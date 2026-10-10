import { LegalPage, ContactEmail, Pending, legalStyles as s } from "../components/LegalPage";
import { APP_NAME, COMPANY, GOVERNING_LAW } from "../legal";

export const meta = () => [
  { title: `Terms of Service — ${APP_NAME}` },
  {
    name: "description",
    content: `The terms you agree to when you install ${APP_NAME}.`,
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms govern your use of {APP_NAME} (“the app”), operated by {COMPANY}.
          Installing the app means you accept them. If you do not, uninstall it.
        </p>
      }
    >
      <h2>1. What the app does</h2>
      <p>
        The app compresses and converts the images on your Shopify products, can generate
        alt text for them using a third-party AI provider, and reports the resulting file
        size savings alongside optional live page-speed tests. Features available to you
        depend on your plan.
      </p>

      <h2>2. Image replacement — read this one</h2>
      <div className={s.warn}>
        <p>
          <strong>Optimization replaces your images and deletes the originals.</strong> For
          each image the app uploads a compressed copy, attaches it to the product, and
          removes the file it replaced. This is how your storefront ends up serving the
          smaller file — but it means the original is gone from that product, and its CDN
          URL changes.
        </p>
        <p>
          You are responsible for keeping your own copies of any images you need to retain.
          Run the app on products you are willing to have modified.
        </p>
      </div>
      <p>
        The app will not re-encode an image where doing so would save almost nothing; those
        are recorded as already optimal and left untouched. Image order is restored after a
        run, but Shopify media operations are not transactional, so a run interrupted
        part-way can leave a product partially optimized. Re-running is safe and resumes
        where it stopped.
      </p>

      <h2>3. Plans, quotas and billing</h2>
      <ul>
        <li>
          Billing is handled entirely by <strong>Shopify Managed Pricing</strong>. The app
          never takes payment details and never creates a charge. You subscribe, change
          plan and cancel on Shopify's own billing page, and Shopify's terms govern the
          transaction.
        </li>
        <li>
          Each plan includes a monthly allowance of optimized images. The allowance resets
          at the start of each calendar month (UTC).
        </li>
        <li>
          Only images that are actually re-encoded and replaced count against your
          allowance. Images that were skipped as already optimal, and images that failed,
          are not charged against it.
        </li>
        <li>
          When the allowance is used up, optimization stops until the next month or until
          you move to a larger plan. Prices shown by Shopify at the point of subscribing are
          the ones that apply.
        </li>
        <li>
          Refunds, where applicable, are handled through Shopify under their policies.
        </li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          Use the app to process images you do not have the rights to modify or publish.
        </li>
        <li>
          Attempt to bypass plan limits, or access stores or data that are not yours.
        </li>
        <li>
          Interfere with the service, probe it for vulnerabilities without permission, or
          place deliberate excessive load on it.
        </li>
      </ul>
      <p>
        We may suspend access to the app where it is being used in breach of these terms, or
        where its use threatens the service for others.
      </p>

      <h2>5. Third-party services</h2>
      <p>
        The app depends on Shopify, and on AI and page-speed providers described in the{" "}
        <a href="/privacy">Privacy Policy</a>. Their availability, rate limits and output
        are outside our control. AI-generated alt text is produced by a model and may be
        inaccurate; review it before relying on it. Page-speed results come from Google and
        vary with your theme, hosting and page content.
      </p>

      <h2>6. Availability</h2>
      <p>
        The app is provided on an “as available” basis. We do not commit to a specific
        uptime level, and maintenance, provider outages or Shopify API changes may interrupt
        it.
      </p>

      <h2>7. Disclaimer and limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, the app is provided <strong>“as is”</strong>{" "}
        and without warranties of any kind, express or implied, including fitness for a
        particular purpose and non-infringement. We do not warrant that optimization will
        produce any particular file size reduction, search ranking, conversion rate or page
        speed score.
      </p>
      <p>
        To the fullest extent permitted by law, {COMPANY} is not liable for indirect,
        incidental, special or consequential damages, or for lost profits, lost revenue or
        lost or altered data, arising from your use of the app. Where liability cannot be
        excluded, it is limited to the amount you paid for the app in the twelve months
        before the claim arose.
      </p>
      <p>
        Nothing in these terms limits liability that cannot lawfully be limited.
      </p>

      <h2>8. Termination</h2>
      <p>
        You may stop using the app at any time by uninstalling it, which ends your access
        and deletes your session. Optimized images and the records written to your products
        remain, as described in the <a href="/privacy">Privacy Policy</a>. We may terminate
        access for breach of these terms.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>
        These terms may change. The date at the top of the page reflects the current
        version, and continued use after a change means you accept it.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of{" "}
        {GOVERNING_LAW || <Pending label="jurisdiction pending — set GOVERNING_LAW" />}, and
        the courts of that jurisdiction have exclusive jurisdiction over any dispute.
      </p>

      <h2>11. Contact</h2>
      <p>
        {COMPANY} — <ContactEmail />
      </p>
    </LegalPage>
  );
}
