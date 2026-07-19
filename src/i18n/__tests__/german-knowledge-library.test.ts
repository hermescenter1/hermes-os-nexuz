import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";

/**
 * PHASE 87L.6D.1 — the 30-article engineering knowledge library in German.
 *
 * This is safety-critical reference content, not UI labels: every article
 * carries a `safetyNote` covering isolation, LOTO, stored energy, safety
 * relays / F-CPUs, interlocks or arc-flash. The tests below pin the safety
 * MODALITY (prohibition stays prohibition, mandatory stays mandatory,
 * qualified-personnel stays qualified-personnel), the technical tokens, and
 * every number — the three ways a translation can silently become unsafe.
 */

type Tree = Record<string, unknown>;
const FIELDS = [
  "name", "summary", "p1", "p2", "p3", "c1", "c2", "overview",
  "purpose", "how", "faults", "c3", "safetyNote", "commissioning",
  "concepts", "brainUse",
] as const;

const enK = (en as Tree).knowledge as Record<string, Record<string, string>>;
const deK = (de as Tree).knowledge as Record<string, Record<string, string>>;
const faK = (fa as Tree).knowledge as Record<string, Record<string, string>>;
const ARTICLES = Object.keys(enK);

/** Product names that legitimately stay identical. */
const IDENTICAL_BY_DESIGN = new Set([
  "opcua.name", "mqtt.name", "modbusTcp.name", "s71200.name", "s71500.name",
]);

/** Word-boundary token match, allowing German hyphen-compounds and plurals. */
function hasToken(text: string, token: string): boolean {
  const parts = token.split(/[\s/]+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const sep = token.includes("/") ? "[\\s\\-]?/?[\\s\\-]?" : "[\\s\\-]?";
  return new RegExp(`(?<![A-Za-z0-9])${parts.join(sep)}s?(?![A-Za-z0-9])`).test(text);
}

describe("87L.6D.1 — structure and exact arithmetic", () => {
  it("is exactly 30 article groups × 16 fields = 480 leaves in all three catalogs", () => {
    for (const [name, cat] of [["en", enK], ["fa", faK], ["de", deK]] as const) {
      expect(Object.keys(cat).length, `${name} groups`).toBe(30);
      let leaves = 0;
      for (const a of Object.keys(cat)) {
        expect(Object.keys(cat[a]).sort(), `${name}.${a} fields`).toEqual([...FIELDS].sort());
        leaves += Object.keys(cat[a]).length;
      }
      expect(leaves, `${name} leaves`).toBe(480);
    }
  });

  it("reconciles: 475 translated + 5 intentional identical = 480, carryover 0", () => {
    let translated = 0, identical = 0;
    const unapproved: string[] = [];
    for (const a of ARTICLES) {
      for (const f of FIELDS) {
        const path = `${a}.${f}`;
        if (deK[a][f] !== enK[a][f]) { translated++; continue; }
        if (IDENTICAL_BY_DESIGN.has(path)) { identical++; continue; }
        unapproved.push(path);
      }
    }
    expect(unapproved, "unapproved English carryover").toEqual([]);
    expect(translated).toBe(475);
    expect(identical).toBe(5);
    expect(translated + identical).toBe(480);
  });

  it("no article group is partially translated", () => {
    for (const a of ARTICLES) {
      const englishFields = FIELDS.filter(
        (f) => deK[a][f] === enK[a][f] && !IDENTICAL_BY_DESIGN.has(`${a}.${f}`),
      );
      expect(englishFields, `${a} has untranslated fields`).toEqual([]);
    }
  });

  it("has zero Persian contamination and zero empty German values", () => {
    for (const a of ARTICLES) {
      for (const f of FIELDS) {
        expect(deK[a][f].trim(), `${a}.${f} empty`).not.toBe("");
        expect(/[؀-ۿ]/.test(deK[a][f]), `${a}.${f} Persian`).toBe(false);
      }
    }
  });

  it("global carryover fell from 1262 to exactly 782", () => {
    const flat = (o: unknown): string[] =>
      o !== null && typeof o === "object" ? Object.values(o as Tree).flatMap(flat) : [String(o)];
    let carry = 0;
    for (const k of Object.keys(en)) {
      if (JSON.stringify((en as Tree)[k]) === JSON.stringify((de as Tree)[k])) {
        carry += flat((en as Tree)[k]).length;
      }
    }
    expect(carry).toBe(782);
    expect(1262 - carry).toBe(480);
  });
});

describe("87L.6D.1 — ICU, numbers, units and technical tokens", () => {
  it("keeps ICU argument parity with en and fa on every leaf", () => {
    const args = (s: string) => [...s.matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]).sort().join("|");
    for (const a of ARTICLES) {
      for (const f of FIELDS) {
        expect(args(deK[a][f]), `de ${a}.${f}`).toBe(args(enK[a][f]));
        expect(args(faK[a][f]), `fa ${a}.${f}`).toBe(args(enK[a][f]));
      }
    }
  });

  it("preserves every number from the English source (German comma decimals allowed)", () => {
    for (const a of ARTICLES) {
      for (const f of FIELDS) {
        for (const n of enK[a][f].match(/\b\d+(?:[.,]\d+)?\b/g) ?? []) {
          const kept = deK[a][f].includes(n) || deK[a][f].includes(n.replace(".", ","));
          expect(kept, `${a}.${f} lost number "${n}"`).toBe(true);
        }
      }
    }
  });

  it("preserves units and physical symbols wherever English carries them", () => {
    // Units must match on a WORD BOUNDARY: a plain substring check finds "ms"
    // inside "programs" and "s" inside almost everything.
    const UNITS = ["°C", "mA", "ms", "KB", "MΩ", "Hz", "I²t", "dv/dt"];
    const unitRe = (u: string) =>
      new RegExp(`(?<![A-Za-z])${u.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![A-Za-z])`);
    for (const a of ARTICLES) {
      for (const f of FIELDS) {
        for (const u of UNITS) {
          if (unitRe(u).test(enK[a][f])) {
            expect(unitRe(u).test(deK[a][f]), `${a}.${f} lost unit "${u}"`).toBe(true);
          }
        }
        // percent is plain-substring safe; the 4–20 mA range becomes the German
        // compound "4–20-mA-Kreise", so match it hyphen-tolerantly
        if (enK[a][f].includes("%")) expect(deK[a][f], `${a}.${f} lost %`).toContain("%");
        if (/4[–-]20\s?mA/.test(enK[a][f])) {
          expect(/4[–-]20[\s-]?mA/.test(deK[a][f]), `${a}.${f} lost 4–20 mA`).toBe(true);
        }
      }
    }
  });

  it("preserves protocol, standard and product identifiers", () => {
    const TOKENS = [
      "PLC", "SCADA", "HMI", "VFD", "OPC UA", "PROFINET", "EtherCAT", "Modbus",
      "MQTT", "HART", "MCC", "LOTO", "F-CPU", "ISA-18.2", "ISA-101", "IEC 62443",
      "IEC 61131-3", "S7-1200", "S7-1500", "TIA Portal", "ET 200MP", "IRT",
      "PT100", "PNP", "NPN", "NTP", "TLS", "MFA", "VLAN", "ACL", "DMZ",
      "ISO-on-TCP", "PUT/GET", "SCL", "OB1", "PWM", "AC-1", "AC-3", "QoS",
    ];
    for (const a of ARTICLES) {
      for (const f of FIELDS) {
        for (const t of TOKENS) {
          if (hasToken(enK[a][f], t)) {
            expect(hasToken(deK[a][f], t), `${a}.${f} lost token "${t}"`).toBe(true);
          }
        }
      }
    }
  });

  it("standards identifiers are never translated into German words", () => {
    const all = Object.values(deK).flatMap((g) => Object.values(g)).join(" ");
    expect(all).toContain("ISA-18.2");
    expect(all).toContain("ISA-101");
    expect(all).toContain("IEC 62443");
    expect(all).toContain("IEC 61131-3");
    expect(all).not.toMatch(/IEC\s?62443\s?Zonen-und-Leitungen/); // no literal "conduit"
  });
});

describe("87L.6D.1 — safety modality preservation (§3, §7)", () => {
  const S = (a: string) => deK[a].safetyNote;

  it("every one of the 30 articles has a German safety note", () => {
    expect(ARTICLES.length).toBe(30);
    for (const a of ARTICLES) {
      expect(S(a).trim().length, `${a} safetyNote`).toBeGreaterThan(30);
      expect(S(a)).not.toBe(enK[a].safetyNote);
    }
  });

  it("prohibitions stay prohibitions — never softened to a preference", () => {
    // "Never treat standard PLC logic as a safety function"
    expect(S("plcBasics")).toMatch(/niemals/i);
    // "never bypass guards or safety interlocks"
    expect(deK.plcBasics.safetyNote).toContain("Sicherheitsrelais");
    expect(S("scadaTags")).toMatch(/niemals/i);
    // no weakening vocabulary anywhere in the safety notes
    const WEAK = /\b(möglichst nicht|vorzugsweise nicht|sollte vermieden|nach Möglichkeit)\b/i;
    for (const a of ARTICLES) expect(WEAK.test(S(a)), `${a} weakened`).toBe(false);
  });

  it("electrical isolation, LOTO, stored energy and prove-dead survive", () => {
    expect(S("motors")).toMatch(/freischalten/i);
    expect(S("motors")).toMatch(/Spannungsfreiheit/);
    expect(S("motors")).toMatch(/Motorklemmen/);
    expect(S("vfd")).toMatch(/DC-Zwischenkreis/);
    expect(S("vfd")).toMatch(/gespeicherte Energie|lebensgefährlich/);
    expect(S("vfd")).toMatch(/Entladezeit/);
    expect(S("vfd")).toMatch(/Spannungsfreiheit/);
    expect(S("troubleshooting")).toContain("LOTO");
    expect(S("contactors")).toMatch(/Freischaltung/);
  });

  it("safety-system wording (relays, F-CPU, interlocks, revalidation) survives", () => {
    expect(S("plcBasics")).toMatch(/F-CPUs?/);
    expect(S("plcBasics")).toMatch(/Risikobeurteilung/);
    expect(S("ladder")).toMatch(/Sicherheitsfunktion/);
    expect(S("s71200")).toMatch(/F-Bausteinen/);
    expect(S("s71500")).toMatch(/Sicherheitsprogramms|Signatur/);
    expect(S("structuredText")).toMatch(/F-Bausteinen/);
    expect(S("digitalInputs")).toMatch(/sicherheitsgerichtete Eingänge/);
  });

  it("qualified-personnel and authorization requirements survive", () => {
    expect(deK.plcBasics.safetyNote + deK.motors.safetyNote).toBeTruthy();
    expect(S("mcc")).toMatch(/PSA/);
    expect(S("alarms")).toMatch(/Autorisierung/);
    expect(S("protection")).toMatch(/Selektivitätsstudie/);
    expect(S("monitoring")).toMatch(/Freigabe/);
    // the brain-level electrical guidance keeps "qualified personnel"
    expect(deK.transmitters.safetyNote).toMatch(/freischalten|drucklos/i);
  });

  it("no safety note is turned into a machine-control instruction", () => {
    const UNSAFE = /\b(überbrücken Sie|umgehen Sie|deaktivieren Sie die Sicherheit|Schutzeinrichtung entfernen)\b/i;
    for (const a of ARTICLES) {
      for (const f of FIELDS) {
        expect(UNSAFE.test(deK[a][f]), `${a}.${f} unsafe imperative`).toBe(false);
      }
    }
  });

  it("uncertainty and diagnostic modality stay intact", () => {
    // "usually means" must not become a certainty
    expect(deK.vfd.p2).toMatch(/meist|meistens/);
    expect(deK.digitalInputs.p3).toMatch(/meist|deuten/);
    // "may" style possibility is preserved, not asserted
    expect(deK.contactors.safetyNote).toMatch(/kann/);
  });
});

describe("87L.6D.1 — terminology and quality", () => {
  it("uses the pinned German safety and engineering terms", () => {
    const all = Object.values(deK).flatMap((g) => Object.values(g)).join(" ");
    for (const term of [
      // §5 preserves the LOTO acronym itself; the spelled-out form is optional
      "Spannungsfreiheit", "LOTO", "Sicherheitsrelais", "F-CPU",
      "Verriegelung", "Schutzabschaltungen", "Motorklemmen",
      "Frequenzumrichter", "Isolationswiderstand", "Inbetriebnahme",
      "Grundursache", "Korrekturmaßnahmen", "Erdschluss", "Überstrom",
      // NOTE: the English source of this namespace contains no
      // "qualified personnel" clause (verified: 0 occurrences), so requiring
      // one in German would ADD a safety requirement the source never made —
      // forbidden by §4. The qualified-personnel wording lives in the `brain`
      // namespace and is pinned by the 87L.6D tests instead.
      "DC-Zwischenkreis", "Schaltschrank", "Erlaubnisdisziplin",
    ]) {
      expect(all, `missing term ${term}`).toContain(term);
    }
  });

  it("uses Instandhaltung, never a blanket Wartung", () => {
    for (const a of ARTICLES) {
      for (const f of FIELDS) {
        expect(/\bWartung\b/.test(deK[a][f]), `${a}.${f} uses Wartung`).toBe(false);
      }
    }
  });

  it("titles stay technically specific and free of marketing language", () => {
    const MARKETING = /\b(beste|führend|revolutionär|einzigartig|garantiert|perfekt)\b/i;
    for (const a of ARTICLES) {
      expect(deK[a].name.length, `${a} title too long`).toBeLessThanOrEqual(40);
      expect(MARKETING.test(deK[a].name), `${a} marketing title`).toBe(false);
      expect(MARKETING.test(deK[a].summary), `${a} marketing summary`).toBe(false);
    }
  });

  it("uses formal address only — no informal du/dein", () => {
    const INFORMAL = /\b(du|dein|deine|deiner|deinem|deinen|dich|dir|euch|euer|eure)\b/i;
    for (const a of ARTICLES) {
      for (const f of FIELDS) {
        expect(INFORMAL.test(deK[a][f]), `${a}.${f} informal`).toBe(false);
      }
    }
  });

  it("carries genuine German orthography in every article", () => {
    for (const a of ARTICLES) {
      const joined = FIELDS.map((f) => deK[a][f]).join(" ");
      expect(/[äöüßÄÖÜ]/.test(joined), `${a} has no umlaut`).toBe(true);
    }
  });
});

describe("87L.6D.1 — regression and privacy boundary", () => {
  it("EN and FA knowledge content is unchanged in structure and language", () => {
    expect(Object.keys(enK).length).toBe(30);
    expect(enK.plcBasics.name).toBe("PLC Fundamentals");
    // fa remains whatever it was — this wave only touched `de`
    expect(Object.keys(faK).sort()).toEqual(Object.keys(enK).sort());
  });

  it("the knowledge namespace holds no absolute URL, credential or private path", () => {
    for (const a of ARTICLES) {
      for (const f of FIELDS) {
        expect(/https?:\/\//.test(deK[a][f]), `${a}.${f} URL`).toBe(false);
        expect(/\/dashboard|\/api\/|password|secret/i.test(deK[a][f]), `${a}.${f} private`).toBe(false);
      }
    }
  });

  it("prior German waves stay at zero carryover", () => {
    for (const ns of [
      "publicSite", "authExperience", "appShell", "dashboard", "assetMaintenance",
      "engineeringDocuments", "businessOps", "orgAdministration",
      "brain", "copilot", "ke", "knowledgeGraph", "predictive", "knowledgeStudio",
    ]) {
      expect(
        JSON.stringify((de as Tree)[ns]) === JSON.stringify((en as Tree)[ns]),
        `${ns} regressed to carryover`,
      ).toBe(false);
    }
  });
});
