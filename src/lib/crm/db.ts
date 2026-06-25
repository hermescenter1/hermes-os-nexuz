// Phase 66 — CRM DB layer (Prisma + mock fallback)

import { getPrisma }    from "@/lib/db/prisma";
import {
  CRM_ACCOUNTS_WITH_HEALTH, CRM_LEADS, CRM_OPPORTUNITIES,
  CRM_DEALS, CRM_RENEWALS, CRM_EXPANSIONS, CRM_MANAGERS,
  CRM_JOURNEY_EVENTS, CRM_ACCOUNTS,
} from "./mock-data";
import { mockHealthForAccount } from "./health-engine";
import type {
  CrmLead, CrmAccount, CrmOpportunity, CrmDeal,
  CrmHealthScore, CrmJourneyEvent, CrmRenewalForecast,
  CrmExpansionOpportunity, CrmSuccessManager,
  CrmDashboardStats, CrmPipelineStage, CrmAccountWithHealth,
  CrmCustomerSuccessOverview, CrmOpportunityStage,
} from "./types";

type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;

async function m() {
  const db = await getPrisma();
  if (!db) return null;
  const d = db as Record<string, unknown>;
  return {
    lead:       d.crmLead              as AnyModel | undefined,
    account:    d.crmAccount           as AnyModel | undefined,
    opp:        d.crmOpportunity       as AnyModel | undefined,
    deal:       d.crmDeal              as AnyModel | undefined,
    health:     d.crmHealthScore       as AnyModel | undefined,
    journey:    d.crmJourneyEvent      as AnyModel | undefined,
    renewal:    d.crmRenewalForecast   as AnyModel | undefined,
    expansion:  d.crmExpansionOpportunity as AnyModel | undefined,
    manager:    d.crmSuccessManager    as AnyModel | undefined,
  };
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getCrmDashboard(): Promise<CrmDashboardStats> {
  try {
    const db = await m();
    if (db?.lead && db?.opp && db?.account) {
      const [totalLeads, totalOpps, accounts] = await Promise.all([
        db.lead.count({} as never),
        db.opp.count({ where: { deletedAt: null } } as never),
        db.account.findMany({ where: { deletedAt: null }, select: { id: true } } as never),
      ]) as [number, number, { id: string }[]];

      const converted = await db.lead.count({ where: { status: "CONVERTED" } } as never) as number;
      const convRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;

      const openOpps = await db.opp.findMany({
        where: { deletedAt: null, stage: { notIn: ["WON","LOST"] } },
        select: { value: true, probability: true },
      } as never) as { value: number; probability: number }[];

      const pipeline = openOpps.reduce((s, o) => s + o.value, 0);
      const forecast = openOpps.reduce((s, o) => s + o.value * (o.probability / 100), 0);

      const healths = await Promise.all(
        (accounts as { id: string }[]).map(a => mockHealthForAccount(a.id))
      );
      const healthy = healths.filter(h => h.category === "HEALTHY").length;
      const atRisk  = healths.filter(h => h.category === "AT_RISK" || h.category === "CRITICAL").length;

      return {
        totalLeads,
        newLeadsThisMonth: Math.round(totalLeads * 0.3),
        pipelineValue: Math.round(pipeline),
        activeOpportunities: openOpps.length,
        conversionRate: convRate,
        forecastRevenue: Math.round(forecast),
        renewalsThisQuarter: 0,
        healthyAccounts: healthy,
        atRiskAccounts: atRisk,
        churnRisk: Math.round((atRisk / Math.max(accounts.length, 1)) * 100),
      };
    }
  } catch { /* fall through */ }

  // Mock fallback
  const accounts  = CRM_ACCOUNTS_WITH_HEALTH;
  const leads     = CRM_LEADS;
  const opps      = CRM_OPPORTUNITIES.filter(o => o.stage !== "WON" && o.stage !== "LOST" && !o.deletedAt);
  const converted = leads.filter(l => l.status === "CONVERTED").length;
  const pipeline  = opps.reduce((s, o) => s + o.value, 0);
  const forecast  = opps.reduce((s, o) => s + o.value * (o.probability / 100), 0);
  const healthy   = accounts.filter(a => a.health.category === "HEALTHY").length;
  const atRisk    = accounts.filter(a => a.health.category === "AT_RISK" || a.health.category === "CRITICAL").length;

  return {
    totalLeads:           leads.length,
    newLeadsThisMonth:    leads.filter(l => new Date(l.createdAt) > new Date(Date.now() - 30 * 86400000)).length,
    pipelineValue:        Math.round(pipeline),
    activeOpportunities:  opps.length,
    conversionRate:       Math.round((converted / leads.length) * 100),
    forecastRevenue:      Math.round(forecast),
    renewalsThisQuarter:  CRM_RENEWALS.filter(r => r.status !== "CHURNED").length,
    healthyAccounts:      healthy,
    atRiskAccounts:       atRisk,
    churnRisk:            Math.round((atRisk / accounts.length) * 100),
  };
}

export async function getCrmPipeline(): Promise<CrmPipelineStage[]> {
  const STAGES: CrmOpportunityStage[] = [
    "DISCOVERY","QUALIFICATION","PROPOSAL","TECHNICAL_REVIEW",
    "COMMERCIAL_REVIEW","NEGOTIATION","WON","LOST",
  ];
  const LABELS: Record<CrmOpportunityStage, string> = {
    DISCOVERY:        "Discovery",
    QUALIFICATION:    "Qualification",
    PROPOSAL:         "Proposal",
    TECHNICAL_REVIEW: "Technical Review",
    COMMERCIAL_REVIEW:"Commercial Review",
    NEGOTIATION:      "Negotiation",
    WON:              "Won",
    LOST:             "Lost",
  };

  const opps = CRM_OPPORTUNITIES.filter(o => !o.deletedAt);
  return STAGES.map(stage => {
    const bucket = opps.filter(o => o.stage === stage);
    return {
      stage,
      label:       LABELS[stage],
      count:       bucket.length,
      value:       bucket.reduce((s, o) => s + o.value, 0),
      probability: bucket.length > 0
        ? Math.round(bucket.reduce((s, o) => s + o.probability, 0) / bucket.length)
        : 0,
    };
  });
}

// ── Leads ─────────────────────────────────────────────────────────────────────

export async function getLeads(status?: string): Promise<CrmLead[]> {
  try {
    const db = await m();
    if (db?.lead) {
      const where = status ? { status, deletedAt: null } : { deletedAt: null };
      const rows = await db.lead.findMany({ where, orderBy: { createdAt: "desc" } } as never) as CrmLead[];
      return rows.map(r => ({ ...r, createdAt: toIso(r.createdAt), updatedAt: toIso(r.updatedAt) }));
    }
  } catch { /* fall through */ }
  const leads = status ? CRM_LEADS.filter(l => l.status === status) : CRM_LEADS;
  return [...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLeadById(id: string): Promise<CrmLead | null> {
  try {
    const db = await m();
    if (db?.lead) {
      const row = await db.lead.findUnique({ where: { id }, include: { activities: true, leadNotes: true } } as never) as CrmLead | null;
      if (row) return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
    }
  } catch { /* fall through */ }
  return CRM_LEADS.find(l => l.id === id) ?? null;
}

export async function createLead(data: {
  firstName: string; lastName: string; email: string;
  phone?: string | null; company?: string | null; jobTitle?: string | null;
  source: string; ownerId?: string | null; notes?: string | null;
}): Promise<CrmLead | null> {
  try {
    const db = await m();
    if (db?.lead) {
      const row = await db.lead.create({
        data: { ...data, status: "NEW", score: 0, updatedAt: new Date() },
      } as never) as CrmLead;
      return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
    }
  } catch { /* fall through */ }
  return null;
}

export async function updateLead(id: string, data: Partial<{ status: string; score: number; notes: string | null }>): Promise<CrmLead | null> {
  try {
    const db = await m();
    if (db?.lead) {
      const row = await db.lead.update({ where: { id }, data: { ...data, updatedAt: new Date() } } as never) as CrmLead;
      return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
    }
  } catch { /* fall through */ }
  return null;
}

// ── Opportunities ─────────────────────────────────────────────────────────────

export async function getOpportunities(stage?: string): Promise<CrmOpportunity[]> {
  try {
    const db = await m();
    if (db?.opp) {
      const where = stage
        ? { stage, deletedAt: null }
        : { deletedAt: null };
      const rows = await db.opp.findMany({
        where,
        include: { account: { select: { id: true, name: true } } },
        orderBy: { updatedAt: "desc" },
      } as never) as CrmOpportunity[];
      return rows.map(r => ({ ...r, createdAt: toIso(r.createdAt), updatedAt: toIso(r.updatedAt) }));
    }
  } catch { /* fall through */ }
  const opps = stage ? CRM_OPPORTUNITIES.filter(o => o.stage === stage) : CRM_OPPORTUNITIES;
  return [...opps].filter(o => !o.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getOpportunityById(id: string): Promise<(CrmOpportunity & { account: CrmAccount | null; activities: unknown[] }) | null> {
  try {
    const db = await m();
    if (db?.opp) {
      const row = await db.opp.findUnique({
        where: { id },
        include: { account: true, activities: { orderBy: { createdAt: "asc" } } },
      } as never) as (CrmOpportunity & { account: CrmAccount | null; activities: unknown[] }) | null;
      if (row) return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
    }
  } catch { /* fall through */ }
  const opp = CRM_OPPORTUNITIES.find(o => o.id === id);
  if (!opp) return null;
  const account = opp.accountId ? CRM_ACCOUNTS.find(a => a.id === opp.accountId) ?? null : null;
  return { ...opp, account, activities: [] };
}

export async function createOpportunity(data: {
  title: string; value: number; probability: number;
  accountId?: string | null; leadId?: string | null;
  stage?: string; expectedCloseDate?: string | null;
  ownerId?: string | null; notes?: string | null;
}): Promise<CrmOpportunity | null> {
  try {
    const db = await m();
    if (db?.opp) {
      const row = await db.opp.create({
        data: { ...data, stage: data.stage ?? "DISCOVERY", updatedAt: new Date() },
      } as never) as CrmOpportunity;
      return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
    }
  } catch { /* fall through */ }
  return null;
}

export async function updateOpportunity(id: string, data: Partial<{
  stage: string; value: number; probability: number; notes: string | null; lostReason: string | null;
}>): Promise<CrmOpportunity | null> {
  try {
    const db = await m();
    if (db?.opp) {
      const extra: Record<string, unknown> = {};
      if (data.stage === "WON")  extra.wonAt  = new Date();
      if (data.stage === "LOST") extra.lostAt = new Date();
      const row = await db.opp.update({
        where: { id }, data: { ...data, ...extra, updatedAt: new Date() },
      } as never) as CrmOpportunity;
      return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
    }
  } catch { /* fall through */ }
  return null;
}

// ── CRM Accounts ──────────────────────────────────────────────────────────────

export async function getCrmAccounts(): Promise<CrmAccountWithHealth[]> {
  try {
    const db = await m();
    if (db?.account) {
      const rows = await db.account.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
      } as never) as CrmAccount[];
      return rows.map(a => ({
        ...a,
        createdAt: toIso(a.createdAt),
        updatedAt: toIso(a.updatedAt),
        health: { id: `hs-${a.id}`, accountId: a.id, computedAt: new Date().toISOString(), ...mockHealthForAccount(a.id) } as CrmHealthScore,
        openDeals: 0,
      }));
    }
  } catch { /* fall through */ }
  return CRM_ACCOUNTS_WITH_HEALTH;
}

export async function getCrmAccountById(id: string): Promise<(CrmAccountWithHealth & {
  contacts: unknown[]; opportunities: unknown[]; deals: unknown[];
  journeyEvents: unknown[]; renewals: unknown[]; expansions: unknown[];
}) | null> {
  try {
    const db = await m();
    if (db?.account) {
      const row = await db.account.findUnique({
        where: { id },
        include: {
          contacts:     { where: { deletedAt: null } },
          opportunities:{ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10 },
          deals:        { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10 },
          journeyEvents:{ orderBy: { occurredAt: "asc" } },
          renewalForecasts: true,
          expansions:   { where: { deletedAt: null } },
        },
      } as never) as CrmAccount | null;
      if (row) {
        const a = row as CrmAccount & { contacts: unknown[]; opportunities: unknown[]; deals: unknown[]; journeyEvents: unknown[]; renewalForecasts: unknown[]; expansions: unknown[] };
        return {
          ...a,
          createdAt: toIso(a.createdAt), updatedAt: toIso(a.updatedAt),
          health: { id: `hs-${a.id}`, accountId: a.id, computedAt: new Date().toISOString(), ...mockHealthForAccount(a.id) } as CrmHealthScore,
          openDeals: (a.deals as { status: string }[]).filter(d => d.status === "OPEN").length,
          renewals: a.renewalForecasts,
        };
      }
    }
  } catch { /* fall through */ }

  const account = CRM_ACCOUNTS.find(a => a.id === id);
  if (!account) return null;
  const health = { id: `hs-${id}`, accountId: id, computedAt: new Date().toISOString(), ...mockHealthForAccount(id) } as CrmHealthScore;
  const deals  = CRM_DEALS.filter(d => d.accountId === id && !d.deletedAt);
  return {
    ...account,
    health,
    openDeals:       deals.filter(d => d.status === "OPEN").length,
    contacts:        [],
    opportunities:   CRM_OPPORTUNITIES.filter(o => o.accountId === id && !o.deletedAt),
    deals,
    journeyEvents:   CRM_JOURNEY_EVENTS.filter(e => e.accountId === id),
    renewals:        CRM_RENEWALS.filter(r => r.accountId === id),
    expansions:      CRM_EXPANSIONS.filter(e => e.accountId === id && !e.deletedAt),
  };
}

// ── Customer Success ──────────────────────────────────────────────────────────

export async function getCustomerSuccessOverview(): Promise<CrmCustomerSuccessOverview> {
  const accounts   = await getCrmAccounts();
  const healthy    = accounts.filter(a => a.health?.category === "HEALTHY").length;
  const watch      = accounts.filter(a => a.health?.category === "WATCH").length;
  const atRisk     = accounts.filter(a => a.health?.category === "AT_RISK").length;
  const critical   = accounts.filter(a => a.health?.category === "CRITICAL").length;

  return {
    accounts,
    renewals:    CRM_RENEWALS,
    expansions:  CRM_EXPANSIONS.filter(e => !e.deletedAt),
    managers:    CRM_MANAGERS,
    healthSummary: { healthy, watch, atRisk, critical },
  };
}
