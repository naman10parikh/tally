/**
 * tally — PII masking at the edge (O4 · J3 · BTS-2 · P8).
 *
 * Mask-all-then-allowlist, fail closed BEFORE storage. PII is a one-way door —
 * once stored/exported "you cannot un-ring the bell." This drops/masks property
 * keys matching PII patterns unless explicitly allow-listed, and scrubs query
 * strings out of URL-shaped values (`$current_url` strips `?email=…&token=…`).
 *
 * No `any`, named exports only.
 */

/** Property-key patterns that are PII unless explicitly allow-listed (P8). */
export const PII_KEY_PATTERN = /(email|phone|ssn|social_security|card|cc_number|password|passwd|secret|token|api_key|dob|date_of_birth|first_name|last_name|full_name|address|zip|postcode)/i;

/** Result of masking a props bag. */
export interface MaskResult {
  /** The masked props safe to store. */
  masked: Record<string, unknown>;
  /** Keys that were dropped/masked (for the audit trail). */
  droppedKeys: string[];
}

/** A redaction marker so the event still has shape but no PII value. */
const REDACTED = "***";

/**
 * Mask a props bag: any key matching the PII pattern (and NOT in `allowlist`) is
 * redacted; URL-shaped string values have their query string stripped. The
 * default posture is mask — a key is kept verbatim only if it's not PII OR is
 * explicitly allow-listed.
 */
export function maskProps(
  props: Record<string, unknown>,
  allowlist: ReadonlySet<string> = new Set(),
): MaskResult {
  const masked: Record<string, unknown> = {};
  const droppedKeys: string[] = [];

  for (const [key, value] of Object.entries(props)) {
    if (PII_KEY_PATTERN.test(key) && !allowlist.has(key)) {
      masked[key] = REDACTED;
      droppedKeys.push(key);
      continue;
    }
    masked[key] = typeof value === "string" ? scrubUrl(value) : value;
  }

  return { masked, droppedKeys };
}

/**
 * Strip query string + fragment from a URL-shaped value (the `$current_url`
 * `before_send` scrub — `?email=a@b.com&token=…` is gone). Non-URL strings pass
 * through unchanged.
 */
export function scrubUrl(value: string): string {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname}`;
  } catch {
    // Malformed URL with a query: cut at the first `?` defensively.
    const q = value.indexOf("?");
    return q >= 0 ? value.slice(0, q) : value;
  }
}

/** True if a property key would be treated as PII (used by audit-pii + the hook). */
export function isPiiKey(key: string, allowlist: ReadonlySet<string> = new Set()): boolean {
  return PII_KEY_PATTERN.test(key) && !allowlist.has(key);
}
