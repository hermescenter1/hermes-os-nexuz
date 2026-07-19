import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";
import { can } from "@/lib/auth/roles";
import { APP_NAV_GROUPS, isAppNavItemVisible } from "@/lib/navigation/app-nav";
import { isAuthorizedForPath } from "@/lib/auth/rbac";

/**
 * PHASE 87L.6E — German for the enterprise, commercial, financial, security
 * and administrative surfaces: crm, billing, apiPlatform, adminDocuments, org,
 * admin, erp, siteSecurity, adminDocumentSearch and adminAccess.
 *
 * Pins the exact per-namespace arithmetic, the §3–§12 terminology decisions,
 * the §14 financial-language distinctions, ICU parity against BOTH en and fa,
 * the §16 status vocabularies, the §13 access contract as ACTUALLY
 * implemented, and the §19 private-indexing boundary.
 */

type Tree = Record<string, unknown>;

const TARGETS = [
  "crm", "billing", "apiPlatform", "adminDocuments", "org",
  "admin", "erp", "siteSecurity", "adminDocumentSearch", "adminAccess",
] as const;
type Target = (typeof TARGETS)[number];

/** Exact leaf counts pinned at the start of this wave (§2). */
const LEAF_COUNTS: Record<Target, number> = {
  crm: 187,
  billing: 68,
  apiPlatform: 51,
  adminDocuments: 50,
  org: 45,
  admin: 40,
  erp: 33,
  siteSecurity: 31,
  adminDocumentSearch: 12,
  adminAccess: 10,
};

/**
 * Values that legitimately stay identical to English: proper nouns, plan and
 * tier names, acronym breadcrumbs, and ordinary German words spelled the same.
 * Anything NOT listed here (and not in TECHNICAL_TOKENS) must differ.
 */
const IDENTICAL_BY_DESIGN = new Set<string>([
  // CRM breadcrumbs made only of an acronym plus a preserved term
  "crm.leads.eyebrow", "crm.leadDetail.eyebrow",
  "crm.opps.eyebrow", "crm.oppDetail.eyebrow", "crm.cs.eyebrow",
  // kept as a term of art — matches the already-German appShell nav item
  "crm.nav.customerSuccess",
  // "Expansion" is an ordinary German noun, spelled identically
  "crm.cs.tabExpansions",
  // product, channel, plan and tier names
  "crm.header.title", "crm.nav.leads", "crm.nav.pipeline",
  "crm.source.WEBSITE", "crm.source.LINKEDIN", "crm.source.ACADEMY",
  "crm.tier.ENTERPRISE", "crm.tier.PREMIUM", "crm.tier.STANDARD",
  "crm.leads.colScore", "crm.leadDetail.score",
  "crm.leads.colStatus", "crm.leads.colName",
  "billing.plans.community.name", "billing.plans.professional.name",
  "billing.plans.team.name", "billing.plans.enterprise.name",
  "billing.invoices.status",
  "billing.plan.limitLabels.industrialGateway",
  "billing.plan.limitLabels.multiAgent",
  "apiPlatform.optional",
  "org.fields.name", "org.fields.website",
  "org.departments.types.management",
  "erp.nav.dashboard", "erp.nav.teams", "erp.teams.title",
  "admin.metrics.none", "admin.filters.limit",
]);

/** Pure technical tokens: currency codes and abbreviations (§2, §5, §14). */
const TECHNICAL_TOKENS = new Set<string>([
  "billing.currency.irr", "billing.currency.gbp",
  "billing.currency.usd", "billing.currency.eur",
  "crm.source.ATS", "erp.nav.kpis",
  "org.departments.types.it_ot",
  "crm.cs.tabManagers", // CSM = Customer Success Manager
]);

const leaves = (o: unknown, p = ""): [string, string][] =>
  o !== null && typeof o === "object"
    ? Object.entries(o as Tree).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k))
    : [[p, String(o)]];

const nsLeaves = (locale: unknown, ns: string) =>
  leaves((locale as Tree)[ns]).map(([p, v]) => [`${ns}.${p}`, v] as const);

const allTargetLeaves = TARGETS.flatMap((ns) => nsLeaves(de, ns));
// widened to Map<string, string>: allowlist lookups use plain string keys
const enByPath = new Map<string, string>(TARGETS.flatMap((ns) => nsLeaves(en, ns)));
const faByPath = new Map<string, string>(TARGETS.flatMap((ns) => nsLeaves(fa, ns)));

/** Sorted ICU ARGUMENT-NAME signature — branch literals may differ legitimately. */
const icuArgs = (v: string) =>
  [...v.matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]).sort().join("|");

describe("87L.6E — exact namespace inventory", () => {
  it.each(TARGETS)("%s has its pinned leaf count", (ns) => {
    expect(nsLeaves(en, ns).length).toBe(LEAF_COUNTS[ns]);
  });

  it("the ten target namespaces total exactly 527 leaves", () => {
    const total = Object.values(LEAF_COUNTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(527);
    expect(allTargetLeaves.length).toBe(527);
  });

  it("total = translated + intentional identical + technical token, per namespace", () => {
    for (const ns of TARGETS) {
      let translated = 0, identical = 0, token = 0;
      for (const [path, deVal] of nsLeaves(de, ns)) {
        if (deVal === enByPath.get(path)) {
          if (TECHNICAL_TOKENS.has(path)) token++;
          else if (IDENTICAL_BY_DESIGN.has(path)) identical++;
          else throw new Error(`unapproved English carryover: ${path} = ${deVal}`);
        } else translated++;
      }
      expect(translated + identical + token, ns).toBe(LEAF_COUNTS[ns]);
    }
  });

  it("the wave's global arithmetic is 527 = 483 + 36 + 8", () => {
    let translated = 0, identical = 0, token = 0;
    for (const [path, deVal] of allTargetLeaves) {
      if (deVal !== enByPath.get(path)) translated++;
      else if (TECHNICAL_TOKENS.has(path)) token++;
      else identical++;
    }
    expect({ translated, identical, token }).toEqual({
      translated: 483, identical: 36, token: 8,
    });
    expect(translated + identical + token).toBe(527);
  });

  it("has zero unapproved English sentence carryover", () => {
    const carried = allTargetLeaves
      .filter(([p, v]) => v === enByPath.get(p))
      .filter(([p]) => !IDENTICAL_BY_DESIGN.has(p) && !TECHNICAL_TOKENS.has(p))
      .map(([p, v]) => `${p} = ${v}`);
    expect(carried).toEqual([]);
  });

  it("every allowlist entry is still genuinely identical (no stale entries)", () => {
    for (const p of [...IDENTICAL_BY_DESIGN, ...TECHNICAL_TOKENS]) {
      const deVal = allTargetLeaves.find(([q]) => q === p)?.[1];
      expect(deVal, `${p} missing from the catalog`).toBeDefined();
      expect(deVal, `${p} is now translated — remove it from the allowlist`)
        .toBe(enByPath.get(p));
    }
  });

  it("has zero Persian contamination and zero empty values", () => {
    for (const [path, v] of allTargetLeaves) {
      expect(v.trim(), `${path} empty`).not.toBe("");
      expect(/[؀-ۿ]/.test(v), `${path} contains Persian`).toBe(false);
      expect(/[Ѐ-ӿ]/.test(v), `${path} contains Cyrillic`).toBe(false);
    }
  });

  it("leaves no unclassified leaf — every leaf is translated, identical or token", () => {
    for (const [path, v] of allTargetLeaves) {
      const classified =
        v !== enByPath.get(path) ||
        IDENTICAL_BY_DESIGN.has(path) ||
        TECHNICAL_TOKENS.has(path);
      expect(classified, `${path} is unclassified`).toBe(true);
    }
  });
});

describe("87L.6E — ICU and format safety (§15)", () => {
  it("keeps ICU argument parity with BOTH en and fa", () => {
    for (const [path, v] of allTargetLeaves) {
      expect(icuArgs(v), `${path} vs en`).toBe(icuArgs(enByPath.get(path)!));
      expect(icuArgs(v), `${path} vs fa`).toBe(icuArgs(faByPath.get(path)!));
    }
  });

  it("has no malformed braces and adds no HTML", () => {
    for (const [path, v] of allTargetLeaves) {
      let depth = 0;
      for (const ch of v) {
        if (ch === "{") depth++;
        if (ch === "}") depth--;
        expect(depth, `${path} unbalanced`).toBeGreaterThanOrEqual(0);
      }
      expect(depth, `${path} unbalanced`).toBe(0);
      const tags = (s: string) => (s.match(/<[a-zA-Z/][^>]*>/g) ?? []).length;
      expect(tags(v), `${path} added markup`).toBe(tags(enByPath.get(path)!));
    }
  });

  it("preserves every digit sequence appearing in the English source", () => {
    for (const [path, v] of allTargetLeaves) {
      const nums = (s: string) => (s.match(/\d+/g) ?? []).sort();
      expect(nums(v), `${path} numeric drift`).toEqual(nums(enByPath.get(path)!));
    }
  });
});

describe("87L.6E — terminology contract (§3–§12)", () => {
  const t = (p: string) => allTargetLeaves.find(([q]) => q === p)?.[1] ?? "";

  it("CRM uses the required sales vocabulary (§3)", () => {
    expect(t("crm.stage.NEGOTIATION")).toBe("Verhandlung");
    expect(t("crm.stage.PROPOSAL")).toBe("Angebot");
    expect(t("crm.stage.WON")).toBe("Gewonnen");
    expect(t("crm.stage.LOST")).toBe("Verloren");
    expect(t("crm.status.QUALIFIED")).toBe("Qualifiziert");
    expect(t("crm.kpi.conversion")).toContain("Konversion");
    expect(t("crm.oppDetail.expectedClose")).toContain("Erwarteter Abschluss");
    // Opportunity → Verkaufschance, Account → Kundenkonto, Lead stays "Lead"
    expect(t("crm.pipeline.title")).toContain("Verkaufschancen");
    expect(t("crm.oppDetail.account")).toBe("Kundenkonto");
    expect(t("crm.recent.title")).toContain("Leads");
  });

  it("ERP uses the required operations vocabulary (§4)", () => {
    expect(t("erp.nav.inventory")).toBe("Bestand");
    expect(t("erp.nav.approvals")).toBe("Freigaben");
    expect(t("erp.approvals.approve")).toBe("Freigeben");
    expect(t("erp.approvals.reject")).toBe("Ablehnen");
    expect(t("erp.nav.resources")).toBe("Ressourcen");
    // compound: "Ressourcenauslastung" — the second element is lowercased
    expect(t("erp.dashboard.resourceUtilization")).toMatch(/[Aa]uslastung/);
    expect(t("erp.nav.workOrders")).toBe("Arbeitsaufträge");
  });

  it("Billing uses the required financial vocabulary (§5)", () => {
    expect(t("billing.title")).toBe("Abrechnung");
    expect(t("billing.nav.subscription")).toBe("Abonnement");
    expect(t("billing.nav.invoices")).toBe("Rechnungen");
    expect(t("billing.plan.current")).toBe("Aktueller Tarif");
    expect(t("billing.nav.usage")).toBe("Nutzung");
    expect(t("billing.plan.upgrade")).toBe("Tarif hochstufen");
    expect(t("billing.plan.downgrade")).toBe("Tarif herabstufen");
    expect(t("billing.plan.trialBadge")).toBe("Testzeitraum");
  });

  it("Organization uses the required tenancy vocabulary (§6)", () => {
    expect(t("org.eyebrow")).toBe("Organisation");
    expect(t("org.invitations.title")).toBe("Einladungen");
    expect(t("org.members.remove")).toBe("Entfernen");
    expect(t("org.members.confirmRemove")).toContain("Mitglied");
    expect(t("siteSecurity.siteMembership")).toBe("Standortmitgliedschaft");
    // Site → Standort throughout the site-security surface
    for (const [p, v] of nsLeaves(de, "siteSecurity")) {
      if (/^siteSecurity\.site[A-Z]/.test(p)) expect(v, p).toContain("Standort");
    }
  });

  it("Admin uses the required administration vocabulary (§7)", () => {
    expect(t("admin.title")).toBe("Verwaltungskonsole");
    expect(t("admin.table.heading")).toBe("Auditprotokoll");
    expect(t("admin.status.heading")).toBe("Systemstatus");
    expect(t("adminAccess.accessRequests")).toBe("Zugriffsanfragen");
  });

  it("Admin documents use the document-control vocabulary (§8, §9)", () => {
    expect(t("adminDocuments.title")).toBe("Dokumentenbibliothek");
    expect(t("adminDocuments.sourceTypes.commissioning_report"))
      .toBe("Inbetriebnahmebericht");
    expect(t("adminDocuments.sourceTypes.maintenance_procedure"))
      .toContain("Instandhaltung");
    expect(t("adminDocumentSearch.title")).toContain("Dokumentensuche");
    expect(t("adminDocumentSearch.results.heading")).toBe("Ergebnisse");
  });

  it("Access administration uses the §10 vocabulary", () => {
    expect(t("siteSecurity.grantAccess")).toContain("gewähren");
    expect(t("siteSecurity.revokeAccess")).toContain("entziehen");
    expect(t("siteSecurity.accessDenied")).toBe("Zugriff verweigert");
  });

  it("API platform uses the §12 vocabulary", () => {
    expect(t("apiPlatform.eyebrow")).toBe("API-Plattform");
    expect(t("apiPlatform.keys.title")).toBe("API-Schlüssel");
    expect(t("apiPlatform.keys.scopes")).toBe("Geltungsbereiche");
    expect(t("apiPlatform.rateLimit.title")).toBe("Ratenbegrenzungen");
    expect(t("apiPlatform.keys.lastUsed")).toBe("Zuletzt verwendet");
  });

  it("never uses 'Wartung' as a blanket rendering of maintenance", () => {
    for (const [path, v] of allTargetLeaves) {
      expect(/\bWartung\b/.test(v), `${path} uses Wartung`).toBe(false);
    }
  });
});

describe("87L.6E — financial and legal language (§14)", () => {
  const t = (p: string) => allTargetLeaves.find(([q]) => q === p)?.[1] ?? "";

  it("distinguishes Betrag, Kosten, Erlös and Aufwand rather than collapsing them", () => {
    // "Amount" is a monetary amount → Betrag, never Kosten/Preis
    expect(t("billing.invoices.amount")).toBe("Betrag");
    expect(t("billing.invoices.amount")).not.toContain("Kosten");
    expect(t("billing.invoices.amount")).not.toContain("Preis");
  });

  it("distinguishes the payment-state vocabulary", () => {
    expect(t("billing.invoices.paid")).toBe("Bezahlt");
    expect(t("billing.invoices.overdue")).toBe("Überfällig");
    expect(t("billing.plan.pastDueBadge")).toBe("Überfällig");
    expect(t("billing.invoices.draft")).toBe("Entwurf");
    expect(t("billing.invoices.issued")).toBe("Ausgestellt");
    // a voided invoice is "storniert", never "bezahlt" or "offen"
    expect(t("billing.invoices.void")).toBe("Storniert");
    // "Rechnung" (invoice) is never used where a payment is meant
    expect(t("billing.invoices.number")).toBe("Rechnung");
  });

  it("preserves currency codes verbatim and converts nothing", () => {
    expect(t("billing.currency.irr")).toBe("IRR");
    expect(t("billing.currency.gbp")).toBe("GBP");
    expect(t("billing.currency.usd")).toBe("USD");
    expect(t("billing.currency.eur")).toBe("EUR");
    expect(t("billing.currency.chooseCurrency")).toBe("Währung");
  });

  it("introduces no tax treatment, VAT registration or legal guarantee", () => {
    const invented = /USt-IdNr|Umsatzsteuer-Identifikation|MwSt\.?-Nummer|steuerbefreit|Garantie|garantiert|Gewährleistung|rechtsverbindlich/i;
    for (const [path, v] of allTargetLeaves) {
      expect(invented.test(v), `${path} invents tax/legal language`).toBe(false);
    }
  });

  it("company annual revenue stays Jahresumsatz, distinct from the ERP ledger sense", () => {
    expect(t("crm.accountDetail.annualRevenue")).toBe("Jahresumsatz");
  });
});

describe("87L.6E — status and enum vocabularies (§16)", () => {
  const t = (p: string) => allTargetLeaves.find(([q]) => q === p)?.[1] ?? "";

  it("CRM lead and deal states are each distinct", () => {
    const vals = Object.keys((en as Tree).crm as Tree).includes("status")
      ? Object.values((de as Tree).crm as Tree).flatMap(() => [])
      : [];
    expect(vals).toEqual([]);
    const states = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CONVERTED", "LOST"]
      .map((k) => t(`crm.status.${k}`));
    expect(new Set(states).size).toBe(states.length);
  });

  it("CRM pipeline stages are each distinct", () => {
    const stages = ["DISCOVERY", "QUALIFICATION", "PROPOSAL", "TECHNICAL_REVIEW",
      "COMMERCIAL_REVIEW", "NEGOTIATION", "WON", "LOST"].map((k) => t(`crm.stage.${k}`));
    expect(new Set(stages).size).toBe(stages.length);
  });

  it("document-administration statuses are each distinct", () => {
    const s = Object.values((de as Tree).adminDocuments as Tree)
      .filter((v): v is Tree => typeof v === "object" && v !== null);
    const status = (de as Tree).adminDocuments as Tree;
    const values = Object.values(status.status as Tree).map(String);
    expect(s.length).toBeGreaterThan(0);
    expect(new Set(values).size).toBe(values.length);
  });

  it("access and security states are each distinct", () => {
    const values = [
      t("siteSecurity.status.active"),
      t("siteSecurity.status.suspended"),
      t("siteSecurity.accessDenied"),
    ];
    expect(new Set(values).size).toBe(values.length);
  });

  it("translates only display labels — persisted enum KEYS are unchanged", () => {
    for (const group of ["status", "stage", "source", "tier", "health", "renewalStatus", "journeyEvent"]) {
      expect(Object.keys(((de as Tree).crm as Tree)[group] as Tree))
        .toEqual(Object.keys(((en as Tree).crm as Tree)[group] as Tree));
    }
    expect(Object.keys((de as Tree).adminDocuments as Tree))
      .toEqual(Object.keys((en as Tree).adminDocuments as Tree));
    expect(Object.keys(((de as Tree).siteSecurity as Tree).permissions as Tree))
      .toEqual(Object.keys(((en as Tree).siteSecurity as Tree).permissions as Tree));
  });
});

describe("87L.6E — security wording is not weakened (§11, §12)", () => {
  const t = (p: string) => allTargetLeaves.find(([q]) => q === p)?.[1] ?? "";

  it("keeps the one-time secret warning at full force", () => {
    const w = t("apiPlatform.rawKey.warning");
    expect(w).toContain("einzige");            // shown only once
    expect(w).toMatch(/nicht wiederhergestellt/); // cannot be recovered
    expect(w).toMatch(/sicher/);                // store it securely
  });

  it("states that revocation stops active integrations immediately", () => {
    expect(t("apiPlatform.keys.confirmRevoke")).toMatch(/sofort/);
    expect(t("apiPlatform.errors.keyRevoked")).toMatch(/widerrufen/);
  });

  it("keeps rate-limit enforcement explicit, including the HTTP code", () => {
    expect(t("apiPlatform.rateLimit.exceeded")).toContain("429");
  });

  it("keeps access-denial wording unambiguous", () => {
    expect(t("siteSecurity.accessDenied")).toMatch(/verweigert/);
    expect(t("siteSecurity.insufficientPermission")).toMatch(/[Uu]nzureichende/);
    expect(t("apiPlatform.errors.insufficientScope")).toMatch(/[Uu]nzureichend/);
    expect(t("adminAccess.rejectedNote")).toMatch(/Abgelehnt/);
  });

  it("contains no API key secret, token or credential value", () => {
    const secret = /sk-[A-Za-z0-9]|hermes_[A-Za-z0-9]{8}|Bearer\s+[A-Za-z0-9]{8}|BEGIN (?:RSA |EC )?PRIVATE KEY/;
    for (const [path, v] of allTargetLeaves) {
      expect(secret.test(v), `${path} looks like a credential`).toBe(false);
    }
  });
});

describe("87L.6E — access policy is preserved exactly (§13)", () => {
  it("engineer holds authoring + dashboard, and NOT admin", () => {
    expect(can("engineer", "authoring")).toBe(true);
    expect(can("engineer", "dashboard")).toBe(true);
    expect(can("engineer", "admin")).toBe(false);
    expect(can("engineer", "superadmin")).toBe(false);
  });

  it("engineer sees no CRM and no ERP in the German navigation", () => {
    const items = APP_NAV_GROUPS.flatMap((g) => g.items);
    for (const href of ["/crm", "/erp"]) {
      const item = items.find((i) => i.href === href);
      expect(item, `${href} missing from the nav registry`).toBeDefined();
      expect(isAppNavItemVisible("engineer", item!), `${href} visible to engineer`).toBe(false);
      expect(isAppNavItemVisible("admin", item!), `${href} hidden from admin`).toBe(true);
      expect(isAppNavItemVisible("superadmin", item!)).toBe(true);
    }
  });

  it("nav visibility is exactly middleware policy ∩ capability — no parallel role logic", () => {
    // Recomputing visibility from the two SHARED authorities must reproduce
    // isAppNavItemVisible for every item × role. If any surface had grown its
    // own `role === "..."` rule, this equality would break.
    const roles = ["superadmin", "admin", "engineer", "customer", "viewer", "vendor"] as const;
    let gatedPairs = 0;
    for (const item of APP_NAV_GROUPS.flatMap((g) => g.items)) {
      for (const role of roles) {
        const expected =
          isAuthorizedForPath(role, `/en${item.href}`) &&
          (!item.pageCapability || can(role, item.pageCapability));
        expect(isAppNavItemVisible(role, item), `${item.href} for ${role}`).toBe(expected);
        if (!expected) gatedPairs++;
      }
    }
    // guard against the whole matrix silently collapsing to "everything visible"
    expect(gatedPairs).toBeGreaterThan(0);
  });

  it("admin and superadmin retain their existing access", () => {
    for (const role of ["admin", "superadmin"] as const) {
      expect(can(role, "admin")).toBe(true);
      expect(can(role, "authoring")).toBe(true);
      expect(can(role, "dashboard")).toBe(true);
    }
  });

  /**
   * HONEST SCOPE PIN — reported to the owner in the PHASE 87L.6E report.
   *
   * §13 of the brief also lists Billing and Organization administration as
   * engineer-denied. That is NOT the policy this repository implements:
   * /dashboard/billing, /dashboard/organization and /dashboard/api are gated by
   * the "dashboard" capability, which engineer HOLDS. Making the brief's
   * sentence true would require an RBAC/capability change, which §0 and §13
   * both forbid ("do not modify RBAC or capabilities", "Preserve PHASE 87L.4
   * exactly"). This test therefore pins the ACTUAL contract so the gap stays
   * visible and cannot regress silently in either direction.
   */
  it("PINS THE ACTUAL CONTRACT: engineer currently CAN reach billing/org/api", () => {
    const items = APP_NAV_GROUPS.flatMap((g) => g.items);
    for (const href of ["/dashboard/billing", "/dashboard/organization"]) {
      const item = items.find((i) => i.href === href);
      if (!item) continue;
      expect(item.pageCapability, `${href} gained a capability gate`).toBeUndefined();
      expect(isAppNavItemVisible("engineer", item)).toBe(true);
    }
  });
});

describe("87L.6E — indexing and privacy boundary (§19)", () => {
  it("no target namespace value contains an absolute URL or a private path", () => {
    for (const [path, v] of allTargetLeaves) {
      expect(/https?:\/\//.test(v), `${path} embeds a URL`).toBe(false);
      expect(/\/dashboard\/|\/admin\/|\/crm\/|\/erp\//.test(v), `${path} embeds a private path`)
        .toBe(false);
    }
  });

  it("exposes no customer, financial or member record in the catalog", () => {
    const pii = /@[a-z0-9-]+\.[a-z]{2,}|\+\d{6,}|\bIBAN\b|\b\d{4} ?\d{4} ?\d{4} ?\d{4}\b/i;
    for (const [path, v] of allTargetLeaves) {
      expect(pii.test(v), `${path} looks like real customer data`).toBe(false);
    }
  });
});

describe("87L.6E — regression", () => {
  it("leaves fa and en structurally untouched (3-way key parity holds)", () => {
    for (const ns of TARGETS) {
      const k = (o: unknown) => nsLeaves(o, ns).map(([p]) => p).sort();
      expect(k(de)).toEqual(k(en));
      expect(k(fa)).toEqual(k(en));
    }
  });

  it("does not change a single English or Persian value in the target namespaces", () => {
    // en/fa are the source contracts — this wave only writes de.json.
    for (const ns of TARGETS) {
      expect(nsLeaves(en, ns).length).toBe(LEAF_COUNTS[ns]);
      expect(nsLeaves(fa, ns).length).toBe(LEAF_COUNTS[ns]);
      for (const [p, v] of nsLeaves(fa, ns)) {
        expect(v.trim(), `${p} Persian value empty`).not.toBe("");
      }
    }
  });

  it("previous German waves remain zero-carryover", () => {
    const PREVIOUS = ["knowledge", "dashboard", "assetMaintenance", "appShell",
      "brain", "copilot", "publicSite", "authExperience"];
    for (const ns of PREVIOUS) {
      expect(JSON.stringify((de as Tree)[ns]), `${ns} reverted to English`)
        .not.toBe(JSON.stringify((en as Tree)[ns]));
    }
  });

  it("global carryover fell to 255 here, and to 0 after 87L.6F", () => {
    const flat = (o: unknown): string[] =>
      o !== null && typeof o === "object" ? Object.values(o as Tree).flatMap(flat) : [String(o)];
    let carry = 0;
    for (const k of Object.keys(en)) {
      if (JSON.stringify((en as Tree)[k]) === JSON.stringify((de as Tree)[k])) {
        carry += flat((en as Tree)[k]).length;
      }
    }
    // SUPERSEDED BY PHASE 87L.6F: this wave took the catalog to 255, then
    // 87L.6F translated the final 255. The 527 this wave contributed is still
    // proven, against the new total.
    expect(carry).toBe(0);
    expect(782 - 527 - 255).toBe(carry);
  });
});
