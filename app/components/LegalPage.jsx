import { Link } from "react-router";
import styles from "./legal.module.css";
import { APP_NAME, COMPANY, LAST_UPDATED, CONTACT_EMAIL } from "../legal";

/**
 * Shell for the three public legal pages. These render outside the embedded
 * admin (no App Bridge, no Polaris) because Shopify's reviewers and merchants
 * open them as ordinary web pages, so they must stand on their own.
 */
export function LegalPage({ title, intro, children }) {
  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.mastheadInner}>
          <Link to="/" className={styles.brand}>
            {APP_NAME}
          </Link>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.meta}>
            {COMPANY} · Last updated {LAST_UPDATED}
          </p>
        </div>
      </header>

      <main className={styles.body}>
        <div className={styles.bodyInner}>
          <article className={styles.card}>
            {intro}
            {children}
          </article>
          <nav className={styles.footer}>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/support">Support</Link>
            <span className={styles.spacer}>
              © {new Date().getFullYear()} {COMPANY}
            </span>
          </nav>
        </div>
      </main>
    </div>
  );
}

/**
 * The support address, or a conspicuous placeholder while it is unset.
 *
 * Rendering a plausible-looking fake address would be worse than rendering
 * nothing: a merchant would write to it and hear nothing back. Set
 * CONTACT_EMAIL in app/legal.js and every usage becomes a mailto: link.
 */
export function ContactEmail() {
  if (!CONTACT_EMAIL) {
    return (
      <span className={styles.pending}>support address pending — set CONTACT_EMAIL</span>
    );
  }
  return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
}

/** Same treatment for any other business detail that is not filled in yet. */
export function Pending({ label }) {
  return <span className={styles.pending}>{label}</span>;
}

export { styles as legalStyles };
