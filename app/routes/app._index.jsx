import { useNavigate, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getBillingStateCached } from "../billing.server";
import { getUsage } from "../usage.server";
import { entitled } from "../plans.server";
import { getBranding } from "../transform.server";
import {
  Page,
  Layout,
  Card,
  Button,
  Badge,
  Text,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";
import UsageMeter from "../components/UsageMeter";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  let plan = null;
  try {
    plan = (await getBillingStateCached(admin, session.shop)).plan;
  } catch (e) {
    if (e instanceof Response) throw e; // let re-auth propagate
  }

  let usage = { imagesUsed: 0 };
  let brandingReady = false;
  try {
    usage = await getUsage(session.shop);
    const branding = await getBranding(session.shop);
    brandingReady = branding.watermarkMode === "logo"
      ? Boolean(branding.watermarkLogo)
      : Boolean(branding.watermarkText);
  } catch { /* usage/settings tables not ready — defaults */ }

  return {
    plan: {
      name: plan?.name || "Free",
      tier: plan?.tier || "free",
      monthlyImages: plan?.monthlyImages ?? 100,
      whiten: entitled(plan, "whiten"),
      watermark: entitled(plan, "watermarkText"),
      badge: entitled(plan, "badge"),
      bulkEdit: entitled(plan, "bulkEdit"),
    },
    usage,
    brandingReady,
  };
};

export default function Index() {
  const navigate = useNavigate();
  const { plan, usage, brandingReady } = useLoaderData();

  const quota = plan.monthlyImages || 0;
  const used = usage?.imagesUsed || 0;
  const remaining = Math.max(0, quota - used);
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const fmt = (n) => Number(n).toLocaleString();

  // Tool tiles — a 2-up grid of self-contained cards, each with its own status
  // chip and action, so availability is readable without opening the page. The
  // badge carries a two-letter monospace code rather than a glyph, so it renders
  // identically on every platform instead of depending on font coverage.
  const tools = [
    {
      code: "MS",
      title: "Media Studio",
      desc: "Pick an edit recipe — uniform canvas, background whitening, resize, watermark, badge — and run it across whole products.",
      cta: "Open studio",
      onClick: () => navigate("/app/mediastudio"),
      available: true,
      chip: { label: "Included", tone: "on" },
    },
    {
      code: "BR",
      title: "Branding",
      desc: "Design your watermark, promo badge and canvas once — every studio run applies the same settings.",
      cta: "Set up branding",
      onClick: () => navigate("/app/branding"),
      available: true,
      chip: brandingReady
        ? { label: "Configured", tone: "on" }
        : { label: "Not set up", tone: "off" },
    },
    {
      code: "BW",
      title: "Background whitening",
      desc: "Clean up studio backdrops — gradients, shadows and all — to pure #FFFFFF so product photos sit cleanly on any page.",
      cta: plan.whiten ? "Open studio" : "Upgrade to Starter",
      onClick: () => navigate(plan.whiten ? "/app/mediastudio" : "/app/billing"),
      available: plan.whiten,
      chip: plan.whiten
        ? { label: "Included", tone: "on" }
        : { label: "Starter & up", tone: "attention" },
    },
    {
      code: "PB",
      title: "Promo badges & bulk edits",
      desc: "Stamp SALE/NEW badges across a collection and run edits over many products in one go.",
      cta: plan.badge ? "Open studio" : "Upgrade to Growth",
      onClick: () => navigate(plan.badge ? "/app/mediastudio" : "/app/billing"),
      available: plan.badge,
      chip: plan.badge
        ? { label: "Included", tone: "on" }
        : { label: "Growth & up", tone: "attention" },
    },
  ];

  // Numeric metrics get the big tabular figure; word values get a pill so long
  // labels like "Growth & up" can't wrap into an overlapping headline.
  const metrics = [
    { label: "Current plan", value: plan.name, pill: "brand" },
    { label: "Edits used", value: fmt(used) },
    { label: "Edits left", value: fmt(remaining) },
    {
      label: "Branding",
      value: brandingReady ? "Ready" : "Not set",
      pill: brandingReady ? "on" : "subdued",
    },
  ];

  return (
    <Page>
      {/* Hero — ink panel with a notched corner and a bottom gradient edge */}
      <div className="px-hero">
        <InlineStack align="space-between" blockAlign="center" wrap={false} gap="600">
          <BlockStack gap="300">
            <span className="px-hero-tag">Pixoraft</span>
            <div className="px-hero-copy">
              <h1>Consistent, on-brand product photos.</h1>
              <p>Standardize every image on one canvas, clean up backgrounds, and stamp watermarks and promo badges — across whole collections in one run.</p>
            </div>
          </BlockStack>
          <Button variant="primary" size="large" onClick={() => navigate("/app/mediastudio")}>
            Open studio
          </Button>
        </InlineStack>
      </div>

      <Layout>
        {/* Metric tiles */}
        <Layout.Section>
          <div className="px-metrics">
            {metrics.map((m) => (
              <div key={m.label} className="px-metric">
                <p className="px-metric-label">{m.label}</p>
                {m.pill ? (
                  <span className={`px-metric-pill px-metric-pill--${m.pill}`} title={m.value}>
                    {m.value}
                  </span>
                ) : (
                  <p className="px-metric-value">{m.value}</p>
                )}
              </div>
            ))}
          </div>
        </Layout.Section>

        {/* Monthly usage — the spent percentage is promoted to a figure on the
            right so the meter has a number beside it rather than under it. */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <div className="px-section-head">
                  <Text variant="headingSm" as="h2">Monthly edit usage</Text>
                  <Badge tone={plan.tier === "free" ? undefined : "success"}>{`${plan.name} plan`}</Badge>
                </div>
                <InlineStack gap="300" blockAlign="center">
                  <Text variant="headingMd" as="p" tone={pct >= 100 ? "critical" : "subdued"}>
                    {`${pct}%`}
                  </Text>
                  <Button variant="plain" onClick={() => navigate("/app/billing")}>Manage plan</Button>
                </InlineStack>
              </InlineStack>
              <UsageMeter used={used} quota={quota} />
              <Text variant="bodySm" as="p" tone="subdued">
                {`${fmt(used)} of ${fmt(quota)} edits this month · ${fmt(remaining)} remaining`}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Tool tiles, under a labelled section head rather than floating bare */}
        <Layout.Section>
          <BlockStack gap="300">
            <div className="px-section-head">
              <Text variant="headingSm" as="h2">Your toolkit</Text>
            </div>
            <div className="px-tools">
              {tools.map((t) => (
                <div key={t.title} className={t.available ? "px-tool" : "px-tool is-locked"}>
                  <div className="px-tool-head">
                    <span className="px-tool-icon px-tool-icon--code" aria-hidden="true">{t.code}</span>
                    <div>
                      <p className="px-tool-title">{t.title}</p>
                      <p className="px-tool-desc" style={{ marginTop: 6 }}>{t.desc}</p>
                    </div>
                  </div>
                  <div className="px-tool-foot">
                    <span className={`px-tool-chip px-tool-chip--${t.chip.tone}`}>{t.chip.label}</span>
                    <Button variant={t.available ? "primary" : "secondary"} onClick={t.onClick}>
                      {t.cta}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
