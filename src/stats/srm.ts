/**
 * tally — Sample Ratio Mismatch (SRM) check (P14 · BTS-5 · J5).
 *
 * The most under-run, highest-leverage safeguard: "is this experiment even valid
 * to read?" You asked 50/50, got 52/48 at large N → randomization is broken,
 * results invalid. Occurs in ~6–10% of tests, throws no error. SRM is the FIRST
 * check on every experiment, run continuously — refuse to report a winner if it
 * fires. A chi-squared goodness-of-fit test on observed vs intended allocation.
 *
 * No `any`, named exports only.
 */

/** Result of an SRM chi-squared check. */
export interface SrmResult {
  /** True = no mismatch (safe to read); false = SRM detected (BLOCK the readout). */
  pass: boolean;
  /** The chi-squared statistic. */
  chiSquared: number;
  /** The p-value (mismatch is significant when p < threshold). */
  pValue: number;
  /** The significance threshold used (SRM convention: 0.001 — stricter than 0.05). */
  threshold: number;
  /** Observed counts per variant. */
  observed: number[];
  /** Expected counts per variant given the intended split + total N. */
  expected: number[];
}

/**
 * Chi-squared goodness-of-fit SRM check.
 *
 * @param observed   actual user counts per variant (e.g. [208000, 192000]).
 * @param intended   intended allocation weights (e.g. [0.5, 0.5] or [1, 1]).
 * @param threshold  p-value below which SRM is declared (default 0.001 — the SRM
 *                   convention is stricter than 0.05 to avoid false alarms).
 */
export function srmCheck(observed: number[], intended: number[], threshold = 0.001): SrmResult {
  if (observed.length !== intended.length || observed.length < 2) {
    throw new Error("srmCheck requires matching observed/intended arrays of length ≥ 2");
  }
  const total = observed.reduce((a, b) => a + b, 0);
  const weightSum = intended.reduce((a, b) => a + b, 0);
  const expected = intended.map((w) => (w / weightSum) * total);

  let chiSquared = 0;
  for (let i = 0; i < observed.length; i++) {
    const e = expected[i];
    if (e > 0) chiSquared += ((observed[i] - e) ** 2) / e;
  }

  const df = observed.length - 1;
  const pValue = chiSquaredPValue(chiSquared, df);
  return {
    pass: pValue >= threshold,
    chiSquared: round(chiSquared),
    pValue: round(pValue, 6),
    threshold,
    observed,
    expected: expected.map((e) => round(e)),
  };
}

/**
 * Upper-tail p-value for a chi-squared statistic with `df` degrees of freedom:
 * P(X > x) = 1 - CDF. Uses the regularized lower incomplete gamma function (a
 * standard series/continued-fraction implementation), so no stats dependency.
 */
export function chiSquaredPValue(x: number, df: number): number {
  if (x <= 0) return 1;
  return 1 - regularizedGammaP(df / 2, x / 2);
}

/** Regularized lower incomplete gamma P(a, x) = γ(a,x)/Γ(a). */
function regularizedGammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) return Number.NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    // Series expansion.
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // Continued fraction for Q(a,x), then P = 1 - Q.
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
  return 1 - q;
}

/** Lanczos approximation for ln Γ(z). */
function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function round(n: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
