import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";

/**
 * PHASE 87L.6D — German for the intelligence surfaces: Industrial Brain,
 * Copilot, Knowledge Engine, Knowledge Graph, Predictive Maintenance,
 * Knowledge Studio and the Brain report.
 *
 * `knowledge` (480 leaves) is deliberately NOT part of this wave: it is a
 * 30-article engineering REFERENCE LIBRARY (259 prose leaves incl. 30
 * safety-critical `safetyNote` entries), not UI labels. It is pinned below as
 * explicitly outstanding so the gap cannot be mistaken for an oversight.
 */

type Tree = Record<string, unknown>;

const TRANSLATED = [
  "brain", "copilot", "ke", "knowledgeGraph",
  "predictive", "knowledgeStudio", "industrialBrainReport",
] as const;

const LEAF_COUNTS: Record<string, number> = {
  brain: 118, copilot: 57, ke: 79, knowledgeGraph: 63,
  predictive: 111, knowledgeStudio: 52, industrialBrainReport: 9,
  knowledge: 480,
};

/** Acronyms, product names and vendor proper nouns that stay identical. */
const IDENTICAL_BY_DESIGN = new Set<string>([
  "brain.eyebrow",                        // Hermes Brain (product)
  "brain.domains.plc", "brain.domains.scada", "brain.domains.hmi",
  "brain.vendors.siemens", "brain.vendors.abb", "brain.vendors.schneider",
  "brain.vendors.phoenix", "brain.vendors.delta", "brain.vendors.mitsubishi",
  "brain.vendors.omron",
  "copilot.eyebrow", "copilot.title",     // product names
  "ke.evidence.types.article",            // "Artikel" — coincidentally close, kept explicit
  "knowledgeGraph.nodeIdPlaceholder", "knowledgeGraph.assetIdPlaceholder",
  "knowledgeGraph.failureModeIdPlaceholder", "knowledgeGraph.procedureIdPlaceholder",
  "predictive.evidence.tag",              // "Tag" — the data-point identifier, not the day
  "ke.articles.version",                  // "Version" — same word in German
  "knowledgeGraph.graphHealth.idempotent", // "Idempotent" — same word in German
  "knowledgeStudio.filters.status",       // "Status" — established German loanword
]);

function flatten(node: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Tree)) {
      const p = prefix ? `${prefix}.${k}` : k;
      for (const [kk, vv] of flatten(v, p)) out.set(kk, vv);
    }
  } else out.set(prefix, String(node));
  return out;
}
const icuArgs = (s: string) =>
  [...s.matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]).sort().join("|");

describe("87L.6D — exact wave arithmetic", () => {
  it("each translated namespace keeps its pinned leaf count in all three catalogs", () => {
    let total = 0;
    for (const ns of TRANSLATED) {
      for (const [name, cat] of [["en", en], ["fa", fa], ["de", de]] as const) {
        expect(flatten((cat as Tree)[ns]).size, `${name}.${ns}`).toBe(LEAF_COUNTS[ns]);
      }
      total += LEAF_COUNTS[ns];
    }
    expect(total, "translated this wave").toBe(489);
  });

  it("reconciles: translated + intentional-identical = every leaf, carryover = 0", () => {
    let translated = 0, identical = 0;
    const unapproved: string[] = [];
    for (const ns of TRANSLATED) {
      const e = flatten((en as Tree)[ns]), d = flatten((de as Tree)[ns]);
      for (const [k, ev] of e) {
        const key = `${ns}.${k}`;
        if (d.get(k) !== ev) { translated++; continue; }
        if (IDENTICAL_BY_DESIGN.has(key)) { identical++; continue; }
        unapproved.push(`${key} = ${JSON.stringify(ev)}`);
      }
    }
    expect(unapproved, "unapproved English carryover").toEqual([]);
    expect(translated + identical).toBe(489);
    expect(translated).toBeGreaterThan(450);
  });

  it("has zero Persian contamination and zero empty values", () => {
    for (const ns of TRANSLATED) {
      for (const [k, v] of flatten((de as Tree)[ns])) {
        expect(v.trim(), `${ns}.${k} empty`).not.toBe("");
        expect(/[؀-ۿ]/.test(v), `${ns}.${k} Persian`).toBe(false);
      }
    }
  });

  it("keeps ICU argument parity with en and fa on every translated leaf", () => {
    for (const ns of TRANSLATED) {
      const e = flatten((en as Tree)[ns]);
      const f = flatten((fa as Tree)[ns]);
      const d = flatten((de as Tree)[ns]);
      for (const [k, ev] of e) {
        expect(icuArgs(d.get(k)!), `de ${ns}.${k}`).toBe(icuArgs(ev));
        expect(icuArgs(f.get(k)!), `fa ${ns}.${k}`).toBe(icuArgs(ev));
      }
    }
  });

  it("`knowledge` is explicitly OUTSTANDING — 480 leaves still English", () => {
    // Pinned so the remaining gap is a documented decision, not a silent miss.
    // It is a 30-article engineering reference library, not UI labels.
    expect(JSON.stringify((de as Tree).knowledge)).toBe(JSON.stringify((en as Tree).knowledge));
    expect(flatten((en as Tree).knowledge).size).toBe(480);
    const articles = Object.keys((en as Tree).knowledge as Tree);
    expect(articles.length).toBe(30);
    // every article carries a safety note — the reason this needs native review
    for (const a of articles) {
      expect(((en as Tree).knowledge as Tree)[a], a).toHaveProperty("safetyNote");
    }
  });

  it("global carryover dropped from 1751 to exactly 1262", () => {
    const flat = (o: unknown): string[] =>
      o !== null && typeof o === "object"
        ? Object.values(o as Tree).flatMap(flat)
        : [String(o)];
    let carry = 0;
    for (const k of Object.keys(en)) {
      if (JSON.stringify((en as Tree)[k]) === JSON.stringify((de as Tree)[k])) {
        carry += flat((en as Tree)[k]).length;
      }
    }
    expect(carry).toBe(1262);
    expect(1751 - carry).toBe(489);
  });
});

describe("87L.6D — terminology contract", () => {
  const d = (ns: string) => flatten((de as Tree)[ns]);

  it("keeps Industrial Brain / Copilot as product names, never literal translations", () => {
    expect(d("brain").get("eyebrow")).toBe("Hermes Brain");
    expect(d("copilot").get("title")).toBe("Industrial Copilot");
    // never a literal "Industrielles Gehirn"
    for (const ns of TRANSLATED) {
      for (const [k, v] of d(ns)) expect(/Gehirn/i.test(v), `${ns}.${k}`).toBe(false);
    }
  });

  it("uses the pinned reasoning terms", () => {
    const b = d("brain"), c = d("copilot"), k = d("ke"), g = d("knowledgeGraph");
    expect(b.get("rootCause.title")).toBe("Grundursachenanalyse");
    expect(b.get("rootCause.primaryLabel")).toBe("Primärursache");
    expect(b.get("pipelineSteps.causeAnalysis")).toBe("Ursachenanalyse");
    expect(b.get("sections.confidence")).toBe("Konfidenz");
    expect(c.get("report.evidence")).toBe("Stützende Evidenz");
    expect(k.get("evidence.title")).toBe("Stützende Evidenz");
    expect(k.get("failures.title")).toContain("Ausfallarten");
    expect(g.get("title")).toBe("Wissensgraph");
    expect(g.get("nodes")).toBe("Knoten");
    expect(g.get("edges")).toBe("Kanten");
  });

  it("uses the pinned predictive terms and never overstates certainty", () => {
    const p = d("predictive");
    expect(p.get("title")).toBe("Prädiktive Instandhaltung");
    expect(p.get("remainingUsefulLife.title")).toContain("Restnutzungsdauer");
    expect(p.get("failureProbability.title")).toBe("Ausfallwahrscheinlichkeit");
    expect(p.get("degradation.title")).toBe("Degradationsanalyse");
    // probability stays probability — no "wird ausfallen" style certainty
    for (const [k, v] of p) {
      expect(/\bwird (?:ausfallen|versagen)\b/i.test(v), `${k} asserts certainty`).toBe(false);
    }
  });

  it("uses Instandhaltung, never a blanket Wartung, across the wave", () => {
    for (const ns of TRANSLATED) {
      for (const [k, v] of d(ns)) {
        expect(/\bWartung\b/.test(v), `${ns}.${k} uses Wartung`).toBe(false);
      }
    }
  });

  it("preserves protected acronyms and vendor names verbatim", () => {
    const b = d("brain");
    for (const [key, token] of [
      ["domains.plc", "PLC"], ["domains.scada", "SCADA"], ["domains.hmi", "HMI"],
      ["vendors.siemens", "Siemens"], ["vendors.omron", "Omron"],
    ] as const) expect(b.get(key)).toBe(token);
    expect(d("predictive").get("remainingUsefulLife.title")).toContain("RUL");
    expect(d("brain").get("examples.e1")).toContain("VFD");
    expect(d("brain").get("examples.e2")).toContain("mA");
    expect(d("knowledgeGraph").get("nodeIdPlaceholder")).toBe("IndustrialKnowledgeGraphNode.id");
  });

  it("uses formal address only — no informal du/dein", () => {
    const INFORMAL = /\b(du|dein|deine|deiner|deinem|deinen|dich|dir|euch|euer|eure)\b/i;
    for (const ns of TRANSLATED) {
      for (const [k, v] of d(ns)) expect(INFORMAL.test(v), `${ns}.${k}`).toBe(false);
    }
  });
});

describe("87L.6D — safety language preservation (§12)", () => {
  const b = flatten((de as Tree).brain);
  const c = flatten((de as Tree).copilot);
  const k = flatten((de as Tree).ke);
  const p = flatten((de as Tree).predictive);

  it("electrical safety keeps de-energize, LOTO, prove-dead and qualified personnel", () => {
    const s = b.get("safety.electrical")!;
    expect(s).toContain("Freischalten");
    expect(s).toContain("LOTO");
    expect(s).toContain("Spannungsfreiheit");
    expect(s).toMatch(/qualifiziertem Personal/);
  });

  it("mechanical safety keeps isolation and the never-bypass-guards rule", () => {
    const s = b.get("safety.mechanical")!;
    expect(s).toContain("Lockout/Tagout");
    expect(s).toMatch(/niemals überbrücken/);
    expect(s).toContain("Sicherheitsverriegelungen");
  });

  it("the guardrail refusal stays a refusal — it never becomes advice", () => {
    const s = b.get("guardrails.safetyBypass")!;
    expect(s).toMatch(/gibt keine Anleitung/);
    expect(s).toMatch(/Verletzungen und Todesfälle/);
    expect(s).toContain("Sicherheitsfachkraft");
  });

  it("the analysis-only boundary survives translation in Brain and Copilot", () => {
    expect(b.get("lede")).toMatch(/steuert keine Anlagen/);
    expect(b.get("approvalNote")).toMatch(/Freigabe durch eine qualifizierte/);
    expect(b.get("approvalNote")).toMatch(/kein Befehl an eine Maschine/);
    expect(c.get("subtitle")).toMatch(/nur lesend/);
    expect(c.get("safetyReadOnly")).toMatch(/keine Steuerbefehle/);
    expect(c.get("blocked")).toMatch(/kann keine Befehle ausführen/);
    expect(k.get("safetyBanner")).toMatch(/NUR LESEND/);
    expect(p.get("safetyBanner")).toMatch(/NUR LESEN \/ ANALYSIEREN/);
  });

  it("uncertainty and insufficiency stay explicit, never smoothed away", () => {
    expect(b.get("unknown.assessment")).toMatch(/Unzureichende Informationen/);
    expect(c.get("insufficientData")).toMatch(/nicht genügend industrielle Daten/);
    expect(c.get("report.lowConfidenceNote")).toMatch(/nicht als Schlussfolgerung/);
    expect(p.get("insufficientData.banner")).toMatch(/Noch nicht genügend Daten/);
    expect(flatten((de as Tree).industrialBrainReport).get("disclaimerNotCertified"))
      .toBe("Kein zertifizierter Sicherheitsbericht");
  });

  it("no unsafe imperative toward machinery is introduced anywhere in the wave", () => {
    // German imperatives that would read as a command to act on equipment
    const UNSAFE = /\b(überbrücken Sie|deaktivieren Sie die Sicherheit|umgehen Sie die Verriegelung|schalten Sie die Sicherheit)/i;
    for (const ns of TRANSLATED) {
      for (const [key, v] of flatten((de as Tree)[ns])) {
        expect(UNSAFE.test(v), `${ns}.${key}`).toBe(false);
      }
    }
  });
});

describe("87L.6D — enum/status labels and mobile safety", () => {
  it("every status family stays internally distinct", () => {
    const FAMILIES = [
      ["brain", "confidenceLevels"], ["brain", "risk"], ["brain", "domains"],
      ["copilot", "confidence"],
      ["ke", "failures.severity"], ["ke", "confidence"], ["ke", "sourceType"],
      ["ke", "articles.status"], ["ke", "procedures.approvalStatus"],
      ["ke", "engineeringCases.status"], ["ke", "evidence.types"],
      ["predictive", "confidence"], ["predictive", "degradation.classes"],
      ["predictive", "recommendations.priorities"], ["predictive", "recommendations.types"],
      ["knowledgeStudio", "metrics"],
    ] as const;
    for (const [ns, sub] of FAMILIES) {
      const tree = sub.split(".").reduce<Tree>((o, s) => o[s] as Tree, (de as Tree)[ns] as Tree);
      const values = Object.values(tree as Record<string, string>);
      expect(new Set(values).size, `${ns}.${sub} duplicates`).toBe(values.length);
    }
  });

  it("keeps the draft → review → approved/published → archived distinctions", () => {
    const k = flatten((de as Tree).ke), s = flatten((de as Tree).knowledgeStudio);
    expect(k.get("articles.status.draft")).toBe("Entwurf");
    expect(k.get("articles.status.review")).toBe("In Prüfung");
    expect(k.get("articles.status.published")).toBe("Veröffentlicht");
    expect(k.get("procedures.approvalStatus.approved")).toBe("Freigegeben");
    expect(s.get("queue.statusDraft")).toBe("Entwurf");
    expect(s.get("queue.statusPublished")).toBe("Veröffentlicht");
  });

  it("chip-grade labels stay inside the 320px budget", () => {
    const SHORT = [
      ["brain", "confidenceLevels"], ["brain", "risk"], ["brain", "domains"],
      ["copilot", "confidence"], ["ke", "failures.severity"],
      ["predictive", "degradation.classes"],
    ] as const;
    for (const [ns, sub] of SHORT) {
      const tree = sub.split(".").reduce<Tree>((o, s) => o[s] as Tree, (de as Tree)[ns] as Tree);
      for (const [k, v] of Object.entries(tree as Record<string, string>)) {
        expect(v.length, `${ns}.${sub}.${k} = "${v}"`).toBeLessThanOrEqual(28);
      }
    }
  });

  it("FA and EN are untouched by this wave", () => {
    expect(flatten((fa as Tree).brain).get("domains.plc")).toBe("PLC");
    expect(flatten((en as Tree).brain).get("eyebrow")).toBe("Hermes Brain");
    // fa still carries Persian for a translated-in-fa key
    expect(flatten((fa as Tree).predictive).get("title")).toMatch(/[؀-ۿ]/);
  });
});
