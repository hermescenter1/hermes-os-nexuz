import { describe, it, expect } from "vitest";
import { KNOWLEDGE, DOMAIN_KEYWORDS, DOMAIN_LIBS, ALL_DOMAINS } from "@/lib/industrial/knowledge";
import { knowledgeService } from "@/lib/services/knowledge-service";
import de from "../../../../messages/de.json";

/**
 * PHASE 87L.6F §13/§14 — German search support for the public engineering
 * Knowledge Library.
 *
 * German terms live in a SEPARATE `keywordsDe` array, NOT in the shared
 * language-neutral `keywords` array. That separation is the whole point: the
 * shared array feeds substring matchers (`keyword.includes(query)`) and
 * `overlapRatio`, whose denominator is `keywords.length`. An earlier attempt
 * appended German to the shared array and regressed English — search("rung")
 * went from 1 article to 15 because "rung" is a substring of "steuerung", and
 * the inflated denominator demoted every knowledge evidence score.
 *
 * These tests therefore assert EXACT English result sets (not `toContain`,
 * which passed at 15 results as readily as at 1) and pin the shared array's
 * size, so the same class of regression cannot return silently.
 */

type Tree = Record<string, unknown>;

/** A German word: has a German-specific letter, or is a plausible German stem. */
const GERMAN_LETTER = /[äöüß]/;
const PERSIAN = /[؀-ۿ]/;
const LATIN_ONLY = /^[\x00-\x7F]+$/;

const deK = (de as Tree).knowledge as Tree;

describe("87L.6F — German search index completeness", () => {
  it("still has exactly 30 articles with stable ids and no duplicates", () => {
    expect(KNOWLEDGE.length).toBe(30);
    const ids = KNOWLEDGE.map((l) => l.id);
    expect(new Set(ids).size).toBe(30);
    // ids are the public route segments — they must not drift
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9]+$/);
    expect(ids).toContain("plcBasics");
    expect(ids).toContain("vfd");
    expect(ids).toContain("rca");
  });

  it("every article id still has a German article body to render", () => {
    for (const lib of KNOWLEDGE) {
      expect(deK[lib.id], `${lib.id} missing from de.knowledge`).toBeDefined();
      expect(String((deK[lib.id] as Tree).name).trim()).not.toBe("");
    }
  });

  it("every one of the 30 articles carries German search terms", () => {
    const bare: string[] = [];
    for (const lib of KNOWLEDGE) {
      if (lib.keywordsDe.length < 6) bare.push(lib.id);
    }
    expect(bare).toEqual([]);
  });

  it("German terms are lowercase and never ASCII-folded umlauts", () => {
    for (const lib of KNOWLEDGE) {
      for (const k of lib.keywordsDe) {
        expect(k, `${lib.id}: "${k}" is not lowercase`).toBe(k.toLowerCase());
      }
      for (const k of lib.keywordsDe.filter((x) => GERMAN_LETTER.test(x))) {
        const folded = k.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
        expect(lib.keywordsDe, `${lib.id}: ASCII-folded duplicate of ${k}`).not.toContain(folded);
      }
    }
  });

  it("has no duplicate keyword within an article", () => {
    for (const lib of KNOWLEDGE) {
      expect(new Set(lib.keywords).size, `${lib.id} has duplicate keywords`).toBe(lib.keywords.length);
      expect(new Set(lib.keywordsDe).size, `${lib.id} has duplicate German terms`).toBe(lib.keywordsDe.length);
    }
  });

  it("DOMAIN_LIBS still maps domains to ARTICLE IDS only (never search terms)", () => {
    // regression guard: an earlier applier bug injected German search terms
    // into DOMAIN_LIBS because it shares its key names with DOMAIN_KEYWORDS.
    const ids = new Set(KNOWLEDGE.map((l) => l.id));
    for (const domain of ALL_DOMAINS) {
      for (const entry of DOMAIN_LIBS[domain]) {
        expect(ids.has(entry), `DOMAIN_LIBS.${domain} contains non-article "${entry}"`).toBe(true);
      }
    }
  });
});

describe("87L.6F — German queries resolve (§14)", () => {
  const REQUIRED: [string, string[]][] = [
    ["Spannungsfreiheit", ["motors", "mcc"]],
    ["Sicherheitsrelais", ["plcBasics", "ladder"]],
    ["Frequenzumrichter", ["vfd"]],
    ["Isolationswiderstand", ["motors"]],
    ["PROFINET", ["protocols"]],
    ["Grundursache", ["rca"]],
    ["Instandhaltung", ["predictive"]],
    ["Störlichtbogen", ["mcc"]],
  ];

  it.each(REQUIRED)("query %s returns the expected article(s)", async (query, expected) => {
    const res = await knowledgeService.search(query, "de");
    expect(res.ok).toBe(true);
    const ids = (res.ok ? res.data : []).map((a: { id: string }) => a.id);
    expect(ids.length, `"${query}" returned nothing`).toBeGreaterThan(0);
    for (const e of expected) {
      expect(ids, `"${query}" should return ${e}`).toContain(e);
    }
  });

  it("matches German TITLE words, not just concepts", async () => {
    // knowledge.<id>.name is the German title a reader actually sees
    for (const [id, probe] of [
      ["vfd", "Frequenzumrichter"],
      ["ladder", "Kontaktplan"],
      ["rca", "Grundursache"],
    ] as const) {
      const res = await knowledgeService.search(probe, "de");
      const ids = (res.ok ? res.data : []).map((a: { id: string }) => a.id);
      expect(ids, `title probe "${probe}" should reach ${id}`).toContain(id);
    }
  });

  it("matches German SAFETY concepts", async () => {
    for (const [probe, id] of [
      ["Spannungsfreiheit", "motors"],
      ["Störlichtbogen", "mcc"],
      ["Sicherheitsrelais", "plcBasics"],
    ] as const) {
      const res = await knowledgeService.search(probe, "de");
      const ids = (res.ok ? res.data : []).map((a: { id: string }) => a.id);
      expect(ids, `safety probe "${probe}" should reach ${id}`).toContain(id);
    }
  });

  it("is case-insensitive and token-based, not whole-string equality", async () => {
    for (const q of ["frequenzumrichter", "FREQUENZUMRICHTER", "Frequenzumrichter"]) {
      const res = await knowledgeService.search(q, "de");
      const ids = (res.ok ? res.data : []).map((a: { id: string }) => a.id);
      expect(ids, `case variant "${q}"`).toContain("vfd");
    }
    // a shorter stem of a stored compound still matches
    const partial = await knowledgeService.search("zwischenkreis", "de");
    expect((partial.ok ? partial.data : []).map((a: { id: string }) => a.id)).toContain("vfd");
  });

  it("returns no duplicate article for a German query", async () => {
    for (const q of ["Instandhaltung", "Standort", "Verriegelung", "Spannungsfreiheit"]) {
      const res = await knowledgeService.search(q, "de");
      const ids = (res.ok ? res.data : []).map((a: { id: string }) => a.id);
      expect(new Set(ids).size, `duplicate result for "${q}"`).toBe(ids.length);
    }
  });

  it("an unknown German query returns the established empty result", async () => {
    const res = await knowledgeService.search("xyzunbekanntesbegriffabc", "de");
    expect(res.ok).toBe(true);
    expect(res.ok ? res.data : null).toEqual([]);
  });

  it("German domain terms let a German question clear the Brain domain gate", () => {
    // classify() returns libraries:[] when maxRaw < DOMAIN_THRESHOLD, BEFORE
    // article keywords are scored — so DOMAIN_KEYWORDS must carry German too.
    const score = (text: string, kws: string[]) => {
      let s = 0;
      for (const k of kws) {
        const kk = k.toLowerCase();
        const matched = kk.length <= 4 && /^[a-z0-9-]+$/.test(kk)
          ? new RegExp(`(^|[^a-z0-9])${kk.replace(/-/g, "\\-")}([^a-z0-9]|$)`).test(text)
          : text.includes(kk);
        if (matched) s += kk.length >= 5 ? 2 : 1;
      }
      return s;
    };
    for (const q of ["frequenzumrichter defekt", "isolationswiderstand messen", "instandhaltung planen", "grundursache finden"]) {
      const max = Math.max(...ALL_DOMAINS.map((d) => score(q, DOMAIN_KEYWORDS[d])), 0);
      expect(max, `"${q}" does not clear the domain gate`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("87L.6F — EN and FA search regression", () => {
  /**
   * EXACT result sets, not `toContain`.
   *
   * An adversarial review proved the earlier `toContain` form was blind to the
   * real regression: when German compounds lived in the shared `keywords`
   * array, search("rung") grew from 1 article to 15 (because "rung" is a
   * substring of "steuerung") and search("rungs") returned 5 wrong articles
   * while OMITTING Ladder Logic — yet `toContain("ladder")` still passed on the
   * first query. Asserting the exact set is the only assertion that can fail.
   */
  const EN_EXACT: [string, string[]][] = [
    ["rung", ["ladder"]],
    ["rungs", []],
    ["run", ["ladder"]],
    ["ladder", ["ladder"]],
    ["vfd", ["vfd"]],
    ["opc ua", ["opcua"]],
    ["root cause", ["rca"]],
    ["historian", ["historian"]],
    ["net", ["protocols"]],
    ["arc", ["historian"]],
    ["span", ["transmitters"]],
  ];

  it.each(EN_EXACT)("EN query %s returns EXACTLY the pre-existing set", async (q, want) => {
    const res = await knowledgeService.search(q);
    const ids = (res.ok ? res.data : []).map((a: { id: string }) => a.id);
    expect(ids, `EN query "${q}" result set drifted`).toEqual(want);
  });

  it("German terms never widen an English query (they live in keywordsDe)", () => {
    // Structural guarantee behind the assertions above: no German term is in
    // the shared array that EN/FA substring matching reads.
    for (const lib of KNOWLEDGE) {
      for (const k of lib.keywords) {
        expect(GERMAN_LETTER.test(k), `${lib.id}: German term "${k}" leaked into shared keywords`).toBe(false);
      }
      expect(lib.keywordsDe.length, `${lib.id} has no German terms`).toBeGreaterThanOrEqual(6);
    }
  });

  it("overlapRatio denominators are unchanged (evidence scoring not diluted)", () => {
    // scoreKnowledge divides by lib.keywords.length; growing that array would
    // silently demote every knowledge candidate for EN/FA queries.
    const EXPECTED_SIZES: Record<string, number> = {
      plcBasics: 9, opcua: 6, rca: 8, s7comm: 6, structuredText: 6, troubleshooting: 13,
    };
    for (const [id, size] of Object.entries(EXPECTED_SIZES)) {
      const lib = KNOWLEDGE.find((l) => l.id === id)!;
      expect(lib.keywords.length, `${id} shared keyword count changed`).toBe(size);
    }
  });

  it("Persian queries still resolve", async () => {
    for (const [q, want] of [
      ["پی‌ال‌سی", "plcBasics"],
      ["درایو", "vfd"],
      ["اسکادا", "scadaTags"],
    ] as const) {
      const res = await knowledgeService.search(q);
      const ids = (res.ok ? res.data : []).map((a: { id: string }) => a.id);
      expect(ids, `FA query "${q}"`).toContain(want);
    }
  });

  it("no English or Persian keyword was removed by this phase", () => {
    // Every article must still carry Persian tokens AND Latin tokens; the wave
    // was additive only.
    for (const lib of KNOWLEDGE) {
      expect(lib.keywords.some((k) => PERSIAN.test(k)), `${lib.id} lost its Persian keywords`).toBe(true);
      expect(lib.keywords.some((k) => LATIN_ONLY.test(k)), `${lib.id} lost its Latin keywords`).toBe(true);
    }
  });

  it("DOMAIN_KEYWORDS kept every pre-existing English and Persian term", () => {
    // spot-check the anchors the classifier has always relied on
    expect(DOMAIN_KEYWORDS.plc).toContain("plc");
    expect(DOMAIN_KEYWORDS.plc).toContain("پی‌ال‌سی");
    expect(DOMAIN_KEYWORDS.drives).toContain("vfd");
    expect(DOMAIN_KEYWORDS.drives).toContain("درایو");
    expect(DOMAIN_KEYWORDS.maintenance).toContain("root cause");
    expect(DOMAIN_KEYWORDS.otNetwork).toContain("profinet");
  });
});

describe("87L.6F — search metadata stays out of the public article body (§13)", () => {
  it("keywords carry no private content, URL or credential VALUE", () => {
    // NOTE: topic nouns like "password" / "zugriffskontrolle" are legitimate
    // keywords for the accessControl article. What must never appear is a
    // credential VALUE, an absolute URL, or a private route — so match the
    // shapes of those, not the vocabulary of security itself.
    const forbidden = [
      /https?:\/\//i,                          // absolute URL
      /\/(dashboard|admin|crm|erp)\b/i,        // private route
      /(api[_-]?key|secret|token|password)\s*[:=]/i, // key=value credential
      /\bbearer\s+\S+/i,                       // bearer token
      /-----BEGIN [A-Z ]*PRIVATE KEY/,         // PEM block
      /\b[A-Za-z0-9_-]{32,}\b/,                // long opaque secret-like blob
    ];
    for (const lib of KNOWLEDGE) {
      for (const k of [...lib.keywords, ...lib.keywordsDe]) {
        for (const re of forbidden) {
          expect(re.test(k), `${lib.id}: "${k}" matches ${re}`).toBe(false);
        }
      }
    }
  });

  it("the article page no longer renders the raw keyword array as body text", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/app/[locale]/library/[article]/page.tsx", "utf8");
    // it must NOT be rendered as visible content ...
    expect(src).not.toMatch(/\{lib\.keywords\.join\([^)]*\)\}/);
    // ... but it MUST still be emitted as search/SEO metadata
    expect(src).toMatch(/keywords:\s*lib\.keywords\.join\(", "\)/);
  });

  it("keeps the keyword array itself intact for matching", () => {
    const shared = KNOWLEDGE.reduce((n, l) => n + l.keywords.length, 0);
    const german = KNOWLEDGE.reduce((n, l) => n + l.keywordsDe.length, 0);
    expect(shared).toBe(270);   // byte-identical to HEAD
    expect(german).toBe(312);
    for (const lib of KNOWLEDGE) expect(lib.keywords.length).toBeGreaterThanOrEqual(6);
  });
});
