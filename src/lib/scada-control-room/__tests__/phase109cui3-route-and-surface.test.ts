/**
 * PHASE 109-C-UI.3 — route protection, i18n parity, RTL and accessibility.
 *
 * These are source-and-catalogue assertions rather than a rendered DOM, and the
 * reason is worth stating: the page is a SERVER component that calls
 * `getTranslations` and a tenant resolver, so rendering it in jsdom would test a
 * pile of mocks I wrote rather than the page. What CAN be checked honestly at
 * this level is that the route is protected, that every string is a catalogue
 * lookup in three locales, that nothing lays out with physical left/right, and
 * that the page opens no client-side connection.
 *
 * Two limits, stated rather than papered over:
 *   * No test here proves pixel layout or focus order in a browser. That is the
 *     visual sweep in the report, and it is reported separately.
 *   * A 44px target is asserted from the class names the surface uses, not from
 *     a measured box.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isProtectedPath, isAuthorizedForPath } from "@/lib/auth/rbac";
import {
  CONNECTIVITY_STATES,
  CONNECTIVITY_REASONS,
  PROVENANCE_SOURCES,
  UNCERTAINTY_LEVELS,
  UNAVAILABLE_CAPABILITIES,
  REFUSAL_CODES,
  ALARM_SEVERITIES,
  SAFETY_CLASSES,
  STORED_GATEWAY_STATUSES,
} from "../contract";

const REPO = process.cwd();
const read = (p: string) => readFileSync(join(REPO, p), "utf8");

/**
 * Read a file with comments stripped.
 *
 * These assertions are about what the CODE does. The first version scanned raw
 * text and failed on this surface's own doc comments — the one that says it uses
 * no `"use client"`, and the one that names the `isFa ?` defect it avoids. A
 * comment explaining why something must not happen is not that thing happening,
 * and Phase 99's static checker already had to learn the same lesson.
 */
const readCode = (p: string): string =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    // `[^:]` in front keeps `https://` from being read as a line comment.
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const PAGE = "src/app/[locale]/engineering/scada-control-room/page.tsx";
const WORKSPACE = "src/components/scada-control-room/ControlRoomWorkspace.tsx";
const BADGE = "src/components/scada-control-room/ConnectivityBadge.tsx";
const REFUSAL = "src/components/scada-control-room/AccessRefusal.tsx";

const locales = ["en", "fa", "de"] as const;
const catalogues = Object.fromEntries(
  locales.map((l) => [l, JSON.parse(read(`messages/${l}.json`))]),
) as Record<(typeof locales)[number], Record<string, never>>;

const cr = (l: (typeof locales)[number]) =>
  (catalogues[l] as unknown as { otEdge: { controlRoom: Record<string, unknown> } }).otEdge.controlRoom;

const leaf = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], o);

/* ══════════════════════════════════════════════════════════════════════════ */

describe("109-C-UI.3 · the route is protected before the page runs", () => {
  for (const locale of locales) {
    it(`/${locale}/engineering/scada-control-room is a protected path`, () => {
      // Under an ALREADY-registered prefix on purpose: an unregistered
      // top-level route is PUBLIC, and this data is a tenant's plant estate.
      expect(isProtectedPath(`/${locale}/engineering/scada-control-room`)).toBe(true);
    });
  }

  it("roles without engineering access are refused by the matcher", () => {
    /*
      Argument order is (role, pathname). The first version of this test had it
      reversed and "passed" — a reminder that a green assertion against the
      wrong signature proves nothing at all.

      `Role` has no null member: an unauthenticated visitor never reaches this
      function, because `isProtectedPath` above sends them to sign in first. What
      IS worth asserting is that an authenticated role from a different part of
      the product cannot read a tenant's plant estate.
    */
    const P = "/en/engineering/scada-control-room";
    for (const role of ["customer", "candidate", "vendor"] as const) {
      expect(isAuthorizedForPath(role, P), role).toBe(false);
    }
    for (const role of ["engineer", "admin", "superadmin"] as const) {
      expect(isAuthorizedForPath(role, P), role).toBe(true);
    }
  });

  it("the page re-proves tenancy, permission and the site grant itself", () => {
    /*
      CODE, not raw text, and the exact CALL, not the token. The first version
      used `toContain("view_industrial")` on the raw file and stayed green when
      a reviewer swapped the predicate for `view_analytics`, because the word
      still sat in a doc comment; and it stayed green when the site-grant call
      was replaced by an org-wide read, because the IMPORT line still existed.
      A protection whose removal leaves the suite green is not being tested.
    */
    const src = readCode(PAGE);
    // Middleware proves a platform role and nothing about which organisation
    // the reader belongs to. All three of these are the second check.
    expect(src).toMatch(/await resolveTenantContextFromServerSession\(\)/);
    expect(src).toMatch(/can\(orgRole,\s*"view_industrial"\)/);
    expect(src).toMatch(
      /const allowedSiteIds = await getAllowedSiteIds\(\s*tenant\.userId,\s*tenant\.organizationId\s*\)/,
    );
    // Only that predicate may feed the refusal; a different permission name in
    // that position is the exact mutation that got through before.
    expect(src).not.toMatch(/can\(orgRole,\s*"view_(analytics|knowledge|multi_site)"\)/);
  });

  it("the engineering half is gated on its own permission and never read without it", () => {
    const src = readCode(PAGE);
    // `view_engineering_project` governs alarm/network-node records and is kept
    // separate from the registry permission on purpose (rbac.ts, Phase 94).
    expect(src).toMatch(/const engineeringPermitted = can\(orgRole,\s*"view_engineering_project"\)/);
    expect(src).toMatch(/engineeringPermitted,\s*\}\)/);
  });

  it("every refusal branch renders a refusal — none falls through to an empty page", () => {
    const src = read(PAGE);
    for (const code of REFUSAL_CODES) {
      expect(src, code).toContain(code);
    }
  });

  it("an unknown organisation role refuses instead of being assumed harmless", () => {
    const src = read(PAGE);
    expect(src).toContain("narrowToOrgRole");
    expect(src).toMatch(/orgRole === null \|\| !can\(/);
  });

  it("the page is dynamic and never indexed", () => {
    const src = read(PAGE);
    expect(src).toContain('export const dynamic = "force-dynamic"');
    expect(src).toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe("109-C-UI.3 · three locales, no literal fallbacks", () => {
  it("every catalogue carries the controlRoom block", () => {
    for (const l of locales) expect(cr(l), l).toBeTypeOf("object");
  });

  const paths = [
    ...CONNECTIVITY_STATES.map((s) => `state.${s}`),
    ...CONNECTIVITY_REASONS.map((r) => `reason.${r}`),
    ...PROVENANCE_SOURCES.map((p) => `provenance.${p}`),
    ...UNCERTAINTY_LEVELS.map((u) => `uncertainty.${u}`),
    ...UNAVAILABLE_CAPABILITIES.map((c) => `unavailable.${c}`),
    ...REFUSAL_CODES.map((c) => `refusal.${c}`),
    "metaTitle", "title", "subtitle", "readOnlyNotice", "sitesHeading",
    "protocolsHeading", "alarmsHeading", "unavailableHeading",
    "codeLabel", "yes", "no", "alarmsTruncated", "protocolsTruncated", "engineeringNotPermitted",
    ...ALARM_SEVERITIES.map((s) => `severity.${s}`),
    ...SAFETY_CLASSES.map((s) => `safetyClass.${s}`),
    ...STORED_GATEWAY_STATUSES.map((s) => `storedStatus.${s}`),
  ];

  for (const p of paths) {
    it(`${p} exists in all three locales and is non-empty`, () => {
      for (const l of locales) {
        const v = leaf(cr(l), p);
        expect(typeof v, `${l}.${p}`).toBe("string");
        expect(String(v).trim().length, `${l}.${p}`).toBeGreaterThan(0);
      }
    });
  }

  it("German never falls back to English on this surface", () => {
    // `otEdge` is in de-catalog TRANSLATED_NS, so it is held to ZERO carryover.
    const flat = (o: unknown, prefix = ""): [string, string][] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        v && typeof v === "object"
          ? flat(v, `${prefix}${k}.`)
          : [[`${prefix}${k}`, String(v)] as [string, string]],
      );
    const en = new Map(flat(cr("en")));
    const identical = flat(cr("de")).filter(([k, v]) => en.get(k) === v);
    expect(identical.map(([k]) => k)).toEqual([]);
  });

  it("Persian never falls back to English either", () => {
    const flat = (o: unknown, prefix = ""): [string, string][] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        v && typeof v === "object"
          ? flat(v, `${prefix}${k}.`)
          : [[`${prefix}${k}`, String(v)] as [string, string]],
      );
    const en = new Map(flat(cr("en")));
    expect(flat(cr("fa")).filter(([k, v]) => en.get(k) === v).map(([k]) => k)).toEqual([]);
  });

  it("Persian uses the Persian ye and ke, never the Arabic forms", () => {
    const text = JSON.stringify(cr("fa"));
    expect(text).not.toMatch(/ي/); // Arabic YEH
    expect(text).not.toMatch(/ك/); // Arabic KAF
  });

  it("no component hard-codes a visible string through a locale ternary", () => {
    for (const f of [WORKSPACE, BADGE, REFUSAL]) {
      const src = readCode(f);
      // The defect that shipped English into German pages in three earlier
      // phases: `isFa ? "…" : "…"` instead of a catalogue lookup.
      expect(src, f).not.toMatch(/isFa\s*\?/);
      expect(src, f).not.toMatch(/locale\s*===\s*["']fa["']\s*\?/);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe("109-C-UI.3 · direction, layout and accessibility", () => {
  const workspace = read(WORKSPACE);

  it("layout uses logical properties, never physical left/right", () => {
    // `text-left`/`ml-`/`pr-` would pin the surface to LTR and silently break
    // Persian. Logical utilities follow the document direction instead.
    expect(workspace).not.toMatch(/\b(text-left|text-right)\b/);
    expect(workspace).not.toMatch(/\bm[lr]-\d/);
    expect(workspace).not.toMatch(/\bp[lr]-\d/);
    /*
      Counted INSIDE className attributes. The raw-text version of this line
      was satisfied by the component's own doc comment, which names the
      utility while explaining why it matters, so stripping every class left
      the test green. The root container and each table header must carry it,
      which is where the minimum of five comes from.
    */
    const classAttrs = workspace.match(/className="[^"]*"/g) ?? [];
    const withStart = classAttrs.filter((c) => /\btext-start\b/.test(c));
    expect(withStart.length).toBeGreaterThanOrEqual(5);
    // The ROOT container specifically, so the whole surface inherits the
    // logical alignment. (Not classAttrs[0]: the first attribute in the file
    // belongs to the Field helper, which was the first draft's mistake.)
    const root = classAttrs.find((c) => /\bmx-auto\b/.test(c) && /\bmax-w-6xl\b/.test(c));
    expect(root).toBeDefined();
    expect(root).toMatch(/\btext-start\b/);
  });

  it("it is responsive from a phone upward", () => {
    expect(workspace).toMatch(/\bsm:/);
    expect(workspace).toMatch(/\bmd:grid-cols-2\b/);
  });

  it("wide content scrolls inside its own container, never the page", () => {
    expect(workspace).toContain("overflow-x-auto");
  });

  it("every section is labelled for assistive technology", () => {
    const labelled = workspace.match(/aria-labelledby=/g) ?? [];
    const headings = workspace.match(/<h2 id="cr-/g) ?? [];
    expect(labelled.length).toBeGreaterThanOrEqual(4);
    expect(headings.length).toBe(labelled.length);
  });

  it("the table uses scoped column headers", () => {
    expect(workspace).toMatch(/<th scope="col"/);
  });

  it("the alarm code column has its own header, not the section heading", () => {
    // Headed with `alarmsHeading`, every code cell was announced as
    // "Configured alarm definitions" by a screen reader.
    const code = readCode(WORKSPACE);
    const headers = code.match(/<th scope="col"[^>]*>\s*\{t\("([^"]+)"\)\}/g) ?? [];
    expect(headers.length).toBe(4);
    expect(headers.join(" ")).not.toContain('t("alarmsHeading")');
    expect(headers.join(" ")).toContain('t("codeLabel")');
  });

  it("the acknowledgement cell carries a text alternative for its glyph", () => {
    const code = readCode(WORKSPACE);
    // A bare glyph conveys the value only visually. It is hidden from
    // assistive technology and the word is what gets read.
    expect(code).toMatch(/<span aria-hidden="true">\{a\.requiresAck \? "✔" : "—"\}<\/span>/);
    expect(code).toMatch(/<span className="sr-only">\{a\.requiresAck \? t\("yes"\) : t\("no"\)\}<\/span>/);
  });

  it("enum tokens are translated through a bounded vocabulary, never printed raw", () => {
    const code = readCode(WORKSPACE);
    expect(code).not.toMatch(/>\{a\.severity\}</);
    expect(code).not.toMatch(/>\{a\.safetyClass\}</);
    expect(code).not.toMatch(/value=\{g\.connectivity\.storedStatus\}/);
    expect(code).toMatch(/tokenLabel\(t, "severity", ALARM_SEVERITIES, a\.severity\)/);
    expect(code).toMatch(/tokenLabel\(t, "safetyClass", SAFETY_CLASSES, a\.safetyClass\)/);
  });

  it("a capped panel says so, and a withheld panel says why", () => {
    const code = readCode(WORKSPACE);
    expect(code).toMatch(/view\.alarmsTruncated \?/);
    expect(code).toMatch(/view\.protocolsTruncated \?/);
    expect((code.match(/!view\.engineeringPermitted \?/g) ?? []).length).toBe(2);
  });

  it("definition pairs stay machine-readable", () => {
    // `dt`/`dd` inside `dl` so a screen reader keeps label and value together.
    expect(workspace).toContain("<dl");
    expect(workspace).toContain("<dt");
    expect(workspace).toContain("<dd");
  });

  it("every timestamp is a machine-readable <time>, isolated as an LTR run", () => {
    // An ISO timestamp inside a Persian paragraph is reordered by the bidi
    // algorithm into "12T10:19:45Z-09-2026" (seen in the rehearsal sweep).
    // dir="ltr" on the element keeps the run intact without changing the
    // paragraph's direction.
    const times = workspace.match(/<time [^>]*>/g) ?? [];
    expect(times.length).toBeGreaterThanOrEqual(2);
    for (const t of times) {
      expect(t).toMatch(/dateTime=/);
      expect(t).toMatch(/dir="ltr"/);
    }
  });

  it("colour is never the only signal on a connectivity badge", () => {
    const badge = read(BADGE);
    // A glyph AND a text label, so the state survives a monochrome panel or a
    // colour vision deficiency.
    expect(badge).toContain("GLYPH");
    expect(badge).toContain("{label}");
    expect(badge).toContain('aria-hidden="true"');
  });

  it("a refusal announces itself instead of looking like a loaded page", () => {
    expect(read(REFUSAL)).toContain('role="alert"');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe("109-C-UI.3 · the surface is inert", () => {
  const sources = [WORKSPACE, BADGE, REFUSAL].map(readCode);

  it("no component is a client component", () => {
    // Server-rendered throughout: no hydration, and nothing the browser can be
    // made to fetch about the plant.
    for (const src of sources) expect(src).not.toContain('"use client"');
  });

  it("there is no polling, no timer and no permanent animation", () => {
    for (const src of sources) {
      expect(src).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
      expect(src).not.toMatch(/\banimate-(pulse|ping|spin|bounce)\b/);
    }
  });

  it("the surface opens no connection of its own", () => {
    for (const src of sources) {
      expect(src).not.toMatch(/\bfetch\(|EventSource|WebSocket/);
    }
  });

  it("the page states in its own text that it is read-only", () => {
    expect(read(WORKSPACE)).toContain("readOnlyNotice");
    for (const l of locales) {
      expect(String(leaf(cr(l), "readOnlyNotice")).length, l).toBeGreaterThan(10);
    }
  });
});
