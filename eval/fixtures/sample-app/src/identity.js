// Identity stitching done RIGHT (BTS-3 / O3 / P23) — the positive example.
//
// Call identify() at FIRST LOAD (anonymous) AND after LOGIN (known) so the
// anonymous→known link is made at the right moment. Use $set_once for
// acquisition / first-touch props (irreversible if overwritten) and $set only
// for mutable current-state. tally's own fixture must model the correct pattern.

// First load — anonymous distinct_id; pin acquisition with $set_once so a later
// session can never overwrite the original referral source (P23).
export function onFirstLoad(posthog, referralSource) {
  posthog.identify(undefined, {
    // $set_once: first-touch acquisition — write-once, never overwritten.
    $set_once: { referral_source: referralSource, first_seen_at: new Date().toISOString() },
  });
}

// After login — stitch anonymous → known user. Mutable state uses $set.
export function onLogin(posthog, userId, plan) {
  posthog.identify(userId, {
    // $set: mutable current-state — safe to overwrite each session.
    $set: { plan, last_login_at: new Date().toISOString() },
  });
}
