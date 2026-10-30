import { redirect, Form, Link, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <span className={styles.tag}>Pixoraft</span>
        <h1 className={styles.heading}>Consistent, on-brand product photos.</h1>
        <p className={styles.text}>
          The product media studio for Shopify. Standardize every image on one
          canvas, clean up backgrounds, and stamp watermarks and promo badges —
          across whole collections in one run.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span className={styles.hint}>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Uniform canvases</strong>
            <span>
              Pad every image to one aspect ratio — never cropped — so collection
              grids line up perfectly, with clean white or brand-color backgrounds.
            </span>
          </li>
          <li>
            <strong>Watermarks &amp; badges</strong>
            <span>
              Design a text or logo watermark and SALE/NEW promo badges once, then
              stamp them across whole products and collections in one run.
            </span>
          </li>
          <li>
            <strong>Background whitening</strong>
            <span>
              Clean up studio backdrops — gradients, shadows and all — to pure #FFFFFF so product photos
              sit seamlessly on any page — image order preserved, originals replaced
              safely.
            </span>
          </li>
        </ul>
        <nav className={styles.footer}>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/support">Support</Link>
        </nav>
      </div>
    </div>
  );
}
