/**
 * tally — multiple-comparison correction (BTS-17 · O5 · J5).
 *
 * Segment-fishing / Texas Sharpshooter: slice 20 segments, one will be p<0.05 by
 * chance. The fix is two-pronged: PRE-REGISTER the hypothesis + metric + segment
 * list before data exists (an experiment contract == an eval contract), AND on
 * any post-hoc readout apply a multiple-comparison correction (Bonferroni /
 * Benjamini-Hochberg) and treat results as hypothesis-generating, not confirmatory.
 *
 * No `any`, named exports only.
 */

/** A per-segment p-value to correct. */
export interface SegmentResult {
  segment: string;
  pValue: number;
}

/** Result of a multiple-comparison correction. */
export interface CorrectionResult {
  method: "bonferroni" | "benjamini-hochberg";
  /** Family-wise alpha used (default 0.05). */
  alpha: number;
  /** Per-segment corrected significance. */
  segments: Array<SegmentResult & { significantAfterCorrection: boolean; adjusted: number }>;
  /** How many survived correction (vs how many looked significant raw). */
  survivors: number;
  rawSignificant: number;
}

/**
 * Bonferroni correction: a segment is significant only if p < alpha / m, where m
 * is the number of comparisons. Conservative; the safe default for confirmatory
 * claims.
 */
export function bonferroni(segments: SegmentResult[], alpha = 0.05): CorrectionResult {
  const m = segments.length;
  const threshold = m > 0 ? alpha / m : alpha;
  const out = segments.map((s) => ({
    ...s,
    adjusted: round(Math.min(1, s.pValue * m)),
    significantAfterCorrection: s.pValue < threshold,
  }));
  return {
    method: "bonferroni",
    alpha,
    segments: out,
    survivors: out.filter((s) => s.significantAfterCorrection).length,
    rawSignificant: segments.filter((s) => s.pValue < alpha).length,
  };
}

/**
 * Benjamini-Hochberg FDR control: sort p-values ascending, find the largest k
 * with p(k) <= (k/m)*alpha; everything up to k is significant. Less conservative
 * than Bonferroni — appropriate for exploratory/hypothesis-generating readouts.
 */
export function benjaminiHochberg(segments: SegmentResult[], alpha = 0.05): CorrectionResult {
  const m = segments.length;
  const sorted = [...segments].sort((a, b) => a.pValue - b.pValue);
  let maxK = 0;
  for (let i = 0; i < sorted.length; i++) {
    const k = i + 1;
    if (sorted[i].pValue <= (k / m) * alpha) maxK = k;
  }
  const cutoff = maxK > 0 ? sorted[maxK - 1].pValue : -1;
  const out = segments.map((s) => ({
    ...s,
    adjusted: round(Math.min(1, (s.pValue * m) / (rank(segments, s.pValue) || 1))),
    significantAfterCorrection: cutoff >= 0 && s.pValue <= cutoff,
  }));
  return {
    method: "benjamini-hochberg",
    alpha,
    segments: out,
    survivors: out.filter((s) => s.significantAfterCorrection).length,
    rawSignificant: segments.filter((s) => s.pValue < alpha).length,
  };
}

function rank(segments: SegmentResult[], p: number): number {
  return segments.filter((s) => s.pValue <= p).length;
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
