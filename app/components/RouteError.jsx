import { isRouteErrorResponse, useRouteError } from "react-router";

/**
 * Visible, diagnosable route error UI.
 *
 * Every page in this app previously bubbled failures to the app-level Shopify
 * boundary, which renders a bare "Application Error" heading above an empty
 * box. That tells a merchant nothing and tells us less — a page could be broken
 * in production with no way to see why short of reading container logs.
 *
 * What is actually available differs by where the error happened, and that
 * difference is itself the most useful clue:
 *
 *   - Thrown during CLIENT rendering  -> the real message and stack are right
 *                                        here in the browser, so show them.
 *   - Thrown in a loader/action       -> React Router sanitizes it to
 *     (production)                       "Unexpected Server Error" before it
 *                                        reaches the client. Seeing that exact
 *                                        string means "look at the server log",
 *                                        which is worth saying out loud.
 *   - A thrown Response (404/410/…)   -> status and statusText survive intact.
 */
export default function RouteError() {
  const error = useRouteError();

  let heading = "Something went wrong on this page";
  let detail = null;
  let origin = null;
  let stack = null;

  if (isRouteErrorResponse(error)) {
    heading = `${error.status} ${error.statusText}`;
    detail =
      typeof error.data === "string" ? error.data : JSON.stringify(error.data);
    origin = "server response";
  } else if (error instanceof Error) {
    detail = error.message;
    stack = error.stack;
    // React Router replaces real loader/action errors with this exact message
    // in production builds, so it is a reliable signal of where to look.
    origin =
      error.message === "Unexpected Server Error"
        ? "server (loader or action) — the real message is in the container log"
        : "client render";
  } else if (error) {
    detail = String(error);
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <p style={s.tag}>Pixoraft</p>
        <h1 style={s.h1}>{heading}</h1>
        {detail && <pre style={s.pre}>{detail}</pre>}
        {origin && (
          <p style={s.meta}>
            Origin: <strong>{origin}</strong>
          </p>
        )}
        {stack && (
          <details style={s.details}>
            <summary style={s.summary}>Stack trace</summary>
            <pre style={s.preSmall}>{stack}</pre>
          </details>
        )}
        <p style={s.help}>
          Reloading the page often clears a transient failure. If it keeps
          happening, send this screen to support.
        </p>
      </div>
    </div>
  );
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const s = {
  wrap: {
    padding: "28px 20px",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif",
  },
  card: {
    maxWidth: 760,
    margin: "0 auto",
    background: "#ffffff",
    border: "1px solid #ecdae5",
    borderLeft: "5px solid #d7342b",
    borderRadius: 10,
    padding: "22px 24px",
    boxShadow: "0 1px 2px rgba(35,10,28,0.05)",
  },
  tag: {
    margin: "0 0 10px",
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#96124f",
  },
  h1: {
    margin: "0 0 14px",
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: "#230a1c",
  },
  pre: {
    margin: "0 0 12px",
    padding: "12px 14px",
    background: "#fdf2f1",
    border: "1px solid #f5cfcc",
    borderRadius: 9,
    fontSize: 12.5,
    lineHeight: 1.55,
    color: "#7a1f19",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowX: "auto",
  },
  preSmall: {
    margin: "8px 0 0",
    padding: "10px 12px",
    background: "#fef7fb",
    border: "1px solid #ecdae5",
    borderRadius: 8,
    fontSize: 11.5,
    lineHeight: 1.5,
    color: "#5d4b57",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 280,
    overflow: "auto",
  },
  meta: { margin: "0 0 10px", fontSize: 13, color: "#7a6472" },
  details: { margin: "0 0 12px" },
  summary: {
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "#8b2fc9",
  },
  help: { margin: 0, fontSize: 13, lineHeight: 1.6, color: "#7a6472" },
};
