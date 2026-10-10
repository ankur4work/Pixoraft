# Pixoraft

Image optimization & SEO suite for Shopify. Compresses product images to WebP,
writes AI alt text, and reports the measured savings plus live Core Web Vitals.

Embedded Shopify app built on React Router 7 + Polaris, with Prisma/Postgres for
sessions, usage metering and the image-size cache. Deployed as a Docker image.

## Features

| Feature | Route | Plan |
| --- | --- | --- |
| Image optimizer — WebP conversion, smart compression, safe replacement, image order preserved | `/app/productoptimization` | All |
| AI alt text generator — one caption per product, applied to every image | `/app/alttextsuggestions` | Starter+ |
| Auto-optimize new products — background run on `products/create` | toggle on the optimizer page | Growth+ |
| Page Speed reports — measured savings + live PageSpeed Insights test | `/app/pagespeedimpactreports` | Growth+ |
| Analytics — size savings, compression by format, CSV export | `/app/imageoptimizationdashboard` | All |
| Billing — plan, quota meter, managed-pricing links | `/app/billing` | All |
| Help — how it works and FAQ | `/app/additional` | All |

Plan tiers, quotas and entitlements live in `app/plans.server.js`; the display
catalog for the pricing page is `app/planCatalog.js`. Billing is Shopify
**Managed Pricing**, so the app reads the active subscription to gate features
and links out to Shopify's hosted pricing page — it never creates charges.

## Architecture notes

- `app/optimize.server.js` — the encode pipeline. Downloads, re-encodes with
  sharp (two-pass WebP: a second lower-quality pass only for sources that
  compressed poorly), uploads via staged uploads, replaces the original, records
  per-image metafields. Images that would save less than `MIN_GAIN_PERCENT` are
  left alone and cost no quota.
- `app/catalog.server.js` + `app/routes/api.catalog.jsx` — the product list is
  built behind a resource route so the optimizer page paints immediately instead
  of waiting several seconds on the catalog crawl.
- `app/routes/api.optimize.jsx` — per-image API. The browser drives a queue of
  up to 6 concurrent images, so every response is a progress event.
- `app/usage.server.js` — monthly quota metering. Quota is *reserved* before the
  work and refunded if the image is skipped or fails, so concurrent requests
  cannot overshoot the plan limit.
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
`DATABASE_URL`, `OPENAI_API_KEY`, `PORT`.

`SHOPIFY_APP_URL` must match `application_url` and the `redirect_urls` in
`shopify.app.toml`, and those URLs must be configured in the Partner Dashboard.
