// PHASE 101-R — surface invariants for the Industrial Brain reference panel.
//
// The bridge contract proves the ENGINE behaves. This file proves the SURFACE
// is wired to it and stays wired: that the route really imports the panel, that
// the panel really calls the bridge, that no engineering prose has been copied
// out of the corpus into a component or a translation catalogue, that every
// Latin-script industrial identifier is emitted with an explicit direction, and
// that the panel reads no identity and opens no connection.
//
// These are deliberately SOURCE invariants. The panel is an async server
// component over a corpus of 1,774 nodes; there is no DOM harness in this
// repository that can render it, so the alternative to reading the source is
// not a better test — it is no test. Each check therefore parses structure
// rather than asserting on a substring that happens to be present.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import en from "../../../../../messages/en.json";
import de from "../../../../../messages/de.json";
import fa from "../../../../../messages/fa.json";

import { CORPUS } from "../../corpus";
import { localized } from "../../types";
import { PUBLIC_SCENARIO_IDS, privateScenarioIds, resolvePublicScenario } from "../exposure";

const ROOT = process.cwd();
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

const PAGE = "src/app/[locale]/industrial-brain/page.tsx";
const PANEL = "src/components/industrial-brain/ReferenceDiagnosticPanel.tsx";
const BRIDGE = "src/lib/industrial-knowledge/runtime/bridge.ts";
const EXPOSURE = "src/lib/industrial-knowledge/runtime/exposure.ts";

const pageSource = read(PAGE);
const panelSource = read(PANEL);
const bridgeSource = read(BRIDGE);
const exposureSource = read(EXPOSURE);

/** Source with comments removed, so a check cannot pass on prose alone. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const panelCode = stripComments(panelSource);
const bridgeCode = stripComments(bridgeSource);

/* ── 1. Route ownership and runtime import proof ──────────────────────────── */

describe("route ownership", () => {
  it("the public route imports AND renders the reference panel", () => {
    expect(pageSource).toMatch(
      /import\s*\{[^}]*ReferenceDiagnosticPanel[^}]*\}\s*from\s*"@\/components\/industrial-brain\/ReferenceDiagnosticPanel"/,
    );
    expect(pageSource).toMatch(/<ReferenceDiagnosticPanel\b/);
  });

  it("the panel calls the canonical bridge, not a private copy of the engine", () => {
    expect(panelCode).toMatch(
      /import\s*\{[\s\S]*?runPublicReferenceDiagnosis[\s\S]*?\}\s*from\s*"@\/lib\/industrial-knowledge\/runtime\/bridge"/,
    );
    expect(panelCode).toMatch(/runPublicReferenceDiagnosis\(\s*\{/);
    // The panel must never reach past the bridge into the raw corpus — not even
    // for a type. Reaching for `../diagnostics` today is how reaching for
    // `../corpus` tomorrow becomes unremarkable, and that import would bypass
    // both the exposure allowlist and the ground-truth guard. The bridge
    // re-exports the whole result vocabulary so there is nothing to reach for.
    const deepImports = [...panelCode.matchAll(/from\s*"([^"]*industrial-knowledge[^"]*)"/g)].map(
      (match) => match[1],
    );
    expect(deepImports).toEqual(["@/lib/industrial-knowledge/runtime/bridge"]);
  });

  it("the bridge consumes the sealed corpus and the Phase 101 engine directly", () => {
    expect(bridgeCode).toMatch(/from\s*"\.\.\/corpus"/);
    expect(bridgeCode).toMatch(/from\s*"\.\.\/diagnostics"/);
    expect(bridgeCode).toMatch(/\bdiagnose\(\s*corpusIndex\(\)/);
  });

  it("the Phase 101 corpus now has a runtime consumer outside its own tests", () => {
    // The defect this whole increment exists to fix: before the bridge, the
    // only importer of `industrial-knowledge` was `industrial-knowledge`.
    const chain = [
      { file: PANEL, source: panelSource, needle: "industrial-knowledge/runtime/bridge" },
      { file: PAGE, source: pageSource, needle: "components/industrial-brain/ReferenceDiagnosticPanel" },
    ];
    for (const link of chain) {
      expect(link.source.includes(link.needle), `${link.file} lost its link`).toBe(true);
    }
  });
});

/* ── 2. No copied corpus content ──────────────────────────────────────────── */

describe("no copied corpus content", () => {
  const catalogues = {
    "messages/en.json": JSON.stringify(en),
    "messages/de.json": JSON.stringify(de),
    "messages/fa.json": JSON.stringify(fa),
  };

  /** Corpus prose that would be a defect to find anywhere but the corpus. */
  const corpusProse: Array<[label: string, text: string]> = [];
  for (const caseId of PUBLIC_SCENARIO_IDS) {
    const resolved = resolvePublicScenario(caseId)!;
    for (const locale of ["en", "fa"] as const) {
      corpusProse.push([`${caseId}.title.${locale}`, localized(resolved.scenario.title, locale)]);
      corpusProse.push([
        `${caseId}.narrative.${locale}`,
        localized(resolved.scenario.narrative, locale),
      ]);
      corpusProse.push([`${caseId}.system.${locale}`, localized(resolved.system.name, locale)]);
    }
  }

  it("has prose worth protecting", () => {
    expect(corpusProse.length).toBeGreaterThan(20);
    for (const [, text] of corpusProse) expect(text.length).toBeGreaterThan(3);
  });

  it("no case title, narrative or system name is duplicated into a catalogue", () => {
    for (const [label, text] of corpusProse) {
      for (const [file, serialised] of Object.entries(catalogues)) {
        expect(serialised.includes(text), `${file} contains corpus text ${label}`).toBe(false);
      }
    }
  });

  it("no corpus prose is duplicated into the panel or the route", () => {
    for (const [label, text] of corpusProse) {
      expect(panelSource.includes(text), `${PANEL} contains corpus text ${label}`).toBe(false);
      expect(pageSource.includes(text), `${PAGE} contains corpus text ${label}`).toBe(false);
    }
  });

  it("no corpus NODE label is duplicated into the panel or a catalogue", () => {
    // Sampled across systems rather than exhaustively: 1,774 labels x 4 files is
    // not worth the wall clock, and a copy-paste defect copies whole blocks.
    //
    // The 20-character floor is not arbitrary. Short corpus labels are generic
    // engineering nouns — "Safety controller" is one — and a product catalogue
    // may legitimately contain that phrase for an unrelated screen. Matching on
    // them would report a collision as a copy. A genuine copy of corpus prose
    // brings whole descriptive labels with it, which comfortably clear the bar.
    const labels = CORPUS.flatMap((system) =>
      system.nodes.slice(0, 8).flatMap((node) => [
        localized(node.label, "en"),
        localized(node.label, "fa"),
      ]),
    ).filter((label) => label.length > 20);
    expect(labels.length).toBeGreaterThan(30);
    for (const label of labels) {
      expect(panelSource.includes(label), `${PANEL} contains node label "${label}"`).toBe(false);
      for (const [file, serialised] of Object.entries(catalogues)) {
        expect(serialised.includes(label), `${file} contains node label "${label}"`).toBe(false);
      }
    }
  });
});

/* ── 3. No hard-coded visible copy ────────────────────────────────────────── */

describe("localisation discipline", () => {
  it("the panel renders no hard-coded English text node", () => {
    // Every visible run of words must come from `t(...)` or from the corpus.
    // A JSX text node beginning with a letter is neither.
    const withoutAttributes = panelCode.replace(/\b(?:className|style|id|name|dir|key|scope|type|role|htmlFor|aria-[a-z]+)=(?:"[^"]*"|\{[^}]*\})/g, "");
    const textNodes = [...withoutAttributes.matchAll(/>\s*([A-Za-z][A-Za-z0-9'’,.:;!?-]*(?:\s+[A-Za-z][A-Za-z0-9'’,.:;!?-]*)+)\s*</g)]
      .map((match) => match[1].trim());
    expect(textNodes, "hard-coded copy in the panel").toEqual([]);
  });

  it("every visible label is resolved through the translation namespace", () => {
    expect(panelCode).toMatch(/getTranslations\("industrialBrain\.reference"\)/);
    const keys = [...panelCode.matchAll(/\bt\("([a-zA-Z0-9_.]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(30);
    const catalogue = (en as Record<string, unknown>).industrialBrain as Record<string, unknown>;
    const reference = catalogue.reference as Record<string, unknown>;
    for (const key of keys) {
      const value = key.split(".").reduce<unknown>(
        (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
        reference,
      );
      expect(typeof value, `industrialBrain.reference.${key} is missing`).toBe("string");
    }
  });
});

/* ── 4. Bidirectional text ────────────────────────────────────────────────── */

describe("industrial identifiers carry an explicit direction", () => {
  it("the identifier element declares dir=ltr", () => {
    expect(panelCode).toMatch(/function Identifier\([\s\S]{0,400}?dir="ltr"/);
  });

  it("long identifiers break instead of being clipped", () => {
    // Measured at 320 px: a corpus node id is one unbreakable token, overruns
    // its column, and the surrounding card clips it. A truncated identifier is
    // worse than a wrapped one — it silently reads as a different object.
    expect(panelCode).toMatch(/function Identifier\([\s\S]{0,500}?break-all/);
  });

  it("no industrial identifier is rendered outside that element", () => {
    // Inside a Persian (RTL) paragraph a bare `DB1210.DBX4.0` reorders visually
    // and stops being the string an engineer can match against their project.
    //
    // Only CHILDREN positions are examined — an expression that follows a `>`.
    // A `key={fact.nodeId}` prop renders nothing and needs no direction, so
    // flagging it would be noise that trains a reader to ignore this gate.
    const identifier =
      "(?:[\\w$]+\\.)*(?:nodeId|sourceId|checksum|faultModeId|corpusChecksum|engineVersion|platform|caseId|domain|edgeIds)\\b";
    const spans = [...panelCode.matchAll(/<Identifier\b[\s\S]*?<\/Identifier>/g)].map((match) => ({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    }));
    expect(spans.length, "the panel renders no identifiers at all").toBeGreaterThan(4);

    const offenders: string[] = [];
    for (const match of panelCode.matchAll(new RegExp(`>\\s*\\{\\s*${identifier}`, "g"))) {
      const at = match.index ?? 0;
      const guarded = spans.some((span) => at >= span.start && at < span.end);
      if (!guarded) offenders.push(match[0].replace(/\s+/g, " "));
    }
    expect(offenders, "identifier rendered without dir=ltr").toEqual([]);
  });
});

/* ── 5. Accessibility semantics ───────────────────────────────────────────── */

describe("accessibility semantics", () => {
  it("the panel is a labelled region and owns no h1", () => {
    expect(panelCode).toMatch(/<section\s+aria-labelledby="phase101-reference-heading"/);
    expect(panelCode).toMatch(/<h2\s+id="phase101-reference-heading"/);
    expect(panelCode).not.toMatch(/<h1\b/);
  });

  it("the case selector is programmatically labelled", () => {
    expect(panelCode).toMatch(/<label\s+htmlFor="phase101-case"/);
    expect(panelCode).toMatch(/id="phase101-case"/);
  });

  it("interactive controls meet the 44px target minimum", () => {
    const controls = [...panelCode.matchAll(/<(select|button)\b[\s\S]*?>/g)].map((m) => m[0]);
    expect(controls.length).toBeGreaterThanOrEqual(2);
    for (const control of controls) {
      expect(control, `control without a 44px target: ${control.slice(0, 60)}`)
        .toMatch(/min-h-\[44px\]/);
    }
  });

  it("table headers declare their scope", () => {
    const headers = [...panelCode.matchAll(/<th\b[\s\S]*?>/g)].map((m) => m[0]);
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) expect(header).toMatch(/scope="col"/);
  });

  it("the failure state is announced, not only coloured", () => {
    expect(panelCode).toMatch(/role="status"/);
    expect(panelCode).toMatch(/t\("error\.heading"\)/);
    expect(panelCode).toMatch(/t\("error\.body"\)/);
  });

  it("renders ONE fail-closed state, with no branch on the reason", () => {
    // An unknown id, an unpublished id, an oversized string and a repeated
    // parameter must be indistinguishable in the response. A second message —
    // or a ternary choosing between two — would be an enumeration oracle.
    const failure = panelCode.slice(
      panelCode.indexOf('outcome.status !== "OK"'),
      panelCode.indexOf("<div className=\"px-5 py-5 space-y-4\">"),
    );
    expect(failure.length).toBeGreaterThan(80);
    expect(failure).not.toMatch(/INVALID|NOT_AVAILABLE|reason/);
    expect((failure.match(/t\("error\./g) ?? []).length).toBe(2);
  });

  it("renders the observed state as a WORD, never as colour alone", () => {
    // Every state cell resolves through the translated vocabulary. Dropping the
    // label and keeping the styling would leave the meaning available only to a
    // sighted reader who knows the palette.
    expect(panelCode).toMatch(/stateLabels\[fact\.state\]/);
    expect(panelCode).toMatch(/stateLabels\[citation\.state\]/);
    for (const state of ["TRUE", "FALSE", "NORMAL", "ABNORMAL", "STALE", "ABSENT"]) {
      expect(panelCode, `state.${state} has no label`).toContain(`t("state.${state}")`);
    }
  });

  it("puts the human validation gate ahead of the safe actions", () => {
    const gate = panelCode.indexOf('t("validation.heading")');
    const body = panelCode.indexOf('t("validation.body")');
    const actions = panelCode.indexOf('t("actions.heading")');
    expect(gate, "the human validation gate was removed").toBeGreaterThan(-1);
    expect(body, "the human validation statement was removed").toBeGreaterThan(-1);
    expect(actions).toBeGreaterThan(gate);
    expect(actions).toBeGreaterThan(body);
  });

  it("the decorative escalation glyph is hidden from assistive technology", () => {
    expect(panelCode).toMatch(/aria-hidden="true"[\s\S]{0,80}▸/);
  });
});

/* ── 6. Security posture of the new surface ───────────────────────────────── */

describe("security posture", () => {
  const newSources = {
    [PANEL]: panelSource,
    [BRIDGE]: bridgeSource,
    [EXPOSURE]: exposureSource,
  };

  it("reads no identity, no tenant and no database", () => {
    for (const [file, source] of Object.entries(newSources)) {
      for (const forbidden of [
        "@/lib/auth",
        "getPrisma",
        "PrismaClient",
        "organizationId",
        "siteId",
        "next/headers",
        "cookies(",
      ]) {
        expect(source.includes(forbidden), `${file} reaches for ${forbidden}`).toBe(false);
      }
    }
  });

  it("opens no connection and executes no dynamic code", () => {
    for (const [file, source] of Object.entries(newSources)) {
      for (const forbidden of [
        "dangerouslySetInnerHTML",
        "new Function",
        "eval(",
        "fetch(",
        "XMLHttpRequest",
        "WebSocket",
        "child_process",
        "opcua",
        "modbus",
        "mqtt",
      ]) {
        expect(source.includes(forbidden), `${file} contains ${forbidden}`).toBe(false);
      }
    }
  });

  it("leaves the route existing authorization untouched", () => {
    // The panel is public by design, but the surrounding page still decides the
    // case-save affordance from the real identity facade. A regression here
    // would mean this increment quietly widened the route.
    expect(pageSource).toMatch(/getCurrentUserUnified\(\)/);
    expect(pageSource).toMatch(/can\(user\?\.role,\s*"authoring"\)/);
  });

  it("keeps the sample disclosure ahead of any result", () => {
    const disclosure = panelCode.indexOf("disclosure.title");
    const firstResult = panelCode.indexOf("outcome.diagnosis");
    expect(disclosure).toBeGreaterThan(-1);
    expect(firstResult).toBeGreaterThan(disclosure);
  });
});

/* ── 7. Trilingual parity of the new namespace ────────────────────────────── */

describe("en/de/fa parity for industrialBrain.reference", () => {
  const leaves = (value: unknown, path = ""): Array<[string, string]> =>
    value !== null && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
          leaves(v, path ? `${path}.${k}` : k),
        )
      : [[path, String(value)]];

  const pick = (catalogue: unknown) =>
    ((catalogue as Record<string, Record<string, unknown>>).industrialBrain
      .reference as unknown);

  const enLeaves = leaves(pick(en));
  const deLeaves = new Map(leaves(pick(de)));
  const faLeaves = new Map(leaves(pick(fa)));

  it("the three catalogues agree on the key set", () => {
    expect(enLeaves.length).toBeGreaterThan(50);
    expect(deLeaves.size).toBe(enLeaves.length);
    expect(faLeaves.size).toBe(enLeaves.length);
    for (const [key] of enLeaves) {
      expect(deLeaves.has(key), `de is missing ${key}`).toBe(true);
      expect(faLeaves.has(key), `fa is missing ${key}`).toBe(true);
    }
  });

  it("carries no English carryover in German or Persian", () => {
    for (const [key, value] of enLeaves) {
      expect(deLeaves.get(key), `de.${key} is an English carryover`).not.toBe(value);
      expect(faLeaves.get(key), `fa.${key} is an English carryover`).not.toBe(value);
    }
  });

  it("uses Persian yeh and kaf, never their Arabic forms", () => {
    for (const [key] of enLeaves) {
      expect(faLeaves.get(key), `fa.${key} uses an Arabic letter`).not.toMatch(/[يك]/);
    }
  });

  it("keeps ICU arguments identical across locales", () => {
    const args = (value: string) =>
      [...value.matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]).sort().join("|");
    for (const [key, value] of enLeaves) {
      expect(args(deLeaves.get(key)!), `de.${key}`).toBe(args(value));
      expect(args(faLeaves.get(key)!), `fa.${key}`).toBe(args(value));
    }
  });
});

/* ── 8. Truthful product labelling ───────────────────────────────────────── */

describe("the panel describes itself truthfully", () => {
  const catalogues = { en, de, fa } as Record<string, unknown>;

  const referenceLeaves = (locale: string): Array<[string, string]> => {
    const leaves = (value: unknown, path = ""): Array<[string, string]> =>
      value !== null && typeof value === "object"
        ? Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
            leaves(v, path ? `${path}.${k}` : k),
          )
        : [[path, String(value)]];
    const ns = (catalogues[locale] as Record<string, Record<string, unknown>>).industrialBrain;
    return leaves(ns.reference);
  };

  it("is introduced as a REFERENCE diagnostic in every locale", () => {
    for (const locale of ["en", "de", "fa"]) {
      const heading = new Map(referenceLeaves(locale)).get("heading")!;
      expect(heading, `${locale} heading`).toMatch(/reference|referenz|مرجع/i);
    }
    expect(panelCode).toMatch(/t\("heading"\)/);
  });

  it("claims no live, real-time or plant analysis anywhere in its copy", () => {
    // The legacy free-text analyser was NOT replaced and this panel reads no
    // live data. Copy that implied otherwise would be the most damaging kind of
    // defect here: an engineer could believe a sample was their plant.
    // Only AFFIRMATIVE constructions. An earlier revision banned the word
    // "live" outright and thereby banned the honest denial "reads no live
    // data" as well — a gate that cannot tell a claim from its denial pushes
    // copy toward vagueness instead of toward accuracy.
    const forbidden = [
      /\b(?:analyses|analyzes|reads|shows|streams) live\b/i,
      /\blive (?:analysis|diagnosis|diagnostics)\b/i,
      /\breal[- ]time\b/i,
      /\bin Echtzeit\b/i,
      /\bEchtzeitanalyse\b/i,
      /\bplant analysis\b/i,
      /\bproduction telemetry\b/i,
      /\breplaces? the analy[sz]er\b/i,
      /\bauthenticated\b/i,
      /\bتحلیل زنده\b/,
    ];
    for (const locale of ["en", "de", "fa"]) {
      for (const [key, value] of referenceLeaves(locale)) {
        for (const pattern of forbidden) {
          expect(pattern.test(value), `${locale}.${key}: ${value}`).toBe(false);
        }
      }
    }
  });

  it("discloses the sample nature before any result, in every locale", () => {
    for (const locale of ["en", "de", "fa"]) {
      const leaves = new Map(referenceLeaves(locale));
      expect(leaves.get("disclosure.badge"), locale).toBeTruthy();
      expect(leaves.get("disclosure.title"), locale).toMatch(
        /sample|Beispiel|نمونه/i,
      );
      expect(leaves.get("disclosure.body"), locale).toMatch(
        /no connection|keine Verbindung|هیچ اتصالی/i,
      );
    }
    const disclosure = panelCode.indexOf('t("disclosure.title")');
    const firstResult = panelCode.indexOf("outcome.diagnosis");
    expect(disclosure).toBeGreaterThan(-1);
    expect(firstResult).toBeGreaterThan(disclosure);
  });

  it("separates itself from the legacy analyser ON THE PAGE", () => {
    // Two capabilities share this route. Leaving a reader to infer that from
    // two similar-looking cards is how a demonstration becomes a misleading one.
    expect(panelCode).toMatch(/t\("relationship\.heading"\)/);
    expect(panelCode).toMatch(/t\("relationship\.body"\)/);
    for (const locale of ["en", "de", "fa"]) {
      const body = new Map(referenceLeaves(locale)).get("relationship.body")!;
      expect(body.length, `${locale} relationship.body`).toBeGreaterThan(60);
    }
    // The legacy analyser is still the workspace\'s own engine and is untouched.
    expect(pageSource).toMatch(/<IndustrialBrainWorkspace\b/);
    expect(panelSource).not.toMatch(/analyzeIndustrialFault|industrial-brain\/analyzer/);
  });
});

/* ── 9. Runtime ownership document ───────────────────────────────────────── */

describe("the runtime ownership document", () => {
  const doc = read("docs/industrial/phase101r-runtime-ownership.md");

  it("publishes the ownership table with every surface on this route", () => {
    for (const surface of [
      "/[locale]/industrial-brain",
      "/api/industrial-brain/analyze",
      "/api/industrial-brain/save-case",
      "runtime/bridge.ts",
      "/api/brain",
    ]) {
      expect(doc, `missing row: ${surface}`).toContain(surface);
    }
  });

  it("records the standing flags, including the ones that say NO", () => {
    for (const flag of [
      "PHASE101_REFERENCE_RUNTIME=IMPLEMENTED",
      "LEGACY_ANALYZER_REPLACED=NO",
      "AUTHENTICATED_ADAPTER_CONSUMER=NONE",
      "PLANT_CONNECTION=NONE",
      "PLANT_WRITE=NONE",
    ]) {
      expect(doc, `missing flag: ${flag}`).toContain(flag);
    }
  });

  it("states the published/withheld split without naming a withheld case", () => {
    expect(doc).toMatch(/7\b/);
    expect(doc).toMatch(/85\b/);
    // The document must not become the leak it describes.
    for (const id of privateScenarioIds()) {
      expect(doc.includes(id), `ownership doc names private case ${id}`).toBe(false);
    }
  });
});

/* ── 10. The withheld corpus is unreachable from product source ──────────── */

describe("no product module can reach a withheld scenario", () => {
  // Closes two mutations that survived the first battery:
  //   * the bridge resolving the full corpus before consulting the allowlist,
  //   * a withheld id written directly into rendered panel copy.

  it("the bridge imports ONLY the published-set accessors from exposure", () => {
    // `resolvePublicScenario` reads the published index and nothing else, so a
    // request cannot resolve a withheld scenario. That guarantee lives or dies
    // on which names the bridge is allowed to hold: importing a full-corpus
    // accessor is how "never looked up" quietly becomes "looked up, then
    // rejected", and the difference is invisible in behaviour until the parser
    // in front of it changes.
    const imported = bridgeCode.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/exposure"/);
    expect(imported, "the bridge no longer imports from ./exposure").not.toBeNull();
    const names = imported![1]
      .split(",")
      .map((n) => n.replace(/\btype\b/, "").trim())
      .filter(Boolean);
    expect(names.sort()).toEqual(["PUBLIC_SCENARIO_IDS", "resolvePublicScenario"]);
  });

  it("no product module names a full-corpus accessor", () => {
    const forbidden = ["privateScenarioForTest", "allScenarioIds", "resolveScenario", "FULL_INDEX"];
    for (const [file, source] of Object.entries({
      [BRIDGE]: bridgeCode,
      [PANEL]: panelCode,
      [PAGE]: stripComments(pageSource),
      "runtime/case-query.ts": stripComments(read("src/lib/industrial-knowledge/runtime/case-query.ts")),
    })) {
      for (const name of forbidden) {
        expect(source.includes(name), `${file} reaches for ${name}`).toBe(false);
      }
    }
  });

  it("no withheld scenario id appears in any shipped source or catalogue", () => {
    // Derived, never transcribed. A withheld id written into panel copy — even
    // into a comment — would be published the moment the file is bundled.
    const withheld = privateScenarioIds();
    expect(withheld.length).toBeGreaterThan(50);
    const surfaces: Record<string, string> = {
      [PANEL]: panelSource,
      [PAGE]: pageSource,
      [BRIDGE]: bridgeSource,
      [EXPOSURE]: exposureSource,
      "messages/en.json": JSON.stringify(en),
      "messages/de.json": JSON.stringify(de),
      "messages/fa.json": JSON.stringify(fa),
      "docs/industrial/phase101r-runtime-ownership.md": read(
        "docs/industrial/phase101r-runtime-ownership.md",
      ),
      // The review round added a shared walker and four boundary fixtures.
      // They are source files like any other: a withheld id transcribed into
      // one of them would ship the moment something bundled it, and a fixture
      // is exactly the kind of file nobody re-reads.
      "scripts/ci/lib/phase101r-client-graph.mjs": read(
        "scripts/ci/lib/phase101r-client-graph.mjs",
      ),
      "scripts/ci/phase101r-client-leakage-scan.mjs": read(
        "scripts/ci/phase101r-client-leakage-scan.mjs",
      ),
      "runtime/server-boundary.ts": read(
        "src/lib/industrial-knowledge/runtime/server-boundary.ts",
      ),
      "runtime/case-query.ts": read("src/lib/industrial-knowledge/runtime/case-query.ts"),
      ...Object.fromEntries(
        [
          "README.md",
          "barrel.ts",
          "client-static-import.tsx",
          "client-via-barrel.tsx",
          "client-dynamic-import.tsx",
          "client-type-only-import.tsx",
        ].map((name) => [
          `fixtures/${name}`,
          read(`src/lib/industrial-knowledge/runtime/__tests__/fixtures/${name}`),
        ]),
      ),
    };
    for (const [file, source] of Object.entries(surfaces)) {
      for (const id of withheld) {
        expect(source.includes(id), `${file} names withheld scenario ${id}`).toBe(false);
      }
    }
  });

  it("every PUBLISHED id does appear in the allowlist, so the check is not vacuous", () => {
    for (const id of PUBLIC_SCENARIO_IDS) {
      expect(exposureSource.includes(id), `${EXPOSURE} lost ${id}`).toBe(true);
    }
  });
});
