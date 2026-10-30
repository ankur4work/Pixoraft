import { useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Divider,
  Badge,
} from "@shopify/polaris";

// Help & reference page.
const STEPS = [
  {
    n: "1",
    title: "Set up your branding",
    body: "Open Branding and design your watermark (text or logo), promo badge, and canvas — aspect ratio and background color. These settings are saved per shop and every studio run uses them, so the look stays consistent.",
  },
  {
    n: "2",
    title: "Pick an edit recipe",
    body: "In the Media Studio, tick the edits you want: uniform canvas, background whitening, resize, watermark, badge. Edits apply in a fixed order — resize, whiten, canvas, then overlays — so the result is predictable.",
  },
  {
    n: "3",
    title: "Run it across products",
    body: "Select one product or many (bulk edits are a Growth feature) and apply. Each image is downloaded, edited and uploaded back to Shopify — the original is removed and your image order is restored at the end.",
  },
  {
    n: "4",
    title: "Check the history",
    body: "History lists every edit the studio applied — which product, which operations, and when — so you always know what changed.",
  },
];

const FAQ = [
  {
    q: "Are my original images kept?",
    a: "No — the edited copy replaces the original on the product, which is what makes your storefront show the new version. Shopify's own file history is the recovery path, so run the studio on a product you are happy to update.",
  },
  {
    q: "Does the canvas edit crop my photos?",
    a: "Never. The canvas pads the image out to the target aspect ratio on your chosen background color — nothing is cut off.",
  },
  {
    q: "Where do the watermark and badge settings come from?",
    a: "From the Branding page. The studio run and the Branding preview use the same positions and relative sizes, so what you previewed is what gets rendered.",
  },
  {
    q: "What counts against my monthly quota?",
    a: "Only images that were actually edited and replaced. Failed images are refunded automatically, so re-running the studio is always safe.",
  },
  {
    q: "Can I keep the page closed during a run?",
    a: "A run is driven by your browser, so keep the tab open until it finishes. Up to six images are processed at a time.",
  },
  {
    q: "Does the quota reset?",
    a: "Yes — usage is counted per calendar month (UTC) and starts again at zero on the first of each month.",
  },
];

export default function HelpPage() {
  const navigate = useNavigate();

  return (
    <Page
      title="Pixoraft — Help"
      subtitle="How the studio works, and answers to the questions merchants ask most"
    >
      <Layout>
        <Layout.Section>
          <div className="px-topbar">
            <span className="px-topbar-badge px-topbar-badge--code" aria-hidden="true">HQ</span>
            <div className="px-topbar-text">
              <p className="px-topbar-title">Getting started</p>
              <p className="px-topbar-sub">Four steps from install to a consistent, on-brand catalog</p>
            </div>
            <span className="px-topbar-meta">Guide</span>
          </div>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {STEPS.map((step, i) => (
                <BlockStack key={step.n} gap="400">
                  {i > 0 && <Divider />}
                  <InlineStack gap="400" blockAlign="start" wrap={false}>
                    <span className="px-step" aria-hidden="true">{step.n}</span>
                    <BlockStack gap="150">
                      <Text variant="headingSm" as="h3">{step.title}</Text>
                      <Text variant="bodySm" as="p" tone="subdued">{step.body}</Text>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200" blockAlign="center">
                <Text variant="headingSm" as="h2">Frequently asked</Text>
                <Badge>{`${FAQ.length} answers`}</Badge>
              </InlineStack>
              {FAQ.map((item, i) => (
                <BlockStack key={item.q} gap="400">
                  {i > 0 && <Divider />}
                  <BlockStack gap="150">
                    <Text variant="bodyMd" as="h3" fontWeight="semibold">{item.q}</Text>
                    <Text variant="bodySm" as="p" tone="subdued">{item.a}</Text>
                  </BlockStack>
                </BlockStack>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingSm" as="h2">Jump back in</Text>
              <InlineStack gap="300" wrap>
                <Button variant="primary" onClick={() => navigate("/app/mediastudio")}>
                  Open Media Studio
                </Button>
                <Button onClick={() => navigate("/app/branding")}>
                  Branding settings
                </Button>
                <Button onClick={() => navigate("/app/billing")}>
                  Manage plan
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
