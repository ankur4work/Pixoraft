// Shared facts for the public legal pages (/privacy, /terms, /support).
//
// Kept in one place so the three pages can never disagree with each other, and
// so the two outstanding business details below are a one-line edit rather than
// a hunt through prose.

export const APP_NAME = "Pixoraft";
export const COMPANY = "SDLC LIMITED";
export const APP_URL = "https://pixoraft.onkra.online";

// Shown as the "Last updated" line. Bump when the wording materially changes.
export const LAST_UPDATED = "10 October 2026";

/* ------------------------------------------------------------------------- */
/*  PENDING — fill these in before submitting the app for review              */
/* ------------------------------------------------------------------------- */

// Set to a real address (e.g. "support@yourdomain.com") and every page swaps
// its placeholder for a mailto: link automatically. Shopify's App Store listing
// requires a working support contact, so this must not ship as null.
export const CONTACT_EMAIL = null;

// Governing law for the Terms. Set to the jurisdiction the company is
// registered in (e.g. "England and Wales"). Left unset rather than guessed.
export const GOVERNING_LAW = null;

/* ------------------------------------------------------------------------- */

// Exactly what the app persists, mirrored from prisma/schema.prisma. If the
// schema changes, this table has to change with it — it is the substantive
// claim the privacy policy makes.
export const STORED_DATA = [
  {
    what: "Shopify session",
    detail:
      "Your shop domain plus the access token Shopify issues at install, and the name, email and locale Shopify attaches to the authenticating staff account. This is what lets the app call the Admin API on your behalf.",
  },
  {
    what: "Monthly image counter",
    detail:
      "Your shop domain, the current month, and how many images have been optimized in it. Used to enforce your plan's quota.",
  },
  {
    what: "App settings",
    detail:
      "Your shop domain and whether auto-optimize for new products is switched on.",
  },
  {
    what: "Image size cache",
    detail:
      "The measured byte size of a Shopify CDN image URL. Stores a number and a URL — never the image itself. It exists so the product list does not re-measure thousands of images on every page load.",
  },
];

export const THIRD_PARTIES = [
  {
    name: "Shopify",
    sends: "Product, media, file and metafield reads and writes via the Admin API.",
    why: "This is your own store data; the app is operating on it at your request.",
  },
  {
    name: "OpenAI",
    sends:
      "The public Shopify CDN URL of an image, plus the product title. OpenAI fetches the image from that URL itself.",
    why: "Generating alt text. Only happens when you run the Alt Text Generator, or when the optimizer meets an image with no usable alt text on a plan that includes the feature.",
  },
  {
    name: "Anthropic",
    sends: "The image contents and the product title.",
    why: "An optional alternative alt-text provider. Only reachable if the deployment has an Anthropic key configured and you pick that provider.",
  },
  {
    name: "Google PageSpeed Insights",
    sends: "The public URL of one of your product pages.",
    why: "Running a live Lighthouse test, and only when you press the button on the Page Speed Reports page.",
  },
];
