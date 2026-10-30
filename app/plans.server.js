// Plan tier catalog + resolution.
//
// This app is a Shopify "Managed Pricing" app: the actual plans (and their real
// prices/trials) are created in the Partner Dashboard, and a merchant subscribes
// to one on Shopify's hosted pricing page. The app cannot create charges; its job
// is to read the *name* of the merchant's active subscription and map it to the
// tier defined here — which decides the monthly image quota and which features
// are unlocked.
//
// IMPORTANT: the plan names below (and their "<name> Annual" variants) MUST match
// the plan names created in the Partner Dashboard exactly, because tier resolution
// is by name. `getPlanByName` normalizes case and a trailing " Annual" and falls
// back to the Free tier for unknown / missing names.

// Feature flags used for gating. Every flag maps to a studio capability:
//   canvas        — pad/crop images to a uniform aspect ratio on a background
//   resize        — cap images at a maximum pixel dimension
//   whiten        — clean up a studio backdrop (gradient or uneven) to pure #FFFFFF
//   watermarkText — text watermark overlay
//   watermarkLogo — logo (uploaded image) watermark overlay
//   badge         — promo badge overlay (SALE / NEW / custom)
//   bulkEdit      — run an edit across many products at once
//   priority      — priority processing (declared for the Pro tier)
export const FEATURES = [
  "canvas",
  "resize",
  "whiten",
  "watermarkText",
  "watermarkLogo",
  "badge",
  "bulkEdit",
  "priority",
];

function feat(...enabled) {
  const set = new Set(enabled);
  return Object.fromEntries(FEATURES.map((f) => [f, set.has(f)]));
}

// Tier catalog, cheapest → most expensive. `tier` is the stable internal key;
// `name` is the human/Partner-Dashboard plan name used for resolution.
export const PLANS = [
  {
    tier: "free",
    name: "Free",
    price: 0,
    priceAnnual: 0,
    monthlyImages: 100,
    features: feat("canvas", "resize"),
  },
  {
    tier: "starter",
    name: "Starter",
    price: 19,
    priceAnnual: 190,
    monthlyImages: 2000,
    features: feat("canvas", "resize", "whiten", "watermarkText"),
  },
  {
    tier: "growth",
    name: "Growth",
    price: 49,
    priceAnnual: 490,
    monthlyImages: 15000,
    features: feat(
      "canvas", "resize", "whiten",
      "watermarkText", "watermarkLogo", "badge", "bulkEdit",
    ),
  },
  {
    tier: "pro",
    name: "Pro",
    price: 499,
    priceAnnual: 2499,
    monthlyImages: 50000,
    features: feat(
      "canvas", "resize", "whiten",
      "watermarkText", "watermarkLogo", "badge", "bulkEdit",
      "priority",
    ),
  },
];

export const FREE_PLAN = PLANS[0];

// Resolve a Shopify subscription name to a tier. Strips a trailing " Annual"
// (so "Growth Annual" → "Growth") and matches case-insensitively. Falls back to
// the Free tier when the name is missing or unrecognized — so an installed-but-
// not-yet-subscribed shop still has a usable (limited) plan.
export function getPlanByName(name) {
  if (!name) return FREE_PLAN;
  const base = String(name).replace(/\s+annual$/i, "").trim().toLowerCase();
  return PLANS.find((p) => p.name.toLowerCase() === base) || FREE_PLAN;
}

// Boolean feature gate. Safe with a null/undefined plan (treated as Free).
export function entitled(plan, feature) {
  const p = plan || FREE_PLAN;
  return Boolean(p.features?.[feature]);
}
