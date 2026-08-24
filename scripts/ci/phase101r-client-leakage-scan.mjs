#!/usr/bin/env node
// PHASE 101-R — prove the withheld half of the Phase 101 corpus never reaches
// a browser.
//
// WHY A SCRIPT AND NOT A UNIT TEST
// The thing under inspection is a BUILD ARTIFACT. `.next/static/**` does not
// exist until `next build` has run, and the served HTML and RSC payload do not
// exist until a server is running. A unit test that asserted on them would
// either be skipped (and rot) or would fail for everyone who had not built. So
// this runs as its own step, after the build, and says loudly when it has
// nothing to check rather than reporting an empty scan as a pass.
//
// WHAT IT CHECKS
//   the SOURCE graph  — can any `"use client"` module reach the corpus at all
//   the BUILD output  — did any of it actually ship
//
// WHAT COUNTS AS A LEAK
//   .next/server/**   — NOT a leak. The server legitimately holds the whole
//                       corpus; that is where the reasoning happens.
//   .next/static/**   — a leak. Anything here is shipped to every visitor.
//   served HTML       — a leak.
//   RSC/Flight payload— a leak. It is embedded in the HTML and is the easiest
//                       place for a server component to spill data by accident.
//
// The private set is DERIVED (all corpus ids minus the published allowlist) by
// reading the same source files the runtime reads. Nothing is transcribed: a
// hard-coded id would outlive the scenario it names, and a hard-coded line of
// engineering text would itself be the leak.
//
// USAGE
//   node scripts/ci/phase101r-client-leakage-scan.mjs
//   node scripts/ci/phase101r-client-leakage-scan.mjs --url=http://127.0.0.1:3120
//
// Exit 0 = no leak found and something was actually scanned. Exit 1 = a leak,
// or nothing to scan.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// The client-graph walk lives in ONE module, shared with
// `runtime/__tests__/phase101r-client-boundary.test.ts`. Two copies of a
// traversal are two answers, and the one that drifts is the one nobody runs.
import { scanClientGraph } from "./lib/phase101r-client-graph.mjs";

const REPO = resolve(process.cwd());
const NEXT_STATIC = join(REPO, ".next", "static");
const REFERENCE_DIR = join(REPO, "src", "lib", "industrial-knowledge", "reference");
const EXPOSURE_FILE = join(REPO, "src", "lib", "industrial-knowledge", "runtime", "exposure.ts");

const urlArg = process.argv.find((a) => a.startsWith("--url="));
const BASE_URL = urlArg ? urlArg.slice("--url=".length).replace(/\/$/, "") : null;

const fail = (message) => {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
};

/* ── Derive the withheld set from the same sources the runtime reads ─────── */

function publishedIds() {
  const source = readFileSync(EXPOSURE_FILE, "utf8");
  const block = source.match(
    /export const PUBLIC_SCENARIO_IDS[^=]*=\s*\[([\s\S]*?)\];/,
  );
  if (!block) throw new Error("could not read PUBLIC_SCENARIO_IDS from exposure.ts");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Every scenario id and its authored title, read straight out of the reference
 * sources. Titles are collected as well as ids because an id is a short token
 * that could appear by coincidence, while a full authored title appearing in a
 * browser artefact is unambiguous.
 */
function corpusScenarios() {
  const out = [];
  for (const entry of readdirSync(REFERENCE_DIR)) {
    if (!entry.endsWith(".ts") || entry === "index.ts" || entry === "_authoring.ts") continue;
    const source = readFileSync(join(REFERENCE_DIR, entry), "utf8");
    // Each scenario opens with `id: "<SYSTEM>-FS-<n>",` followed by a
    // `title: t("<english>", "<persian>")` on the next lines.
    const re = /id:\s*"((?:TIA|SCADA|HMI)-\d+-FS-\d+)",[\s\S]{0,400}?title:\s*t\(\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re.exec(source)) !== null) out.push({ id: m[1], title: m[2] });
  }
  return out;
}

const published = new Set(publishedIds());
const scenarios = corpusScenarios();
const withheld = scenarios.filter((s) => !published.has(s.id));

if (published.size === 0) fail("no published ids were derived — the scan would be vacuous");
if (scenarios.length === 0) fail("no corpus scenarios were derived — the scan would be vacuous");
if (withheld.length === 0) fail("no withheld scenarios were derived — the scan would be vacuous");

/** Needles that must never appear in a browser artefact. */
const NEEDLES = [
  ...withheld.map((s) => ({ kind: "private-id", value: s.id })),
  ...withheld
    .filter((s) => s.title.length > 20)
    .map((s) => ({ kind: "private-title", value: s.title })),
  { kind: "answer-key", value: "groundTruth" },
  { kind: "answer-key", value: "expectedMissingNodeIds" },
  { kind: "answer-key", value: "expectedSafeActionIds" },
  { kind: "answer-key", value: "supportingNodeIds" },
];

console.log(
  `derived ${published.size} published / ${withheld.length} withheld scenarios ` +
    `→ ${NEEDLES.length} needles`,
);

/* ── Scan ─────────────────────────────────────────────────────────────────── */

function scan(label, text) {
  let clean = true;
  for (const needle of NEEDLES) {
    if (text.includes(needle.value)) {
      fail(`${label} contains ${needle.kind}: ${needle.value.slice(0, 60)}`);
      clean = false;
    }
  }
  return clean;
}

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

let scannedSomething = false;

// A — THE SOURCE GRAPH.
// Run before the artifact scan on purpose: if a client module can reach the
// corpus, that is the CAUSE, and finding it first turns the byte-level hits
// below from a symptom into a diagnosis.
const graph = scanClientGraph(REPO);
if (graph.entries === 0) {
  fail('no "use client" entries were found — the graph scan would be vacuous');
} else if (graph.violations.length > 0) {
  for (const chain of graph.violations) fail(`client graph reaches server-only code: ${chain}`);
} else {
  console.log(
    `client graph: ${graph.entries} "use client" entries, none reaching ${graph.forbidden.length} server-only modules`,
  );
}

// 0 — VACUITY GUARD.
// A scan for strings that are not in the build at all passes for the wrong
// reason. The withheld corpus is SUPPOSED to be in `.next/server`, so requiring
// it there proves two things at once: the build really carries the corpus, and
// the needles are the exact strings that build contains. Without this, a
// mis-derived id list or a corpus that silently dropped out of the bundle would
// both read as a clean pass.
const NEXT_SERVER = join(REPO, ".next", "server");
if (!existsSync(NEXT_SERVER)) {
  fail(".next/server is missing — run `npm run build` before this scan");
} else {
  const serverFiles = walkFiles(NEXT_SERVER).filter((f) => /\.(js|mjs|json)$/.test(f));
  const found = new Set();
  for (const file of serverFiles) {
    const text = readFileSync(file, "utf8");
    for (const s of withheld) if (text.includes(s.id)) found.add(s.id);
  }
  if (found.size === 0) {
    fail(
      "no withheld scenario id appears in .next/server — the corpus is not in " +
        "this build, so the client scan below would be vacuous",
    );
  } else {
    console.log(
      `vacuity guard: ${found.size}/${withheld.length} withheld ids present in .next/server (expected)`,
    );
  }
}

// 1 — the client bundle.
if (!existsSync(NEXT_STATIC)) {
  fail(".next/static is missing — run `npm run build` before this scan");
} else {
  const files = walkFiles(NEXT_STATIC).filter((f) => /\.(js|mjs|json|css|txt|map)$/.test(f));
  if (files.length === 0) fail(".next/static contained no scannable files");
  for (const file of files) scan(file.slice(REPO.length + 1), readFileSync(file, "utf8"));
  console.log(`scanned ${files.length} client-bundle files`);
  scannedSomething = files.length > 0;
}

// 2 — served HTML and the RSC payload embedded in it.
//
// NORMALISATION, AND WHY IT IS NOT A WEAKENING
// Next records the request URL in its own router payload, so whatever the
// caller typed into `?case=` comes back in the HTML — a withheld id and an
// invented id alike, in the same two places, byte for byte. That is the
// CALLER's input echoed by the framework, not content the server disclosed.
// Treating it as a leak would make it impossible to test the withheld case at
// all, so every value the request ITSELF supplied is replaced with a
// placeholder first, exactly as the per-request CSP nonce is. A withheld id
// appearing in a response that did NOT name it still fails.
const flightOf = (html) =>
  [...html.matchAll(/self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].map((m) => m[1]).join("\n");

/**
 * The rendered panel only.
 *
 * Used for the equivalence comparison below. The framework router payload sits
 * OUTSIDE this region and necessarily differs between two different URLs, so
 * comparing whole documents would report the URL itself as a difference.
 * Comparing what the panel RENDERED is the sharper question anyway: two
 * refusals must look identical to a reader, whatever they asked for.
 */
function panelOf(html) {
  const open = html.indexOf('<section aria-labelledby="phase101-reference-heading"');
  if (open < 0) return null;
  // The panel CONTAINS nested <section> blocks (one per result block), so
  // "up to the first </section>" truncates it after the first block — which
  // silently turns every "is the hypothesis block present?" question into
  // "no", and turns the refusal-equivalence comparison into a comparison of
  // two headers. Balance the tags instead.
  let depth = 0;
  const tag = /<section\b|<\/section>/g;
  tag.lastIndex = open;
  let m;
  while ((m = tag.exec(html)) !== null) {
    depth += m[0] === "</section>" ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index);
  }
  return null;
}

/** Strip the per-request nonce and every value this request supplied. */
function normalise(html, supplied = []) {
  let out = html;
  for (const nonce of new Set([...html.matchAll(/nonce="([^"]+)"/g)].map((m) => m[1]))) {
    out = out.split(nonce).join("<NONCE>");
  }
  for (const value of supplied) {
    if (!value) continue;
    // Both the raw and the percent-decoded spelling: the router payload may
    // carry either, depending on how the value survived the URL.
    const forms = new Set([value]);
    try {
      forms.add(decodeURIComponent(value));
    } catch {
      /* a malformed escape stays as-is */
    }
    for (const form of forms) if (form) out = out.split(form).join("<SUPPLIED>");
  }
  return out;
}

if (BASE_URL) {
  const get = async (path) => {
    const response = await fetch(`${BASE_URL}${path}`);
    if (!response.ok) {
      fail(`${path} returned HTTP ${response.status}`);
      return null;
    }
    return response.text();
  };

  const MALFORMED = "%00%00%00";
  const INVENTED = "ZZZZ99";
  const WITHHELD = withheld[0].id;
  const PUBLISHED_FIRST = [...published][0];

  const cases = [
    ["/en/industrial-brain", []],
    ["/de/industrial-brain", []],
    ["/fa/industrial-brain", []],
    ...[...published].map((id) => [`/en/industrial-brain?case=${id}`, [id]]),
    // The three refusal shapes: a withheld id, an invented id, a malformed value.
    [`/en/industrial-brain?case=${WITHHELD}`, [WITHHELD]],
    [`/en/industrial-brain?case=${INVENTED}`, [INVENTED]],
    [`/en/industrial-brain?case=${MALFORMED}`, [MALFORMED]],
    // A repeated parameter must be refused, not reduced to its first value.
    [
      `/en/industrial-brain?case=${PUBLISHED_FIRST}&case=${WITHHELD}`,
      [PUBLISHED_FIRST, WITHHELD],
    ],
  ];

  for (const [path, supplied] of cases) {
    const html = await get(path);
    if (html === null) continue;
    const clean = normalise(html, supplied);
    scan(`HTML ${path}`, clean);
    const flight = flightOf(clean);
    if (flight.length > 0) scan(`RSC payload ${path}`, flight);
    scannedSomething = true;
  }
  console.log(`scanned ${cases.length} served responses (HTML + RSC payload)`);

  // 3 — REFUSAL EQUIVALENCE.
  //
  // The sharpest form of the property: a withheld id, an invented id, a
  // malformed value and a repeated parameter must all RENDER the same panel.
  // If any of them differs, the page is an oracle for corpus membership no
  // matter what its words say.
  //
  // Every fixture here supplies a value that is NOT a published id, so nothing
  // it sends can legitimately appear inside the panel (the option list carries
  // the seven published ids and nothing else). The panels are therefore
  // compared with only the per-request CSP nonce normalised — no
  // supplied-value substitution, which in an earlier revision hid a real
  // difference behind its own placeholder. If a supplied value showed up in the
  // panel it would now surface twice: as a difference here, and as a needle hit
  // in the scan above.
  const refusals = [
    ["withheld id", `/en/industrial-brain?case=${WITHHELD}`],
    ["invented id", `/en/industrial-brain?case=${INVENTED}`],
    ["malformed value", `/en/industrial-brain?case=${MALFORMED}`],
    ["repeated parameter", `/en/industrial-brain?case=${INVENTED}&case=${WITHHELD}`],
    ["oversized value", `/en/industrial-brain?case=${"A".repeat(4096)}`],
  ];

  const rendered = [];
  for (const [label, path] of refusals) {
    const html = await get(path);
    if (html === null) continue;
    const panel = panelOf(html);
    if (panel === null) {
      fail(`${label}: the reference panel is not in the response at all`);
      continue;
    }
    rendered.push([label, normalise(panel)]);
  }

  if (rendered.length !== refusals.length) {
    fail("could not fetch every refusal shape — equivalence unproven");
  } else {
    const [firstLabel, first] = rendered[0];
    for (const [label, panel] of rendered.slice(1)) {
      if (panel !== first) fail(`${label} renders a DIFFERENT panel from ${firstLabel}`);
    }
    // …the shared refusal panel must not be a result panel…
    if (first.includes("phase101-hypotheses-heading")) {
      fail("the refusal panel still rendered a hypothesis block");
    }
    // …it must still be the reference panel, not an empty shell…
    if (!first.includes("phase101-reference-heading")) fail("the refusal panel lost its heading");
    // …and it must still carry the sample disclosure.
    if (!/SAMPLE/.test(first)) fail("the refusal panel dropped the sample disclosure");
    if (first.length < 500) fail("the refusal panel is implausibly small — extraction may be wrong");
    if (process.exitCode !== 1) {
      console.log(
        `refusal equivalence: ${refusals.map(([l]) => l).join(" === ")} (${first.length} bytes)`,
      );
    }
  }

  // 3b — THE PRIVACY ORACLE, BEYOND THE RENDERED BYTES.
  // Equal DOM is necessary but not sufficient: a differing status code, or a
  // redirect that lands one shape on a different URL from another, would leak
  // corpus membership without a single byte of the panel changing.
  const oracleProbes = [
    ["withheld id", `/en/industrial-brain?case=${WITHHELD}`],
    ["invented id", `/en/industrial-brain?case=${INVENTED}`],
    ["malformed value", `/en/industrial-brain?case=${MALFORMED}`],
  ];
  const observed = [];
  for (const [label, path] of oracleProbes) {
    const response = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
    observed.push({
      label,
      status: response.status,
      redirected: response.redirected,
      location: response.headers.get("location"),
      // The final URL must be the one that was ASKED FOR — normalised for the
      // caller's own value, which is the only part that legitimately differs.
      finalPath: new URL(response.url).pathname,
    });
  }
  const [reference, ...rest] = observed;
  for (const probe of rest) {
    if (probe.status !== reference.status) {
      fail(`${probe.label} status ${probe.status} != ${reference.label} status ${reference.status}`);
    }
    if (probe.redirected !== reference.redirected || probe.location !== reference.location) {
      fail(`${probe.label} redirects differently from ${reference.label}`);
    }
    if (probe.finalPath !== reference.finalPath) {
      fail(`${probe.label} final path ${probe.finalPath} != ${reference.finalPath}`);
    }
  }
  if (process.exitCode !== 1) {
    console.log(
      `privacy oracle: status=${reference.status} redirect=${reference.redirected} ` +
        `path=${reference.finalPath} identical across ${observed.length} refusal shapes`,
    );
  }

  // 4 — A REPEATED PARAMETER IS NOT REDUCED TO ITS FIRST VALUE.
  // `?case=<published>&case=<withheld>` must refuse, not quietly answer the
  // published half. Checked on its own because the published id it sends does
  // legitimately appear in the option list, so it cannot join the byte-equality
  // comparison above.
  const mixedHtml = await get(
    `/en/industrial-brain?case=${PUBLISHED_FIRST}&case=${WITHHELD}`,
  );
  if (mixedHtml !== null) {
    const panel = panelOf(mixedHtml);
    if (panel === null) fail("mixed repeated parameter: no panel in the response");
    else if (panel.includes("phase101-hypotheses-heading")) {
      fail("a repeated parameter was reduced to its first value and answered it");
    } else {
      console.log("repeated parameter refused rather than reduced to its first value");
    }
  }
} else {
  console.log("no --url given: skipped the served-HTML and RSC scan");
}

if (!scannedSomething) fail("nothing was scanned");
if (process.exitCode !== 1) console.log("PASS  no private corpus content in any browser artefact");
