# tally — BRAND

## Name rationale

**tally** = the simplest honest count — the marks you make so the total can never silently drift; the
human, low-tech antidote to a rotted event taxonomy. One word, lowercase. Light, relatable, animate
(the Energy naming family — Spark/Ribbon vibes, not heavy enterprise names). The name *is* the thesis:
underneath every funnel, retention curve, and experiment is one job — count what happened, once,
correctly, in a ledger no one can silently corrupt.

**Symbolic connection to the workflow:** a tally mark is a registry entry. Before dashboards and SQL,
you kept count with marks you could not retroactively un-make. That is exactly tally's discipline — a
CI-gated canonical event registry (the dedup ledger), identity stitched at instrumentation time
(`$set_once` for acquisition, because the first-touch value is gone forever once overwritten), and
flags whose keys are tombstoned, never reused. The marks hold the total honest.

## Tagline

> *"Count what matters, once, correctly — and refuse to ship the silent-failure that no alert will ever
> catch."*

Parent brand: **powered by Energy.**

## Design tokens (Energy warm-black system — see `.claude/rules/design.md`)

- **Background:** warm black `#141312` (NOT pure black `#000`, NOT near-black `#09090b`).
- **Type:** **Instrument Serif** for display/headings · **Poppins** for body (the serif+sans pairing is
  the single highest-impact anti-AI-slop choice).
- **Accent:** **amber** (warm, editorial, grounded). **NO generic AI purple/pink gradients** — that
  indigo is the apologized AI-slop prior.
- **Text on dark:** zinc-100/200 (softer than pure white).
- **Layout:** asymmetric bento grids over symmetric card grids; editorial, not generic-SaaS.
- **Iconography:** Lucide / Phosphor icons (weighted for hierarchy); no emoji as functional icons.

## Landing copy (cockpit shell)

**Hero:** Count what matters, once, correctly.
**Sub:** tally is your product-analytics + experimentation lead — a CI-gated event registry that can't
silently rot, PII masked before it's ever stored, and experiments that refuse to ship a fake winner.
**Three-plane footnote:** tally owns product behavior + flags + experiments. LLM token spend is
agentmoney's; app health is canary's; web stats are the Plausible plane. tally never pipes an LLM span
into PostHog.
