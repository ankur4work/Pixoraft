import { useState, useCallback, useEffect } from 'react';
import { useLoaderData, useFetcher } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import RouteError from '../components/RouteError';
import { authenticate } from '../shopify.server';
import { getBillingStateCached } from '../billing.server';
import { entitled } from '../plans.server';
import { getBranding, BRANDING_DEFAULTS } from '../transform.server';
import db from '../db.server';
import {
  Page,
  Layout,
  Card,
  Button,
  Badge,
  Text,
  Box,
  InlineStack,
  BlockStack,
  Divider,
  Banner,
  Select,
  TextField,
  RangeSlider,
  DropZone,
  Thumbnail,
  ChoiceList,
} from '@shopify/polaris';

/* -------------------------------------------------------------------------- */
/*  Loader / action                                                           */
/* -------------------------------------------------------------------------- */

const POSITIONS = [
  { label: 'Top left', value: 'northwest' },
  { label: 'Top center', value: 'north' },
  { label: 'Top right', value: 'northeast' },
  { label: 'Middle left', value: 'west' },
  { label: 'Center', value: 'center' },
  { label: 'Middle right', value: 'east' },
  { label: 'Bottom left', value: 'southwest' },
  { label: 'Bottom center', value: 'south' },
  { label: 'Bottom right', value: 'southeast' },
];

const RATIOS = [
  { label: 'Square — 1:1 (recommended)', value: '1:1' },
  { label: 'Portrait — 4:5', value: '4:5' },
  { label: 'Portrait — 3:4', value: '3:4' },
  { label: 'Landscape — 16:9', value: '16:9' },
];

const isHex = (v) => /^#[0-9a-f]{3,8}$/i.test(v || '');
const inList = (v, list) => list.some((o) => o.value === v);
const clampInt = (v, min, max, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
};

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  let plan = null;
  try {
    plan = (await getBillingStateCached(admin, session.shop)).plan;
  } catch (e) {
    if (e instanceof Response) throw e;
  }

  return {
    branding: await getBranding(session.shop),
    can: {
      watermarkText: entitled(plan, 'watermarkText'),
      watermarkLogo: entitled(plan, 'watermarkLogo'),
      badge: entitled(plan, 'badge'),
    },
  };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const d = BRANDING_DEFAULTS;

  // Everything is validated server-side — these values are later interpolated
  // into SVG overlays, so only known-safe shapes are stored.
  const logo = String(form.get('watermarkLogo') || '');
  if (logo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo)) {
    return { success: false, error: 'The logo could not be read. Upload a PNG, JPEG or WebP.' };
  }
  if (logo.length > 700_000) {
    return { success: false, error: 'That logo is too large — keep it under 500 KB.' };
  }

  const data = {
    watermarkMode: form.get('watermarkMode') === 'logo' ? 'logo' : 'text',
    watermarkText: String(form.get('watermarkText') || '').slice(0, 60),
    watermarkLogo: logo || null,
    watermarkPosition: inList(form.get('watermarkPosition'), POSITIONS)
      ? form.get('watermarkPosition') : d.watermarkPosition,
    watermarkOpacity: clampInt(form.get('watermarkOpacity'), 5, 100, d.watermarkOpacity),
    watermarkScale: clampInt(form.get('watermarkScale'), 5, 50, d.watermarkScale),
    badgeText: String(form.get('badgeText') || d.badgeText).slice(0, 16),
    badgeColor: isHex(form.get('badgeColor')) ? form.get('badgeColor') : d.badgeColor,
    badgePosition: inList(form.get('badgePosition'), POSITIONS)
      ? form.get('badgePosition') : d.badgePosition,
    canvasRatio: inList(form.get('canvasRatio'), RATIOS) ? form.get('canvasRatio') : d.canvasRatio,
    canvasColor: isHex(form.get('canvasColor')) ? form.get('canvasColor') : d.canvasColor,
  };

  await db.shopSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return { success: true };
}

/* -------------------------------------------------------------------------- */
/*  Preview helpers (CSS mirror of the server-side placement)                 */
/* -------------------------------------------------------------------------- */

function overlayStyle(position) {
  const style = { position: 'absolute', margin: '4%' };
  if (/west/.test(position)) style.left = 0;
  else if (/east/.test(position)) style.right = 0;
  else { style.left = '50%'; style.transform = 'translateX(-50%)'; }
  if (/north/.test(position)) style.top = 0;
  else if (/south/.test(position)) style.bottom = 0;
  else {
    style.top = '50%';
    style.transform = style.transform
      ? 'translate(-50%, -50%)'
      : 'translateY(-50%)';
  }
  return style;
}

/* -------------------------------------------------------------------------- */
/*  UI                                                                        */
/* -------------------------------------------------------------------------- */

export default function BrandingPage() {
  const { branding, can } = useLoaderData();
  const saver = useFetcher();

  const [mode, setMode] = useState(branding.watermarkMode);
  const [text, setText] = useState(branding.watermarkText);
  const [logo, setLogo] = useState(branding.watermarkLogo || '');
  const [wmPosition, setWmPosition] = useState(branding.watermarkPosition);
  const [opacity, setOpacity] = useState(branding.watermarkOpacity);
  const [scale, setScale] = useState(branding.watermarkScale);
  const [badgeText, setBadgeText] = useState(branding.badgeText);
  const [badgeColor, setBadgeColor] = useState(branding.badgeColor);
  const [badgePosition, setBadgePosition] = useState(branding.badgePosition);
  const [canvasRatio, setCanvasRatio] = useState(branding.canvasRatio);
  const [canvasColor, setCanvasColor] = useState(branding.canvasColor);

  const [logoError, setLogoError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (saver.state === 'idle' && saver.data?.success) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 5000);
      return () => clearTimeout(t);
    }
  }, [saver.state, saver.data]);

  const handleLogoDrop = useCallback((_dropped, accepted) => {
    setLogoError(null);
    const file = accepted?.[0];
    if (!file) {
      setLogoError('Upload a PNG, JPEG or WebP image.');
      return;
    }
    if (file.size > 500 * 1024) {
      setLogoError('Keep the logo under 500 KB — a small transparent PNG works best.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result || ''));
    reader.readAsDataURL(file);
  }, []);

  const handleSave = useCallback(() => {
    saver.submit(
      {
        watermarkMode: mode,
        watermarkText: text,
        watermarkLogo: logo,
        watermarkPosition: wmPosition,
        watermarkOpacity: String(opacity),
        watermarkScale: String(scale),
        badgeText,
        badgeColor,
        badgePosition,
        canvasRatio,
        canvasColor,
      },
      { method: 'post' }
    );
  }, [saver, mode, text, logo, wmPosition, opacity, scale, badgeText, badgeColor, badgePosition, canvasRatio, canvasColor]);

  const saving = saver.state !== 'idle';
  const watermarkAllowed = mode === 'logo' ? can.watermarkLogo : can.watermarkText;

  return (
    <Page
      title="Pixoraft — Branding"
      subtitle="Design the watermark, badge and canvas the studio applies to your images"
      primaryAction={{ content: 'Save settings', onAction: handleSave, loading: saving }}
    >
      <Layout>
        <Layout.Section>
          <div className="px-topbar">
            <span className="px-topbar-badge px-topbar-badge--code" aria-hidden="true">BR</span>
            <div className="px-topbar-text">
              <p className="px-topbar-title">Branding</p>
              <p className="px-topbar-sub">Set it once — every studio run uses these settings</p>
            </div>
            <span className="px-topbar-meta">Settings</span>
          </div>
        </Layout.Section>

        {saver.data?.error && (
          <Layout.Section>
            <Banner title="Could not save" tone="critical">{saver.data.error}</Banner>
          </Layout.Section>
        )}
        {saved && (
          <Layout.Section>
            <Banner title="Saved" tone="success" onDismiss={() => setSaved(false)}>
              Your branding settings are live — the next studio run will use them.
            </Banner>
          </Layout.Section>
        )}

        {/* Watermark */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <div className="px-section-head">
                  <Text variant="headingSm" as="h2">Watermark</Text>
                </div>
                {!watermarkAllowed && (
                  <Badge tone="attention">{mode === 'logo' ? 'Growth & up' : 'Starter & up'}</Badge>
                )}
              </InlineStack>

              <ChoiceList
                title="Watermark type"
                choices={[
                  { label: 'Text', value: 'text', helpText: 'Your store or brand name, semi-transparent.' },
                  {
                    label: 'Logo image',
                    value: 'logo',
                    helpText: 'A small transparent PNG works best. Growth plan & up.',
                    disabled: !can.watermarkLogo,
                  },
                ]}
                selected={[mode]}
                onChange={(v) => setMode(v[0] || 'text')}
              />

              {mode === 'text' ? (
                <TextField
                  label="Watermark text"
                  value={text}
                  onChange={setText}
                  maxLength={60}
                  autoComplete="off"
                  placeholder="© Your Brand"
                />
              ) : (
                <BlockStack gap="200">
                  <InlineStack gap="400" blockAlign="center">
                    <Box width="140px">
                      <DropZone accept="image/png,image/jpeg,image/webp" type="image" allowMultiple={false} onDrop={handleLogoDrop}>
                        {logo
                          ? <DropZone.FileUpload actionTitle="Replace logo" />
                          : <DropZone.FileUpload actionTitle="Upload logo" actionHint="PNG with transparency" />}
                      </DropZone>
                    </Box>
                    {logo && <Thumbnail source={logo} alt="Watermark logo" size="large" />}
                  </InlineStack>
                  {logoError && <Text as="p" tone="critical" variant="bodySm">{logoError}</Text>}
                </BlockStack>
              )}

              <InlineStack gap="400" wrap>
                <Box minWidth="200px">
                  <Select label="Position" options={POSITIONS} value={wmPosition} onChange={setWmPosition} />
                </Box>
                <Box minWidth="220px">
                  <RangeSlider
                    label={`Opacity — ${opacity}%`}
                    min={5} max={100}
                    value={opacity}
                    onChange={setOpacity}
                  />
                </Box>
                <Box minWidth="220px">
                  <RangeSlider
                    label={`Size — ${scale}% of image width`}
                    min={5} max={50}
                    value={scale}
                    onChange={setScale}
                  />
                </Box>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Badge */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <div className="px-section-head">
                  <Text variant="headingSm" as="h2">Promo badge</Text>
                </div>
                {!can.badge && <Badge tone="attention">Growth & up</Badge>}
              </InlineStack>
              <InlineStack gap="400" wrap>
                <Box minWidth="180px">
                  <TextField
                    label="Badge text"
                    value={badgeText}
                    onChange={(v) => setBadgeText(v.slice(0, 16))}
                    autoComplete="off"
                    placeholder="SALE"
                  />
                </Box>
                <Box minWidth="160px">
                  <TextField
                    label="Badge color"
                    value={badgeColor}
                    onChange={setBadgeColor}
                    autoComplete="off"
                    error={isHex(badgeColor) ? undefined : 'Hex color, e.g. #D7263D'}
                  />
                </Box>
                <Box minWidth="200px">
                  <Select label="Position" options={POSITIONS} value={badgePosition} onChange={setBadgePosition} />
                </Box>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Canvas */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <div className="px-section-head">
                <Text variant="headingSm" as="h2">Canvas</Text>
              </div>
              <Text variant="bodySm" as="p" tone="subdued">
                The canvas edit pads every image to one aspect ratio — it never crops —
                so your collection grids line up perfectly.
              </Text>
              <InlineStack gap="400" wrap>
                <Box minWidth="260px">
                  <Select label="Aspect ratio" options={RATIOS} value={canvasRatio} onChange={setCanvasRatio} />
                </Box>
                <Box minWidth="160px">
                  <TextField
                    label="Background color"
                    value={canvasColor}
                    onChange={setCanvasColor}
                    autoComplete="off"
                    error={isHex(canvasColor) ? undefined : 'Hex color, e.g. #FFFFFF'}
                  />
                </Box>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Live preview */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <div className="px-section-head">
                <Text variant="headingSm" as="h2">Preview</Text>
              </div>
              <Text variant="bodySm" as="p" tone="subdued">
                An approximation of where your overlays will land — the real render uses
                the exact same positions and sizes relative to each image.
              </Text>
              <div
                style={{
                  position: 'relative',
                  width: 320,
                  aspectRatio: canvasRatio.replace(':', ' / '),
                  maxWidth: '100%',
                  background: isHex(canvasColor) ? canvasColor : '#FFFFFF',
                  backgroundImage:
                    'radial-gradient(circle at 50% 55%, rgba(120,70,160,0.35), rgba(120,70,160,0.08) 60%)',
                  border: '1px solid var(--p-color-border, #d9d9de)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                {/* watermark */}
                {(mode === 'text' ? text : logo) && (
                  <div style={overlayStyle(wmPosition)}>
                    {mode === 'text' ? (
                      <span
                        style={{
                          fontWeight: 700,
                          fontFamily: 'Arial, sans-serif',
                          color: '#fff',
                          textShadow: '0 0 2px rgba(0,0,0,0.5)',
                          opacity: opacity / 100,
                          fontSize: Math.max(10, (320 * scale) / 100 / Math.max(1, text.length * 0.62)),
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {text}
                      </span>
                    ) : (
                      <img
                        src={logo}
                        alt="Watermark preview"
                        style={{ width: (320 * scale) / 100, opacity: opacity / 100, display: 'block' }}
                      />
                    )}
                  </div>
                )}
                {/* badge */}
                {badgeText && (
                  <div style={overlayStyle(badgePosition)}>
                    <span
                      style={{
                        display: 'inline-block',
                        background: isHex(badgeColor) ? badgeColor : '#D7263D',
                        color: '#fff',
                        fontWeight: 800,
                        fontFamily: 'Arial, sans-serif',
                        letterSpacing: 1,
                        fontSize: 14,
                        padding: '6px 12px',
                        borderRadius: 999,
                        textTransform: 'uppercase',
                      }}
                    >
                      {badgeText}
                    </span>
                  </div>
                )}
              </div>
              <Divider />
              <InlineStack align="end">
                <Button variant="primary" onClick={handleSave} loading={saving}>
                  Save settings
                </Button>
              </InlineStack>
            </BlockStack>
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
