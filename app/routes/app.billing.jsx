import { useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getBillingState,
  managedPricingUrl,
  appBridgeRedirect,
  cancelSubscription,
} from "../billing.server";
import { getUsage } from "../usage.server";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Divider,
  Banner,
} from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import UsageMeter from "../components/UsageMeter";

// Human labels for the entitlement flags, shown as the current plan's inclusions.
const FEATURE_LABELS = {
  canvas: "Uniform canvas & aspect ratios",
  resize: "Resize to a max dimension",
  whiten: "Background whitening",
  watermarkText: "Text watermarks",
  watermarkLogo: "Logo watermarks",
  badge: "Promo badges",
  bulkEdit: "Bulk edits across products",
  priority: "Priority processing",
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  let state = { hasActivePlan: false, plan: null, appHandle: undefined };
  try {
    state = await getBillingState(admin, session.shop);
  } catch (e) {
    if (e instanceof Response) throw e;
  }

  let usage = { imagesUsed: 0 };
  try { usage = await getUsage(session.shop); } catch { /* table not ready */ }

  const plan = state.plan || { name: "Free", tier: "free", monthlyImages: 100, features: {} };
  const included = Object.keys(FEATURE_LABELS).filter((k) => plan.features?.[k]);

  return {
    hasActivePlan: state.hasActivePlan,
    planName: plan.name,
    tier: plan.tier,
    monthlyImages: plan.monthlyImages,
    included,
    imagesUsed: usage.imagesUsed || 0,
    // Direct top-frame link target for the Change/Choose-plan CTA.
    pricingUrl: managedPricingUrl(session.shop, state.appHandle),
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  const state = await getBillingState(admin);
  const pricingUrl = managedPricingUrl(session.shop, state.appHandle);

  // Cancel: try the in-app cancel mutation first; if managed pricing blocks it,
  // fall back to the hosted page to cancel manually.
  if (actionType === "cancel") {
    const sub = state.activeSubscription;
    if (!sub) return { cancelled: true };
    try {
      await cancelSubscription(admin, sub.id);
      return { cancelled: true };
    } catch (e) {
      console.error("[BILLING] in-app cancel failed, redirecting:", e?.message);
      throw appBridgeRedirect(pricingUrl);
    }
  }

  return null;
};

export default function BillingPage() {
  const { hasActivePlan, planName, tier, monthlyImages, included, imagesUsed, pricingUrl } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isBusy = navigation.state !== "idle";

  const post = (actionType) => {
    const fd = new FormData();
    fd.append("actionType", actionType);
    submit(fd, { method: "post" });
  };

  const quota = monthlyImages || 0;
  const used = imagesUsed || 0;
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const fmt = (n) => Number(n).toLocaleString();

  return (
    <Page title="Pixoraft — Billing" subtitle="Manage your plan">
      <Layout>
        <Layout.Section>
          <div className="px-topbar">
            <span className="px-topbar-badge px-topbar-badge--code" aria-hidden="true">BL</span>
            <div className="px-topbar-text">
              <p className="px-topbar-title">Plan &amp; usage</p>
              <p className="px-topbar-sub">Billed securely through Shopify — change or cancel anytime</p>
            </div>
            <span className="px-topbar-meta">{planName}</span>
          </div>
        </Layout.Section>

        {actionData?.cancelled && !hasActivePlan && (
          <Layout.Section>
            <Banner title="Subscription cancelled" tone="info">
              Your plan has been cancelled. Choose a plan any time to unlock more.
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="200">
                  <InlineStack gap="300" blockAlign="center">
                    <Text variant="headingXl" as="h2">{planName}</Text>
                    {hasActivePlan
                      ? <Badge tone="success">Active</Badge>
                      : <Badge>Current</Badge>}
                  </InlineStack>
                  <Text variant="bodySm" as="p" tone="subdued">
                    {`Up to ${fmt(quota)} image edits per month`}
                  </Text>
                </BlockStack>
                <InlineStack gap="300">
                  <Button variant="primary" url={pricingUrl} target="_top">
                    {hasActivePlan ? "Change plan" : "Choose a plan"}
                  </Button>
                  {hasActivePlan && (
                    <Button tone="critical" variant="plain" loading={isBusy} onClick={() => post("cancel")}>
                      Cancel
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>

              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="bodySm" as="p" tone="subdued">Edits this month</Text>
                  <Text variant="bodySm" as="p" tone={pct >= 100 ? "critical" : "subdued"}>
                    {`${fmt(used)} / ${fmt(quota)}`}
                  </Text>
                </InlineStack>
                <UsageMeter used={used} quota={quota} />
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <div className="px-section-head">
                  <Text variant="headingSm" as="h3">Included in your plan</Text>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  {included.map((k) => (
                    <InlineStack key={k} gap="200" blockAlign="center" wrap={false}>
                      {/* A ringed dot rather than a rotated diamond — the
                          circle-with-a-ring is this theme's brand mark. */}
                      <span
                        aria-hidden="true"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "#d81b74",
                          boxShadow: "0 0 0 3px rgba(216,27,116,0.16)",
                          flexShrink: 0,
                          marginLeft: 2,
                        }}
                      />
                      <Text variant="bodySm" as="span">{FEATURE_LABELS[k]}</Text>
                    </InlineStack>
                  ))}
                </div>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Text variant="bodySm" as="p" tone="subdued">
            Plans and prices are managed securely on Shopify's billing page. Use “Change plan”
            to upgrade, downgrade, or switch between monthly and yearly — changes are reflected
            here automatically.
          </Text>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
