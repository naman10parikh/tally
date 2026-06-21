/**
 * tally — the peeking guard (O6 · BTS-4 · P13 · J5). THE differentiator.
 *
 * On a FIXED-HORIZON FREQUENTIST test, checking results mid-flight and stopping
 * on first significance inflates the false-positive rate to 30–40%+ ("in the
 * limit of continuous monitoring, crossing p=0.05 under the null is 100%"). An
 * agent makes this worse — it polls and ships the instant it sees significance.
 *
 * The asymmetry to encode (ecosystem-03 §1a): an agent MAY stop a LOSER early on
 * a sequential boundary, but must NOT ship a WINNER before the pre-registered N
 * unless using a proper always-valid (sequential/Bayesian) method. This guard
 * refuses to declare a winner on a peeked fixed-horizon test.
 *
 * No `any`, named exports only.
 */

/** The statistical method an experiment is using. */
export type ExperimentMethod = "frequentist-fixed-horizon" | "frequentist-sequential" | "bayesian";

/** Input to the peeking guard. */
export interface PeekingInput {
  method: ExperimentMethod;
  /** Whether the operator is trying to declare a WINNER (vs stop a loser). */
  declaringWinner: boolean;
  /** Samples collected so far. */
  currentN: number;
  /** Pre-registered sample size for a fixed-horizon test. */
  preRegisteredN?: number;
  /** The result direction, if known ("winner" | "loser"). */
  direction?: "winner" | "loser";
}

/** Result of the peeking guard. */
export interface PeekingResult {
  /** True = looking/declaring is statistically valid right now. */
  safe: boolean;
  /** Whether tally would let a WINNER be declared. */
  winnerAllowed: boolean;
  /** Whether stopping a LOSER early is allowed (sequential boundary). */
  loserStopAllowed: boolean;
  /** The recommendation when not safe. */
  recommendation: string;
}

/**
 * Apply the peeking guard.
 *
 * - Bayesian: looking is always valid (no peeking penalty by construction) →
 *   safe, winner allowed.
 * - Sequential frequentist: valid to look; winners allowed on the always-valid
 *   boundary; losers may be stopped early.
 * - Fixed-horizon frequentist: declaring a WINNER before the pre-registered N is
 *   peeking → REFUSED; recommend Bayesian/sequential or waiting for N. Stopping a
 *   LOSER early is the one allowed early action.
 */
export function peekingGuard(input: PeekingInput): PeekingResult {
  const { method, declaringWinner, currentN, preRegisteredN, direction } = input;

  if (method === "bayesian") {
    return {
      safe: true,
      winnerAllowed: true,
      loserStopAllowed: true,
      recommendation: "Bayesian: results may be checked at any time without a peeking penalty.",
    };
  }

  if (method === "frequentist-sequential") {
    return {
      safe: true,
      winnerAllowed: true,
      loserStopAllowed: true,
      recommendation: "Sequential (always-valid): looking is valid; a winner may be declared on the boundary, a loser stopped early.",
    };
  }

  // Fixed-horizon frequentist — the dangerous case.
  const reachedN = preRegisteredN !== undefined && currentN >= preRegisteredN;

  if (declaringWinner && !reachedN) {
    return {
      safe: false,
      winnerAllowed: false,
      loserStopAllowed: true,
      recommendation:
        "REFUSE to declare a winner: this is a fixed-horizon frequentist test peeked before the pre-registered N. " +
        "Wait for N, OR switch to a Bayesian / sequential (always-valid) method so looking is statistically valid. " +
        "(An agent may stop a LOSER early on a sequential boundary, but must not ship a WINNER early — the asymmetry.)",
    };
  }

  if (!declaringWinner && direction === "loser") {
    return {
      safe: true,
      winnerAllowed: false,
      loserStopAllowed: true,
      recommendation: "Stopping a clear loser early is acceptable; declaring a winner early is not.",
    };
  }

  // Fixed-horizon, reached N, declaring a winner → valid.
  if (declaringWinner && reachedN) {
    return {
      safe: true,
      winnerAllowed: true,
      loserStopAllowed: true,
      recommendation: "Pre-registered N reached on a fixed-horizon test — declaring a result is valid.",
    };
  }

  return {
    safe: false,
    winnerAllowed: false,
    loserStopAllowed: true,
    recommendation:
      "Fixed-horizon test not yet at its pre-registered N — do not declare a winner; wait for N or use a sequential/Bayesian method.",
  };
}
