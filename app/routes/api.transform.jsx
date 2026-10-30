import { authenticate } from '../shopify.server';
import { getBillingStateCached } from '../billing.server';
import { entitled } from '../plans.server';
import {
  listProductImages,
  transformOneImage,
  restoreOrder,
  revertEdit,
  getBranding,
  MAX_DIM_LIMIT,
} from '../transform.server';

/**
 * The per-image edit API the Media Studio page drives.
 *
 * A resource route (no default export) so a plain `fetch` gets JSON back, which
 * is what lets the browser run a real queue: ask for a product's images, work
 * through them a few at a time, and update the progress bar on every response.
 * App Bridge attaches the session token to same-origin fetches, so
 * `authenticate.admin` works here exactly as it does on the page itself.
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// The requested ops arrive from the browser, so entitlements are re-checked
// here — the UI disabling a checkbox is cosmetics, this is the gate. Returns
// the subset of ops this plan may run, or an error string.
async function validateOps(raw, plan, shop) {
  let requested;
  try {
    requested = JSON.parse(raw || '{}');
  } catch {
    return { error: 'The edit settings could not be read.' };
  }

  const ops = {};
  if (requested.resize) {
    if (!entitled(plan, 'resize')) return { error: 'Resizing is not included in your plan.' };
    const maxDim = Number(requested.resize.maxDim);
    ops.resize = { maxDim: Number.isFinite(maxDim) ? Math.min(maxDim, MAX_DIM_LIMIT) : 2048 };
  }
  if (requested.whiten) {
    if (!entitled(plan, 'whiten')) return { error: 'Background whitening needs the Starter plan or above.' };
    ops.whiten = true;
  }
  if (requested.canvas) {
    if (!entitled(plan, 'canvas')) return { error: 'Canvas standardization is not included in your plan.' };
    ops.canvas = true;
  }
  if (requested.watermark) {
    const branding = await getBranding(shop);
    const needed = branding.watermarkMode === 'logo' ? 'watermarkLogo' : 'watermarkText';
    if (!entitled(plan, needed)) {
      return {
        error: branding.watermarkMode === 'logo'
          ? 'Logo watermarks need the Growth plan or above.'
          : 'Watermarks need the Starter plan or above.',
      };
    }
    if (branding.watermarkMode === 'logo' && !branding.watermarkLogo) {
      return { error: 'Upload a watermark logo on the Branding page first.' };
    }
    if (branding.watermarkMode === 'text' && !branding.watermarkText) {
      return { error: 'Set your watermark text on the Branding page first.' };
    }
    ops.watermark = true;
  }
  if (requested.badge) {
    if (!entitled(plan, 'badge')) return { error: 'Promo badges need the Growth plan or above.' };
    ops.badge = true;
  }

  if (Object.keys(ops).length === 0) return { error: 'Pick at least one edit to apply.' };
  return { ops };
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed.' }, 405);
  }

  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');
  const productId = formData.get('productId');

  if (intent === 'revert') {
    const editId = formData.get('editId');
    if (!editId) return json({ success: false, error: 'No edit was given.' }, 400);
    try {
      return json(await revertEdit({ admin, shop: session.shop, editId }));
    } catch (error) {
      const detail = error?.graphQLErrors?.[0]?.message || error?.message || 'unknown error';
      console.error('[api.transform] revert failed:', detail);
      return json({ success: false, error: detail }, 500);
    }
  }

  if (!productId) {
    return json({ success: false, error: 'No product was given.' }, 400);
  }

  try {
    if (intent === 'listImages') {
      const product = await listProductImages(admin, productId);
      if (!product) {
        return json({ success: false, error: 'That product could not be loaded.' }, 404);
      }
      return json({ success: true, ...product });
    }

    if (intent === 'transformImage') {
      const imageId = formData.get('imageId');
      if (!imageId) {
        return json({ success: false, error: 'No image was given.' }, 400);
      }
      // Already cached per shop, so a per-image request doesn't add a billing
      // round-trip.
      const { plan } = await getBillingStateCached(admin, session.shop);
      const validated = await validateOps(formData.get('ops'), plan, session.shop);
      if (validated.error) {
        return json({ success: false, imageId, error: validated.error }, 400);
      }
      return json(
        await transformOneImage({
          admin,
          productId,
          imageId,
          ops: validated.ops,
          shop: session.shop,
          plan,
        })
      );
    }

    if (intent === 'finalize') {
      let order = [];
      try {
        const raw = formData.get('order');
        if (raw) order = JSON.parse(raw);
      } catch {
        // The order is cosmetic — a bad value just means "leave it as it is".
      }
      await restoreOrder(admin, productId, Array.isArray(order) ? order : []);
      return json({ success: true });
    }

    return json({ success: false, error: `Unknown intent "${intent}".` }, 400);
  } catch (error) {
    const detail = error?.graphQLErrors?.[0]?.message || error?.message || 'unknown error';
    console.error('[api.transform] %s failed:', intent, detail);
    return json({ success: false, error: detail }, 500);
  }
}
