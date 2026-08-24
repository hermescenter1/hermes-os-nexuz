/**
 * Phase 107 Stage 6-A — root-cause inventory.
 *
 * The evidence pack reports 73 UNHANDLED_FETCH_FAILURE and 26 STUCK_LOADING
 * *observations*. They are not 99 defects: one component rendered in three
 * locales at two viewports produces six observations, and one shared data-
 * fetching idiom copied across a module produces dozens.
 *
 * This walks from each affected ROUTE to the component that actually owns the
 * request, extracts every client-side fetch in that component, and records how
 * the code behaves on a non-2xx, a malformed body and an exception. The output
 * is the deduplicated list of real causes to fix.
 */
import fs from "node:fs";
import path from "node:path";

const APP = "src/app/[locale]";
const EVIDENCE = process.argv[2] || "E:/hermes-os-phase107-stage5-evidence/AUTH-EVIDENCE-MANIFEST.json";

const manifest = JSON.parse(fs.readFileSync(EVIDENCE, "utf8")).manifest;

/** route -> which Stage 6-A categories it was observed in, and how many cells. */
const affected = new Map();
for (const cell of manifest) {
  for (const a of cell.anomalies || []) {
    const kind = /fetch failed but the page shows no error/i.test(a) ? "UNHANDLED_FETCH_FAILURE"
      : /still presenting a loading state/i.test(a) ? "STUCK_LOADING"
        : null;
    if (!kind) continue;
    if (!affected.has(cell.route)) affected.set(cell.route, { kinds: new Set(), cells: 0, locales: new Set() });
    const e = affected.get(cell.route);
    e.kinds.add(kind); e.cells++; e.locales.add(cell.locale);
  }
}

const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };

/** The page file backing a route, with dynamic segments restored. */
function pageFile(route) {
  const p = path.join(APP, route === "/" ? "" : route, "page.tsx");
  return fs.existsSync(p) ? p : null;
}

/** Local components a file imports from @/components. */
function importedComponents(src) {
  const out = [];
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']@\/components\/([^"']+)["']/g)) {
    const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    for (const n of names) out.push({ name: n, module: m[2] });
  }
  return out;
}

/** Resolve `@/components/x/Y` to a real file. */
function resolveComponent(mod, name) {
  const bases = [`src/components/${mod}`, `src/components/${mod}/${name}`];
  for (const b of bases) {
    for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
      if (fs.existsSync(b + ext)) return b + ext;
    }
  }
  // barrel: find the file that declares the component
  const dir = `src/components/${mod}`;
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".tsx")) continue;
      const s = read(path.join(dir, f));
      if (s && new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`).test(s)) return path.join(dir, f).split(path.sep).join("/");
    }
  }
  return null;
}

/** Every client-side fetch in a file, with how its result is consumed. */
function fetchSites(file) {
  const src = read(file);
  if (!src) return [];
  const out = [];
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!/\bfetch\s*\(/.test(line)) return;
    const window = lines.slice(Math.max(0, i - 6), i + 14).join("\n");
    const endpoint = (line.match(/fetch\(\s*[`"']([^`"']+)/) || [])[1] ?? "(dynamic)";
    out.push({
      line: i + 1,
      endpoint,
      snippet: line.trim().slice(0, 120),
      // The behaviours that decide whether a failure is visible to the user.
      checksOk: /\.ok\b/.test(window),
      parsesUnconditionally: /\.then\(\s*\(?\s*r\w*\s*\)?\s*=>\s*r\w*\.json\(\)/.test(window) || /await\s+res\.json\(\)/.test(window),
      hasCatch: /\.catch\(|catch\s*\(/.test(window),
      hasFinally: /finally\s*\{/.test(window),
      setsLoadingFalse: /set\w*[Ll]oading\(\s*false\s*\)/.test(window),
      setsError: /set\w*[Ee]rror\s*\(/.test(window),
      guardsAbort: /AbortController|signal|cancelled|ignore\b/.test(window),
    });
  });
  return out;
}

const rows = [];
for (const [route, meta] of affected) {
  const pf = pageFile(route);
  const pageSrc = pf ? read(pf) : null;
  const owners = new Set();
  if (pageSrc) {
    for (const c of importedComponents(pageSrc)) {
      const f = resolveComponent(c.module, c.name);
      if (f) owners.add(f);
    }
    if (/\bfetch\s*\(/.test(pageSrc)) owners.add(pf);
  }
  for (const owner of owners) {
    const sites = fetchSites(owner);
    if (!sites.length) continue;
    rows.push({
      route, kinds: [...meta.kinds], cells: meta.cells, locales: [...meta.locales],
      owner, sites,
    });
  }
  if (!owners.size || ![...owners].some((o) => fetchSites(o).length)) {
    rows.push({ route, kinds: [...meta.kinds], cells: meta.cells, locales: [...meta.locales], owner: pf ?? "(page not found)", sites: [] });
  }
}

fs.mkdirSync("docs/design/stage6a", { recursive: true });
fs.writeFileSync("docs/design/stage6a/root-cause-inventory.json", JSON.stringify(rows, null, 2));

/* ── summary ─────────────────────────────────────────────────────────────── */
const byOwner = new Map();
for (const r of rows) {
  if (!byOwner.has(r.owner)) byOwner.set(r.owner, { routes: new Set(), cells: 0, sites: r.sites });
  const e = byOwner.get(r.owner);
  e.routes.add(r.route); e.cells += r.cells;
}
console.log(`affected routes: ${affected.size}`);
console.log(`owning files:    ${byOwner.size}`);
console.log("");
for (const [owner, e] of [...byOwner.entries()].sort((a, b) => b[1].cells - a[1].cells)) {
  const unguarded = e.sites.filter((s) => !s.checksOk).length;
  console.log(`${String(e.cells).padStart(3)} cells  ${e.routes.size} route(s)  ${e.sites.length} fetch(es), ${unguarded} without response.ok`);
  console.log(`         ${owner}`);
}
