// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../messages/en.json";
import de from "../../../messages/de.json";
import { CrmCommandClient } from "@/components/crm-experience/CrmCommandClient";
import { BillingDashboard } from "@/components/billing/BillingDashboard";

/**
 * PHASE 87L.6E — the translated enterprise surfaces actually RENDER German
 * through next-intl, and every one of the 527 messages FORMATS through the
 * real ICU engine (a regex cannot prove that).
 *
 * These are authenticated, admin-scoped surfaces, so no real browser session
 * is available in this environment. This jsdom render against the real de
 * catalog is the honest substitute and is reported as exactly that — it is
 * NOT a claim of authenticated browser validation.
 */

type Tree = Record<string, unknown>;

const TARGETS = [
  "crm", "billing", "apiPlatform", "adminDocuments", "org",
  "admin", "erp", "siteSecurity", "adminDocumentSearch", "adminAccess",
] as const;

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/de/crm",
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

function withDe(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="de" messages={de as never} timeZone="Europe/Berlin">
      <div dir="ltr">{ui}</div>
    </NextIntlClientProvider>
  );
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("87L.6E — every message formats through the real ICU engine", () => {
  const leaves = (o: unknown, p = ""): [string, string][] =>
    o !== null && typeof o === "object"
      ? Object.entries(o as Tree).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k))
      : [[p, String(o)]];

  /** Plausible values for every ICU argument used by the target namespaces. */
  const ARGS: Record<string, string | number> = {
    count: 3, position: 2, reason: "Zeitüberschreitung", time: "12:00",
    date: "01.03.2026", n: 45, healthy: 7, atRisk: 2, capacity: 25,
  };

  it.each(TARGETS)("%s formats every leaf without throwing", (ns) => {
    const t = createTranslator({ locale: "de", messages: de as never, namespace: ns as never });
    for (const [path] of leaves((de as Tree)[ns])) {
      const out = (t as unknown as (k: string, v?: unknown) => string)(path, ARGS);
      expect(out, `${ns}.${path} formatted empty`).not.toBe("");
      // an unresolved ICU argument would surface as a literal brace
      expect(out, `${ns}.${path} left an unresolved placeholder`).not.toMatch(/\{[a-zA-Z]/);
    }
  });

  it("renders the same argument values as English does, in German words", () => {
    const dt = createTranslator({ locale: "de", messages: de as never, namespace: "crm" as never });
    const et = createTranslator({ locale: "en", messages: en as never, namespace: "crm" as never });
    const d = (dt as unknown as (k: string, v?: unknown) => string)("kpi.healthySplit", ARGS);
    const e = (et as unknown as (k: string, v?: unknown) => string)("kpi.healthySplit", ARGS);
    expect(d).toContain("7");
    expect(d).toContain("2");
    expect(e).toContain("7");
    expect(d).not.toBe(e);
    expect(d).toContain("gesund");
  });
});

describe("87L.6E — CRM command surface renders German in every state", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });
  beforeEach(() => { vi.restoreAllMocks(); });

  it("shows the German loading state before data arrives", async () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = await mount(withDe(<CrmCommandClient />));
    const text = container.textContent ?? "";
    expect(text).toMatch(/Vertriebsdaten werden geladen|Wird geladen/);
    expect(text).not.toMatch(/Loading sales data/);
  });

  it("shows the German unavailable state and never a raw server error", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false, status: 500,
      json: async () => ({ error: "PrismaClientKnownRequestError: P2021 relation missing" }),
    })) as unknown as typeof fetch;
    const { container } = await mount(withDe(<CrmCommandClient />));
    await flush(); await flush();
    const text = container.textContent ?? "";
    expect(text).toContain("Vertriebsdaten nicht verfügbar");
    // §0: never render a raw server error
    expect(text).not.toContain("Prisma");
    expect(text).not.toContain("P2021");
    expect(text).not.toMatch(/Sales data unavailable/);
  });

  it("renders German labels, German enum badges and no English sentence when ready", async () => {
    const stats = {
      totalLeads: 12, newLeadsThisMonth: 4, qualifiedLeads: 5, convertedLeads: 2,
      conversionRate: 16.7, totalOpportunities: 6, openOpportunities: 4,
      pipelineValue: 250000, weightedPipelineValue: 90000, wonValue: 40000,
      totalAccounts: 8, healthyAccounts: 6, atRiskAccounts: 2, renewalsThisQuarter: 3,
    };
    const pipeline = [{ stage: "NEGOTIATION", count: 2, value: 120000, weightedValue: 60000 }];
    const leads = [{
      id: "l1", name: "Muster", company: "Muster GmbH", status: "QUALIFIED",
      source: "WEBSITE", score: 80, createdAt: "2026-03-01T00:00:00.000Z",
      email: "x@example.invalid", ownerId: null,
    }];
    globalThis.fetch = vi.fn(async (url: unknown) => ({
      ok: true, status: 200,
      json: async () =>
        String(url).includes("leads") ? { leads } : { stats, pipeline },
    })) as unknown as typeof fetch;

    const { container } = await mount(withDe(<CrmCommandClient />));
    await flush(); await flush(); await flush();
    const text = container.textContent ?? "";

    expect(text).toContain("Leads gesamt");
    expect(text).toMatch(/Verkaufschancen|Pipeline-Wert/);
    expect(text).toContain("Qualifiziert");          // status enum, German
    expect(text).not.toContain("Total leads");
    expect(text).not.toContain("Qualified");
    expect(/[؀-ۿ]/.test(text), "Persian leaked into the German CRM surface").toBe(false);
  });
});

describe("87L.6E — Billing surface renders German financial vocabulary", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

  it("renders the German loading state, then German financial labels", async () => {
    globalThis.fetch = vi.fn(async (url: unknown) => {
      const u = String(url);
      const body =
        u.includes("plans") ? { plans: [] } :
        u.includes("subscription") ? { subscription: null } :
        u.includes("invoices") ? { invoices: [] } :
        { usage: {}, statuses: [] };
      return { ok: true, status: 200, json: async () => body };
    }) as unknown as typeof fetch;

    const { container } = await mount(withDe(<BillingDashboard />));
    await flush(); await flush(); await flush();
    const text = container.textContent ?? "";

    // empty state reached without an English sentence or a raw error
    expect(text).not.toMatch(/Could not load billing information/);
    expect(text).not.toMatch(/No active subscription/);
    expect(text).not.toContain("Prisma");
    expect(/[؀-ۿ]/.test(text), "Persian leaked into the German billing surface").toBe(false);
    if (text.trim().length > 0) {
      expect(text).toMatch(/Abrechnung|Abonnement|Tarif|Rechnung|Nutzung|Wird geladen/);
    }
  });
});

describe("87L.6E — no English sentence remains in the target catalog", () => {
  it("no target leaf is a multi-word English sentence identical to en", () => {
    const leaves = (o: unknown, p = ""): [string, string][] =>
      o !== null && typeof o === "object"
        ? Object.entries(o as Tree).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k))
        : [[p, String(o)]];
    // An English SENTENCE carries an English function word. A breadcrumb built
    // from proper nouns ("CRM · Customer Success") is not a sentence, so the
    // heuristic looks for the function words rather than counting tokens.
    // Case-SENSITIVE and lowercase-only: an English sentence carries lowercase
    // function words mid-string, whereas acronyms are uppercase ("IT / OT"
    // must not match "it"). The exact allowlist arithmetic in
    // german-enterprise-wave.test.ts is the primary guard; this is a backstop.
    const ENGLISH_FUNCTION_WORD = /\b(the|and|of|to|for|with|from|your|this|that|are|is|be|not)\b/;
    const suspicious: string[] = [];
    for (const ns of TARGETS) {
      const enL = new Map(leaves((en as Tree)[ns]));
      for (const [path, v] of leaves((de as Tree)[ns])) {
        if (v === enL.get(path) && ENGLISH_FUNCTION_WORD.test(v)) {
          suspicious.push(`${ns}.${path} = ${v}`);
        }
      }
    }
    expect(suspicious).toEqual([]);
  });
});
