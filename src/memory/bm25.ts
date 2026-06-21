/**
 * tally — Memory queryable layer: BM25F search over the expertise brain.
 *
 * Upgrades the Memory component from 🟡 (MEMORY.md + grep) to ✅: a real ranked
 * search over `brain/`, CHUNKED BY ID (BTS-N / O-N / P-N / J-N / GAPS §A–E),
 * returning `{ file, id, title, score, snippet }` hits + an `explain(id)` that
 * prints the full chunk. Per HARNESS-OVERRIDES §2 the layer indexes the EXPERTISE
 * BRAIN, not code/commit history. This is the shared engine: `scripts/memory-
 * search.sh` delegates to it (the OR-branch of the Memory ✅ criterion) and the
 * B-track `tally brain`/`tally explain` (B6) wrap the exported `search()`/
 * `explain()`. No `any`, named exports only; tsx-runnable, zero deps (no
 * package.json), so it is independent of B1.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A single ID-keyed chunk of the brain (one BTS / O / P / J / GAPS entry). */
export interface BrainChunk {
  /** Stable ID, e.g. "BTS-4", "O6", "P27", "J5", "A3". */
  id: string;
  /** Source file basename, e.g. "BATTLE-TESTED-SCENARIOS.md". */
  file: string;
  /** Heading title with the ID + leading severity emoji stripped. */
  title: string;
  /** Full chunk text (heading through the line before the next heading). */
  body: string;
}

/** A ranked search hit. */
export interface BrainHit {
  id: string;
  file: string;
  title: string;
  /** BM25 score (title-field boosted); higher is better. */
  score: number;
  /** Best-matching line(s) for context display. */
  snippet: string;
}

// BM25F parameters. The brain is two fields per chunk — `title` (the heading) and
// `body` — scored with INDEPENDENT length normalization so a short, on-topic
// heading isn't drowned by a long body, then combined as
// `TITLE_BOOST * titleScore + bodyScore`. This is the standard field-weighted
// BM25 used by production search (Elasticsearch/Lucene). k1/b are gentle so term
// pile-up in one long body can't dominate a precise title match.
const BM25_K1 = 1.2;
const BM25_B = 0.5;
/** A title-field match is worth ~3× a body match (canonical BM25F title weight). */
const TITLE_BOOST = 3;

/**
 * Per-file ID heading patterns. The capture group is the canonical ID. Order is
 * irrelevant — each file is matched against its own pattern only.
 */
const ID_HEADING_PATTERNS: ReadonlyArray<{ file: RegExp; heading: RegExp }> = [
  // "## BTS-4 🔴 The PM ships a 'winning' experiment ..."
  { file: /BATTLE-TESTED-SCENARIOS\.md$/, heading: /^##\s+(BTS-\d+)\b/ },
  // "### O6 — Always make peeking structurally impossible ..."  (incl. O12b)
  { file: /OPINIONS\.md$/, heading: /^###\s+(O\d+[a-z]?)\b/ },
  // "### P27 🔴 Reusing a retired flag key/bit ..."
  { file: /KNOWN-PITFALLS\.md$/, heading: /^###\s+(P\d+)\b/ },
  // "## J5 — Experimentation statistics ..."
  { file: /EXPERTISE-MAP\.md$/, heading: /^##\s+(J\d+)\b/ },
  // "### A3 ⚖️ Sequential/Bayesian vs fixed-horizon ..." (GAPS §A–E)
  { file: /GAPS-AND-DISPUTES\.md$/, heading: /^###\s+([A-E]\d+)\b/ },
];

/** Strip leading severity emoji / dash / pipe so the title is clean prose. */
function cleanTitle(rawAfterId: string): string {
  return rawAfterId
    .replace(/^[\s—–\-:|]+/u, "")
    // Drop a leading severity emoji block (🔴 🟠 🟡 ⚖️ etc.) if present.
    .replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "")
    .trim();
}

/** Tokenize to lowercased word tokens (BM25-friendly; keeps alnum runs). */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Resolve the repo's brain directory from this module's location. */
function defaultBrainDir(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // .../src/memory
  return resolve(here, "..", "..", "brain");
}

/**
 * Parse one markdown file into ID-keyed chunks using its heading pattern.
 * A file with no matching pattern (e.g. MOC, ORG_*) yields no chunks — by
 * design, only the six expertise artifacts carry IDs.
 */
function chunkFile(filePath: string, fileName: string): BrainChunk[] {
  const pat = ID_HEADING_PATTERNS.find((p) => p.file.test(fileName));
  if (!pat) return [];

  const lines = readFileSync(filePath, "utf8").split("\n");
  const chunks: BrainChunk[] = [];
  let current: { id: string; title: string; depth: number; bodyLines: string[] } | null = null;

  const flush = (): void => {
    if (!current) return;
    chunks.push({
      id: current.id,
      file: fileName,
      title: current.title,
      body: current.bodyLines.join("\n").trimEnd(),
    });
    current = null;
  };

  for (const line of lines) {
    const m = line.match(pat.heading);
    if (m) {
      flush();
      const id = m[1];
      const afterId = line.slice(line.indexOf(id) + id.length);
      const depth = (line.match(/^#+/)?.[0].length ?? 2);
      current = { id, title: cleanTitle(afterId), depth, bodyLines: [line] };
      continue;
    }
    if (current) {
      // Terminate the chunk at a section heading of equal-or-higher level (≤ the
      // chunk's own depth) that is NOT itself an ID heading — so an entry can't
      // bleed into the next "## Feature flags" / "## Quick-scan index" section.
      const h = line.match(/^(#+)\s/);
      if (h && h[1].length <= current.depth) {
        flush();
        continue;
      }
      current.bodyLines.push(line);
    }
  }
  if (current) {
    chunks.push({
      id: current.id,
      file: fileName,
      title: current.title,
      body: current.bodyLines.join("\n").trimEnd(),
    });
  }
  return chunks;
}

/** Load + chunk every markdown file under `brainDir`. */
export function loadBrainChunks(brainDir: string = defaultBrainDir()): BrainChunk[] {
  const out: BrainChunk[] = [];
  let entries: string[];
  try {
    entries = readdirSync(brainDir);
  } catch {
    // No brain dir → empty corpus (caller decides how to report).
    return out;
  }
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const full = join(brainDir, name);
    try {
      if (!statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    out.push(...chunkFile(full, name));
  }
  return out;
}

interface IndexedChunk {
  chunk: BrainChunk;
  /** term -> count in the body (excluding the heading line). */
  bodyTf: Map<string, number>;
  /** term -> count in the title (the heading). */
  titleTf: Map<string, number>;
  /** body token count (for body-field length normalization). */
  bodyLen: number;
  /** title token count (for title-field length normalization). */
  titleLen: number;
}

/** A built BM25F index over a brain corpus (title + body as separate fields). */
export class BrainIndex {
  private readonly indexed: IndexedChunk[];
  private readonly df: Map<string, number>;
  private readonly avgBodyLen: number;
  private readonly avgTitleLen: number;
  private readonly n: number;
  private readonly byId: Map<string, BrainChunk>;

  constructor(chunks: BrainChunk[]) {
    this.indexed = [];
    this.df = new Map();
    this.byId = new Map();

    for (const chunk of chunks) {
      this.byId.set(chunk.id.toUpperCase(), chunk);

      const titleToks = tokenize(chunk.title);
      // Body excludes the heading line so the title isn't double-counted.
      const bodyOnly = chunk.body.split("\n").slice(1).join("\n");
      const bodyToks = tokenize(bodyOnly);

      const titleTf = new Map<string, number>();
      for (const t of titleToks) titleTf.set(t, (titleTf.get(t) ?? 0) + 1);
      const bodyTf = new Map<string, number>();
      for (const t of bodyToks) bodyTf.set(t, (bodyTf.get(t) ?? 0) + 1);

      // Document frequency: a term counts once per chunk if it appears anywhere.
      const seen = new Set<string>([...titleTf.keys(), ...bodyTf.keys()]);
      for (const term of seen) this.df.set(term, (this.df.get(term) ?? 0) + 1);

      this.indexed.push({
        chunk,
        bodyTf,
        titleTf,
        bodyLen: bodyToks.length,
        titleLen: titleToks.length,
      });
    }

    this.n = this.indexed.length;
    this.avgBodyLen = this.n > 0 ? this.indexed.reduce((s, c) => s + c.bodyLen, 0) / this.n : 0;
    this.avgTitleLen = this.n > 0 ? this.indexed.reduce((s, c) => s + c.titleLen, 0) / this.n : 0;
  }

  get size(): number {
    return this.n;
  }

  /** Okapi idf with the +1 floor so common terms never go negative. */
  private idf(term: string): number {
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (this.n - df + 0.5) / (df + 0.5));
  }

  /** Single-field BM25 saturation/length-norm term (k1/b, gentle). */
  private fieldScore(tf: number, len: number, avgLen: number): number {
    if (tf === 0) return 0;
    const denom = tf + BM25_K1 * (1 - BM25_B + (BM25_B * len) / (avgLen || 1));
    return (tf * (BM25_K1 + 1)) / denom;
  }

  /**
   * Rank chunks for `query` with BM25F: title and body are scored as separate
   * length-normalized fields and combined `TITLE_BOOST*title + body`, so a chunk
   * whose HEADING is about the query (e.g. O6 "make peeking impossible") outranks
   * one that only buries the term in a long body.
   */
  search(query: string, limit = 5): BrainHit[] {
    const qTerms = tokenize(query);
    if (qTerms.length === 0 || this.n === 0) return [];

    const scored = this.indexed.map((doc) => {
      let score = 0;
      for (const term of qTerms) {
        const titleS = this.fieldScore(doc.titleTf.get(term) ?? 0, doc.titleLen, this.avgTitleLen);
        const bodyS = this.fieldScore(doc.bodyTf.get(term) ?? 0, doc.bodyLen, this.avgBodyLen);
        if (titleS === 0 && bodyS === 0) continue;
        score += this.idf(term) * (TITLE_BOOST * titleS + bodyS);
      }
      return { doc, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) =>
        b.score !== a.score ? b.score - a.score : a.doc.chunk.id.localeCompare(b.doc.chunk.id),
      )
      .slice(0, limit)
      .map(({ doc, score }) => ({
        id: doc.chunk.id,
        file: doc.chunk.file,
        title: doc.chunk.title,
        score: Math.round(score * 1000) / 1000,
        snippet: bestSnippet(doc.chunk.body, qTerms),
      }));
  }

  /** Return the full chunk for an ID (case-insensitive), or null. */
  explain(id: string): BrainChunk | null {
    return this.byId.get(id.trim().toUpperCase()) ?? null;
  }
}

/** Pick the line(s) with the most query-term hits as a snippet. */
function bestSnippet(body: string, qTerms: string[], context = 1): string {
  const lines = body.split("\n");
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < lines.length; i++) {
    const toks = new Set(tokenize(lines[i]));
    let s = 0;
    for (const t of qTerms) if (toks.has(t)) s++;
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  const start = Math.max(0, bestIdx - context);
  const end = Math.min(lines.length, bestIdx + context + 1);
  return lines
    .slice(start, end)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(" ")
    .slice(0, 280);
}

/** Convenience: build an index over the default brain dir and search. */
export function search(query: string, limit = 5, brainDir?: string): BrainHit[] {
  return new BrainIndex(loadBrainChunks(brainDir)).search(query, limit);
}

/** Convenience: build an index over the default brain dir and explain one ID. */
export function explain(id: string, brainDir?: string): BrainChunk | null {
  return new BrainIndex(loadBrainChunks(brainDir)).explain(id);
}

// --- CLI mode (tsx-runnable; mirrors the B6 `tally brain`/`tally explain` shape so
// the B-track command wrappers are trivial, and `scripts/memory-search.sh` can
// delegate here — the OR-branch of the Memory ✅ criterion, independent of B1). ---

function isMain(): boolean {
  const entry = process.argv[1] ? resolve(process.argv[1]) : "";
  return entry === resolve(fileURLToPath(import.meta.url));
}

function runCli(argv: string[]): number {
  const wantJson = argv.includes("--json");
  const args = argv.filter((a) => a !== "--json");
  const sub = args[0];

  if (!sub || sub === "--help" || sub === "-h") {
    process.stdout.write(
      'tally memory/bm25 — BM25F search over brain/\n' +
        '  bm25 search "<query>" [--limit N] [--json]   ranked hits (file + ID + snippet)\n' +
        "  bm25 explain <BTS-/P-/O-/J-/A-id> [--json]   print the full chunk by ID\n",
    );
    return 0;
  }

  if (sub === "search") {
    const limitIdx = args.indexOf("--limit");
    const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) || 5 : 5;
    const queryParts = args
      .slice(1)
      .filter((a, i) => !(a === "--limit") && !(args[i] === "--limit"));
    const query = queryParts.join(" ").trim();
    if (!query) {
      process.stderr.write("error: search requires a query\n");
      return 1;
    }
    const hits = search(query, limit);
    if (wantJson) {
      process.stdout.write(JSON.stringify({ query, hits }, null, 2) + "\n");
      return 0;
    }
    if (hits.length === 0) {
      process.stdout.write(`No brain hits for: ${query}\n`);
      return 0;
    }
    process.stdout.write(`=== brain search: "${query}" ===\n\n`);
    hits.forEach((h, i) => {
      process.stdout.write(
        `[${i + 1}] ${h.file} ${h.id} (score ${h.score})\n    ${h.title}\n    > ${h.snippet}\n\n`,
      );
    });
    return 0;
  }

  if (sub === "explain") {
    const id = args[1];
    if (!id) {
      process.stderr.write("error: explain requires an ID (e.g. P27)\n");
      return 1;
    }
    const chunk = explain(id);
    if (!chunk) {
      process.stderr.write(`error: no brain entry for ID "${id}"\n`);
      return 2;
    }
    if (wantJson) {
      process.stdout.write(JSON.stringify(chunk, null, 2) + "\n");
      return 0;
    }
    process.stdout.write(`# ${chunk.file} · ${chunk.id}\n\n${chunk.body}\n`);
    return 0;
  }

  process.stderr.write(`error: unknown subcommand "${sub}" (use search | explain)\n`);
  return 1;
}

if (isMain()) {
  process.exit(runCli(process.argv.slice(2)));
}
