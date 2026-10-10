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

// Help & reference page. Replaces the scaffold's "additional page" placeholder,
// which shipped with template copy about how to add pages to the nav menu.
const STEPS = [
  {
    n: "1",
    title: "Run the optimizer",
    body: "Open Image Optimization, pick the products you want (or select all), and start a run. Each image is downloaded, re-compressed to WebP and uploaded back to Shopify — the original is removed and your image order is restored at the end.",
  },
  {
    n: "2",
    title: "Let alt text follow",
    body: "The optimizer writes AI alt text for images that have none. For a dedicated pass over your whole catalog — one caption per product, applied to all of its images — use the Alt Text Generator.",
  },
  {
    n: "3",
    title: "Measure the result",
    body: "Analytics shows the real before/after file sizes recorded during each run. Page Speed Reports adds a live Lighthouse test against the public product page via Google PageSpeed Insights.",
  },
  {
    n: "4",
    title: "Automate it",
    body: "Turn on auto-optimize and every newly created product is optimized in the background, without opening the app.",
  },
];

const FAQ = [
  {
    q: "Are my original images kept?",
    a: "No — the optimized copy replaces the original on the product, which is what makes your storefront serve the smaller file. Shopify's own file history is the recovery path, so run the optimizer on a product you are happy to update.",
  },
  {
    q: "Why was an image skipped?",
    a: "Images that are already efficiently encoded are left alone. If re-compressing would save only a couple of kilobytes, replacing the file (and invalidating its CDN URL) is not worth a quota credit, so it is recorded as already optimal and never retried.",
  },
  {
    q: "What counts against my monthly quota?",
    a: "Only images that were actually re-encoded and replaced. Skipped and failed images are refunded automatically, so re-running the optimizer is always safe.",
  },
  {
    q: "Can I keep the page closed during a run?",
    a: "An interactive run is driven by your browser, so keep the tab open until it finishes. Auto-optimize runs server-side and needs nothing open.",
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
      subtitle="How the optimizer works, and answers to the questions merchants ask most"
    >
      <Layout>
        <Layout.Section>
          <div className="px-topbar">
            <span className="px-topbar-badge px-topbar-badge--code" aria-hidden="true">HQ</span>
            <div className="px-topbar-text">
              <p className="px-topbar-title">Getting started</p>
              <p className="px-topbar-sub">Four steps from install to a measurably lighter catalog</p>
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
                <Button variant="primary" onClick={() => navigate("/app/productoptimization")}>
                  Open optimizer
                </Button>
                <Button onClick={() => navigate("/app/imageoptimizationdashboard")}>
                  View analytics
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
