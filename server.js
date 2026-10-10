import path from "node:path";
import compression from "compression";
import express from "express";
import morgan from "morgan";
import { createRequestHandler } from "@react-router/express";

/**
 * Production server.
 *
 * This replaces `react-router-serve` for one reason: that binary never calls
 * `app.set("trust proxy", ...)`, and this app always runs behind a reverse
 * proxy (Traefik, via Coolify).
 *
 * React Router 7.18 added a CSRF guard that runs on every mutation request:
 *
 *   throwIfPotentialCSRFAttack() rejects when
 *   new URL(origin header).origin !== new URL(request.url).origin
 *
 * and @react-router/express builds request.url from Express's `req.protocol`.
 * With trust-proxy off, `req.protocol` reports the protocol of the *connection
 * to the proxy* — plain http — while the browser sends `Origin: https://…`.
 * The two origins then differ by scheme alone, every form submission is
 * classified as cross-origin, and the server answers 400 Bad Request.
 *
 * That broke every action in the app (alt text apply/generate, the
 * auto-optimize toggle, billing cancel, the PageSpeed test, CSV export) while
 * leaving pages loading normally, because the guard only runs on mutations.
 * `/api/optimize` kept working throughout because resource routes skip the
 * guard entirely — which is what made the failure look page-specific.
 *
 * Trusting the proxy fixes the cause rather than the symptom: the app derives
 * its own URL correctly, so the origins genuinely match. The alternative —
 * adding the host to `allowedActionOrigins` — would silence the guard while
 * leaving every other consumer of request.url seeing the wrong scheme.
 *
 * Everything else here mirrors @react-router/serve's own setup (compression,
 * the same two static mounts with the same cache policy, morgan logging, and
 * SIGTERM/SIGINT handling) so switching servers changes nothing but the above.
 */

const build = await import("./build/server/index.js");

const app = express();
app.disable("x-powered-by");

// Number of proxy hops to trust. Coolify puts exactly one (Traefik) in front of
// this container, so the default is 1 rather than `true`: trusting *all* hops
// would let a client spoof X-Forwarded-* if the container were ever exposed
// directly. Override with TRUST_PROXY (a hop count, or an IP/subnet list).
const rawTrustProxy = process.env.TRUST_PROXY;
app.set(
  "trust proxy",
  rawTrustProxy
    ? Number.isNaN(Number(rawTrustProxy))
      ? rawTrustProxy
      : Number(rawTrustProxy)
    : 1,
);

app.use(compression());

// Fingerprinted build assets — safe to cache forever.
app.use(
  path.posix.join(build.publicPath, "assets"),
  express.static(path.join(build.assetsBuildDirectory, "assets"), {
    immutable: true,
    maxAge: "1y",
  }),
);
app.use(build.publicPath, express.static(build.assetsBuildDirectory));
app.use(express.static("public", { maxAge: "1h" }));

app.use(morgan("tiny"));

app.all("*", createRequestHandler({ build, mode: process.env.NODE_ENV }));

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`[pixoraft] listening on http://localhost:${port}`);
});

["SIGTERM", "SIGINT"].forEach((signal) => {
  process.once(signal, () => server?.close(console.error));
});
