import { LegalPage, ContactEmail, legalStyles as s } from "../components/LegalPage";
import { APP_NAME, COMPANY, STORED_DATA, THIRD_PARTIES } from "../legal";

export const meta = () => [
  { title: `Privacy Policy — ${APP_NAME}` },
  {
    name: "description",
    content: `How ${APP_NAME} handles your Shopify store data.`,
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          {APP_NAME} is a Shopify app operated by {COMPANY}. It compresses the images on
          your products, writes alt text for them, and reports what that saved. This page
          describes exactly what the app reads, what it keeps, and who else sees it.
        </p>
      }
    >
      <h2>What the app is allowed to access</h2>
      <p>
        At install, Shopify asks you to grant two permissions, and the app cannot reach
        anything outside them:
      </p>
      <ul>
        <li>
          <strong>write_products</strong> — read and modify your products, their images and
          their metafields.
        </li>
        <li>
          <strong>write_files</strong> — read and modify files in your store's content
          library, which is where product image alt text is written.
        </li>
      </ul>
      <p>
        The app does not request access to orders, customers, payments, discounts or your
        storefront theme, and so has no way to read them.
      </p>

      <h2>What we store</h2>
      <p>
        Everything the app keeps in its own database is listed here. There is nothing else.
      </p>
      <div className={s.rows}>
        {STORED_DATA.map((row) => (
          <div key={row.what} className={s.row}>
            <p className={s.rowTitle}>{row.what}</p>
            <p className={s.rowBody}>{row.detail}</p>
          </div>
        ))}
      </div>

      <div className={s.note}>
        <p>
          <strong>We never store your images.</strong> During optimization an image is
          downloaded into memory, re-encoded, uploaded back to Shopify and discarded. No
          copy is written to disk and no copy is retained. The only thing kept about an
          image is how many bytes it was.
        </p>
        <p>
          <strong>We store no customer data.</strong> The app has no access to your
          customers, their orders or their personal information, and keeps no record of
          any shopper.
        </p>
      </div>

      <h2>What the app changes in your store</h2>
      <p>When you run an optimization, the app acts on your behalf to:</p>
      <ul>
        <li>
          Upload a compressed WebP copy of an image, attach it to the product, and{" "}
          <strong>delete the original image</strong> from that product.
        </li>
        <li>Restore the image order you had before the run.</li>
        <li>
          Write alt text on images that have none, when your plan includes that feature.
        </li>
        <li>
          Save a record of the result on the product as metafields in the{" "}
          <code>image_optimization</code> namespace — the before and after file size, the
          compression achieved and when it ran. This is what the analytics and reports are
          calculated from.
        </li>
      </ul>
      <p>
        Nothing happens to a product until you select it and start a run, with one
        exception: if you switch on auto-optimize, products you create from that point on
        are optimized in the background on the same terms.
      </p>

      <h2>Who else receives data</h2>
      <div className={s.rows}>
        {THIRD_PARTIES.map((p) => (
          <div key={p.name} className={s.row}>
            <p className={s.rowTitle}>{p.name}</p>
            <p className={s.rowBody}>{p.sends}</p>
            <p className={s.rowNote}>{p.why}</p>
          </div>
        ))}
      </div>
      <p>
        These providers process that data under their own terms and privacy policies. The
        app shares nothing with anyone else — no analytics vendors, no advertising
        networks, no data brokers — and never sells data.
      </p>

      <h2>Retention and deletion</h2>
      <ul>
        <li>
          <strong>When you uninstall</strong>, Shopify notifies the app and it deletes your
          session and access token. The app can no longer reach your store.
        </li>
        <li>
          <strong>If Shopify sends a shop erasure request</strong>, the app additionally
          deletes your usage counter and your saved settings.
        </li>
        <li>
          <strong>Customer data requests and erasure requests</strong> are acknowledged,
          and there is nothing to act on, because the app holds no customer records.
        </li>
        <li>
          The image size cache holds a public CDN URL and a byte count, with no link to a
          shop or a person.
        </li>
      </ul>
      <div className={s.warn}>
        <p>
          Optimized images and the metafields describing them stay on your store after you
          uninstall. They are your store's own content, and deleting them would remove the
          images your products are using. If you want them gone, remove them in Shopify.
        </p>
      </div>

      <h2>Security</h2>
      <ul>
        <li>All traffic to the app and to every provider above is over HTTPS.</li>
        <li>
          The database is reachable only from the application itself on a private network;
          it is not exposed to the internet.
        </li>
        <li>
          Access tokens are held only for as long as the app is installed, and are deleted
          on uninstall.
        </li>
      </ul>
      <p>
        No system is perfectly secure, and we do not claim otherwise. If you believe you
        have found a vulnerability, please report it to the contact below before disclosing
        it publicly.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you are, you may have the right to ask what data is held about
        you, to have it corrected, or to have it erased. For this app that is the short
        list in <strong>What we store</strong> above, and uninstalling removes your session
        immediately. For anything further, contact us.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes materially, the date at the top of the page changes with it.
        Continuing to use the app after a change means you accept the updated policy.
      </p>

      <h2>Contact</h2>
      <p>
        {COMPANY} — <ContactEmail />
      </p>
    </LegalPage>
  );
}
