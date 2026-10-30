// Product catalog for the Media Studio page (server only).
//
// This is the expensive half of that page — one Shopify request per 50
// products, sequential because pagination is cursor-based. It lives behind
// /api/catalog, which the page requests after it has already rendered, so the
// navigation never waits on the crawl.
import db from './db.server';

async function fetchProductPage(admin, cursor = null) {
  const query = `#graphql
    query GetProductsWithImages($cursor: String) {
      products(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            handle
            status
            featuredImage { id url }
            media(first: 250) {
              edges { node { ... on MediaImage { id image { url width height } } } }
            }
          }
        }
      }
    }
  `;
  // Bound and retry this request.
  //
  // A `fetch failed` means no HTTP response arrived at all (DNS, TCP, TLS,
  // dropped socket) — not a Shopify error, which comes back as a 200 with an
  // errors array. Worse, the call can hang with no result, so every attempt is
  // raced against a timeout. The timeout does NOT cancel the underlying request
  // — admin.graphql takes no signal — but a leaked socket is cheaper than a
  // page that never renders.
  const ATTEMPTS = 2;
  const TIMEOUT_MS = 15000;
  let lastError;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let timer;
    try {
      const response = await Promise.race([
        admin.graphql(query, { variables: { cursor } }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Shopify did not respond within ${TIMEOUT_MS}ms`)),
            TIMEOUT_MS
          );
        }),
      ]);
      return await response.json();
    } catch (error) {
      lastError = error;
      // `cause` is where undici puts the actual reason (ENOTFOUND,
      // UND_ERR_CONNECT_TIMEOUT, ECONNRESET…).
      console.error(
        '[CATALOG] products fetch attempt %d/%d failed: %s | cause: %s %s',
        attempt,
        ATTEMPTS,
        error?.message,
        error?.cause?.code || '',
        error?.cause?.message || ''
      );
      if (attempt < ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } finally {
      // Otherwise the losing timer keeps the event loop awake for its full
      // duration on every successful request.
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function getAllProducts(admin) {
  const allProducts = [];
  let hasNextPage = true;
  let cursor = null;
  while (hasNextPage) {
    const data = await fetchProductPage(admin, cursor);

    // A Shopify-side rejection (throttling, MAX_COST_EXCEEDED, a bad token)
    // arrives as a 200 with an errors array and no data.
    if (!data?.data?.products) {
      const detail = JSON.stringify(data?.errors || data).slice(0, 300);
      throw new Error('Shopify returned no product data: ' + detail);
    }

    for (const edge of data.data.products.edges) allProducts.push(edge.node);
    hasNextPage = data.data.products.pageInfo.hasNextPage;
    cursor = data.data.products.pageInfo.endCursor;
  }
  return allProducts;
}

export const EMPTY_STATS = {
  total: 0,
  totalImages: 0,
  editedProducts: 0,
  totalEdits: 0,
  mixedRatios: 0,
};

// Never rejects: the page renders its chrome first and then asks for this, so a
// failure has to come back as data the page can show in a banner.
export async function buildCatalog(admin, shop) {
  try {
    const products = await getAllProducts(admin);

    // Edit counts come from the local history, not from crawling metafields —
    // one grouped query for the whole catalog.
    let editsByProduct = new Map();
    try {
      const grouped = await db.studioEdit.groupBy({
        by: ['productId'],
        where: { shop },
        _count: { _all: true },
      });
      editsByProduct = new Map(grouped.map(g => [g.productId, g._count._all]));
    } catch { /* history table not migrated yet — counts show as zero */ }

    const processedProducts = products.map((product) => {
      const images = (product.media?.edges || [])
        .map(e => e.node)
        .filter(n => n && n.image && n.image.url)
        .map(n => ({
          id: n.id,
          url: n.image.url,
          width: n.image.width || 0,
          height: n.image.height || 0,
        }));

      // "Mixed ratios" is the studio's needs-work signal: a product whose
      // images don't share one aspect ratio renders unevenly in collection
      // grids, which is exactly what the canvas op fixes.
      const ratios = new Set(
        images
          .filter(img => img.width > 0 && img.height > 0)
          .map(img => (img.width / img.height).toFixed(2))
      );

      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        imageCount: images.length,
        editCount: editsByProduct.get(product.id) || 0,
        mixedRatios: ratios.size > 1,
        featuredImageUrl: product.featuredImage?.url || images[0]?.url,
      };
    });

    // Return ALL products; filtering/sorting happens instantly on the client
    // from this list, so changing a filter never re-runs this (heavy) fetch.
    return {
      products: processedProducts,
      stats: {
        total: processedProducts.length,
        totalImages: processedProducts.reduce((s, p) => s + p.imageCount, 0),
        editedProducts: processedProducts.filter(p => p.editCount > 0).length,
        totalEdits: processedProducts.reduce((s, p) => s + p.editCount, 0),
        mixedRatios: processedProducts.filter(p => p.mixedRatios).length,
      },
      error: null,
    };
  } catch (error) {
    console.error(
      '[CATALOG] Error loading products: %s | cause: %s %s',
      error?.message,
      error?.cause?.code || '',
      error?.cause?.message || ''
    );
    return { products: [], stats: EMPTY_STATS, error: 'Failed to load products' };
  }
}
