/**
 * Continuous usage meter.
 *
 * Replaces Polaris's <ProgressBar> for quota display so the quota can carry the
 * brand gradient and switch to a hatched red fill once it is spent — a
 * ProgressBar can do neither. A single sweep of fill reads as "how much of your
 * allowance is gone", which is the question a quota answers.
 *
 * Purely presentational: it takes the same numbers the Polaris bar derived its
 * percentage from, so quota behaviour is unchanged.
 */
export default function UsageMeter({ used = 0, quota = 0 }) {
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const critical = quota > 0 && used >= quota;

  return (
    <div
      className={critical ? "px-meter is-critical" : "px-meter"}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${pct}% of the monthly image quota used`}
    >
      {/* Zero usage paints nothing at all — the CSS min-width would otherwise
          show a stub of fill on a meter that should read as empty. */}
      {pct > 0 && <div className="px-meter-fill" style={{ width: `${pct}%` }} />}
    </div>
  );
}
