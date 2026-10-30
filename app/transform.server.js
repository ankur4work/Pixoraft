// Media-studio edit pipeline (server only).
//
// Downloads a product image, applies the requested studio operations with sharp
// (background whitening, canvas standardization, resize, watermark, badge),
// uploads the edited copy via staged uploads, swaps it onto the product and
// records the edit. One image per call — the browser drives a queue so every
// response is a progress event (same pattern api.optimize used before this app
// became the studio).
import sharp from "sharp";
import { setDefaultResultOrder } from "node:dns";
import { reserveImages, refundImages } from "./usage.server";
import db from "./db.server";

const num = (v, dflt, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
};

// libvips spawns one thread per core by default, and several images are edited
// concurrently per shop — on a small container the two multiply into thread
// thrashing. Cap libvips so request concurrency is the only dial, and keep the
// pixel cache tiny since every buffer here is used exactly once.
sharp.concurrency(num(process.env.SHARP_CONCURRENCY, 2, 1, 16));
sharp.cache({ memory: 64, files: 0, items: 50 });

// Output quality. The studio's job is styling, not shrinking, so the encode is
// deliberately generous — a visible quality drop on an edit the merchant asked
// for would read as the app damaging their photos.
const JPEG_QUALITY = num(process.env.STUDIO_JPEG_QUALITY, 92, 60, 100);

// Edits never upscale beyond this; also the cap for the resize op's input.
export const MAX_DIM_LIMIT = 4096;

/* -------------------------------------------------------------------------- */
/*  Networking helpers                                                        */
/* -------------------------------------------------------------------------- */

// The container was hanging ~10s per image on IPv6 connect attempts to the
// Shopify CDN. Prefer IPv4 so fetch connects to the reachable address first,
// and cap every CDN request with an explicit timeout so a single bad fetch can
// never stall a run.
let dnsConfigured = false;
function preferIPv4() {
  if (dnsConfigured) return;
  try { setDefaultResultOrder("ipv4first"); } catch { /* older runtimes */ }
  dnsConfigured = true;
}

export async function timedFetch(url, opts = {}, timeoutMs = 20000) {
  preferIPv4();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/*  Branding settings                                                         */
/* -------------------------------------------------------------------------- */

export const BRANDING_DEFAULTS = {
  watermarkMode: "text",
  watermarkText: "",
  watermarkLogo: null,
  watermarkPosition: "southeast",
  watermarkOpacity: 55,
  watermarkScale: 22,
  badgeText: "SALE",
  badgeColor: "#D7263D",
  badgePosition: "northwest",
  canvasRatio: "1:1",
  canvasColor: "#FFFFFF",
};

export async function getBranding(shop) {
  try {
    const row = await db.shopSettings.findUnique({ where: { shop } });
    return { ...BRANDING_DEFAULTS, ...(row || {}) };
  } catch {
    return { ...BRANDING_DEFAULTS };
  }
}

/* -------------------------------------------------------------------------- */
/*  Overlay builders                                                          */
/* -------------------------------------------------------------------------- */

const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

// Where a w×h overlay goes on a W×H image for a 9-grid gravity name.
function placeOverlay(gravity, W, H, w, h) {
  const margin = Math.max(8, Math.round(W * 0.03));
  const left = /west/.test(gravity) ? margin
    : /east/.test(gravity) ? W - w - margin
    : Math.round((W - w) / 2);
  const top = /north/.test(gravity) ? margin
    : /south/.test(gravity) ? H - h - margin
    : Math.round((H - h) / 2);
  return {
    left: Math.max(0, Math.min(left, W - w)),
    top: Math.max(0, Math.min(top, H - h)),
  };
}

// Text watermark as an SVG sized to its content.
function textWatermarkOverlay(text, W, settings) {
  const clean = String(text).slice(0, 60);
  if (!clean) return null;
  const targetWidth = Math.max(40, Math.round((W * settings.watermarkScale) / 100));
  const fontSize = Math.max(12, Math.round(targetWidth / (0.62 * clean.length)));
  const w = Math.ceil(clean.length * fontSize * 0.62) + 8;
  const h = Math.ceil(fontSize * 1.4);
  const opacity = Math.min(1, Math.max(0.05, settings.watermarkOpacity / 100));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
      font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="700"
      font-size="${fontSize}" fill="#FFFFFF" fill-opacity="${opacity}"
      stroke="#000000" stroke-opacity="${opacity * 0.35}" stroke-width="1"
      >${escapeXml(clean)}</text>
  </svg>`;
  return { input: Buffer.from(svg), width: w, height: h };
}

// Logo watermark: decode the stored data URI, scale it to a fraction of the
// image width and bake the opacity into its alpha channel.
async function logoWatermarkOverlay(dataUri, W, settings) {
  const match = /^data:image\/[a-z+.-]+;base64,(.+)$/i.exec(dataUri || "");
  if (!match) return null;
  const logo = Buffer.from(match[1], "base64");
  const targetWidth = Math.max(24, Math.round((W * settings.watermarkScale) / 100));

  const { data, info } = await sharp(logo)
    .resize(targetWidth, targetWidth, { fit: "inside", withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const alpha = Math.min(1, Math.max(0.05, settings.watermarkOpacity / 100));
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * alpha);

  return {
    input: await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer(),
    width: info.width,
    height: info.height,
  };
}

// Promo badge: a rounded pill with bold uppercase text.
function badgeOverlay(W, settings) {
  const text = String(settings.badgeText || "SALE").slice(0, 16).toUpperCase();
  const color = /^#[0-9a-f]{3,8}$/i.test(settings.badgeColor) ? settings.badgeColor : "#D7263D";
  const fontSize = Math.max(14, Math.round(W * 0.045));
  const padX = Math.round(fontSize * 0.7);
  const padY = Math.round(fontSize * 0.45);
  const w = Math.ceil(text.length * fontSize * 0.62) + padX * 2;
  const h = fontSize + padY * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="0" y="0" width="${w}" height="${h}" rx="${Math.round(h / 2)}" fill="${color}"/>
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
      font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="800"
      font-size="${fontSize}" fill="#FFFFFF" letter-spacing="1"
      >${escapeXml(text)}</text>
  </svg>`;
  return { input: Buffer.from(svg), width: w, height: h };
}

/* -------------------------------------------------------------------------- */
/*  Pixel ops                                                                 */
/* -------------------------------------------------------------------------- */

const colorDist = (a, b) => {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

// Average a small patch centered at (cx, cy) in a flattened (opaque) RGBA
// buffer — one background color sample.
function samplePatch(data, width, height, cx, cy, patch) {
  const half = Math.floor(patch / 2);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = cy - half; y <= cy + half; y++) {
    if (y < 0 || y >= height) continue;
    for (let x = cx - half; x <= cx + half; x++) {
      if (x < 0 || x >= width) continue;
      const idx = (y * width + x) * 4;
      r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; n++;
    }
  }
  return n > 0 ? [r / n, g / n, b / n] : [255, 255, 255];
}

// Background cleanup on a raw RGBA buffer, in place.
//
// A flat "lift pixels that are already near-white" rule does nothing on a
// real studio shot, where the backdrop is routinely darkened toward the
// edges by vignetting/shadow falloff rather than flat white — exactly the
// kind of photo this op exists to clean up. There is no foreground/
// background segmentation here (that needs a matting model this app doesn't
// ship), so instead eight points around the border — the four corners plus
// the four edge midpoints — are sampled as background references and
// blended per-pixel by inverse-distance weighting. Plain bilinear-from-four-
// corners underestimates how dark a radial vignette gets at the edge
// midpoints (it only "sees" the two adjacent corners there); the extra four
// samples fix that without needing to know the vignette's shape in advance.
// Any pixel close to its locally-expected background color is lifted to
// white, with a feathered falloff so the product's edge doesn't get a hard
// cutout halo. This assumes a product centered against a backdrop that
// reaches the border, which is the standard e-commerce studio-shot
// composition.
function whitenRaw(data, width, height) {
  const patch = Math.max(4, Math.round(Math.min(width, height) * 0.03));
  const mx = width - 1, my = height - 1;
  const points = [
    [0, 0], [Math.round(mx / 2), 0], [mx, 0],
    [0, Math.round(my / 2)], [mx, Math.round(my / 2)],
    [0, my], [Math.round(mx / 2), my], [mx, my],
  ];
  const samples = points.map(([x, y]) => ({
    x, y, color: samplePatch(data, width, height, x, y, patch),
  }));

  const TOLERANCE = 42; // color distance within which a pixel counts as background
  const FEATHER = 30; // extra distance over which the lift fades out smoothly
  const EPS = 64; // keeps IDW weights finite exactly at a sample point

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let wr = 0, wg = 0, wb = 0, wsum = 0;
      for (const s of samples) {
        const dx = x - s.x, dy = y - s.y;
        const weight = 1 / (dx * dx + dy * dy + EPS);
        wr += weight * s.color[0];
        wg += weight * s.color[1];
        wb += weight * s.color[2];
        wsum += weight;
      }
      const expected = [wr / wsum, wg / wsum, wb / wsum];

      const idx = (y * width + x) * 4;
      const a = data[idx + 3] / 255;
      const r = data[idx] * a + 255 * (1 - a);
      const g = data[idx + 1] * a + 255 * (1 - a);
      const b = data[idx + 2] * a + 255 * (1 - a);

      const dist = colorDist([r, g, b], expected);
      let t = 0;
      if (dist <= TOLERANCE) t = 1;
      else if (dist <= TOLERANCE + FEATHER) t = 1 - (dist - TOLERANCE) / FEATHER;

      data[idx] = Math.round(r + (255 - r) * t);
      data[idx + 1] = Math.round(g + (255 - g) * t);
      data[idx + 2] = Math.round(b + (255 - b) * t);
      data[idx + 3] = 255;
    }
  }
}

// "W:H" → number, defaulting to square.
function parseRatio(ratio) {
  const m = /^(\d+)\s*:\s*(\d+)$/.exec(String(ratio || "1:1"));
  if (!m) return 1;
  const r = Number(m[1]) / Number(m[2]);
  return Number.isFinite(r) && r > 0 ? r : 1;
}

/* -------------------------------------------------------------------------- */
/*  applyOps — the edit pipeline itself                                       */
/* -------------------------------------------------------------------------- */

// ops is the validated set the API route built: a subset of
//   { resize: { maxDim }, whiten: true, canvas: true, watermark: true, badge: true }
// Canvas/watermark/badge read their configuration from the shop's branding
// settings, so a run always matches what the Branding page previews.
//
// Order matters and is fixed: resize → whiten → canvas → overlays. Whitening
// before the canvas pad means the pad color and the lifted background meet
// seamlessly; overlays go last so they are never padded or recolored.
export async function applyOps(buffer, ops, settings) {
  const applied = [];

  // Decode once: orientation honored, optional resize, out to raw RGBA.
  let stage = sharp(buffer).rotate().ensureAlpha();
  if (ops.resize) {
    const maxDim = num(ops.resize.maxDim, 2048, 256, MAX_DIM_LIMIT);
    stage = stage.resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true });
    applied.push("resize");
  }
  const { data, info } = await stage.raw().toBuffer({ resolveWithObject: true });
  let width = info.width;
  let height = info.height;

  let flattened = false;
  if (ops.whiten) {
    whitenRaw(data, width, height);
    flattened = true;
    applied.push("whiten");
  }

  let img = sharp(data, { raw: { width, height, channels: 4 } });

  if (ops.canvas) {
    const ratio = parseRatio(settings.canvasRatio);
    const bg = /^#[0-9a-f]{3,8}$/i.test(settings.canvasColor) ? settings.canvasColor : "#FFFFFF";
    // Smallest box of the target ratio that contains the image — pad, never crop.
    let targetW = width, targetH = height;
    if (width / height < ratio) targetW = Math.round(height * ratio);
    else targetH = Math.round(width / ratio);
    if (targetW !== width || targetH !== height) {
      img = img.resize(targetW, targetH, { fit: "contain", background: bg });
      width = targetW;
      height = targetH;
      flattened = true;
    }
    applied.push("canvas");
  }

  const composites = [];
  if (ops.watermark) {
    const overlay = settings.watermarkMode === "logo"
      ? await logoWatermarkOverlay(settings.watermarkLogo, width, settings)
      : textWatermarkOverlay(settings.watermarkText, width, settings);
    if (overlay) {
      composites.push({
        input: overlay.input,
        ...placeOverlay(settings.watermarkPosition, width, height, overlay.width, overlay.height),
      });
      applied.push("watermark");
    }
  }
  if (ops.badge) {
    const overlay = badgeOverlay(width, settings);
    composites.push({
      input: overlay.input,
      ...placeOverlay(settings.badgePosition, width, height, overlay.width, overlay.height),
    });
    applied.push("badge");
  }
  if (composites.length > 0) img = img.composite(composites);

  // Whitened/padded output is opaque → JPEG at a generous quality. Anything
  // that may still carry transparency ships as PNG so it isn't destroyed.
  const sourceMeta = await sharp(buffer).metadata();
  const keepAlpha = !flattened && Boolean(sourceMeta.hasAlpha);
  const out = keepAlpha
    ? await img.png().toBuffer()
    : await img.flatten({ background: "#FFFFFF" }).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();

  return {
    buffer: out,
    mimeType: keepAlpha ? "image/png" : "image/jpeg",
    ext: keepAlpha ? "png" : "jpg",
    width,
    height,
    applied,
  };
}

/* -------------------------------------------------------------------------- */
/*  Shopify media plumbing                                                    */
/* -------------------------------------------------------------------------- */

// Upload the edited buffer via Shopify staged uploads, attach it to the
// product, and delete the original. Returns the new MediaImage gid.
export async function uploadAndReplaceImage(admin, productId, originalMediaId, edited, altText) {
  const filename = `pixoraft-studio-${Date.now()}.${edited.ext}`;

  const stagedRes = await admin.graphql(
    `#graphql
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        input: [{
          filename,
          mimeType: edited.mimeType,
          httpMethod: "POST",
          resource: "IMAGE",
          fileSize: String(edited.buffer.byteLength),
        }],
      },
    }
  );
  const stagedData = await stagedRes.json();
  if (stagedData.data?.stagedUploadsCreate?.userErrors?.length > 0) {
    throw new Error(stagedData.data.stagedUploadsCreate.userErrors[0].message);
  }
  const target = stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) throw new Error("Failed to create staged upload target");

  const form = new FormData();
  for (const param of target.parameters) form.append(param.name, param.value);
  form.append("file", new Blob([edited.buffer], { type: edited.mimeType }), filename);
  const uploadRes = await timedFetch(target.url, { method: "POST", body: form }, 40000);
  if (!uploadRes.ok) throw new Error(`Staged upload HTTP ${uploadRes.status}`);

  const mediaRes = await admin.graphql(
    `#graphql
      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { ... on MediaImage { id } }
          mediaUserErrors { field message }
        }
      }`,
    {
      variables: {
        productId,
        media: [{ alt: altText || "", mediaContentType: "IMAGE", originalSource: target.resourceUrl }],
      },
    }
  );
  const mediaData = await mediaRes.json();
  if (mediaData.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
    throw new Error(mediaData.data.productCreateMedia.mediaUserErrors[0].message);
  }
  const newMedia = mediaData.data?.productCreateMedia?.media?.[0];
  if (!newMedia) throw new Error("Failed to attach media to product");

  await admin.graphql(
    `#graphql
      mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds
          mediaUserErrors { field message }
        }
      }`,
    { variables: { productId, mediaIds: [originalMediaId] } }
  );

  return newMedia.id;
}

// Back up the untouched original to the store's Files library (unattached to
// any product) via fileCreate, so an edit can later be reverted. Best-effort:
// returns null on any failure rather than throwing, since a backup that
// couldn't be made should not block the edit itself — it just means that
// edit won't be revertible.
async function backupOriginal(admin, buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    const format = meta.format === "png" ? "png" : meta.format === "webp" ? "webp" : "jpg";
    const mimeType = format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
    const filename = `pixoraft-original-${Date.now()}.${format}`;

    const stagedRes = await admin.graphql(
      `#graphql
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets { url resourceUrl parameters { name value } }
            userErrors { field message }
          }
        }`,
      {
        variables: {
          input: [{
            filename,
            mimeType,
            httpMethod: "POST",
            resource: "IMAGE",
            fileSize: String(buffer.byteLength),
          }],
        },
      }
    );
    const stagedData = await stagedRes.json();
    const target = stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) return null;

    const form = new FormData();
    for (const param of target.parameters) form.append(param.name, param.value);
    form.append("file", new Blob([buffer], { type: mimeType }), filename);
    const uploadRes = await timedFetch(target.url, { method: "POST", body: form }, 40000);
    if (!uploadRes.ok) return null;

    // fileCreate (not productCreateMedia) — this intentionally does NOT attach
    // to any product, so it sits in the Files library as a recovery copy only.
    const fileRes = await admin.graphql(
      `#graphql
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files { id }
            userErrors { field message }
          }
        }`,
      {
        variables: {
          files: [{ contentType: "IMAGE", originalSource: target.resourceUrl }],
        },
      }
    );
    const fileData = await fileRes.json();
    return fileData.data?.fileCreate?.files?.[0]?.id || null;
  } catch (err) {
    console.error("[STUDIO] original backup failed (non-fatal):", err?.message || err);
    return null;
  }
}

// The images on a product, in the merchant's order — what a run works through.
export async function listProductImages(admin, productId) {
  const response = await admin.graphql(
    `#graphql
      query ProductImagesForRun($id: ID!) {
        product(id: $id) {
          id
          title
          media(first: 250) {
            edges { node { ... on MediaImage { id image { url altText } } } }
          }
        }
      }`,
    { variables: { id: productId } }
  );
  const data = await response.json();
  const product = data.data?.product;
  if (!product) return null;

  const images = (product.media?.edges || [])
    .map(e => e.node)
    .filter(n => n && n.image && n.image.url)
    .map(n => ({ id: n.id, url: n.image.url, altText: n.image.altText || "" }));

  return { id: product.id, title: product.title, images };
}

/* -------------------------------------------------------------------------- */
/*  Per-image — one image per call, so the browser can show real progress     */
/* -------------------------------------------------------------------------- */

// Edit exactly one image and replace it on the product.
//
// Returns a result object rather than throwing, so one bad image never takes
// down the rest of a run. Quota is reserved up front and refunded on failure —
// a failed image costs the merchant nothing.
export async function transformOneImage({ admin, productId, imageId, ops, shop, plan }) {
  const response = await admin.graphql(
    `#graphql
      query OneImageContext($imageId: ID!, $productId: ID!) {
        node(id: $imageId) {
          ... on MediaImage { id image { url altText } }
        }
        product(id: $productId) { id title }
      }`,
    { variables: { imageId, productId } }
  );
  const data = await response.json();
  const node = data.data?.node;
  const product = data.data?.product;

  if (!node?.image?.url || !product) {
    return { success: false, imageId, error: "That image is no longer on the product." };
  }

  const reserved = await reserveImages(shop, plan, 1);
  if (!reserved.allowed) {
    return {
      success: false,
      imageId,
      // Flagged so the browser stops the run instead of asking for every
      // remaining image and collecting the same refusal each time.
      quotaExceeded: true,
      error: "Monthly edit quota reached.",
    };
  }

  let spent = false;
  try {
    const settings = await getBranding(shop);

    let download, buffer;
    for (let attempt = 0; attempt < 2 && !buffer; attempt++) {
      try {
        download = await timedFetch(node.image.url, {}, 25000);
        if (!download.ok) throw new Error(`Fetch image HTTP ${download.status}`);
        buffer = Buffer.from(await download.arrayBuffer());
      } catch (err) {
        if (attempt === 1) throw err;
      }
    }

    const edited = await applyOps(buffer, ops, settings);
    if (edited.applied.length === 0) {
      return { success: false, imageId, error: "No edit was applicable to this image." };
    }

    // Back up the pristine original BEFORE it's replaced, so the edit can be
    // undone later from History. Runs before the replace call — once the
    // replace happens the original is gone from Shopify for good.
    const originalFileId = await backupOriginal(admin, buffer);

    const newImageId = await uploadAndReplaceImage(
      admin, productId, imageId, edited, node.image.altText
    );
    // The edited copy is attached, so the credit is genuinely spent from here
    // even if the bookkeeping below misbehaves.
    spent = true;

    try {
      await db.studioEdit.create({
        data: {
          shop,
          productId,
          productTitle: product.title || "",
          imageId,
          newImageId,
          ops: JSON.stringify(edited.applied),
          originalFileId,
        },
      });
    } catch (e) {
      console.error("[STUDIO] history write failed:", e?.message || e);
    }

    return {
      success: true,
      imageId,
      newImageId,
      applied: edited.applied,
      width: edited.width,
      height: edited.height,
      outputKB: Math.round(edited.buffer.byteLength / 1024),
    };
  } catch (err) {
    const detail = err?.graphQLErrors?.[0]?.message || err?.message || "edit failed";
    console.error(`[STUDIO] ${imageId}:`, detail);
    return { success: false, imageId, error: detail };
  } finally {
    if (!spent) await refundImages(shop, 1);
  }
}

// Put the image order back after a run. Replacing an image appends the copy at
// the end, and with several in flight they no longer finish in the order they
// started — `desiredOrder` is the slot-by-slot order the run tracked.
export async function restoreOrder(admin, productId, desiredOrder = []) {
  const response = await admin.graphql(
    `#graphql
      query ProductMediaOrder($id: ID!) {
        product(id: $id) {
          id
          media(first: 250) { edges { node { ... on MediaImage { id } } } }
        }
      }`,
    { variables: { id: productId } }
  );
  const data = await response.json();
  const product = data.data?.product;
  if (!product) return false;

  const currentIds = (product.media?.edges || [])
    .map(e => e.node)
    .filter(n => n && n.id)
    .map(n => n.id);

  // Unknown ids make the mutation fail outright, so only ids still present are
  // moved, and anything the caller did not mention is appended rather than lost.
  const wanted = desiredOrder.filter(id => currentIds.includes(id));
  const ordered = [...wanted, ...currentIds.filter(id => !wanted.includes(id))];
  const changed = ordered.some((id, i) => id !== currentIds[i]);

  if (changed && ordered.length > 1) {
    try {
      await admin.graphql(
        `#graphql
          mutation ReorderMedia($id: ID!, $moves: [MoveInput!]!) {
            productReorderMedia(id: $id, moves: $moves) {
              job { id }
              mediaUserErrors { field message }
            }
          }`,
        {
          variables: {
            id: productId,
            moves: ordered.map((id, i) => ({ id, newPosition: String(i) })),
          },
        }
      );
    } catch (err) {
      // Cosmetic. A failed reorder must not fail a successful edit.
      console.error("[STUDIO] reorder failed (non-fatal):", err?.message || err);
    }
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/*  Revert — restore the backed-up original for one edit                      */
/* -------------------------------------------------------------------------- */

// Undo a single edit: re-attach the untouched original (backed up to Files at
// edit time) to the product, remove the edited copy currently on it, and
// clean up the backup file. The restored image lands at the end of the
// product's media list rather than its original position — position isn't
// recorded at edit time, so this is a deliberate simplification rather than a
// bug: reorder it manually afterward if the position matters.
export async function revertEdit({ admin, shop, editId }) {
  const edit = await db.studioEdit.findUnique({ where: { id: editId } });
  if (!edit || edit.shop !== shop) {
    return { success: false, error: "That edit could not be found." };
  }
  if (edit.reverted) {
    return { success: false, error: "That edit was already reverted." };
  }
  if (!edit.originalFileId) {
    return { success: false, error: "No backup of the original is available for this edit." };
  }

  const fileRes = await admin.graphql(
    `#graphql
      query BackupFile($id: ID!) {
        node(id: $id) { ... on MediaImage { image { url } } }
      }`,
    { variables: { id: edit.originalFileId } }
  );
  const fileData = await fileRes.json();
  const originalUrl = fileData.data?.node?.image?.url;
  if (!originalUrl) {
    return {
      success: false,
      error: "The backed-up original is still processing — try again in a minute.",
    };
  }

  try {
    const mediaRes = await admin.graphql(
      `#graphql
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media { ... on MediaImage { id } }
            mediaUserErrors { field message }
          }
        }`,
      {
        variables: {
          productId: edit.productId,
          media: [{ mediaContentType: "IMAGE", originalSource: originalUrl }],
        },
      }
    );
    const mediaData = await mediaRes.json();
    if (mediaData.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
      throw new Error(mediaData.data.productCreateMedia.mediaUserErrors[0].message);
    }
    const restored = mediaData.data?.productCreateMedia?.media?.[0];
    if (!restored) throw new Error("Failed to re-attach the original image.");

    await admin.graphql(
      `#graphql
        mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
          productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
            deletedMediaIds
            mediaUserErrors { field message }
          }
        }`,
      { variables: { productId: edit.productId, mediaIds: [edit.newImageId] } }
    );

    // Best-effort cleanup — a failed delete just leaves the backup file
    // sitting in Files, which is harmless and not worth failing the revert.
    try {
      await admin.graphql(
        `#graphql
          mutation fileDelete($fileIds: [ID!]!) {
            fileDelete(fileIds: $fileIds) { deletedFileIds userErrors { field message } }
          }`,
        { variables: { fileIds: [edit.originalFileId] } }
      );
    } catch (e) {
      console.error("[STUDIO] backup file cleanup failed (non-fatal):", e?.message || e);
    }

    await db.studioEdit.update({ where: { id: editId }, data: { reverted: true } });

    return { success: true, restoredImageId: restored.id };
  } catch (err) {
    const detail = err?.graphQLErrors?.[0]?.message || err?.message || "revert failed";
    console.error(`[STUDIO] revert ${editId}:`, detail);
    return { success: false, error: detail };
  }
}
