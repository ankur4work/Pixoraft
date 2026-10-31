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

// Flatten transparency onto white and return a flat opaque RGB buffer —
// one [r,g,b] triplet per pixel — for cheap indexed access in the passes
// below (avoids repeating the alpha math per channel per pass).
function toOpaqueRGB(data, width, height) {
  const n = width * height;
  const rgb = new Uint8ClampedArray(n * 3);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = data[p + 3] / 255;
    const o = i * 3;
    rgb[o] = data[p] * a + 255 * (1 - a);
    rgb[o + 1] = data[p + 1] * a + 255 * (1 - a);
    rgb[o + 2] = data[p + 2] * a + 255 * (1 - a);
  }
  return rgb;
}

// Which pixels are "background": a border-seeded flood fill, not a global
// color-distance check. A per-pixel "is this color close to SOME expected
// background value" test — the first cut of this op — has no idea where the
// product is: the moment any part of the product (a pale watch face, a
// cream fabric, skin tone) lands within tolerance of the backdrop's color
// ANYWHERE in the frame, it gets wiped to white too. A flood fill has no
// such blind spot — a pixel only ever joins the background region by being
// reached through an unbroken chain of small, local color steps starting at
// the frame's edge, so it can cross a smooth lighting gradient but cannot
// jump across the product's own boundary, where the color step is large
// no matter how the product's palette compares to the backdrop's elsewhere
// in the photo. Assumes the backdrop reaches the image border, which is the
// standard e-commerce studio-shot composition — a product cropped flush
// against the frame edge is the one case this can't help.
function backgroundMask(rgb, width, height) {
  const n = width * height;
  const mask = new Uint8Array(n); // 1 = background
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qHead = 0, qTail = 0;

  // Per-step tolerance while crawling pixel-to-pixel — only has to absorb one
  // gradient step plus JPEG noise, not the backdrop's total light-to-dark
  // range, so it can stay tight without breaking on a smooth vignette.
  const STEP_TOLERANCE = 26;

  const colorAt = (idx) => {
    const o = idx * 3;
    return [rgb[o], rgb[o + 1], rgb[o + 2]];
  };

  const seed = (idx) => {
    if (visited[idx]) return;
    visited[idx] = 1;
    mask[idx] = 1;
    queue[qTail++] = idx;
  };
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }

  while (qHead < qTail) {
    const idx = queue[qHead++];
    const x = idx % width, y = (idx / width) | 0;
    const ref = colorAt(idx);

    const tryNeighbor = (nx, ny) => {
      const nIdx = ny * width + nx;
      if (visited[nIdx]) return;
      if (colorDist(colorAt(nIdx), ref) <= STEP_TOLERANCE) {
        visited[nIdx] = 1;
        mask[nIdx] = 1;
        queue[qTail++] = nIdx;
      } else {
        visited[nIdx] = 1; // rejected once; revisiting from another neighbor
      }                     // adds cost without changing the outcome here
    };
    if (x > 0) tryNeighbor(x - 1, y);
    if (x < width - 1) tryNeighbor(x + 1, y);
    if (y > 0) tryNeighbor(x, y - 1);
    if (y < height - 1) tryNeighbor(x, y + 1);
  }

  return mask;
}

// Separable box blur of a 0/1 mask into a 0..1 alpha map — softens the flood
// fill's pixel-stepped boundary into a smooth edge instead of a hard cutout.
function featherMask(mask, width, height, radius) {
  const tmp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  const win = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += mask[row + Math.min(width - 1, Math.max(0, i))];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / win;
      sum += mask[row + Math.min(width - 1, x + radius + 1)] - mask[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += tmp[Math.min(height - 1, Math.max(0, i)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / win;
      sum += tmp[Math.min(height - 1, y + radius + 1) * width + x] - tmp[Math.max(0, y - radius) * width + x];
    }
  }
  return out;
}

// Background cleanup on a raw RGBA buffer, in place: flatten transparency,
// flood-fill the background from the frame border, then lift it to pure
// white with a feathered edge so the product's boundary doesn't get a hard
// cutout halo.
function whitenRaw(data, width, height) {
  const rgb = toOpaqueRGB(data, width, height);
  const mask = backgroundMask(rgb, width, height);
  const alpha = featherMask(mask, width, height, 2);

  for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
    const t = alpha[i];
    const o = i * 3;
    data[p] = Math.round(rgb[o] + (255 - rgb[o]) * t);
    data[p + 1] = Math.round(rgb[o + 1] + (255 - rgb[o + 1]) * t);
    data[p + 2] = Math.round(rgb[o + 2] + (255 - rgb[o + 2]) * t);
    data[p + 3] = 255;
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
