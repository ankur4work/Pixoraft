import { LegalPage, ContactEmail, legalStyles as s } from "../components/LegalPage";
import { APP_NAME, COMPANY } from "../legal";

export const meta = () => [
  { title: `Support — ${APP_NAME}` },
  { name: "description", content: `Get help with ${APP_NAME}.` },
];

// Mirrors the in-app Help page, phrased for someone who may not have the app
// open — a Shopify reviewer, or a merchant deciding whether to install.
const FAQ = [
  {
    q: "Are my original images kept?",
    a: "No. The edited copy replaces the original on the product, which is what makes your storefront show the new version. Keep your own copies of anything you need to retain, and run the app on products you are happy to have modified.",
  },
  {
    q: "Does the canvas edit crop my photos?",
    a: "Never. The canvas pads the image out to the target aspect ratio on your chosen background color — nothing is cut off.",
  },
  {
    q: "Where do the watermark and badge come from?",
    a: "From the Branding page inside the app. You design them once — text or logo, position, size, opacity, colors — and every run applies the same settings, so the whole catalog stays consistent.",
  },
  {
    q: "What counts against my monthly allowance?",
    a: "Only images that were actually edited and replaced. Failed images are refunded automatically, so re-running the studio is always safe.",
  },
  {
    q: "A run stopped part-way. Did I lose anything?",
    a: "No. Each image either finished (and was replaced) or was left untouched, and your image order is restored at the end of the run either way.",
  },
  {
    q: "Can I close the tab during a run?",
    a: "A run is driven by your browser, so keep the tab open until it finishes. Up to six images are processed at a time.",
  },
  {
    q: "Does the allowance reset?",
    a: "Yes — usage is counted per calendar month (UTC) and starts again at zero on the first of each month.",
  },
];

export default function Support() {
  return (
    <LegalPage
      title="Support"
      intro={
        <p>
          Help with {APP_NAME} — how to reach us, and answers to the questions that come up
          most often.
        </p>
      }
    >
      <h2>Contact us</h2>
      <div className={s.note}>
        <p>
          Email <ContactEmail />
        </p>
        <p>
          To help us answer quickly, include your <strong>.myshopify.com domain</strong>,
          the name of a product that shows the problem, and roughly when it happened.
        </p>
      </div>

      <h2>Before you write in</h2>
      <ul>
        <li>
          <strong>Check your plan.</strong> Background whitening and text watermarks need
          Starter or above; logo watermarks, badges and bulk edits need Growth or above.
          Locked features show the plan they require on the app's home page.
        </li>
        <li>
          <strong>Check your allowance.</strong> The meter on the home page and the
          studio page shows how many edits are left this month.
        </li>
        <li>
          <strong>Try the run again.</strong> Most failures are transient — a slow image
          download or a Shopify rate limit — and re-running resumes safely without
          re-charging anything.
        </li>
      </ul>

      <h2>Frequently asked</h2>
      {FAQ.map((item) => (
        <div key={item.q}>
          <h3>{item.q}</h3>
          <p>{item.a}</p>
        </div>
      ))}

      <hr className={s.divider} />

      <h2>Reporting a security issue</h2>
      <p>
        Please report suspected vulnerabilities to the address above, with enough detail to
        reproduce the issue, and give us a chance to fix it before disclosing publicly.
      </p>

      <h2>Privacy and terms</h2>
      <p>
        See the <a href="/privacy">Privacy Policy</a> for what the app reads and stores, and
        the <a href="/terms">Terms of Service</a> for the agreement you accept on install.
      </p>

      <h2>Who we are</h2>
      <p>
        {APP_NAME} is operated by {COMPANY}.
      </p>
    </LegalPage>
  );
}
