// Shared facts for the public legal pages (/privacy, /terms, /support).
//
// Kept in one place so the three pages can never disagree with each other, and
// so the two outstanding business details below are a one-line edit rather than
// a hunt through prose.

export const APP_NAME = "Pixoraft";
export const COMPANY = "SDLC LIMITED";
export const APP_URL = "https://pixoraft.onkra.online";

// Shown as the "Last updated" line. Bump when the wording materially changes.
export const LAST_UPDATED = "30 October 2026";

/* ------------------------------------------------------------------------- */
/*  PENDING — fill these in before submitting the app for review              */
/* ------------------------------------------------------------------------- */

// Set to a real address (e.g. "support@yourdomain.com") and every page swaps
// its placeholder for a mailto: link automatically. Shopify's App Store listing
// requires a working support contact, so this must not ship as null.
export const CONTACT_EMAIL = "admin@capturecrews.com";

// Governing law for the Terms. Set to the jurisdiction the company is
// registered in (e.g. "England and Wales"). Left unset rather than guessed.
export const GOVERNING_LAW = "India";

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
    what: "Monthly edit counter",
    detail:
      "Your shop domain, the current month, and how many image edits have been applied in it. Used to enforce your plan's quota.",
  },
  {
    what: "Branding settings",
    detail:
      "Your shop domain and the watermark, badge and canvas settings you configure — including the watermark logo you upload, stored as a small image so runs can apply it.",
  },
  {
    what: "Edit history",
    detail:
      "One record per edit: the product, which operations ran (e.g. canvas, watermark) and when. Shown on the History page. Never the image itself.",
  },
];

export const THIRD_PARTIES = [
  {
    name: "Shopify",
    sends: "Product, media, file and metafield reads and writes via the Admin API.",
    why: "This is your own store data; the app is operating on it at your request.",
  },
];
