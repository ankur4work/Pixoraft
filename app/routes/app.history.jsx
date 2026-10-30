import { useLoaderData, useNavigate } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import RouteError from '../components/RouteError';
import { authenticate } from '../shopify.server';
import { currentPeriod } from '../usage.server';
import db from '../db.server';
import {
  Page,
  Layout,
  Card,
  Button,
  Badge,
  Text,
  InlineStack,
  BlockStack,
  Divider,
  EmptyState,
} from '@shopify/polaris';

/* -------------------------------------------------------------------------- */
/*  Loader — everything comes from the local edit history, no Shopify calls   */
/* -------------------------------------------------------------------------- */

const OP_LABELS = {
  canvas: 'Canvas',
  whiten: 'Whiten',
  resize: 'Resize',
  watermark: 'Watermark',
  badge: 'Badge',
};

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const monthStart = new Date(`${currentPeriod()}-01T00:00:00Z`);

  let recent = [];
  let totalEdits = 0;
  let monthEdits = 0;
  try {
    [recent, totalEdits, monthEdits] = await Promise.all([
      db.studioEdit.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.studioEdit.count({ where: { shop } }),
      db.studioEdit.count({ where: { shop, createdAt: { gte: monthStart } } }),
    ]);
  } catch { /* history table not migrated yet — show an empty page */ }

  // Tally operations across the recent window for the per-op breakdown.
  const opCounts = {};
  const productIds = new Set();
  for (const row of recent) {
    productIds.add(row.productId);
    try {
      for (const op of JSON.parse(row.ops)) {
        opCounts[op] = (opCounts[op] || 0) + 1;
      }
    } catch { /* unreadable record — skip its tally */ }
  }

  return {
    totalEdits,
    monthEdits,
    recentProducts: productIds.size,
    opCounts,
    edits: recent.map((row) => {
      let ops = [];
      try { ops = JSON.parse(row.ops); } catch { /* shown without op chips */ }
      return {
        id: row.id,
        productTitle: row.productTitle || 'Product',
        ops,
        createdAt: row.createdAt,
      };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/*  UI                                                                        */
/* -------------------------------------------------------------------------- */

const fmtDate = (d) =>
  new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

export default function HistoryPage() {
  const { totalEdits, monthEdits, recentProducts, opCounts, edits } = useLoaderData();
  const navigate = useNavigate();

  const opBreakdown = Object.entries(opCounts).sort((a, b) => b[1] - a[1]);

  return (
    <Page
      title="Pixoraft — History"
      subtitle="Every edit the studio has applied, newest first"
    >
      <Layout>
        <Layout.Section>
          <div className="px-topbar">
            <span className="px-topbar-badge px-topbar-badge--code" aria-hidden="true">HI</span>
            <div className="px-topbar-text">
              <p className="px-topbar-title">Edit history</p>
              <p className="px-topbar-sub">What ran, on which products, and when</p>
            </div>
            <span className="px-topbar-meta">Log</span>
          </div>
        </Layout.Section>

        <Layout.Section>
          <div className="px-figure-grid">
            <div className="px-figure">
              <p className="px-figure-label">Edits all-time</p>
              <p className="px-figure-value">{totalEdits.toLocaleString()}</p>
            </div>
            <div className="px-figure">
              <p className="px-figure-label">Edits this month</p>
              <p className="px-figure-value px-figure-value--good">{monthEdits.toLocaleString()}</p>
            </div>
            <div className="px-figure">
              <p className="px-figure-label">Products touched (recent)</p>
              <p className="px-figure-value">{recentProducts}</p>
            </div>
          </div>
        </Layout.Section>

        {opBreakdown.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <div className="px-section-head">
                  <Text variant="headingSm" as="h2">By operation</Text>
                  <Badge>last {edits.length} edits</Badge>
                </div>
                <InlineStack gap="300" wrap>
                  {opBreakdown.map(([op, count]) => (
                    <InlineStack key={op} gap="150" blockAlign="center">
                      <Badge tone="info">{OP_LABELS[op] || op}</Badge>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{count}</Text>
                    </InlineStack>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            {edits.length === 0 ? (
              <EmptyState
                heading="No edits yet"
                action={{ content: 'Open Media Studio', onAction: () => navigate('/app/mediastudio') }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Run your first edit recipe and it will show up here.</p>
              </EmptyState>
            ) : (
              <BlockStack gap="300">
                {edits.map((edit, i) => (
                  <BlockStack key={edit.id} gap="300">
                    {i > 0 && <Divider />}
                    <InlineStack align="space-between" blockAlign="center" wrap>
                      <InlineStack gap="300" blockAlign="center" wrap>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">{edit.productTitle}</Text>
                        <InlineStack gap="100">
                          {edit.ops.map((op) => (
                            <Badge key={op} tone="info">{OP_LABELS[op] || op}</Badge>
                          ))}
                        </InlineStack>
                      </InlineStack>
                      <Text as="span" variant="bodySm" tone="subdued">{fmtDate(edit.createdAt)}</Text>
                    </InlineStack>
                  </BlockStack>
                ))}
              </BlockStack>
            )}
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <InlineStack gap="300">
              <Button variant="primary" onClick={() => navigate('/app/mediastudio')}>
                Open Media Studio
              </Button>
              <Button onClick={() => navigate('/app/billing')}>Manage plan</Button>
            </InlineStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  return <RouteError />;
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
