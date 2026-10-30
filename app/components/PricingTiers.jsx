import { PLAN_TIERS } from "../planCatalog";

// 4-tier pricing comparison used by both the standalone pricing page and the
// in-app pricing wall. Presentational only: every plan CTA is a real top-frame
// link (`target="_top"`) to Shopify's hosted managed-pricing page, where the
// actual price/cycle live and are picked. A direct anchor is used (rather than a
// form POST + reauthorize-header redirect) because a user click is a reliable
// user-activation that can navigate the top frame out of the embedded iframe —
// the POST-based redirect intermittently failed during initial setup and looped
// the merchant back to the app index.
//
// NOTE: we intentionally do NOT show prices here. Prices are owned by the
// Partner Dashboard plans and can be changed there without a code deploy;
// rendering them in-app would risk showing a stale amount. The merchant sees the
// real price on Shopify's pricing page after clicking through.
//
// Design: the recommended tier is marked with a real GRADIENT BORDER — an outer
// element filled with the brand gradient, padded 2px, wrapping an ordinary white
// card. Every tier therefore keeps the same light background and the same
// baseline, so the recommendation reads at a glance without inverting one card
// out of four (which made its ribbon collide with the heading) and without
// lifting it out of the grid's alignment.
export default function PricingTiers({ pricingUrl }) {
  return (
    <div style={s.page}>
      <div style={s.inner}>
        <header style={s.head}>
          <span style={s.tag}>Pixoraft</span>
          <h1 style={s.heading}>Pricing that scales with your catalog.</h1>
          <p style={s.subheading}>
            Uniform canvases, clean backgrounds, watermarks and badges — start free
            and move up whenever your catalog does.
          </p>
        </header>

        <div style={s.grid}>
          {PLAN_TIERS.map((tier) => {
            const hot = Boolean(tier.popular);
            // The gradient border is the wrapper; the card itself is identical
            // in both cases apart from its corner radius fitting inside it.
            const card = (
              <div style={hot ? s.cardHot : s.card}>
                {!hot && <div style={s.rail} />}
                <div style={s.cardBody}>
                  <div style={s.tierRow}>
                    <p style={s.tierName}>{tier.name}</p>
                    {hot && <span style={s.ribbon}>Recommended</span>}
                  </div>
                  <p style={s.tagline}>{tier.tagline}</p>

                  <div style={s.quotaBox(hot)}>
                    <span style={s.quotaNum}>{tier.images}</span>
                    <span style={s.quotaUnit}>edits / month</span>
                  </div>

                  <div style={s.featureList}>
                    {tier.features.map((f, i) => (
                      <div key={i} style={s.featureRow}>
                        <span style={hot ? s.markHot : s.mark} aria-hidden="true" />
                        <span style={s.featureText}>{f}</span>
                      </div>
                    ))}
                  </div>

                  <a
                    href={pricingUrl}
                    target="_top"
                    style={{
                      ...(hot ? s.ctaHot : s.cta),
                      display: "block",
                      textAlign: "center",
                      textDecoration: "none",
                      boxSizing: "border-box",
                      cursor: "pointer",
                    }}
                  >
                    {tier.price === 0 ? "Start free" : "Choose plan"}
                  </a>
                </div>
              </div>
            );

            return hot ? (
              <div key={tier.name} style={s.hotFrame}>{card}</div>
            ) : (
              <div key={tier.name} style={s.plainFrame}>{card}</div>
            );
          })}
        </div>

        <p style={s.disclaimer}>Secure billing through Shopify · Change or cancel anytime</p>
      </div>
    </div>
  );
}

const INK = "#230a1c";
const CORE = "#d81b74";
const PLUM = "#8b2fc9";
const MUTED = "#7a6472";
const LINE = "#ecdae5";
const GRAD = "linear-gradient(118deg, #d81b74 0%, #8b2fc9 100%)";
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const s = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(78% 58% at 16% 0%, rgba(216,27,116,0.10) 0%, rgba(216,27,116,0) 60%), radial-gradient(70% 60% at 92% 10%, rgba(139,47,201,0.10) 0%, rgba(139,47,201,0) 62%), linear-gradient(180deg, #fef7fb 0%, #f7eefa 100%)",
    display: "flex",
    justifyContent: "center",
    padding: "48px 24px 56px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif",
    boxSizing: "border-box",
  },
  inner: { width: "100%", maxWidth: 1120 },
  head: { maxWidth: 680, marginBottom: 32 },
  // Monospace pill with a leading dot — the same wordmark treatment the app
  // chrome uses, so the pricing wall is recognisably the same product.
  tag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#96124f",
    background: "#fdeaf3",
    border: "1px solid #f3c5dc",
    borderRadius: 999,
    padding: "5px 13px",
    marginBottom: 18,
  },
  heading: {
    fontSize: 38,
    fontWeight: 700,
    color: INK,
    margin: "0 0 10px 0",
    letterSpacing: "-0.03em",
    lineHeight: 1.1,
  },
  subheading: {
    fontSize: 15,
    lineHeight: 1.6,
    color: MUTED,
    margin: 0,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(234px, 1fr))",
    gap: 16,
    width: "100%",
    alignItems: "stretch",
  },
  // Both frames occupy the same box so the four cards stay on one baseline;
  // only the recommended one paints a gradient in its 2px of padding.
  plainFrame: { display: "flex", padding: 2, borderRadius: 16, boxSizing: "border-box" },
  hotFrame: {
    display: "flex",
    padding: 2,
    borderRadius: 16,
    background: GRAD,
    boxSizing: "border-box",
    boxShadow: "0 20px 40px -22px rgba(139,47,201,0.5)",
  },
  card: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    width: "100%",
    background: "#ffffff",
    borderRadius: 14,
    border: `1px solid ${LINE}`,
    boxShadow: "0 1px 2px rgba(35,10,28,0.05)",
  },
  cardHot: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    width: "100%",
    background: "#ffffff",
    borderRadius: 14,
    border: "none",
  },
  // Vertical gradient rail on the plain tiers — the recommended tier gets the
  // full gradient border instead, so it would be redundant there.
  rail: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
    background: GRAD,
    opacity: 0.5,
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: "22px 20px 20px 23px",
    flex: 1,
  },
  tierRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  tierName: { fontSize: 17, fontWeight: 700, color: INK, margin: 0, letterSpacing: "-0.01em" },
  ribbon: {
    fontFamily: MONO,
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#ffffff",
    background: GRAD,
    borderRadius: 999,
    padding: "4px 10px",
    whiteSpace: "nowrap",
  },
  tagline: { fontSize: 12.5, color: MUTED, margin: "-6px 0 0 0" },
  quotaBox: (hot) => ({
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "12px 14px",
    borderRadius: 10,
    background: hot ? "linear-gradient(118deg, #fdeaf3 0%, #f5ecfd 100%)" : "#fef7fb",
    border: hot ? "1px solid #f0cfe6" : `1px solid ${LINE}`,
  }),
  quotaNum: { fontSize: 24, fontWeight: 700, color: CORE, lineHeight: 1.1, letterSpacing: "-0.02em" },
  quotaUnit: { fontFamily: MONO, fontSize: 10.5, color: MUTED, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" },
  featureList: { display: "flex", flexDirection: "column", gap: 9, flex: 1 },
  featureRow: { display: "flex", alignItems: "flex-start", gap: 10 },
  // A ringed dot instead of a check glyph or a diamond — quieter, and the same
  // mark the billing page uses for plan inclusions.
  mark: {
    width: 6,
    height: 6,
    marginTop: 6,
    marginLeft: 2,
    borderRadius: "50%",
    background: PLUM,
    boxShadow: "0 0 0 3px rgba(139,47,201,0.14)",
    flexShrink: 0,
  },
  markHot: {
    width: 6,
    height: 6,
    marginTop: 6,
    marginLeft: 2,
    borderRadius: "50%",
    background: CORE,
    boxShadow: "0 0 0 3px rgba(216,27,116,0.16)",
    flexShrink: 0,
  },
  featureText: { fontSize: 12.5, color: "#4a3b45", lineHeight: "18px" },
  cta: {
    width: "100%",
    padding: "11px 12px",
    background: "#ffffff",
    color: PLUM,
    border: "1px solid #e4c9f2",
    borderRadius: 999,
    fontSize: 13.5,
    fontWeight: 700,
  },
  ctaHot: {
    width: "100%",
    padding: "11px 12px",
    background: GRAD,
    color: "#ffffff",
    border: "1px solid transparent",
    borderRadius: 999,
    fontSize: 13.5,
    fontWeight: 700,
    boxShadow: "0 10px 22px -10px rgba(216,27,116,0.6)",
  },
  disclaimer: { fontSize: 12, color: MUTED, marginTop: 28 },
};
