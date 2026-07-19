import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";

/**
 * PHASE 87L.6C — German for the command and industrial-operations surfaces:
 * dashboard, assetMaintenance, engineeringDocuments, businessOps and
 * orgAdministration. Pins the exact arithmetic, the terminology decisions from
 * docs/i18n/german-glossary.md, ICU parity, and the private-indexing boundary.
 */

type Tree = Record<string, unknown>;
const TARGETS = [
  "dashboard", "assetMaintenance", "engineeringDocuments",
  "businessOps", "orgAdministration",
] as const;

/** Exact leaf counts pinned at the start of this wave. */
const LEAF_COUNTS: Record<(typeof TARGETS)[number], number> = {
  dashboard: 183,
  assetMaintenance: 141,
  engineeringDocuments: 76,
  businessOps: 63,
  orgAdministration: 86,
};

/**
 * Values that legitimately stay identical to English — acronyms, protocol and
 * product names, and words spelled the same in German. Anything NOT listed
 * here must differ from its English counterpart.
 */
const IDENTICAL_BY_DESIGN = new Set<string>([
  // dashboard — acronyms and loanwords standard in German industry
  "dashboard.overview.oee", "dashboard.kpi.oee",
  "dashboard.panels.plc", "dashboard.panels.scada",
  "dashboard.status.online", "dashboard.status.offline",
  "dashboard.status.ok",                       // "Normal" is the same word in German
  "dashboard.networkP.online", "dashboard.exec.status.online",
  "dashboard.exec.status.knowledgeCloud", "dashboard.exec.status.phase2",
  "dashboard.scadaP.servers", "dashboard.severity.medium",
  "dashboard.command.assetHealth.medium",
  // assetMaintenance
  "assetMaintenance.reliability.mtbf", "assetMaintenance.reliability.mttr",
  "assetMaintenance.reliability.hours",
  "assetMaintenance.assetType.PLC", "assetMaintenance.assetType.HMI",
  "assetMaintenance.assetType.VFD", "assetMaintenance.assetType.MOTOR",
  "assetMaintenance.assetType.SENSOR", "assetMaintenance.assetType.ROBOT",
  "assetMaintenance.assetType.COMPRESSOR",
  "assetMaintenance.criticality.MEDIUM", "assetMaintenance.maintenancePriority.MEDIUM",
  // engineeringDocuments
  "engineeringDocuments.docType.PID", "engineeringDocuments.docType.FAT",
  "engineeringDocuments.docType.SAT",
  "engineeringDocuments.revisionType.MAJOR", "engineeringDocuments.revisionType.MINOR",
  "engineeringDocuments.revisionType.PATCH",
  // orgAdministration
  "orgAdministration.header.eyebrow",          // Administration
  "orgAdministration.role.ADMIN", "orgAdministration.role.MANAGER",
  "orgAdministration.fields.limit",
  "orgAdministration.subscriptionStatus.ACTIVE", // Aktiv? no — see assertion
]);

function flatten(node: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Tree)) {
      const p = prefix ? `${prefix}.${k}` : k;
      for (const [kk, vv] of flatten(v, p)) out.set(kk, vv);
    }
  } else {
    out.set(prefix, String(node));
  }
  return out;
}
const icuArgs = (s: string) =>
  [...s.matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]).sort().join("|");

describe("87L.6C — exact namespace arithmetic", () => {
  it("each target namespace has its pinned leaf count in all three catalogs", () => {
    let total = 0;
    for (const ns of TARGETS) {
      const e = flatten((en as Tree)[ns]);
      expect(e.size, `${ns} leaf count`).toBe(LEAF_COUNTS[ns]);
      expect(flatten((fa as Tree)[ns]).size, `${ns} fa`).toBe(LEAF_COUNTS[ns]);
      expect(flatten((de as Tree)[ns]).size, `${ns} de`).toBe(LEAF_COUNTS[ns]);
      total += e.size;
    }
    expect(total).toBe(549);
  });

  it("reconciles: translated + intentional-identical = every leaf, carryover = 0", () => {
    let translated = 0, identical = 0;
    const unapproved: string[] = [];
    for (const ns of TARGETS) {
      const e = flatten((en as Tree)[ns]), d = flatten((de as Tree)[ns]);
      for (const [k, ev] of e) {
        const dv = d.get(k)!;
        const key = `${ns}.${k}`;
        if (dv !== ev) { translated++; continue; }
        if (IDENTICAL_BY_DESIGN.has(key)) { identical++; continue; }
        // an identical single word that is genuinely the same in German is
        // still an unapproved carryover unless allowlisted
        unapproved.push(`${key} = ${JSON.stringify(ev)}`);
      }
    }
    expect(unapproved, "unapproved English carryover").toEqual([]);
    expect(translated + identical).toBe(549);
    expect(translated).toBeGreaterThan(500);
  });

  it("has zero Persian contamination and zero empty values in the German targets", () => {
    for (const ns of TARGETS) {
      for (const [k, v] of flatten((de as Tree)[ns])) {
        expect(v.trim(), `${ns}.${k} empty`).not.toBe("");
        expect(/[؀-ۿ]/.test(v), `${ns}.${k} Persian`).toBe(false);
      }
    }
  });

  it("keeps ICU argument parity with en and fa on every target leaf", () => {
    for (const ns of TARGETS) {
      const e = flatten((en as Tree)[ns]);
      const f = flatten((fa as Tree)[ns]);
      const d = flatten((de as Tree)[ns]);
      for (const [k, ev] of e) {
        expect(icuArgs(d.get(k)!), `de ${ns}.${k}`).toBe(icuArgs(ev));
        expect(icuArgs(f.get(k)!), `fa ${ns}.${k}`).toBe(icuArgs(ev));
      }
    }
  });
});

describe("87L.6C — glossary terminology decisions", () => {
  const d = (ns: string) => flatten((de as Tree)[ns]);

  it("uses Instandhaltung, never a blanket 'Wartung'", () => {
    const am = d("assetMaintenance");
    expect(am.get("cmms.eyebrow")).toBe("Instandhaltung");
    expect(am.get("actions.plans")).toBe("Instandhaltungspläne");
    expect(am.get("assetStatus.UNDER_MAINTENANCE")).toBe("In Instandhaltung");
    for (const [k, v] of am) {
      expect(/\bWartung\b/.test(v), `${k} uses Wartung`).toBe(false);
    }
  });

  it("uses the pinned industrial terms across modules", () => {
    const am = d("assetMaintenance"), ed = d("engineeringDocuments"), bo = d("businessOps");
    expect(am.get("assets.eyebrow")).toBe("Anlagenregister");
    expect(am.get("actions.workOrders")).toBe("Arbeitsaufträge");
    expect(am.get("sections.failures")).toBe("Aktuelle Ausfallmeldungen");
    expect(ed.get("distinction.controlled")).toContain("Gelenktes Engineering-Dokument");
    expect(ed.get("approvalStatus.APPROVED")).toBe("Freigegeben");
    expect(ed.get("fields.site")).toBe("Standort");
    expect(bo.get("groups.workOrders")).toBe("Arbeitsaufträge");
    expect(bo.get("status.approval.PENDING")).toBe("Ausstehend");
  });

  it("keeps protected acronyms and protocol names verbatim", () => {
    const am = d("assetMaintenance"), ed = d("engineeringDocuments"), db = d("dashboard");
    for (const [map, key, token] of [
      [am, "reliability.mtbf", "MTBF"], [am, "reliability.mttr", "MTTR"],
      [am, "assetType.PLC", "PLC"], [am, "assetType.HMI", "HMI"],
      [am, "assetType.VFD", "VFD"], [ed, "docType.PID", "P&ID"],
      [ed, "docType.FAT", "FAT"], [ed, "docType.SAT", "SAT"],
    ] as const) {
      expect((map as Map<string, string>).get(key)).toBe(token);
    }
    expect(am.get("assetType.MCC_PANEL")).toContain("MCC");
    expect(ed.get("docType.PLC_PROGRAM")).toContain("PLC");
    expect(db.get("panels.scada")).toBe("SCADA-Status");
    expect(db.get("networkP.ids")).toBe("Angriffserkennung");
  });

  it("uses formal address only — no informal du/dein anywhere in the wave", () => {
    const INFORMAL = /\b(du|dein|deine|deiner|deinem|deinen|dich|dir|euch|euer|eure)\b/i;
    for (const ns of TARGETS) {
      for (const [k, v] of flatten((de as Tree)[ns])) {
        expect(INFORMAL.test(v), `${ns}.${k} informal`).toBe(false);
      }
    }
  });

  it("carries genuine German orthography (umlauts/ß) in every target namespace", () => {
    for (const ns of TARGETS) {
      const values = [...flatten((de as Tree)[ns]).values()];
      expect(values.some((v) => /[äöüßÄÖÜ]/.test(v)), `${ns} has no umlaut`).toBe(true);
    }
  });
});

describe("87L.6C — enum/status coverage and semantic distinctions", () => {
  it("every enum FAMILY is internally distinct — no two members share a label", () => {
    // Distinctness is a within-family property. Across families the same word
    // is often correct German: an overdue maintenance task and a past-due
    // subscription are both "Überfällig", and that is the right translation
    // for each — collapsing them would be the bug, not sharing the word.
    const FAMILIES = [
      ["assetMaintenance", "assetStatus"], ["assetMaintenance", "criticality"],
      ["assetMaintenance", "risk"], ["assetMaintenance", "maintenanceStatus"],
      ["assetMaintenance", "maintenancePriority"], ["assetMaintenance", "lifecycle"],
      ["assetMaintenance", "assetType"],
      ["engineeringDocuments", "status"], ["engineeringDocuments", "approvalStatus"],
      ["engineeringDocuments", "docType"],
      ["businessOps", "status.project"], ["businessOps", "status.task"],
      ["businessOps", "status.workOrder"], ["businessOps", "status.approval"],
      ["orgAdministration", "memberStatus"], ["orgAdministration", "invitationStatus"],
      ["orgAdministration", "subscriptionStatus"], ["orgAdministration", "role"],
      ["dashboard", "severity"], ["dashboard", "status"],
    ] as const;
    for (const [ns, sub] of FAMILIES) {
      const tree = sub.split(".").reduce<Tree>((o, k) => o[k] as Tree, (de as Tree)[ns] as Tree);
      const values = Object.values(tree as Record<string, string>);
      expect(new Set(values).size, `${ns}.${sub} has duplicate labels`).toBe(values.length);
    }
  });

  it("keeps the required semantic distinctions from collapsing", () => {
    const am = flatten((de as Tree).assetMaintenance);
    const ed = flatten((de as Tree).engineeringDocuments);
    const oa = flatten((de as Tree).orgAdministration);
    // in-service vs out-of-service, healthy vs at-risk vs critical,
    // approved vs rejected vs archived, active vs suspended
    expect(am.get("assetStatus.IN_SERVICE")).not.toBe(am.get("assetStatus.DECOMMISSIONED"));
    expect(am.get("risk.HEALTHY")).not.toBe(am.get("risk.AT_RISK"));
    expect(am.get("risk.AT_RISK")).not.toBe(am.get("risk.CRITICAL"));
    expect(ed.get("status.APPROVED")).not.toBe(ed.get("status.REJECTED"));
    expect(ed.get("status.ARCHIVED")).not.toBe(ed.get("status.OBSOLETE"));
    expect(oa.get("memberStatus.ACTIVE")).not.toBe(oa.get("memberStatus.SUSPENDED"));
    // warning must never read as critical
    expect(flatten((de as Tree).dashboard).get("status.warning"))
      .not.toBe(flatten((de as Tree).dashboard).get("severity.critical"));
  });

  it("keeps enum KEYS untouched — only display labels changed", () => {
    for (const ns of ["assetMaintenance", "engineeringDocuments", "businessOps", "orgAdministration"] as const) {
      expect([...flatten((de as Tree)[ns]).keys()].sort())
        .toEqual([...flatten((en as Tree)[ns]).keys()].sort());
    }
  });
});

describe("87L.6C — mobile safety and private-indexing boundary", () => {
  it("navigation-grade labels stay short enough for a 320px sidebar", () => {
    // status chips, KPI captions and enum labels render in narrow columns —
    // cap them so a German compound cannot blow out a mobile card
    const SHORT_TREES = [
      ["assetMaintenance", "assetStatus"], ["assetMaintenance", "criticality"],
      ["assetMaintenance", "risk"], ["assetMaintenance", "maintenancePriority"],
      ["engineeringDocuments", "approvalStatus"], ["engineeringDocuments", "revisionType"],
      ["orgAdministration", "memberStatus"], ["orgAdministration", "invitationStatus"],
      ["orgAdministration", "billingCycle"], ["dashboard", "severity"],
    ] as const;
    for (const [ns, sub] of SHORT_TREES) {
      const tree = ((de as Tree)[ns] as Tree)[sub] as Record<string, string>;
      for (const [k, v] of Object.entries(tree)) {
        expect(v.length, `${ns}.${sub}.${k} = "${v}" is too long for a chip`).toBeLessThanOrEqual(28);
      }
    }
  });

  it("these are PROTECTED surfaces — no target namespace leaks a public URL", () => {
    for (const ns of TARGETS) {
      for (const [k, v] of flatten((de as Tree)[ns])) {
        expect(/https?:\/\//.test(v), `${ns}.${k} contains an absolute URL`).toBe(false);
      }
    }
  });

  it("FA regression: the same namespaces keep their Persian values", () => {
    const faAm = flatten((fa as Tree).assetMaintenance);
    expect(faAm.get("assetStatus.IN_SERVICE")).toMatch(/[؀-ۿ]/);
    const faOa = flatten((fa as Tree).orgAdministration);
    expect(faOa.get("memberStatus.ACTIVE")).toMatch(/[؀-ۿ]/);
  });
});
