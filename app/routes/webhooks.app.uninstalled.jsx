import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * app/uninstalled + the three GDPR compliance topics.
 *
 * shopify.app.toml routes `customers/data_request`, `customers/redact` and
 * `shop/redact` to THIS endpoint (Shopify requires a compliance URI and this is
 * the one declared). That matters, because the handler used to delete every
 * session for the shop whenever `session` was truthy — and `authenticate.webhook`
 * resolves the shop's offline session for compliance topics too. A merchant who
 * filed a customer data request would have been silently signed out of a working
 * installation and forced to reauthorize.
 *
 * So the destructive branch is now keyed on the topic, not on "we found a
 * session":
 *
 *   APP_UNINSTALLED / SHOP_REDACT  -> drop this shop's sessions. The access
 *                                     token is dead (uninstall) or the shop is
 *                                     being erased, so keeping it is useless and
 *                                     a liability.
 *   CUSTOMERS_DATA_REQUEST         -> acknowledge. The app stores no customer
 *   CUSTOMERS_REDACT                  records of any kind — only the shop
 *                                     domain, the Shopify session, a monthly
 *                                     image counter, a per-shop setting and a
 *                                     url -> byte-size cache. There is nothing
 *                                     about a customer to return or erase.
 *
 * Every branch must still answer 200 quickly: Shopify retries, and then disables,
 * an endpoint that errors or stalls.
 */
const DESTRUCTIVE_TOPICS = new Set(["APP_UNINSTALLED", "SHOP_REDACT"]);

export const action = async ({ request }) => {
  // `session` is deliberately not destructured: its presence is what used to
  // drive the delete, and that is the bug described above.
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (DESTRUCTIVE_TOPICS.has(topic)) {
    // Not guarded on `session`: an uninstall can arrive after the session row is
    // already gone, and deleteMany on zero rows is a no-op either way.
    await db.session.deleteMany({ where: { shop } });

    if (topic === "SHOP_REDACT") {
      // The shop is being erased, so the rows keyed by its domain go too. The
      // ImageSize cache is keyed by CDN url rather than shop and holds nothing
      // but a byte count, so there is nothing shop-identifying to remove there.
      await db.usageCounter.deleteMany({ where: { shop } });
      await db.shopSettings.deleteMany({ where: { shop } });
    }
  } else {
    // Logged so the acknowledgement is auditable — Shopify requires a response,
    // and "we hold no customer data" is the whole of our answer.
    console.log(
      `[COMPLIANCE] ${topic} for ${shop}: no customer data is stored by this app; nothing to return or erase.`,
    );
  }

  return new Response();
};
