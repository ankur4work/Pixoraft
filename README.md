# Pixoraft

Product media studio for Shopify. Bulk-edits product images for a consistent,
on-brand catalog: uniform canvases, background whitening, resizing, watermarks
and promo badges — applied across whole products and collections in one run.

Embedded Shopify app built on React Router 7 + Polaris, with Prisma/Postgres for
sessions, usage metering, branding settings and the edit history. Deployed as a
Docker image.

## Features

| Feature | Route | Plan |
| --- | --- | --- |
| Media Studio — pick an edit recipe, run it across products, image order preserved | `/app/mediastudio` | All |
| Uniform canvas — pad (never crop) to one aspect ratio on a chosen background | studio op | All |
| Resize — cap images at a maximum pixel dimension | studio op | All |
| Background whitening — lift near-white backgrounds to pure #FFFFFF | studio op | Starter+ |
| Text watermark | studio op | Starter+ |
| Logo watermark, promo badges, bulk edits across products | studio ops | Growth+ |
| Branding — watermark/badge/canvas designer with live preview | `/app/branding` | All |
| History — every edit, by product and operation | `/app/history` | All |
| Billing — plan, quota meter, managed-pricing links | `/app/billing` | All |
| Help — how it works and FAQ | `/app/additional` | All |

Plan tiers, quotas and entitlements live in `app/plans.server.js`; the display
catalog for the pricing page is `app/planCatalog.js`. Billing is Shopify
**Managed Pricing**, so the app reads the active subscription to gate features
and links out to Shopify's hosted pricing page — it never creates charges.

## Architecture notes

- `app/transform.server.js` — the edit pipeline. Downloads an image, applies the
  requested ops with sharp in a fixed order (resize → whiten → canvas →
  watermark/badge overlays), uploads via staged uploads, replaces the original
  and records the edit in the `StudioEdit` history. Output is JPEG q92 (or PNG
  when transparency must survive) — the studio's job is styling, not shrinking.
- `app/catalog.server.js` + `app/routes/api.catalog.jsx` — the product list is
  built behind a resource route so the studio page paints immediately instead
  of waiting several seconds on the catalog crawl. Flags products whose images
  have mixed aspect ratios (the canvas op's needs-work signal).
- `app/routes/api.transform.jsx` — per-image API. The browser drives a queue of
  up to 6 concurrent images, so every response is a progress event. Requested
  ops are re-validated against plan entitlements server-side.
- `app/usage.server.js` — monthly quota metering. Quota is *reserved* before the
  work and refunded if the image fails, so concurrent requests cannot overshoot
  the plan limit.
- Branding settings (watermark text/logo, badge, canvas) are stored per shop in
  `ShopSettings`; the Branding page's CSS preview mirrors the server-side
  placement math, so what's previewed is what renders.
- `app/routes/healthz.jsx` — readiness probe used by the Docker healthcheck and
  the Coolify proxy, so traffic only arrives once the server is actually serving.

## Theme

The brand theme is `app/styles/pixoraft.css` — "Magenta Flux": fuchsia → violet
on a wine-ink base, with gold for attention and mint for success. Every colour,
radius and gradient is declared in the `:root` block at the top of that file and
nowhere else, so a re-theme is editing one block.

The element geometry is part of the identity, and the file documents the five
rules it follows: pills rather than squared labels, circular ring icon badges,
accent rails that run vertically down the left edge, concentric-ring texture
instead of a dot grid, and a continuous gradient usage meter. Uppercase
micro-labels are monospace throughout. Class names are prefixed `px-`.

## Local development

```bash
npm install
cp .env.example .env     # fill in credentials
npx prisma generate
npm run dev              # shopify app dev
```

`npm run build` produces the production bundle; `npm start` serves it.

## Deployment

Container build is defined by the `Dockerfile` (Node 20 Alpine). The start
command runs `prisma db push` before booting, so the schema is applied on every
deploy.

Required environment variables are listed in `.env.example`. At minimum:
`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`,
`DATABASE_URL`, `PORT`.

`SHOPIFY_APP_URL` must match `application_url` and the `redirect_urls` in
`shopify.app.toml`, and those URLs must be configured in the Partner Dashboard.
