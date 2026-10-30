// Client-safe pricing display catalog (marketing copy + prices) for the pricing
// page and pricing wall. The source of truth for runtime gating/quotas is
// plans.server.js — keep the prices/quotas here in sync with that file and with
// the plans created in the Partner Dashboard.
//
// Note: because this is a Managed Pricing app, every "Choose plan" button sends
// the merchant to Shopify's hosted pricing page where they pick the real plan —
// the per-tier buttons here are purely informational about what they'll get.
export const PLAN_TIERS = [
  {
    name: "Free",
    price: 0,
    priceAnnual: 0,
    images: "100",
    tagline: "Try it out",
    features: [
      "100 image edits / month",
      "Uniform canvas & aspect ratios",
      "Resize to a max dimension",
    ],
  },
  {
    name: "Starter",
    price: 19,
    priceAnnual: 190,
    images: "2,000",
    tagline: "For growing stores",
    features: [
      "2,000 image edits / month",
      "Everything in Free",
      "Background whitening",
      "Text watermarks",
    ],
  },
  {
    name: "Growth",
    price: 49,
    priceAnnual: 490,
    images: "15,000",
    tagline: "Most popular",
    popular: true,
    features: [
      "15,000 image edits / month",
      "Everything in Starter",
      "Logo watermarks",
      "Promo badges (SALE / NEW / custom)",
      "Bulk edits across many products",
    ],
  },
  {
    name: "Pro",
    price: 499,
    priceAnnual: 2499,
    images: "50,000",
    tagline: "High volume",
    features: [
      "50,000 image edits / month",
      "Everything in Growth",
      "Priority processing",
    ],
  },
];
