/* web/app.js — tally cockpit SPA (G1, PLAN §10). Vanilla JS, zero dependencies, no build.
 *
 * Wires the 6 views to the read-only JSON endpoints in web/server.mjs:
 *   Brain browser        → /api/brain-files, /api/brain-file, /api/brain, /api/explain
 *   Run log              → /api/runs
 *   Tracking plan        → /api/tracking-plan
 *   Experiment decisions → /api/experiments   (the differentiator: SRM-first + peeking verdict)
 *   Flag health          → /api/flags
 *   Ask the employee     → /api/brain + /api/explain (read-only)
 * Read-mostly (Q7): no endpoint here mutates — there is no create-flag/fire-capture/ship-winner button.
 */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Minimal HTML-escape — all server text is rendered as text, never injected as markup. */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const body = await res.json().catch(() => ({ error: `bad response (${res.status})` }));
  if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
  return body;
}

/* --------------------------------------------------------------------- tabs --- */
function showView(name) {
  $$("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === name)));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  // Lazy-load each data view on first reveal.
  if (name === "runs" && !showView._runs) { showView._runs = true; loadRuns(); }
  if (name === "plan" && !showView._plan) { showView._plan = true; loadPlan(); }
  if (name === "experiments" && !showView._exp) { showView._exp = true; loadExperiments(); }
  if (name === "flags" && !showView._flags) { showView._flags = true; loadFlags(); }
}

/* ------------------------------------------------------------ brain browser --- */
async function loadArtifactList() {
  try {
    const { files } = await getJson("/api/brain-files");
    const list = $("#artifact-list");
    list.innerHTML = "";
    files.forEach((f) => {
      const b = document.createElement("button");
      b.textContent = f.replace(/\.md$/, "");
      b.dataset.file = f;
      b.addEventListener("click", () => openArtifact(f, b));
      list.appendChild(b);
    });
  } catch (err) {
    $("#artifact-list").innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

async function openArtifact(name, btn) {
  $$("#artifact-list button").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
  const reader = $("#brain-reader");
  reader.innerHTML = `<span class="loading">Loading ${esc(name)}…</span>`;
  try {
    const { markdown } = await getJson(`/api/brain-file?name=${encodeURIComponent(name)}`);
    reader.innerHTML = `<pre>${renderMarkdownLite(markdown)}</pre>`;
  } catch (err) {
    reader.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

/** Lightest possible markdown: escape, then bold **…** so headings/labels stand out. No HTML injection. */
function renderMarkdownLite(md) {
  return esc(md).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

async function runBrainSearch() {
  const q = $("#brain-q").value.trim();
  if (!q) return;
  const hitsEl = $("#brain-hits");
  hitsEl.innerHTML = `<span class="loading">Searching brain for "${esc(q)}"…</span>`;
  try {
    const { hits } = await getJson(`/api/brain?q=${encodeURIComponent(q)}`);
    if (!hits.length) { hitsEl.innerHTML = `<span class="empty">No hits for "${esc(q)}".</span>`; return; }
    hitsEl.innerHTML = "";
    hits.forEach((h) => {
      const row = document.createElement("div");
      row.className = "hit";
      const id = h.id ? esc(h.id) : "—";
      row.innerHTML =
        `<span class="id">${id}</span>` +
        `<span class="heading">${esc(h.title || h.file)}</span>` +
        `<span class="score">score ${esc(h.score)}</span>`;
      if (h.id) row.addEventListener("click", () => readById(h.id));
      hitsEl.appendChild(row);
    });
  } catch (err) {
    hitsEl.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

async function readById(id) {
  const reader = $("#brain-reader");
  reader.innerHTML = `<span class="loading">Reading ${esc(id)}…</span>`;
  try {
    const r = await getJson(`/api/explain?id=${encodeURIComponent(id)}`);
    reader.innerHTML = `<pre>${renderMarkdownLite(r.body)}</pre>`;
    reader.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    reader.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

/* ----------------------------------------------------------------- run log --- */
async function loadRuns() {
  const wrap = $("#runs-wrap");
  try {
    const { runs } = await getJson("/api/runs?limit=60");
    if (!runs.length) { wrap.innerHTML = `<span class="empty">No runs logged yet — run a <code>tally</code> command.</span>`; return; }
    const rows = runs
      .map((r) => {
        const trace = (r.traceId || "").slice(0, 12);
        const dur = typeof r.durationMs === "number" ? r.durationMs : "—";
        const okClass = r.outcome === "ok" ? "ok" : "bad";
        return (
          `<tr>` +
          `<td class="mono">${esc((r.ts || "").replace("T", " ").replace(/\..*/, ""))}</td>` +
          `<td class="mono">${esc(r.command || "—")}</td>` +
          `<td class="mono">${esc(r.model || "—")}</td>` +
          `<td class="num">${esc(dur)} ms</td>` +
          `<td class="mono">${esc(trace)}…</td>` +
          `<td class="num">${esc(r.toolCount ?? "—")}</td>` +
          `<td><span class="badge ${okClass}">${esc(r.outcome || "—")}</span></td>` +
          `</tr>`
        );
      })
      .join("");
    wrap.innerHTML =
      `<table><thead><tr><th>when</th><th>command</th><th>model</th><th>duration</th><th>trace.id</th><th>tools</th><th>outcome</th></tr></thead><tbody>${rows}</tbody></table>`;
  } catch (err) {
    wrap.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

/* ------------------------------------------------------------ tracking plan --- */
async function loadPlan() {
  const wrap = $("#plan-wrap");
  try {
    const p = await getJson("/api/tracking-plan");
    const ci = p.ciCheck && p.ciCheck.present
      ? `<span class="badge ok">CI gate present — fails the build on a case-variant</span>`
      : `<span class="badge bad">no CI gate</span>`;
    const accessors = p.typedAccessors ? `<span class="badge ok">typed accessors ✓</span>` : `<span class="badge bad">no typed accessors</span>`;
    const head =
      `<div class="card" style="margin-bottom:16px">` +
      `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">` +
      `${ci} ${accessors} <span class="badge amber">casing: ${esc(p.casing)}</span>` +
      `<span class="num" style="font-size:12px;color:var(--text-faint)">${esc(p.discovered)} events discovered</span>` +
      `</div>` +
      (p.mergedVariants && p.mergedVariants.length
        ? `<div class="mono" style="font-size:12px;color:var(--bad)">merged case-variants: ${p.mergedVariants.map((v) => esc(v)).join(", ")}</div>`
        : `<div class="mono" style="font-size:12px;color:var(--text-faint)">no case-variants — every event is canonical</div>`) +
      `</div>`;
    const rows = (p.events || [])
      .map((e) => {
        // events from the registry carry props as an array of {name,type}; the summary carries a count.
        const propList = Array.isArray(e.props)
          ? e.props.map((pr) => `${esc(pr.name)}:<span style="color:var(--text-faint)">${esc(pr.type)}</span>`).join(", ")
          : `${esc(e.props)} prop(s)`;
        const status = e.registered
          ? `<span class="badge ok">registered ✅</span>`
          : `<span class="badge bad">autocaptured 🟡</span>`;
        return (
          `<tr>` +
          `<td class="mono" style="color:var(--text)">${esc(e.name)}</td>` +
          `<td class="mono">${propList}</td>` +
          `<td>${status}</td>` +
          `</tr>`
        );
      })
      .join("");
    wrap.innerHTML =
      head +
      `<div class="card"><table><thead><tr><th>event</th><th>typed schema</th><th>status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } catch (err) {
    wrap.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

/* ------------------------------------------------- experiment decisions (★) --- */
async function loadExperiments() {
  const wrap = $("#exp-wrap");
  try {
    const { decisions } = await getJson("/api/experiments");
    if (!decisions.length) { wrap.innerHTML = `<span class="empty">No experiment fixtures found.</span>`; return; }
    wrap.innerHTML = decisions.map(renderExperimentCard).join("");
  } catch (err) {
    wrap.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

function renderExperimentCard(d) {
  const r = d.result || {};
  const refused = r.refused === true;
  const verdictText = refused ? "REFUSED" : (r.verdict ? String(r.verdict).toUpperCase() : "OK");
  const cls = refused ? "refused" : "valid";
  const verdictBadge = refused
    ? `<span class="badge bad">${esc(verdictText)}</span>`
    : `<span class="badge ok">${esc(verdictText)}</span>`;

  // SRM line — present on both the valid payload (r.srm) and the SRM-fail refusal (r.srm).
  let srmLine = "";
  if (r.srm) {
    const pass = r.srm.pass ? `<span class="badge ok">SRM pass</span>` : `<span class="badge bad">SRM fail</span>`;
    const obs = Array.isArray(r.srm.observed) ? r.srm.observed.join(" / ") : "—";
    srmLine =
      `<div class="exp-checks">${pass}</div>` +
      `<div class="exp-srm">χ²=${esc(r.srm.chiSquared)} · p=${esc(r.srm.pValue)} · threshold ${esc(r.srm.threshold)} · observed ${esc(obs)}</div>`;
  }

  // Peeking line — present on both the valid payload and the peeked refusal.
  let peekLine = "";
  if (r.peeking) {
    const safe = r.peeking.safe ? `<span class="badge ok">peeking safe</span>` : `<span class="badge bad">peeking unsafe</span>`;
    const winner = r.peeking.winnerAllowed ? `<span class="badge ok">winner allowed</span>` : `<span class="badge bad">winner refused</span>`;
    peekLine = `<div class="exp-checks">${safe} ${winner}</div>`;
  }

  // Pre-registration (valid payload only) + method (refusal payload).
  let metaLine = "";
  if (typeof r.preRegistered === "boolean") {
    metaLine += r.preRegistered ? `<span class="badge ok">pre-registered</span> ` : `<span class="badge bad">not pre-registered</span> `;
  }
  if (r.method) metaLine += `<span class="badge amber">${esc(r.method)}</span>`;
  const metaWrap = metaLine ? `<div class="exp-checks">${metaLine}</div>` : "";

  const reason = r.reason || (r.peeking && r.peeking.recommendation) || "";
  const reasonBlock = reason ? `<div class="exp-reason">${esc(reason)}</div>` : "";

  const warnings = Array.isArray(r.warnings) && r.warnings.length
    ? `<div class="exp-srm">warnings: ${r.warnings.map((w) => esc(typeof w === "string" ? w : (w.message || JSON.stringify(w)))).join(" · ")}</div>`
    : "";

  return (
    `<div class="exp-card ${cls}">` +
    `<div class="exp-head"><span class="fixture">${esc(d.fixture)}</span><span class="label">${esc(d.label)}</span><span class="exp-verdict">${verdictBadge}</span></div>` +
    metaWrap +
    srmLine +
    peekLine +
    reasonBlock +
    warnings +
    `</div>`
  );
}

/* ------------------------------------------------------------ flag health --- */
async function loadFlags() {
  const wrap = $("#flags-wrap");
  try {
    const f = await getJson("/api/flags");
    const zombies = f.zombies || [];
    const overall = zombies.length
      ? `<span class="badge bad">${esc(zombies.length)} zombie flag(s)</span>`
      : `<span class="badge ok">no zombie flags</span>`;
    const head =
      `<div class="card" style="margin-bottom:16px"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">` +
      `${overall} <span class="num" style="font-size:12px;color:var(--text-faint)">${esc(f.temporaryFlags ?? 0)} temporary flag(s) tracked</span>` +
      `</div></div>`;
    const rows = zombies
      .map((z) => {
        const reason = z.reason ? `<div class="flag-reason">↳ ${esc(z.reason)}</div>` : "";
        return (
          `<div class="flag-row zombie">` +
          `<span class="fkey">${esc(z.key)}</span>` +
          `<span class="ftype">${esc(z.type)}</span>` +
          `<span class="fowner">${esc(z.owner || "no owner")}</span>` +
          `<span class="fage num">age ${esc(z.ageDays)}d · last-eval ${esc(z.lastEvalDays)}d</span>` +
          `</div>` +
          reason
        );
      })
      .join("");
    const body = zombies.length
      ? `<div class="card">${rows}</div>`
      : `<div class="card"><span class="empty">No zombie flags in the ledger — every temporary flag has an expiry + owner (O10).</span></div>`;
    const tombstones = (f.tombstones || []).length
      ? `<div class="tombstone-list">tombstoned keys (NEVER reuse — Knight Capital, P27): ${f.tombstones.map((t) => `<strong>${esc(t)}</strong>`).join(", ")}</div>`
      : "";
    wrap.innerHTML = head + body + tombstones;
  } catch (err) {
    wrap.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

/* ------------------------------------------------------- ask the employee --- */
async function ask() {
  const q = $("#ask-q").value.trim();
  if (!q) return;
  const out = $("#ask-answer");
  out.innerHTML = `<span class="loading">Asking tally…</span>`;
  const isId = /^(BTS-\d+|P\d+|O\d+[a-z]?|J\d+|[A-Ea-e]\d+)$/.test(q);
  try {
    if (isId) {
      const r = await getJson(`/api/explain?id=${encodeURIComponent(q)}`);
      out.innerHTML =
        `<div class="card"><div class="mono" style="color:var(--amber);margin-bottom:8px">${esc(r.id)} · ${esc(r.file)}</div><pre style="margin:0;white-space:pre-wrap;font-family:var(--mono);font-size:12.5px;line-height:1.7;color:var(--text-dim)">${renderMarkdownLite(r.body)}</pre></div>` +
        boundaryNote();
    } else {
      const { hits } = await getJson(`/api/brain?q=${encodeURIComponent(q)}`);
      if (!hits.length) { out.innerHTML = `<span class="empty">tally has no opinion on that (no brain hit).</span>` + boundaryNote(); return; }
      const top = hits[0];
      let detail = "";
      if (top.id) {
        try { const r = await getJson(`/api/explain?id=${encodeURIComponent(top.id)}`); detail = `<pre style="margin:10px 0 0;white-space:pre-wrap;font-family:var(--mono);font-size:12.5px;line-height:1.7;color:var(--text-dim)">${renderMarkdownLite(r.body)}</pre>`; } catch { /* fall back to the hit title */ }
      }
      const others = hits.slice(1).map((h) => `<div class="hit"><span class="id">${esc(h.id || "—")}</span><span class="heading">${esc(h.title || h.file)}</span></div>`).join("");
      out.innerHTML =
        `<div class="card"><div class="mono" style="color:var(--amber);margin-bottom:6px">${esc(top.id || top.file)}</div><div style="color:var(--text)">${esc(top.title || "")}</div>${detail}</div>` +
        (others ? `<div style="margin-top:12px">${others}</div>` : "") +
        boundaryNote();
    }
  } catch (err) {
    out.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

function boundaryNote() {
  return `<div class="boundary-note">Boundary: LLM token cost / spend is <strong>agentmoney's</strong> (tally never pipes <code>gen_ai.usage.*</code> into PostHog); app health / errors / uptime is <strong>canary's</strong>; web pageview stats are the <strong>Plausible</strong> plane. tally owns product analytics + flags + experiments only (O18).</div>`;
}

/* ------------------------------------------------------------------- init --- */
function init() {
  $$("nav.tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
  $("#brain-go").addEventListener("click", runBrainSearch);
  $("#brain-q").addEventListener("keydown", (e) => { if (e.key === "Enter") runBrainSearch(); });
  $("#ask-go").addEventListener("click", ask);
  $("#ask-q").addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); });
  loadArtifactList();
}

document.addEventListener("DOMContentLoaded", init);
