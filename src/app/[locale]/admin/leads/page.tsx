import { setRequestLocale, getTranslations, getLocale } from "next-intl/server";
import { DEFAULT_LOCALE }       from "@/i18n/locales";
import { RequireCapability }    from "@/components/auth/RequireCapability";
import { noIndexMetadata }      from "@/lib/seo/metadata";
import { getPrisma }            from "@/lib/db/prisma";
import { AccessRequestActions } from "@/components/admin/AccessRequestActions";
import { formatDate } from "@/lib/i18n/format";

export const metadata = noIndexMetadata("Sales Leads — Hermes Admin");
export const dynamic  = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SalesLeadRow {
  id:            string;
  fullName:      string;
  email:         string;
  phone:         string | null;
  company:       string | null;
  country:       string | null;
  industry:      string | null;
  interest:      string | null;
  useCase:       string | null;
  message:       string | null;
  companySize:   string | null;
  roleTitle:     string | null;
  preferredDemo: string | null;
  source:        string;
  status:        string;
  locale:        string | null;
  createdAt:     string;
}

async function getLeads(): Promise<SalesLeadRow[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  try {
    const rows = await (prisma as never as {
      salesLead: {
        findMany: (a: unknown) => Promise<unknown[]>;
      };
    }).salesLead.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, fullName: true, email: true, phone: true,
        company: true, country: true, industry: true, interest: true,
        useCase: true, message: true, companySize: true, roleTitle: true,
        preferredDemo: true, source: true, status: true, locale: true, createdAt: true,
      },
    });
    return rows.map(r => {
      const d = r as Record<string, unknown>;
      return {
        id:            String(d.id ?? ""),
        fullName:      String(d.fullName ?? ""),
        email:         String(d.email ?? ""),
        phone:         d.phone as string | null,
        company:       d.company as string | null,
        country:       d.country as string | null,
        industry:      d.industry as string | null,
        interest:      d.interest as string | null,
        useCase:       d.useCase as string | null,
        message:       d.message as string | null,
        companySize:   d.companySize as string | null,
        roleTitle:     d.roleTitle as string | null,
        preferredDemo: d.preferredDemo as string | null,
        source:        String(d.source ?? "WEBSITE"),
        status:        String(d.status ?? "NEW"),
        locale:        d.locale as string | null,
        createdAt:     d.createdAt instanceof Date
          ? d.createdAt.toISOString()
          : String(d.createdAt ?? ""),
      };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/leads] DB error:", msg);
    return [];
  }
}

function fmtDate(s: string, locale = "en") {
  return formatDate(s, locale, { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_CLS: Record<string, string> = {
  NEW:       "bg-[rgba(30,200,164,0.08)] text-[#1EC8A4] border-[rgba(30,200,164,0.2)]",
  REVIEWED:  "bg-[rgba(96,180,240,0.08)] text-[#60B4F0] border-[rgba(96,180,240,0.2)]",
  CONTACTED: "bg-[rgba(234,179,8,0.08)]  text-[#EAB308] border-[rgba(234,179,8,0.2)]",
  APPROVED:  "bg-[rgba(56,189,248,0.08)] text-[#38BDF8] border-[rgba(56,189,248,0.2)]",
  REJECTED:  "bg-[rgba(239,68,68,0.08)]  text-[#EF4444] border-[rgba(239,68,68,0.22)]",
  CLOSED:    "bg-[#172234]/60           text-[#4A5A6E]  border-[#1E2E40]",
};

// ── Lead card (shared by both sections) ───────────────────────────────────────

async function LeadCard({ lead, actions }: { lead: SalesLeadRow; actions?: boolean }) {
  let requestLocale: string = DEFAULT_LOCALE;
  try { requestLocale = await getLocale(); } catch { /* header unavailable */ }
  const locale = requestLocale;
  const t = await getTranslations("adminOperations.leads");
  return (
    <details
                className="group rounded-xl border border-[#1E2E40] bg-[#0C1420]/50 overflow-hidden">
                {/* Summary row */}
                <summary className="flex flex-wrap items-center gap-3 px-4 py-3.5 cursor-pointer list-none hover:bg-[#111C2A]/60 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#F0F4F8]">{lead.fullName}</span>
                      {lead.company && (
                        <span className="text-[10px] text-[#5A6B80] font-mono">· {lead.company}</span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-[#4A5A6E] font-mono">{lead.email}</span>
                      {lead.country && <span className="text-[10px] text-[#4A5A6E] font-mono">· {lead.country}</span>}
                      {lead.industry && <span className="text-[10px] text-[#4A5A6E] font-mono">· {lead.industry}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {lead.interest && (
                      <span className="text-[9px] px-2 py-0.5 rounded border bg-[rgba(96,180,240,0.06)] text-[#60B4F0] border-[rgba(96,180,240,0.2)] font-mono uppercase">
                        {lead.interest.replace(/_/g, " ")}
                      </span>
                    )}
                    <span className={`text-[9px] px-2 py-0.5 rounded border font-mono uppercase ${STATUS_CLS[lead.status] ?? STATUS_CLS.NEW}`}>
                      {lead.status}
                    </span>
                    <span className="text-[9px] text-[#4A5A6E] font-mono">{fmtDate(lead.createdAt, locale)}</span>
                    <svg viewBox="0 0 20 20" fill="currentColor"
                      className="w-3.5 h-3.5 text-[#4A5A6E] group-open:rotate-180 transition-transform">
                      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
                    </svg>
                  </div>
                </summary>

                {/* Detail panel */}
                <div className="border-t border-[#1E2E40] px-4 py-4 bg-[#0a111e]/40">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4 text-[10px] font-mono">
                    {[
                      { k: t("phone"),    v: lead.phone },
                      { k: t("role"),     v: lead.roleTitle },
                      { k: t("size"),     v: lead.companySize },
                      { k: t("prefDemo"), v: lead.preferredDemo },
                      { k: t("locale"),   v: lead.locale },
                    ].map(({ k, v }) => v ? (
                      <div key={k}>
                        <p className="text-[#4A5A6E] uppercase tracking-wider mb-0.5">{k}</p>
                        <p className="text-[#8A9BB0]">{v}</p>
                      </div>
                    ) : null)}
                  </div>
                  {lead.useCase && (
                    <div className="mb-3">
                      <p className="text-[9px] font-mono uppercase tracking-wider text-[#4A5A6E] mb-1">
                        {t("useCase")}
                      </p>
                      <p className="text-xs text-[#8A9BB0] leading-relaxed whitespace-pre-wrap">{lead.useCase}</p>
                    </div>
                  )}
                  {lead.message && (
                    <div>
                      <p className="text-[9px] font-mono uppercase tracking-wider text-[#4A5A6E] mb-1">
                        {t("message")}
                      </p>
                      <p className="text-xs text-[#8A9BB0] leading-relaxed whitespace-pre-wrap">{lead.message}</p>
                    </div>
                  )}
                  {actions && <AccessRequestActions leadId={lead.id} initialStatus={lead.status} />}
                </div>
              </details>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminLeadsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t  = await getTranslations("adminAccess");
  const tl = await getTranslations("adminOperations.leads");

  const leads = await getLeads();
  const accessRequests = leads.filter(l => l.source === "AUTH_ACCESS_REQUEST");
  const demoLeads      = leads.filter(l => l.source !== "AUTH_ACCESS_REQUEST");

  return (
    <RequireCapability capability="admin">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#1EC8A4] mb-1">
            {tl("brand")}
          </p>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-[#1EC8A4] to-[rgba(30,200,164,0.2)]" />
            <h1 className="text-lg font-bold text-[#F0F4F8] uppercase tracking-wider">
              {tl("title")}
            </h1>
          </div>
          <p className="text-xs text-[#4A5A6E] font-mono">
            {leads.length} {tl("leadsUnit")} · {tl("adminOnly")}
          </p>
        </div>

        {/* ── Access requests (Phase 81C) — distinct from demo/sales leads ── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] px-2 py-0.5 rounded border bg-[rgba(56,189,248,0.06)] text-[#38BDF8] border-[rgba(56,189,248,0.2)] font-mono uppercase">
              AUTH
            </span>
            <h2 className="text-sm font-bold text-[#F0F4F8] uppercase tracking-wider">
              {t("accessRequests")}
            </h2>
            <span className="text-[10px] text-[#4A5A6E] font-mono">({accessRequests.length})</span>
          </div>
          {accessRequests.length === 0 ? (
            <div className="rounded-xl border border-[#1E2E40] bg-[#0C1420]/40 p-6 text-center">
              <p className="text-xs text-[#4A5A6E] font-mono">
                {tl("accessEmpty")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accessRequests.map(lead => (
                <LeadCard key={lead.id} lead={lead} actions />
              ))}
            </div>
          )}
        </div>

        {/* ── Demo requests / sales leads ── */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[9px] px-2 py-0.5 rounded border bg-[rgba(30,200,164,0.06)] text-[#1EC8A4] border-[rgba(30,200,164,0.2)] font-mono uppercase">
            SALES
          </span>
          <h2 className="text-sm font-bold text-[#F0F4F8] uppercase tracking-wider">
            {tl("salesTitle")}
          </h2>
          <span className="text-[10px] text-[#4A5A6E] font-mono">({demoLeads.length})</span>
        </div>
        {demoLeads.length === 0 ? (
          <div className="rounded-xl border border-[#1E2E40] bg-[#0C1420]/40 p-12 text-center">
            <p className="text-sm text-[#4A5A6E] font-mono">
              {tl("salesEmpty")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {demoLeads.map(lead => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </div>
    </RequireCapability>
  );
}
