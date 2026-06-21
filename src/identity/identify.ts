/**
 * tally — identity & first-touch (O3 · J2 · BTS-3 · P23).
 *
 * The two-call `identify()` pattern made explicit: `$set_once` for acquisition /
 * first-touch props (the retroactive-loss class — the original value is gone if
 * you overwrite it), `$set` only for mutable current state. Enforced at
 * instrumentation time, not review (BTS-3: "if you use `$set` for referral
 * source, every later session overwrites the original acquisition channel").
 *
 * No `any`, named exports only.
 */

/** A built identify() payload split into the two operators. */
export interface IdentifyPayload {
  distinctId: string;
  /** First-touch / acquisition props — written with `$set_once` (never overwritten). */
  $set_once: Record<string, unknown>;
  /** Mutable current-state props — written with `$set`. */
  $set: Record<string, unknown>;
}

/** Acquisition / first-touch property keys (must be `$set_once`, O3/P23). */
export const ACQUISITION_KEY = /^(referral_source|referrer|utm_|first_|initial_|acquisition|signup_source|landing|original_)/i;

/**
 * Split a flat props bag into the `$set_once` (acquisition) and `$set` (mutable)
 * operators by key. An acquisition key going through `$set` is the BTS-3 bug;
 * this routing makes the correct call by construction.
 */
export function buildIdentify(distinctId: string, props: Record<string, unknown>): IdentifyPayload {
  const payload: IdentifyPayload = { distinctId, $set_once: {}, $set: {} };
  for (const [key, value] of Object.entries(props)) {
    if (ACQUISITION_KEY.test(key)) {
      payload.$set_once[key] = value;
    } else {
      payload.$set[key] = value;
    }
  }
  return payload;
}

/** True if a prop key is an acquisition/first-touch prop (used by the hook gate). */
export function isAcquisitionProp(key: string): boolean {
  return ACQUISITION_KEY.test(key);
}
