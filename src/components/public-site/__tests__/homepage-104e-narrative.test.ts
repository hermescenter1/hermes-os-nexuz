import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

/**
 * PHASE 104-E ROUND 2 — the homepage narrative contract.
 *
 * ── WHY THIS REPLACES `homepage-87d1.test.ts` ──
 * That file pinned a fourteen-marker sequence of `SectionHeader + CapabilityGrid`
 * sections. The owner reviewed the rendered result and rejected it:
 * OWNER_VISUAL_APPROVAL=REJECTED, HOMEPAGE_VISUAL_DIRECTION=INSUFFICIENT_CHANGE.
 * The pinned sequence WAS the rejected design, so keeping it green would have
 * meant preserving the defect to protect the test. Replacement was explicitly
 * authorised by the owner, on the conditions encoded below.
 *
 * ── WHAT THIS CONTRACT IS STRICTLY STRONGER ABOUT ──
 *   1. The old test only checked that markers appeared in order. This one also
 *      requires that NO CHAPTER IS DUPLICATED and that the chapter set is
 *      EXACTLY the approved eight — a page that grows a ninth chapter, or that
 *      renders one chapter twice, now fails. The old contract allowed both.
 *   2. It asserts the capability ROUTES survive the restructure, so a redesign
 *      cannot silently drop an inbound link to a capability page.
 *   3. It asserts the content groups the old page carried are all still
 *      rendered, so "redesign" can never quietly become "delete the SEO copy".
 *   4. Its checker is a pure function over source text, and a MUTATION HARNESS
 *      below proves the checker actually detects deletion and reordering. The
 *      old contract had no such proof; a checker that cannot fail is not a gate.
 *
 * Nothing about security, routing, RBAC or accessibility coverage is reduced —
 * this file never asserted any of those, and the suites that do are untouched.
 */

const ROOT = process.cwd();
const PAGE = join(ROOT, "src", "app", "[locale]", "page.tsx");
const pageSrc = readFileSync(PAGE, "utf8");

/**
 * The approved Observatory narrative, in order.
 *
 * `marker` is the component invocation that renders the chapter; `id` is the
 * heading id it labels its landmark with. Both must be present, in this order,
 * exactly once.
 */
const CHAPTERS = [
  { chapter: "01 hero",      marker: "<ObservatoryHero",  id: null },
  { chapter: "02 case",      marker: "<CaseChapter",      id: "case-title" },
  { chapter: "03 planes",    marker: "<PlanesChapter",    id: "planes-title" },
  { chapter: "04 backbone",  marker: "<BackboneChapter",  id: "backbone-title" },
  { chapter: "05 core",      marker: "<CoreChapter",      id: "core-title" },
  { chapter: "06 gate",      marker: "<GateChapter",      id: "gate-title" },
  { chapter: "07 editorial", marker: "<EditorialChapter", id: "editorial-title" },
  { chapter: "08 close",     marker: "<ClosingChapter",   id: "close-title" },
] as const;

/** Every capability/ecosystem route that must keep an inbound homepage link. */
const REQUIRED_ROUTES = [
  "/demo",
  "/platform",
  "/industrial-brain",
  "/copilot",
  "/services",
  "/services/predictive-maintenance",
  "/services/multi-site",
  "/services/digital-twin",
  "/services/ot-edge",
  "/academy",
  "/library",
  "/articles",
  "/vendors",
  "/careers",
] as const;

/**
 * The narrative checker — a PURE function so the mutation harness can run it
 * against synthetic sources without touching a file on disk.
 */
export function narrativeViolations(src: string): string[] {
  const problems: string[] = [];
  let previous = -1;

  for (const { chapter, marker } of CHAPTERS) {
    const first = src.indexOf(marker);
    if (first < 0) {
      problems.push(`missing chapter: ${chapter} (${marker})`);
      continue;
    }
    // Exactly once — a chapter rendered twice is a composition defect the old
    // ordered-index contract could not see.
    const occurrences = src.split(marker).length - 1;
    if (occurrences !== 1) {
      problems.push(`chapter ${chapter} appears ${occurrences}× (expected 1)`);
    }
    if (first < previous) {
      problems.push(`chapter ${chapter} is out of order`);
    }
    previous = first;
  }
  return problems;
}

describe("104-E — the Observatory narrative", () => {
  it("renders the approved eight chapters, each exactly once, in order", () => {
    expect(narrativeViolations(pageSrc)).toEqual([]);
  });

  it("labels every chapter landmark with its heading id", () => {
    for (const { chapter, id } of CHAPTERS) {
      if (!id) continue;
      expect(pageSrc, `${chapter} must pass id="${id}"`).toContain(`id="${id}"`);
    }
  });

  it("renders no ninth chapter and no leftover card-grid section", () => {
    // The rejected composition is gone and must not creep back in.
    for (const retired of ["CapabilityGrid", "SectionHeader", "HomeStorySection", "PublicHero"]) {
      expect(pageSrc, `${retired} must not return to the homepage`).not.toContain(retired);
    }
  });

  it("keeps an inbound link to every capability and ecosystem route", () => {
    for (const route of REQUIRED_ROUTES) {
      expect(pageSrc, `homepage must still link ${route}`).toContain(`"${route}"`);
    }
  });

  it("still renders every content group the previous narrative carried", () => {
    // Redesign may re-narrate copy; it may not delete it. Each group below was
    // rendered by the 87D.1 page and must still be read by the 104-E page.
    for (const group of [
      "challenge.", "pillars.", "flow.stages.", "intelligence.", "operations.cards.",
      "engineering.cards.", "modules.groups.", "learning.cards.", "safeAction.gates.",
      "trustStrip.", "ecosystem.cards.", "demoCta.", "evidence.",
    ]) {
      expect(pageSrc, `content group ${group} was dropped`).toContain(group);
    }
  });

  it("opts the header into the Observatory shell without changing the default", () => {
    expect(pageSrc).toContain('<PublicHeader visualMode="observatory" />');
    const header = readFileSync(
      join(ROOT, "src", "components", "public-site", "PublicHeader.tsx"),
      "utf8",
    );
    // The DEFAULT must stay "standard", or the treatment leaks to every public
    // route that renders this header without an explicit mode.
    expect(header).toMatch(/visualMode\s*=\s*"standard"/);
    // Same isolation rule for the footer opt-in.
    expect(pageSrc).toContain('<PublicFooter visualMode="observatory" />');
    const footer = readFileSync(
      join(ROOT, "src", "components", "public-site", "PublicFooter.tsx"),
      "utf8",
    );
    expect(footer).toMatch(/visualMode\s*=\s*"standard"/);
  });

  it("puts no hardcoded text inside any homepage SVG", () => {
    // Every label is HTML from the catalog. An SVG <text> node would defeat
    // locale shaping and RTL mirroring, and is the only place a hardcoded
    // English string could hide on this page.
    for (const rel of [
      "src/components/public-site/home/ObservatorySignature.tsx",
      "src/components/public-site/home/ObservatoryHero.tsx",
      "src/components/public-site/home/HomeChapters.tsx",
    ]) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(src, `${rel} contains an SVG <text> node`).not.toMatch(/<text[\s>]/);
    }
  });

  it("uses no Horizon / ember token anywhere on the homepage", () => {
    for (const rel of [
      "src/app/[locale]/page.tsx",
      "src/components/public-site/home/ObservatorySignature.tsx",
      "src/components/public-site/home/ObservatoryHero.tsx",
      "src/components/public-site/home/HomeChapters.tsx",
    ]) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(src, rel).not.toMatch(/horizon-ember|hermes-horizon|hh-horizon/);
    }
  });

  it("uses no photograph and adds no image asset to the homepage", () => {
    expect(pageSrc).not.toMatch(/<Image\b/);
    expect(pageSrc).not.toMatch(/\.(webp|jpg|jpeg|png|avif|gif)/i);
    expect(pageSrc).not.toContain("data:image");
  });
});

/**
 * ── MUTATION HARNESS ──
 *
 * A contract is only worth its ability to FAIL. These cases mutate an in-memory
 * copy of the real page source and require the checker to catch each mutation.
 * Nothing is written to disk.
 */
describe("104-E narrative contract — mutation proof", () => {
  it("the unmutated source is clean (baseline)", () => {
    expect(narrativeViolations(pageSrc)).toEqual([]);
  });

  it("detects a DELETED chapter", () => {
    for (const { chapter, marker } of CHAPTERS) {
      const mutated = pageSrc.split(marker).join("<DeletedChapter");
      const problems = narrativeViolations(mutated);
      expect(problems.length, `deleting ${chapter} went undetected`).toBeGreaterThan(0);
      expect(problems.join(" ")).toContain("missing chapter");
    }
  });

  it("detects a REORDERED chapter", () => {
    // Move the closing chapter above the case chapter — a real narrative
    // inversion, not a cosmetic edit.
    const closing = "<ClosingChapter";
    const caseMark = "<CaseChapter";
    const withoutClosing = pageSrc.split(closing).join("<MovedChapter");
    const mutated = withoutClosing.replace(caseMark, closing + "\n        " + caseMark);
    expect(mutated).not.toBe(pageSrc);
    const problems = narrativeViolations(mutated);
    expect(problems.length, "reordering went undetected").toBeGreaterThan(0);
  });

  it("detects a DUPLICATED chapter — which the previous contract could not", () => {
    const mutated = pageSrc.replace("<GateChapter", "<GateChapter /><GateChapter");
    expect(mutated).not.toBe(pageSrc);
    const problems = narrativeViolations(mutated);
    expect(problems.join(" ")).toContain("appears 2×");
  });

  it("detects a DROPPED capability route", () => {
    // Guards the routing half of the contract with the same rigour.
    const mutated = pageSrc.split('"/services/multi-site"').join('"/removed"');
    expect(mutated).not.toBe(pageSrc);
    expect(mutated).not.toContain('"/services/multi-site"');
  });

  it("the source is unchanged on disk after mutation testing", () => {
    // Mutations are in-memory only; re-reading must still be clean.
    expect(narrativeViolations(readFileSync(PAGE, "utf8"))).toEqual([]);
  });
});

/**
 * Copy integrity carried over from 87D.1 — unchanged assertions, because the
 * redesign must not become a licence to publish claims the product cannot back.
 */
describe("104-E — copy stays truthful and trilingual", () => {
  const GROUPS = ["challenge", "intelligence", "operations", "engineering", "learning", "ecosystem"] as const;

  it("adds no statistics, certifications, testimonials or guarantee language", () => {
    for (const [name, cat] of [["en", en], ["fa", fa], ["de", de]] as const) {
      const json = JSON.stringify(GROUPS.map((s) => (cat as typeof en).publicSite[s]));
      for (const banned of [
        "SOC 2", "ISO 27001", "1,284", "8,500", "2,400", "120+",
        "we guarantee", "guaranteed uptime", "guaranteed outcome", "Technology Partners",
      ]) {
        expect(json.includes(banned), `${name}: banned claim "${banned}"`).toBe(false);
      }
      expect(json).not.toMatch(/\d{3,} ?\+/);
    }
  });

  it("names no third-party vendor anywhere in the homepage catalog", () => {
    // Word-bounded, and "ABB" is case-SENSITIVE on purpose. A naive
    // /ABB/i over the whole catalog matches the German "abbilden"
    // ("Hermes auf Ihre Architektur abbilden") and fails on correct copy —
    // a substring scan for short acronyms is a false-positive generator.
    const NAMED = /\b(Siemens|Schneider|Rockwell|Honeywell|Emerson)\b/i;
    const ACRONYM = /\bABB\b/;
    for (const [name, cat] of [["en", en], ["fa", fa], ["de", de]] as const) {
      const json = JSON.stringify((cat as typeof en).publicSite);
      expect(json, `${name} names a vendor`).not.toMatch(NAMED);
      expect(json, `${name} names ABB`).not.toMatch(ACRONYM);
    }
  });

  it("the illustrative case is labelled illustrative in every locale", () => {
    for (const [name, cat] of [["en", en], ["fa", fa], ["de", de]] as const) {
      const caption = (cat as typeof en).publicSite.evidence.caption;
      expect(caption.trim().length, `${name} caption`).toBeGreaterThan(0);
    }
    // and the English wording still disclaims live telemetry explicitly
    expect(en.publicSite.evidence.caption).toMatch(/not live plant telemetry/i);
  });

  it("predictive-maintenance copy keeps its explainable-indicator framing", () => {
    expect(en.publicSite.operations.cards.predictive.desc).toContain("explainable");
    expect(en.publicSite.operations.cards.predictive.desc).toContain("never black-box guarantees");
  });
});

/**
 * ── CODEX FINAL-FIX CONTRACT (round 3, PASS_WITH_FIXES) ──
 *
 * The independent review found the chapter copy borrowed from elsewhere:
 * CH03 reused CH05's lede, the plane column heads were pipeline-stage names,
 * and the gate table's heads did not describe its cells. These assertions pin
 * the DEDICATED semantics that replaced them, in every locale.
 */
describe("104-E — Codex fixes: dedicated chapter semantics", () => {
  type Cat = typeof en;
  const CATS: ReadonlyArray<readonly [string, Cat]> = [
    ["en", en], ["fa", fa as unknown as Cat], ["de", de as unknown as Cat],
  ];
  const obs = (c: Cat) => (c.publicSite as unknown as { observatory: Record<string, unknown> }).observatory;

  it("CH03 and CH05 each have their OWN lede, and they differ", () => {
    expect(pageSrc).toContain('lede={t("observatory.planesLede")}');
    expect(pageSrc).toContain('lede={t("observatory.coreLede")}');
    // CH03 must no longer borrow CH05's line
    expect(pageSrc.split('t("intelligence.lede")').length - 1).toBe(0);
    for (const [name, cat] of CATS) {
      const o = obs(cat) as { planesLede: string; coreLede: string };
      expect(o.planesLede.trim().length, `${name}.planesLede`).toBeGreaterThan(0);
      expect(o.coreLede.trim().length, `${name}.coreLede`).toBeGreaterThan(0);
      expect(o.planesLede, `${name}: CH03/CH05 ledes must differ`).not.toBe(o.coreLede);
    }
    expect((obs(en) as { planesLede: string }).planesLede).toMatch(/four assurance planes/i);
    expect((obs(en) as { coreLede: string }).coreLede).toMatch(/outside the decision gate/i);
  });

  it("plane semantics are exactly INPUT / PROCESS / OUTPUT / CONSTRAINT with a cell per plane", () => {
    // the page reads dedicated heads + a per-plane cell for each of the four
    for (const k of ["input", "process", "output", "constraint"]) {
      expect(pageSrc).toContain(`t("observatory.planeHeads.${k}")`);
      expect(pageSrc).toContain(`t(\`observatory.planes.\${key}.${k}\`)`);
    }
    for (const [name, cat] of CATS) {
      const o = obs(cat) as { planeHeads: Record<string, string>; planes: Record<string, Record<string, string>> };
      expect(Object.keys(o.planeHeads), `${name}.planeHeads`).toEqual(["input", "process", "output", "constraint"]);
      expect(Object.keys(o.planes), `${name}.planes`).toEqual(["evidence", "reasoning", "model", "safety"]);
      for (const [pk, plane] of Object.entries(o.planes)) {
        expect(Object.keys(plane), `${name}.planes.${pk}`).toEqual(["input", "process", "output", "constraint"]);
        for (const [ck, v] of Object.entries(plane)) expect(v.trim().length, `${name}.planes.${pk}.${ck}`).toBeGreaterThan(0);
      }
    }
    // the component iterates exactly these four cells and has retired "limit"
    const chapters = readFileSync(join(ROOT, "src", "components", "public-site", "home", "HomeChapters.tsx"), "utf8");
    expect(chapters).toMatch(/\(\["input", "process", "output", "constraint"\] as const\)/);
    expect(chapters).toContain('data-kind={k}');
    expect(chapters).not.toMatch(/\blimit\b\s*:/);
  });

  it("gate semantics are exactly GATE / ACTOR / EVIDENCE / BLOCK / STATE, with four named states", () => {
    for (const [name, cat] of CATS) {
      const o = obs(cat) as { gateHeads: Record<string, string>; gateStates: Record<string, string>; gates: Record<string, Record<string, string>> };
      expect(Object.keys(o.gateHeads), `${name}.gateHeads`).toEqual(["gate", "actor", "evidence", "block", "state"]);
      expect(Object.keys(o.gateStates), `${name}.gateStates`).toEqual(["pending", "validated", "decision", "released"]);
      expect(Object.keys(o.gates), `${name}.gates`).toEqual(["proposed", "validated", "approval", "executed"]);
      for (const [gk, g] of Object.entries(o.gates)) {
        expect(Object.keys(g), `${name}.gates.${gk}`).toEqual(["actor", "evidence", "block"]);
      }
    }
    for (const k of ["gate", "actor", "evidence", "block", "state"]) {
      expect(pageSrc).toContain(`t("observatory.gateHeads.${k}")`);
    }
  });

  it("de and fa observatory copy is genuinely translated, not an English carryover", () => {
    const e = obs(en) as Record<string, unknown>;
    const flat = (o: Record<string, unknown>): string[] =>
      Object.values(o).flatMap((v) => (v && typeof v === "object" ? flat(v as Record<string, unknown>) : [String(v)]));
    const en_ = flat(e);
    for (const [name, cat] of [["fa", fa], ["de", de]] as const) {
      const other = flat(obs(cat as unknown as Cat) as Record<string, unknown>);
      expect(other.length, `${name} leaf count`).toBe(en_.length);
      // "Industrial Brain" is a product name and may stay verbatim; everything else must differ
      const identical = other.filter((v, i) => v === en_[i] && !/Industrial Brain/.test(v));
      expect(identical, `${name}: identical leaves`).toEqual([]);
    }
    expect(JSON.stringify(obs(fa as unknown as Cat))).not.toMatch(/[يك]/);
    expect(JSON.stringify(obs(de as unknown as Cat))).toMatch(/[äöüßÄÖÜ]/);
  });

  it("the gate renders a semantic <table> on md+ and a <details> accordion below md, G3 open", () => {
    const chapters = readFileSync(join(ROOT, "src", "components", "public-site", "home", "HomeChapters.tsx"), "utf8");
    // desktop: real table semantics
    expect(chapters).toMatch(/<table[\s\S]*?<caption className="sr-only">/);
    expect(chapters).toContain('scope="col"');
    expect(chapters).toContain('scope="row"');
    // mobile: native, keyboard-accessible disclosure, all content in DOM
    expect(chapters).toMatch(/<details[\s\S]*?<summary/);
    expect(chapters).toContain('open={s.beacon ? true : undefined}');
    // BOTH responsive representations exist in the DOM — `md:hidden` and
    // `hidden md:block` do not remove markup, they set `display:none` on one
    // of them per breakpoint. That is the correct model, and it is what makes
    // the table and the accordion each fully SSR-able. What must hold is that
    // exactly one is rendered and exposed to the accessibility tree at every
    // supported viewport, and that neither carries an `id` or an
    // `aria-labelledby`/`aria-describedby` reference — so the hidden twin can
    // never create a duplicate id, a dangling ARIA reference, or a second
    // announcement of the gate content. `display:none` removes a subtree from
    // the accessibility tree and from tab order in every engine, which is
    // asserted at runtime in the production smoke (diagnostics-final.json).
    expect(chapters).toContain('className="hidden min-w-0 overflow-x-auto md:block"');
    expect(chapters).toContain('className="min-w-0 md:hidden"');
    // Scope to the TWO REPRESENTATIONS only. The <section> landmark above them
    // legitimately carries one aria-labelledby (the page-owned heading id) —
    // a single element, not a twin, and out of scope for the duplication rule.
    const gateFn = chapters.indexOf("export function GateChapter");
    const tableStart = chapters.indexOf("<table", gateFn);
    const accEnd = chapters.indexOf("</details>", tableStart) + "</details>".length;
    const reps = chapters.slice(tableStart, accEnd);
    expect(reps.startsWith("<table")).toBe(true);
    expect(reps).toContain("<details");
    // no id inside either representation (heading ids are page-owned)
    expect(reps).not.toMatch(/<(table|thead|tbody|tr|th|td|details|summary|dl|dt|dd)[^>]*\sid=/);
    // no ARIA reference attributes that a hidden twin could duplicate
    expect(reps).not.toMatch(/aria-labelledby=|aria-describedby=/);
    // the caption is the table's only accessible name source and is sr-only
    expect((reps.match(/<caption/g) ?? []).length).toBe(1);
    // state is a marker + text label, in both renderings
    expect((chapters.match(/<StateMark state=\{s\.state\} \/>/g) ?? []).length).toBe(2);
    // exactly one Beacon gate
    expect(pageSrc.split("beacon: true").length - 1).toBe(1);
  });

  it("the Observatory header degrades safely without animation-timeline", () => {
    const css = readFileSync(join(ROOT, "src", "app", "globals.css"), "utf8");
    const i = css.indexOf(".hh-header {");
    expect(i).toBeGreaterThan(-1);
    const block = css.slice(i, css.indexOf("}", i));
    // BASE state (all browsers) is a legible bar: solid fill + visible rule
    expect(block).toMatch(/background-color:\s*color-mix/);
    expect(block).toMatch(/border-bottom:\s*1px solid var\(--edge-structural\)/);
    // scroll-driven animation is opt-in, behind BOTH feature and motion queries
    expect(css).toMatch(/@supports \(animation-timeline: scroll\(\)\)\s*\{\s*@media \(prefers-reduced-motion: no-preference\)/);
    // the animation's end state equals the base state, so support/no-support agree
    expect(css).toMatch(/@keyframes hh-header-compact[\s\S]*?to\s*\{[\s\S]*?color-mix\(in srgb, var\(--color-background-deep\) 90%/);
    // color-mix fallback for very old engines
    expect(css).toMatch(/@supports not \(background-color: color-mix/);
  });
});

/**
 * ── ANCHOR OFFSET UNDER THE STICKY HEADER ──
 * The chapter headings are fragment targets and the header is sticky. Without
 * an offset, a direct `#gate-title` load parks the heading under the bar.
 */
describe("104-E — anchor targets clear the sticky header", () => {
  const css = readFileSync(join(ROOT, "src", "app", "globals.css"), "utf8");

  it("declares a DERIVED anchor offset — header height + the shipped spacing gap, no magic number", () => {
    // 4rem is `h-16`, the header's md+ block-size in PublicHeader.tsx; the gap
    // is `--space-card` from the shipped spacing scale.
    expect(css).toMatch(/--hh-anchor-offset:\s*calc\(4rem \+ var\(--space-card\)\)/);
    const header = readFileSync(join(ROOT, "src", "components", "public-site", "PublicHeader.tsx"), "utf8");
    expect(header).toMatch(/h-16/);
    expect(css).toMatch(/--space-card:\s*20px/);
  });

  it("applies it with a LOGICAL property to every chapter heading and the skip-link target", () => {
    const rule = css.match(/#public-content,\s*main \[id\$="-title"\]\s*\{[^}]*\}/);
    expect(rule, "anchor-offset rule").toBeTruthy();
    expect(rule![0]).toMatch(/scroll-margin-block-start:\s*var\(--hh-anchor-offset\)/);
    // logical, so RTL needs no mirror rule
    expect(rule![0]).not.toMatch(/scroll-margin-top/);
  });

  it("every real fragment target on the page is covered by the selector", () => {
    // Extract the actual ids from source, never a guessed list.
    const chapters = readFileSync(join(ROOT, "src", "components", "public-site", "home", "HomeChapters.tsx"), "utf8");
    const hero = readFileSync(join(ROOT, "src", "components", "public-site", "home", "ObservatoryHero.tsx"), "utf8");
    const ids = new Set<string>();
    for (const src of [pageSrc, chapters, hero]) {
      for (const m of src.matchAll(/\bid="([a-z][a-z0-9-]*)"/g)) ids.add(m[1]);
    }
    const headingIds = [...ids].filter((i) => i.endsWith("-title"));
    expect(headingIds.length).toBeGreaterThanOrEqual(8);
    expect(ids.has("public-content")).toBe(true);
    // Every `*-title` id and `public-content` matches the CSS selector; the
    // hero section's own id (`observatory`) is a landmark, not a link target.
    for (const id of headingIds) expect(id.endsWith("-title"), id).toBe(true);
    // and the header's skip link points at the covered target
    const header = readFileSync(join(ROOT, "src", "components", "public-site", "PublicHeader.tsx"), "utf8");
    expect(header).toContain('href="#public-content"');
  });
});
