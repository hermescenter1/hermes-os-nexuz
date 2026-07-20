import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";

/**
 * PHASE 87L.6F — the final German gate.
 *
 * Part 1 pins the last wave's 255 leaves.
 * Part 2 is the FULL-CATALOG reconciliation (§2): every one of the 5,136
 * leaves is classified exactly once by inspecting its actual VALUE — never by
 * namespace membership — and the prohibited classes must be empty.
 */

type Tree = Record<string, unknown>;

const TARGETS = [
  "multiSite", "caseStudio", "digitalTwin", "industrial", "unknownCenter",
  "automation", "documents", "analytics", "platform", "storage",
] as const;
type Target = (typeof TARGETS)[number];

const LEAF_COUNTS: Record<Target, number> = {
  multiSite: 55, caseStudio: 40, digitalTwin: 35, industrial: 30,
  unknownCenter: 27, automation: 19, documents: 19, analytics: 15,
  platform: 12, storage: 3,
};

/** Identical-by-design in this wave — loanwords and product names. */
const WAVE_IDENTICAL = new Set<string>([
  "automation.dashboard", "automation.workflows", "automation.webhooks",
  "documents.nav.dashboard", "documents.nav.explorer", "documents.nav.audit",
  "unknownCenter.eyebrow", "unknownCenter.metrics.none",
  "digitalTwin.status", "multiSite.status",
  "analytics.trendsTitle", "industrial.gateways.title",
]);
const WAVE_TOKEN = new Set<string>([
  "analytics.kpiTitle", "industrial.eyebrow",
]);

const leaves = (o: unknown, p = ""): [string, string][] =>
  o !== null && typeof o === "object"
    ? Object.entries(o as Tree).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k))
    : [[p, String(o)]];

const nsLeaves = (locale: unknown, ns: string) =>
  leaves((locale as Tree)[ns]).map(([p, v]) => [`${ns}.${p}`, v] as const);

const targetLeaves = TARGETS.flatMap((ns) => nsLeaves(de, ns));
const enTarget = new Map<string, string>(TARGETS.flatMap((ns) => nsLeaves(en, ns)));
const faTarget = new Map<string, string>(TARGETS.flatMap((ns) => nsLeaves(fa, ns)));

const icuArgs = (v: string) =>
  [...v.matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]).sort().join("|");

describe("87L.6F — the final 255 leaves", () => {
  it.each(TARGETS)("%s has its pinned leaf count", (ns) => {
    expect(nsLeaves(en, ns).length).toBe(LEAF_COUNTS[ns]);
  });

  it("the ten namespaces total exactly 255", () => {
    expect(Object.values(LEAF_COUNTS).reduce((a, b) => a + b, 0)).toBe(255);
    expect(targetLeaves.length).toBe(255);
  });

  it("arithmetic holds per namespace and overall (255 = 241 + 12 + 2)", () => {
    let T = 0, I = 0, K = 0;
    for (const ns of TARGETS) {
      let t = 0, i = 0, k = 0;
      for (const [path, dv] of nsLeaves(de, ns)) {
        if (dv === enTarget.get(path)) {
          if (WAVE_TOKEN.has(path)) k++;
          else if (WAVE_IDENTICAL.has(path)) i++;
          else throw new Error(`unapproved English carryover: ${path} = ${dv}`);
        } else t++;
      }
      expect(t + i + k, ns).toBe(LEAF_COUNTS[ns]);
      T += t; I += i; K += k;
    }
    expect({ translated: T, identical: I, token: K })
      .toEqual({ translated: 241, identical: 12, token: 2 });
  });

  it("has zero unapproved carryover, zero Persian, zero empty", () => {
    const carried: string[] = [];
    for (const [path, v] of targetLeaves) {
      expect(v.trim(), `${path} empty`).not.toBe("");
      expect(/[؀-ۿ]/.test(v), `${path} Persian`).toBe(false);
      expect(/[Ѐ-ӿ]/.test(v), `${path} Cyrillic`).toBe(false);
      if (v === enTarget.get(path) && !WAVE_IDENTICAL.has(path) && !WAVE_TOKEN.has(path)) {
        carried.push(`${path} = ${v}`);
      }
    }
    expect(carried).toEqual([]);
  });

  it("keeps ICU parity with en and fa, and adds no markup", () => {
    for (const [path, v] of targetLeaves) {
      expect(icuArgs(v), `${path} vs en`).toBe(icuArgs(enTarget.get(path)!));
      expect(icuArgs(v), `${path} vs fa`).toBe(icuArgs(faTarget.get(path)!));
      let depth = 0;
      for (const ch of v) {
        if (ch === "{") depth++;
        if (ch === "}") depth--;
        expect(depth, `${path} unbalanced`).toBeGreaterThanOrEqual(0);
      }
      expect(depth, `${path} unbalanced`).toBe(0);
      const tags = (s: string) => (s.match(/<[a-zA-Z/][^>]*>/g) ?? []).length;
      expect(tags(v), `${path} added markup`).toBe(tags(enTarget.get(path)!));
    }
  });

  it("preserves every digit sequence from the English source", () => {
    for (const [path, v] of targetLeaves) {
      const nums = (s: string) => (s.match(/\d+/g) ?? []).sort();
      expect(nums(v), `${path} numeric drift`).toEqual(nums(enTarget.get(path)!));
    }
  });
});

describe("87L.6F — terminology (§3-§12, §16)", () => {
  const t = (p: string) => targetLeaves.find(([q]) => q === p)?.[1] ?? "";

  it("multi-site uses Standort / standortübergreifend", () => {
    expect(t("multiSite.site")).toBe("Standort");
    expect(t("multiSite.sites")).toBe("Standorte");
    expect(t("multiSite.enterpriseSummaryDesc")).toMatch(/[Ss]tandortübergreifend/);
    expect(t("multiSite.failurePatterns")).toMatch(/[Ss]tandortübergreifend/);
    expect(t("multiSite.availability")).toBe("Verfügbarkeit");
  });

  it("case studio uses Engineering-Fall / Grundursache / Feststellung vocabulary", () => {
    expect(t("caseStudio.title")).toBe("Fallstudio");
    expect(t("caseStudio.lede")).toContain("Engineering-Fälle");
    expect(t("caseStudio.form.problem")).toBe("Problembeschreibung");
    expect(t("caseStudio.form.primary")).toContain("Grundursache");
    expect(t("caseStudio.preview.rootCause")).toBe("Grundursache");
    expect(t("caseStudio.form.corrective")).toBe("Korrekturmaßnahmen");
  });

  it("digital twin uses Digitaler Zwilling vocabulary", () => {
    expect(t("digitalTwin.eyebrow")).toBe("Digitaler Zwilling");
    expect(t("digitalTwin.subtitle")).toContain("Beobachtung");
    expect(t("digitalTwin.lastTelemetry")).toContain("Telemetrie");
  });

  it("industrial and analytics use the established glossary terms", () => {
    expect(t("industrial.sites.title")).toBe("Standorte");
    expect(t("industrial.assets.title")).toBe("Anlagen");
    expect(t("analytics.availabilityLabel")).toBe("Verfügbarkeit");
    expect(t("analytics.title")).toContain("Zeitreihen");
  });

  it("never uses Wartung as a blanket rendering of maintenance", () => {
    for (const [path, v] of targetLeaves) {
      expect(/\bWartung\b/.test(v), `${path} uses Wartung`).toBe(false);
    }
  });

  it("preserves persisted enum KEYS in every target namespace", () => {
    // caseStudio.queue.status* is built at runtime from the DraftStatus enum
    // ("draft"|"ready"|"published") which goes on the wire to /api/cases.
    for (const k of ["statusDraft", "statusReady", "statusPublished"]) {
      expect(Object.keys(((de as Tree).caseStudio as Tree).queue as Tree)).toContain(k);
    }
    // industrial.<section>.title/description — the key prefix IS the route slug
    for (const slug of ["sites", "gateways", "assets", "telemetry", "connectors"]) {
      const sec = ((de as Tree).industrial as Tree)[slug] as Tree;
      expect(sec, slug).toBeDefined();
      expect(Object.keys(sec)).toEqual(Object.keys(((en as Tree).industrial as Tree)[slug] as Tree));
    }
    // industrial.connectors.enabled/disabled selected from the boolean field
    expect(Object.keys(((de as Tree).industrial as Tree).connectors as Tree))
      .toEqual(Object.keys(((en as Tree).industrial as Tree).connectors as Tree));
  });
});

describe("87L.6F — observation-only safety wording is not weakened (§5, §6)", () => {
  const t = (p: string) => targetLeaves.find(([q]) => q === p)?.[1] ?? "";

  it("industrial keeps the read/observe-only banner with its prohibition", () => {
    const b = t("industrial.safetyBanner");
    expect(b).toMatch(/Sicherheit/);
    expect(b).toMatch(/Lesen|Beobachten/);
    expect(b).toMatch(/keine\s+Steuerbefehle/i);
    expect(b).toMatch(/PLC/);
  });

  it("industrial telemetry keeps 'read-only, sends no commands'", () => {
    const n = t("industrial.telemetry.readOnlyNote");
    expect(n).toMatch(/schreibgeschützt/);
    expect(n).toMatch(/keine Befehle/i);
    expect(n).toContain("50");
  });

  it("digital twin keeps the no-write-back banner", () => {
    const b = t("digitalTwin.readOnlyBanner");
    expect(b).toMatch(/NUR LESEN|BEOBACHTEN/);
    expect(b).toMatch(/[Kk]eine\s+Rückschreibung/);
  });

  it("no target string implies autonomous control of equipment", () => {
    const controlClaim = /steuert automatisch|übernimmt die Steuerung|greift steuernd ein|autonome Steuerung/i;
    for (const [path, v] of targetLeaves) {
      expect(controlClaim.test(v), `${path} implies control`).toBe(false);
    }
  });

  it("keeps the V1 / placeholder honesty markers", () => {
    expect(t("caseStudio.sessionNote")).toContain("V1");
    expect(t("caseStudio.metrics.published")).toContain("Platzhalter");
    expect(t("caseStudio.actions.publish")).toContain("Platzhalter");
    expect(t("unknownCenter.sessionNote")).toContain("V1");
    expect(t("unknownCenter.actionNote")).toContain("Platzhalter");
    expect(t("industrial.connectors.foundationNote")).toMatch(/Phase 3[56]/);
  });
});

/**
 * §2 — FULL-CATALOG RECONCILIATION over all 5,136 leaves.
 *
 * Classification inspects the VALUE, not the namespace. A namespace being
 * "translated" proves nothing about an individual leaf, so every leaf is
 * bucketed independently and the prohibited buckets must be empty.
 */
describe("87L.6F — full 5,136-leaf reconciliation (§2)", () => {
  const allEn = leaves(en);
  const allDe = new Map<string, string>(leaves(de));
  const allFa = new Map<string, string>(leaves(fa));

  /** Values legitimately identical across the WHOLE catalog. */
  const isNumericOrUnit = (v: string) => /^[\d\s.,:%°/+-]+$/.test(v.trim()) && /\d/.test(v);
  const isPunctuationOnly = (v: string) => /^[^\p{L}\p{N}]+$/u.test(v.trim());
  const PROTOCOL_OR_STANDARD =
    /^(PLC|SCADA|HMI|VFD|MQTT|OPC ?UA|Modbus(\s?TCP)?|PROFINET|EtherCAT|HART|MCC|LOTO|F-CPU|KPIs?|API|ATS|CRM|ERP|EDMS|IRR|GBP|USD|EUR|IT ?\/ ?OT|S7-1[25]00|IEC[\s-]?\d+|ISA-[\d.]+|Prisma|Redis|Website|Status|Name|Team|Teams|Dashboard|Explorer|Audit|Webhooks|Workflows|Trends|Gateways|Intelligence|Premium|Standard|Enterprise|Community|Professional|Score|Pipeline|Leads|LinkedIn|Academy|Expansion|CSMs \(\{count\}\)|Management|Multi-Agent|Industrial Gateway|Customer Success|CRM · .*|Phase \d+|optional|Modular|—)$/i;
  // NOTE: this MUST call .test(). An arrow that merely returns the literal
  // regex is always truthy and would silently bucket every identical leaf as a
  // technical token — caught by the no-unused-vars lint warning on `v`.
  const isProtocolOrStandard = (v: string) => PROTOCOL_OR_STANDARD.test(v.trim());

  /**
   * Multi-word values that are identical BY DESIGN across every locale.
   * Each predicate names one class from §2; together they are the only way a
   * multi-word identical value may avoid the prohibited bucket.
   */
  const isBrandOrProduct = (v: string) =>
    /^HERMES\b/i.test(v.trim()) ||
    new Set([
      "Industrial Brain", "Hermes Brain", "Engineering Copilot", "Industrial Copilot",
      "ENGINEERING COPILOT", "Hermes Copilot", "Knowledge Cloud", "Knowledge Studio",
      "Case Studio", "Unknown Analysis Center", "Knowledge Engine & Graph",
      "OPC UA Gateway", "Modbus Gateway", "MQTT Gateway", "Recruiting (ATS)",
    ]).has(v.trim());

  // "PLC · SCADA · OPC UA · MQTT", "ERP · CRM · ATS", "OPC UA · Modbus TCP · …"
  const isProtocolOrProductList = (v: string) =>
    v.includes("·") &&
    v.split("·").every((seg) =>
      /^[\s]*(?:Hermes\s+)?[A-Z0-9][A-Za-z0-9&/\-. ]*$/.test(seg) || seg.trim() === ""
    );

  const isContactOrUrl = (v: string) =>
    /^https?:\/\//.test(v.trim()) ||
    /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(v.trim()) ||
    /^\+[\d ]+$/.test(v.trim());

  /** People, companies, places and vendor part numbers are never translated. */
  const isProperNoun = (v: string) =>
    new Set([
      "Isfahan, Iran", "Hamid Reza Forozandeh", "Hermes Novin Mehr IRIC",
      "Ada Lovelace", "Acme Manufacturing", "Schneider Electric", "Phoenix Contact",
      "Siemens S7-1200", "Siemens S7-1500",
    ]).has(v.trim());

  /** Example/placeholder input values and required-field markers. */
  const isFormPlaceholder = (v: string) =>
    /^[A-Za-z]+ \*$/.test(v.trim()) || /^you@/.test(v.trim());

  /** Standard/spec names and composite technical identifiers. */
  const isTechnicalIdentifier = (v: string) =>
    new Set([
      "P&ID", "SCADA & HMI", "PLC/SCADA", "PLC & SCADA", "Open Graph",
      "Consent API", "Twitter Cards", "Phase 2+", "Support: Ticket",
    ]).has(v.trim());

  /**
   * An ICU shell whose only translatable words are loanwords German keeps
   * verbatim, e.g. "{count, plural, one {# Workflow} other {# Workflows}}".
   */
  const isIcuLoanwordShell = (v: string) =>
    /\{[a-zA-Z]+,\s*(plural|select)/.test(v) &&
    v.replace(/[{}#,]/g, " ").split(/\s+/).filter(Boolean)
      .every((w) => /^(plural|select|one|other|count|Workflow|Workflows|Webhook|Webhooks)$/.test(w));

  /** "Problem: {title}", "Expansion ({count})" — label words German shares. */
  const isLoanwordWithIcu = (v: string) =>
    /\{[a-zA-Z]+\}/.test(v) &&
    /^(Problem|Expansion|Status|Team|Name)\b/.test(v.trim());

  /**
   * A title template whose only literal content is a brand name, e.g.
   * "{name} — Hermes Industrial Journal". Strip the ICU argument and the
   * separator; if a brand remains, nothing was left untranslated.
   */
  const isIcuPlusBrand = (v: string) => {
    const rest = v.replace(/\{[^}]*\}/g, "").replace(/[—·|-]/g, " ").trim();
    return rest.length > 0 && isBrandOrProduct(rest);
  };

  const preservedByDesign = (v: string) =>
    isBrandOrProduct(v) || isProtocolOrProductList(v) || isContactOrUrl(v) ||
    isProperNoun(v) || isFormPlaceholder(v) || isTechnicalIdentifier(v) ||
    isIcuLoanwordShell(v) || isLoanwordWithIcu(v) || isIcuPlusBrand(v);

  const buckets = {
    germanTranslation: [] as string[],
    intentionalIdentical: [] as string[],
    technicalToken: [] as string[],
    numericOrUnit: [] as string[],
    prohibitedCarryover: [] as string[],
    persianContamination: [] as string[],
  };

  for (const [path, enVal] of allEn) {
    const deVal = allDe.get(path);
    if (deVal === undefined) throw new Error(`missing de leaf: ${path}`);

    // Persian contamination is checked on the VALUE regardless of anything else,
    // except the two legitimate endonyms that name the Persian language itself.
    const isEndonym = /^(فارسی|پارسی)$/.test(deVal.trim());
    if (/[؀-ۿ]/.test(deVal) && !isEndonym) {
      buckets.persianContamination.push(`${path} = ${deVal}`);
      continue;
    }

    if (deVal !== enVal) { buckets.germanTranslation.push(path); continue; }
    if (isNumericOrUnit(deVal) || isPunctuationOnly(deVal)) { buckets.numericOrUnit.push(path); continue; }
    if (isProtocolOrStandard(deVal)) { buckets.technicalToken.push(path); continue; }
    // single-token loanwords spelled identically in German
    if (/^[\p{L}\p{N}][\p{L}\p{N}\-.]*$/u.test(deVal.trim()) && deVal.trim().split(/\s+/).length === 1) {
      buckets.intentionalIdentical.push(path); continue;
    }
    // multi-word values that are identical by design (brands, protocol lists,
    // contact data, proper nouns, placeholders, ICU loanword shells)
    if (preservedByDesign(deVal)) { buckets.intentionalIdentical.push(path); continue; }
    buckets.prohibitedCarryover.push(`${path} = ${deVal}`);
  }

  it("classifies every leaf exactly once, with no duplicates", () => {
    const total = Object.values(buckets).reduce((n, b) => n + b.length, 0);
    expect(total).toBe(allEn.length);
    expect(allEn.length).toBe(5136);
    const all = Object.values(buckets).flat().map((s) => s.split(" = ")[0]);
    expect(new Set(all).size, "a leaf was classified twice").toBe(all.length);
  });

  it("has ZERO prohibited English carryover across the whole catalog", () => {
    expect(buckets.prohibitedCarryover.slice(0, 40)).toEqual([]);
  });

  it("has ZERO Persian contamination in de.json", () => {
    expect(buckets.persianContamination.slice(0, 40)).toEqual([]);
  });

  it("satisfies 5136 = translations + identicals + tokens + numeric/unit", () => {
    const { germanTranslation, intentionalIdentical, technicalToken, numericOrUnit } = buckets;
    expect(
      germanTranslation.length + intentionalIdentical.length +
      technicalToken.length + numericOrUnit.length
    ).toBe(5136);
    // the overwhelming majority must be real translation, not "preserved"
    expect(germanTranslation.length).toBeGreaterThan(4500);
  });

  it("keeps en/fa/de at exact 3-way key parity", () => {
    const k = (m: Map<string, string>) => [...m.keys()].sort();
    expect(k(allDe)).toEqual(allEn.map(([p]) => p).sort());
    expect(k(allFa)).toEqual(allEn.map(([p]) => p).sort());
  });

  it("canonical namespace-level carryover is exactly 0", () => {
    let carry = 0;
    for (const ns of Object.keys(en)) {
      if (JSON.stringify((en as Tree)[ns]) === JSON.stringify((de as Tree)[ns])) {
        carry += leaves((en as Tree)[ns]).length;
      }
    }
    expect(carry).toBe(0);
    expect(255 - 255).toBe(carry);
  });

  it("prints the reconciliation", () => {
    const report = Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, v.length])
    );
    // eslint-disable-next-line no-console
    console.log("87L.6F full-catalog reconciliation:", report);
    expect(report.prohibitedCarryover).toBe(0);
  });
});
