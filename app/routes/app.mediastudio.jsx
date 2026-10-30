import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useLoaderData, useFetcher, useRevalidator, useNavigate } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import RouteError from '../components/RouteError';
import { authenticate } from '../shopify.server';
import { getBillingStateCached } from '../billing.server';
import { getUsage } from '../usage.server';
import { entitled } from '../plans.server';
import { getBranding } from '../transform.server';
import {
  Page,
  Layout,
  Card,
  Button,
  Badge,
  Checkbox,
  Text,
  Box,
  InlineStack,
  BlockStack,
  Thumbnail,
  Divider,
  Banner,
  ProgressBar,
  Select,
  Spinner,
  EmptyState,
} from '@shopify/polaris';
import UsageMeter from '../components/UsageMeter';

/* -------------------------------------------------------------------------- */
/*  Loader — cheap data only                                                  */
/* -------------------------------------------------------------------------- */

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  // Everything in here has to be fast, because the browser cannot finish the
  // navigation until this returns. The product catalog is the slow part and
  // lives behind /api/catalog, requested once this page has already painted.
  const [planResult, shopResult] = await Promise.allSettled([
    getBillingStateCached(admin, session.shop),
    Promise.all([getUsage(session.shop), getBranding(session.shop)]),
  ]);

  const plan = planResult.status === 'fulfilled' ? planResult.value.plan : null;
  const [usage, branding] = shopResult.status === 'fulfilled'
    ? shopResult.value
    : [{ period: '', imagesUsed: 0 }, {}];

  return {
    usage,
    branding: {
      watermarkMode: branding.watermarkMode || 'text',
      watermarkReady: branding.watermarkMode === 'logo'
        ? Boolean(branding.watermarkLogo)
        : Boolean(branding.watermarkText),
      badgeText: branding.badgeText || 'SALE',
      canvasRatio: branding.canvasRatio || '1:1',
    },
    plan: {
      tier: plan?.tier || 'free',
      name: plan?.name || 'Free',
      monthlyImages: plan?.monthlyImages ?? 100,
      can: {
        canvas: entitled(plan, 'canvas'),
        resize: entitled(plan, 'resize'),
        whiten: entitled(plan, 'whiten'),
        watermarkText: entitled(plan, 'watermarkText'),
        watermarkLogo: entitled(plan, 'watermarkLogo'),
        badge: entitled(plan, 'badge'),
        bulkEdit: entitled(plan, 'bulkEdit'),
      },
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  UI                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * How many images of the same product the browser edits at once. Six concurrent
 * images against one shop's rate limit is the number the old per-image queue
 * ran for months without throttling; each request is one context query plus the
 * media mutations.
 */
const IMAGE_CONCURRENCY = 6;

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapLimitClient(items, limit, fn, shouldStop) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      // Post-increment is safe: JavaScript runs one worker at a time between
      // awaits, so no two can claim the same item.
      let index = cursor++;
      while (index < items.length) {
        if (shouldStop()) return;
        await fn(items[index], index);
        index = cursor++;
      }
    }
  );
  await Promise.all(workers);
}

// Shown until /api/catalog answers.
const EMPTY_STATS = {
  total: 0,
  totalImages: 0,
  editedProducts: 0,
  totalEdits: 0,
  mixedRatios: 0,
};

const RESIZE_OPTIONS = [
  { label: '1200 px', value: '1200' },
  { label: '1600 px', value: '1600' },
  { label: '2048 px (recommended)', value: '2048' },
  { label: '4096 px', value: '4096' },
];

export default function MediaStudio() {
  const { plan, usage, branding } = useLoaderData();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  // The product list is fetched AFTER this page renders — building it takes
  // seconds, and in the loader it would make the navigation look dead.
  const catalogFetcher = useFetcher();
  useEffect(() => {
    if (catalogFetcher.state === 'idle' && !catalogFetcher.data) {
      catalogFetcher.load('/api/catalog');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogFetcher.state, catalogFetcher.data]);

  const products = useMemo(() => catalogFetcher.data?.products ?? [], [catalogFetcher.data]);
  const stats = catalogFetcher.data?.stats ?? EMPTY_STATS;
  const catalogLoading = !catalogFetcher.data;
  const refreshCatalog = useCallback(() => {
    catalogFetcher.load('/api/catalog');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogFetcher]);

  useEffect(() => {
    if (catalogFetcher.data?.error) setError(catalogFetcher.data.error);
  }, [catalogFetcher.data]);

  /* ----- edit recipe -------------------------------------------------------- */

  const canWatermark = branding.watermarkMode === 'logo'
    ? plan.can.watermarkLogo
    : plan.can.watermarkText;

  const [opWhiten, setOpWhiten] = useState(false);
  const [opCanvas, setOpCanvas] = useState(true);
  const [opResize, setOpResize] = useState(false);
  const [resizeMax, setResizeMax] = useState('2048');
  const [opWatermark, setOpWatermark] = useState(false);
  const [opBadge, setOpBadge] = useState(false);

  const opsPayload = useMemo(() => {
    const ops = {};
    if (opWhiten) ops.whiten = true;
    if (opCanvas) ops.canvas = true;
    if (opResize) ops.resize = { maxDim: Number(resizeMax) };
    if (opWatermark) ops.watermark = true;
    if (opBadge) ops.badge = true;
    return ops;
  }, [opWhiten, opCanvas, opResize, resizeMax, opWatermark, opBadge]);
  const opsSelected = Object.keys(opsPayload).length > 0;

  /* ----- page state --------------------------------------------------------- */

  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('title');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Live per-product edit counts, keyed by product id, updated after every image.
  const [liveProgress, setLiveProgress] = useState({});

  // Track edits made this session so the usage meter moves without a reload.
  // The moment fresh loader data arrives it ALREADY includes those edits, so
  // the session delta is dropped — otherwise the meter would read double.
  const [sessionImages, setSessionImages] = useState(0);
  useEffect(() => { setSessionImages(0); }, [usage]);

  /* ----- the run ------------------------------------------------------------ */

  const [run, setRun] = useState(null);
  const runRef = useRef(null);
  // Set by the Stop button and by a quota refusal; every worker checks it.
  const stopRef = useRef(false);

  const publish = useCallback(() => {
    const s = runRef.current;
    setRun(s ? { ...s, images: s.images.map(i => ({ ...i })) } : null);
  }, []);

  /** One call to the per-image API. */
  const callApi = useCallback(async (fields) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.append(k, v);

    // App Bridge already adds the session token to relative fetches, but asking
    // for it explicitly means auth doesn't depend on that patch being in place.
    const headers = {};
    try {
      const token = await window.shopify?.idToken?.();
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch { /* App Bridge's own fetch patch is the backstop */ }

    const response = await fetch('/api/transform', { method: 'POST', body, headers });

    let data = null;
    try { data = await response.json(); } catch { /* fall through */ }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Your session expired. Reload the page and try again.');
      }
      throw new Error(data?.error || `The server returned an error (${response.status}).`);
    }
    if (!data) throw new Error('The server sent back an empty response.');
    return data;
  }, []);

  const executeRun = useCallback(async (productIds, ops) => {
    const byId = new Map(products.map(p => [p.id, p]));
    const opsJson = JSON.stringify(ops);

    runRef.current = {
      productIds,
      productIndex: 0,
      productTitle: byId.get(productIds[0])?.title || '',
      totalImages: productIds.reduce((sum, id) => sum + (byId.get(id)?.imageCount || 0), 0),
      imagesDone: 0,
      imagesFailed: 0,
      images: [],
      stopping: false,
    };
    publish();

    let quotaError = null;
    let lastError = null;

    for (let i = 0; i < productIds.length; i++) {
      if (stopRef.current) break;

      const productId = productIds[i];
      const state = runRef.current;
      state.productIndex = i;
      state.productTitle = byId.get(productId)?.title || '';
      state.images = [];
      publish();

      let listing;
      try {
        listing = await callApi({ intent: 'listImages', productId });
      } catch (err) {
        lastError = err.message;
        // Drop the estimate, or its images sit in the total forever and the bar
        // can never reach 100%.
        state.totalImages -= byId.get(productId)?.imageCount || 0;
        publish();
        continue;
      }

      state.totalImages += listing.images.length - (byId.get(productId)?.imageCount || 0);
      state.productTitle = listing.title;
      state.images = listing.images.map(img => ({
        id: img.id,
        url: img.url,
        status: 'pending',
        detail: null,
      }));
      publish();

      // The id each slot ends up holding, so the merchant's order can be put
      // back: replacing an image appends the copy at the end, and with several
      // in flight they no longer finish in the order they started.
      const finalIds = listing.images.map(img => img.id);
      const todo = listing.images.map((img, index) => ({ ...img, index }));

      await mapLimitClient(
        todo,
        IMAGE_CONCURRENCY,
        async (image) => {
          const entry = runRef.current.images[image.index];
          entry.status = 'working';
          publish();

          let result;
          try {
            result = await callApi({
              intent: 'transformImage', productId, imageId: image.id, ops: opsJson,
            });
          } catch (err) {
            result = { success: false, error: err.message };
          }

          const live = runRef.current;

          // Every remaining image would return the same refusal, so stop.
          if (result.quotaExceeded) {
            quotaError = 'Monthly edit quota reached. Upgrade your plan to edit more images this month.';
            stopRef.current = true;
            entry.status = 'pending';
            publish();
            return;
          }

          if (result.success) {
            finalIds[image.index] = result.newImageId || image.id;
            live.imagesDone += 1;
            entry.status = 'done';
            entry.detail = (result.applied || []).join(' · ');
            setSessionImages(s => s + 1);
            setLiveProgress(prev => ({
              ...prev,
              [productId]: (prev[productId] || byId.get(productId)?.editCount || 0) + 1,
            }));
          } else {
            live.imagesFailed += 1;
            lastError = result.error;
            entry.status = 'failed';
            entry.detail = result.error;
          }
          publish();
        },
        () => stopRef.current
      );

      // Put the image order back, even for a partial product.
      try {
        await callApi({ intent: 'finalize', productId, order: JSON.stringify(finalIds) });
      } catch (err) {
        console.error('Could not restore image order for', productId, err);
      }
    }

    const final = runRef.current;
    const stoppedByUser = final.stopping;

    runRef.current = null;
    stopRef.current = false;
    setRun(null);

    if (final.imagesDone === 0 && final.imagesFailed === 0) {
      if (stoppedByUser && !quotaError) {
        setSuccessMessage('Stopped — nothing was changed.');
        setTimeout(() => setSuccessMessage(null), 6000);
      } else {
        setError(quotaError || lastError || 'Nothing was edited.');
      }
    } else if (final.imagesDone === 0) {
      setError(lastError || 'None of the images could be edited.');
    } else {
      const parts = [
        `Edited ${final.imagesDone} image${final.imagesDone > 1 ? 's' : ''}.`,
      ];
      if (final.imagesFailed > 0) parts.push(`${final.imagesFailed} could not be processed — ${lastError}`);
      if (quotaError) parts.push(quotaError);
      else if (stoppedByUser) parts.push('You stopped the run; the rest were left alone.');
      setSuccessMessage(parts.join(' '));
      setTimeout(() => setSuccessMessage(null), 12000);
    }

    // Quietly refresh in place: the loader for the usage meter, /api/catalog
    // for the new edit counts and thumbnails.
    revalidator.revalidate();
    refreshCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, callApi, publish, revalidator, refreshCatalog]);

  const beginQueue = useCallback((ids) => {
    if (!ids.length || runRef.current || !opsSelected) return;
    setError(null);
    setSuccessMessage(null);
    stopRef.current = false;
    executeRun(ids, opsPayload).catch((err) => {
      // A throw here would leave the page showing progress forever.
      console.error('Studio run crashed:', err);
      runRef.current = null;
      stopRef.current = false;
      setRun(null);
      setError(err.message || 'The run stopped unexpectedly.');
      revalidator.revalidate();
    });
  }, [executeRun, revalidator, opsPayload, opsSelected]);

  const handleStopRun = useCallback(() => {
    stopRef.current = true;
    if (runRef.current) {
      runRef.current.stopping = true;
      publish();
    }
  }, [publish]);

  /* ----- derived view ------------------------------------------------------- */

  const displayedProducts = useMemo(() => {
    let list = products;
    if (filter === 'mixed_ratios') list = list.filter(p => p.mixedRatios);
    else if (filter === 'unedited') list = list.filter(p => (liveProgress[p.id] ?? p.editCount) === 0);
    else if (filter === 'edited') list = list.filter(p => (liveProgress[p.id] ?? p.editCount) > 0);

    const sorted = [...list];
    if (sortBy === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === 'images_desc') sorted.sort((a, b) => b.imageCount - a.imageCount);
    else if (sortBy === 'edits_asc') sorted.sort((a, b) => (liveProgress[a.id] ?? a.editCount) - (liveProgress[b.id] ?? b.editCount));
    return sorted;
  }, [products, filter, sortBy, liveProgress]);

  const handleSelectProduct = useCallback((id) => {
    setSelectedProducts(prev => {
      if (prev.includes(id)) return prev.filter(p => p !== id);
      // Without the bulk-edit entitlement the selection is one product at a time.
      return plan.can.bulkEdit ? [...prev, id] : [id];
    });
  }, [plan.can.bulkEdit]);

  const handleSelectAll = useCallback(() => {
    setSelectedProducts(selectedProducts.length === displayedProducts.length ? [] : displayedProducts.map(p => p.id));
  }, [selectedProducts.length, displayedProducts]);

  const isRunning = run !== null;
  const isBusy = isRunning || revalidator.state !== 'idle';
  const activeId = run ? run.productIds[run.productIndex] : null;

  const imagesSettled = run ? run.imagesDone + run.imagesFailed : 0;
  const progress = run && run.totalImages > 0
    ? Math.min(100, Math.round((imagesSettled / run.totalImages) * 100))
    : 0;

  // Usage meter: loader baseline + images edited live this session.
  const quota = plan?.monthlyImages ?? 100;
  const usedImages = (usage?.imagesUsed ?? 0) + sessionImages;
  const quotaReached = usedImages >= quota;

  const filterOptions = [
    { label: 'All Products', value: 'all' },
    { label: 'Mixed aspect ratios', value: 'mixed_ratios' },
    { label: 'Never edited', value: 'unedited' },
    { label: 'Edited', value: 'edited' },
  ];
  const sortOptions = [
    { label: 'Title A–Z', value: 'title' },
    { label: 'Most images first', value: 'images_desc' },
    { label: 'Fewest edits first', value: 'edits_asc' },
  ];

  const watermarkHint = !canWatermark
    ? (branding.watermarkMode === 'logo' ? 'Growth & up' : 'Starter & up')
    : !branding.watermarkReady ? 'Set up on Branding' : null;

  const ops = [
    {
      key: 'canvas',
      label: `Uniform canvas (${branding.canvasRatio})`,
      help: 'Pad every image to one aspect ratio so collection grids line up.',
      checked: opCanvas, set: setOpCanvas,
      allowed: plan.can.canvas, hint: plan.can.canvas ? null : 'Upgrade',
    },
    {
      key: 'whiten',
      label: 'Whiten background',
      help: 'Clean up a studio backdrop — even a shadowed or gradient one — to pure #FFFFFF.',
      checked: opWhiten, set: setOpWhiten,
      allowed: plan.can.whiten, hint: plan.can.whiten ? null : 'Starter & up',
    },
    {
      key: 'resize',
      label: 'Resize to max dimension',
      help: 'Cap oversized uploads at a sensible pixel size.',
      checked: opResize, set: setOpResize,
      allowed: plan.can.resize, hint: plan.can.resize ? null : 'Upgrade',
    },
    {
      key: 'watermark',
      label: branding.watermarkMode === 'logo' ? 'Logo watermark' : 'Text watermark',
      help: 'Overlay your brand mark using the settings from the Branding page.',
      checked: opWatermark, set: setOpWatermark,
      allowed: canWatermark && branding.watermarkReady, hint: watermarkHint,
    },
    {
      key: 'badge',
      label: `Promo badge (“${branding.badgeText}”)`,
      help: 'Stamp a promo pill on the corner of every image.',
      checked: opBadge, set: setOpBadge,
      allowed: plan.can.badge, hint: plan.can.badge ? null : 'Growth & up',
    },
  ];

  return (
    <Page
      title="Pixoraft — Media Studio"
      subtitle="Bulk-edit product images: uniform canvases, clean backgrounds, watermarks and promo badges"
    >
      <Layout>
        <Layout.Section>
          <div className="px-topbar">
            <span className="px-topbar-badge px-topbar-badge--code" aria-hidden="true">MS</span>
            <div className="px-topbar-text">
              <p className="px-topbar-title">Media Studio</p>
              <p className="px-topbar-sub">Pick an edit recipe, pick products, run it across every image</p>
            </div>
            <span className="px-topbar-meta">{`${plan?.name || 'Free'} plan`}</span>
          </div>
        </Layout.Section>

        {isRunning && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" wrap={true}>
                  <InlineStack gap="300" blockAlign="center">
                    <Spinner accessibilityLabel="Edit in progress" size="small" />
                    <Text variant="headingMd" as="h3">
                      {run.stopping
                        ? 'Finishing the images already started…'
                        : run.images.length > 0
                          ? `Editing images…`
                          : 'Reading the product’s images…'}
                    </Text>
                  </InlineStack>
                  <InlineStack gap="300" blockAlign="center">
                    <Text variant="headingMd" as="p" tone="subdued">{`${progress}%`}</Text>
                    {!run.stopping && (
                      <Button variant="tertiary" onClick={handleStopRun}>Stop</Button>
                    )}
                  </InlineStack>
                </InlineStack>

                <ProgressBar progress={progress} size="small" tone="primary" />

                <Text variant="bodyMd" as="p">
                  {run.productTitle
                    ? <Text as="span" fontWeight="semibold">{run.productTitle}</Text>
                    : 'Starting…'}
                  {run.productIds.length > 1 &&
                    ` — product ${run.productIndex + 1} of ${run.productIds.length}`}
                </Text>

                {run.images.length > 0 && (
                  <InlineStack gap="200" wrap={true}>
                    {run.images.map((image, index) => (
                      <BlockStack key={image.id} gap="100" inlineAlign="center">
                        <div className={`px-shot px-shot--${image.status}`}>
                          <Thumbnail source={image.url} alt={`Image ${index + 1}`} size="small" />
                        </div>
                        {image.status === 'working' ? (
                          <Spinner accessibilityLabel={`Editing image ${index + 1}`} size="small" />
                        ) : (
                          <Text variant="bodySm" as="span" tone={
                            image.status === 'done' ? 'success'
                              : image.status === 'failed' ? 'critical'
                                : 'subdued'
                          }>
                            {image.status === 'done' ? 'Done'
                              : image.status === 'failed' ? 'Failed'
                                : `#${index + 1}`}
                          </Text>
                        )}
                      </BlockStack>
                    ))}
                  </InlineStack>
                )}

                <Text variant="bodySm" as="p" tone="subdued">
                  {`${imagesSettled} of ${run.totalImages} image${run.totalImages === 1 ? '' : 's'} done`}
                  {run.imagesFailed > 0 && ` · ${run.imagesFailed} failed`}
                </Text>

                <Text variant="bodySm" as="p" tone="subdued">
                  {`Up to ${IMAGE_CONCURRENCY} images are processed at a time. Each one is downloaded, edited and uploaded back to Shopify, so please keep this page open.`}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {error && (
          <Layout.Section>
            <Banner title="Error" tone="critical" onDismiss={() => setError(null)}>{error}</Banner>
          </Layout.Section>
        )}
        {successMessage && (
          <Layout.Section>
            <Banner title="Success" tone="success" onDismiss={() => setSuccessMessage(null)}>{successMessage}</Banner>
          </Layout.Section>
        )}

        {/* Edit recipe */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <div className="px-section-head">
                  <Text variant="headingSm" as="h3">Edit recipe</Text>
                  <Badge tone="info">{`${Object.keys(opsPayload).length} selected`}</Badge>
                </div>
                <Button variant="plain" onClick={() => navigate('/app/branding')}>
                  Branding settings
                </Button>
              </InlineStack>
              <Text variant="bodySm" as="p" tone="subdued">
                Edits are applied in a fixed order — resize, whiten, canvas, then overlays —
                and replace the image on the product. Watermark, badge and canvas styling
                come from your Branding settings.
              </Text>
              <Divider />
              <BlockStack gap="200">
                {ops.map((op) => (
                  <InlineStack key={op.key} gap="300" blockAlign="start" wrap={false}>
                    <Checkbox
                      label={op.label}
                      helpText={op.help}
                      checked={op.checked && op.allowed}
                      onChange={(v) => op.set(v)}
                      disabled={isBusy || !op.allowed}
                    />
                    {op.hint && <Badge tone="attention">{op.hint}</Badge>}
                  </InlineStack>
                ))}
                {opResize && plan.can.resize && (
                  <Box maxWidth="240px">
                    <Select
                      label="Longest edge"
                      options={RESIZE_OPTIONS}
                      value={resizeMax}
                      onChange={setResizeMax}
                      disabled={isBusy}
                    />
                  </Box>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Plan usage meter */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <div className="px-section-head">
                  <Text variant="headingSm" as="h3">Monthly usage</Text>
                  <Badge tone={plan?.tier === 'free' ? undefined : 'success'}>{`${plan?.name || 'Free'} plan`}</Badge>
                </div>
                <Text variant="bodyMd" as="p" tone={quotaReached ? 'critical' : 'subdued'}>
                  {`${usedImages.toLocaleString()} / ${quota.toLocaleString()} edits`}
                </Text>
              </InlineStack>
              <UsageMeter used={usedImages} quota={quota} />
              {quotaReached && (
                <Text variant="bodySm" as="p" tone="critical">
                  You've used your monthly edit quota. Upgrade your plan to edit more images.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <div className="px-figure-grid">
            <div className="px-figure">
              <p className="px-figure-label">Total products</p>
              <p className="px-figure-value">{stats.total}</p>
            </div>
            <div className="px-figure">
              <p className="px-figure-label">Mixed aspect ratios</p>
              <p className="px-figure-value px-figure-value--alert">{stats.mixedRatios}</p>
            </div>
            <div className="px-figure">
              <p className="px-figure-label">Total images</p>
              <p className="px-figure-value">{stats.totalImages}</p>
            </div>
            <div className="px-figure">
              <p className="px-figure-label">Edits applied</p>
              <p className="px-figure-value px-figure-value--good">{stats.totalEdits + sessionImages}</p>
            </div>
          </div>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="300">
                  <Box width="200px">
                    <Select label="Filter" options={filterOptions} value={filter} onChange={setFilter} disabled={isBusy} />
                  </Box>
                  <Box width="200px">
                    <Select label="Sort by" options={sortOptions} value={sortBy} onChange={setSortBy} disabled={isBusy} />
                  </Box>
                </InlineStack>
                {selectedProducts.length > 0 && (
                  <Button
                    variant="primary"
                    onClick={() => { beginQueue(selectedProducts); setSelectedProducts([]); }}
                    loading={isBusy}
                    disabled={isBusy || quotaReached || !opsSelected}
                  >
                    {`Apply to selected (${selectedProducts.length})`}
                  </Button>
                )}
              </InlineStack>
              {!opsSelected && (
                <Text variant="bodySm" as="p" tone="subdued">
                  Pick at least one edit in the recipe above to enable runs.
                </Text>
              )}
              <Divider />
              {plan.can.bulkEdit ? (
                <Checkbox
                  label={`Select All (${displayedProducts.length} products)`}
                  checked={selectedProducts.length === displayedProducts.length && displayedProducts.length > 0}
                  onChange={handleSelectAll}
                  disabled={isBusy}
                />
              ) : (
                <Text variant="bodySm" as="p" tone="subdued">
                  One product at a time on your plan — bulk edits across many products are a Growth feature.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {catalogLoading ? (
                <Box padding="800">
                  <BlockStack gap="300" inlineAlign="center">
                    <Spinner accessibilityLabel="Loading your products" size="large" />
                    <Text as="p" tone="subdued">Loading your products…</Text>
                  </BlockStack>
                </Box>
              ) : displayedProducts.length === 0 ? (
                <EmptyState heading="No products found" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png">
                  <p>Try adjusting your filters to see products.</p>
                </EmptyState>
              ) : (
                displayedProducts.map((product) => {
                  const isActive = activeId === product.id;
                  const editCount = liveProgress[product.id] ?? product.editCount;
                  return (
                    <Card key={product.id} background={selectedProducts.includes(product.id) ? 'bg-surface-selected' : undefined}>
                      <InlineStack gap="400" blockAlign="center">
                        <Checkbox checked={selectedProducts.includes(product.id)} onChange={() => handleSelectProduct(product.id)} disabled={isBusy} />
                        {product.featuredImageUrl && (
                          <Thumbnail source={product.featuredImageUrl} alt={product.title} size="large" />
                        )}
                        <Box width="100%">
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="center">
                              <BlockStack gap="150">
                                <Text variant="headingMd" as="h3">{product.title}</Text>
                                <InlineStack gap="200">
                                  <Badge>{product.status}</Badge>
                                  <Badge tone="info">{`${product.imageCount} images`}</Badge>
                                  {product.mixedRatios && <Badge tone="attention">Mixed ratios</Badge>}
                                  {editCount > 0 && <Badge tone="success">{`${editCount} edits`}</Badge>}
                                  {isActive && <Badge tone="attention">Editing…</Badge>}
                                </InlineStack>
                              </BlockStack>
                              <Button
                                variant="primary"
                                onClick={() => beginQueue([product.id])}
                                loading={isActive}
                                disabled={isBusy || quotaReached || !opsSelected || product.imageCount === 0}
                              >
                                {isActive ? 'Editing…' : 'Apply edits'}
                              </Button>
                            </InlineStack>
                          </BlockStack>
                        </Box>
                      </InlineStack>
                    </Card>
                  );
                })
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// Surface failures on the page instead of bubbling to the app-level Shopify
// boundary, which renders a bare "Application Error" above an empty box.
export function ErrorBoundary() {
  return <RouteError />;
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
