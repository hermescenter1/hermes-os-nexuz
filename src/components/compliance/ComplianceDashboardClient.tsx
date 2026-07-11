"use client";

import { useState, useEffect } from "react";
import { useTranslations }      from "next-intl";
import { Link }                 from "@/i18n/navigation";

interface Stats {
  totalPrivacyRequests: number; pendingRequests: number; completedRequests: number;
  totalConsentRecords: number; totalCookieConsents: number; totalExportRequests: number;
  totalDeletionRequests: number; totalLegalDocuments: number; publishedLegalDocuments: number;
}
interface Request { id: string; requestType: string; email: string; status: string; createdAt: string; locale: string; }
interface Doc { id: string; documentType: string; version: string; isPublished: boolean; locale: string; title: string; updatedAt: string; }
interface Form { documentType: string; version: string; title: string; content: string; locale: string; }

const BLANK: Form = { documentType: "PRIVACY_POLICY", version: "1.0", title: "", content: "", locale: "en" };

export function ComplianceDashboardClient({ view = "overview" }: { view?: "overview" | "requests" | "documents" | "consents" }) {
  const t = useTranslations("adminGovernance.compliance");
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [docs,     setDocs]     = useState<Doc[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [form,     setForm]     = useState<Form>({ ...BLANK });
  const [saving,   setSaving]   = useState(false);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const [ov, rq, dc] = await Promise.all([
      fetch("/api/compliance/overview").then((r) => r.json()),
      fetch("/api/compliance/privacy-requests").then((r) => r.json()),
      fetch("/api/compliance/legal-documents").then((r) => r.json()),
    ]);
    const o = ov as { stats?: Stats };
    const r = rq as { requests?: Request[] };
    const d = dc as { documents?: Doc[] };
    if (o.stats) setStats(o.stats);
    setRequests(r.requests ?? []);
    setDocs(d.documents ?? []);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/compliance/privacy-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function createDoc() {
    setSaving(true);
    await fetch("/api/compliance/legal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, publish: true }),
    });
    setCreating(false);
    setForm({ ...BLANK });
    await load();
    setSaving(false);
  }

  const f = (k: keyof Form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  if (loading) return <div className="py-16 text-center text-muted text-sm">{t("loading")}</div>;

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      {stats && (
        <div className="global-ops-strip">
          <div className="global-ops-cell"><span className="kpi-label">{t("kpiPrivacyRequests")}</span><span className="intel-kpi-value">{stats.totalPrivacyRequests}</span></div>
          <div className="global-ops-cell"><span className="kpi-label">{t("kpiPending")}</span><span className="intel-kpi-value text-amber-400">{stats.pendingRequests}</span></div>
          <div className="global-ops-cell"><span className="kpi-label">{t("kpiConsentRecords")}</span><span className="intel-kpi-value">{stats.totalConsentRecords}</span></div>
          <div className="global-ops-cell"><span className="kpi-label">{t("kpiCookieConsents")}</span><span className="intel-kpi-value">{stats.totalCookieConsents}</span></div>
          <div className="global-ops-cell"><span className="kpi-label">{t("kpiLegalDocs")}</span><span className="intel-kpi-value text-signal">{stats.publishedLegalDocuments}/{stats.totalLegalDocuments}</span></div>
          <div className="global-ops-cell"><span className="kpi-label">{t("kpiDataRequests")}</span><span className="intel-kpi-value">{stats.totalExportRequests + stats.totalDeletionRequests}</span></div>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {[
          { label: t("tabOverview"),  href: "/compliance"                  },
          { label: t("tabRequests"),  href: "/compliance/privacy-requests" },
          { label: t("tabDocuments"), href: "/compliance/legal-documents"  },
          { label: t("tabConsents"),  href: "/compliance/consents"         },
        ].map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="shrink-0 border-b-2 border-transparent px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted hover:text-ink transition-colors"
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Privacy requests table */}
      {(view === "overview" || view === "requests") && requests.length > 0 && (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70 mb-3">
            {view === "overview" ? t("recentRequests") : t("allRequests")}
          </h2>
          <div className="rounded-xl border border-line overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-bg border-b border-line">
                  {[t("colType"), t("colEmail"), t("colStatus"), t("colDate"), ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-muted/70">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(view === "overview" ? requests.slice(0, 5) : requests).map((r) => (
                  <tr key={r.id} className="hover:bg-bg/50">
                    <td className="px-4 py-3 font-mono text-ink capitalize">{r.requestType.replace(/_/g, " ").toLowerCase()}</td>
                    <td className="px-4 py-3 text-muted">{r.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[9px] font-mono uppercase ${
                        r.status === "COMPLETED" ? "bg-signal/10 text-signal" :
                        r.status === "PENDING"   ? "bg-amber-400/10 text-amber-300" :
                        r.status === "IN_REVIEW" ? "bg-ice/10 text-ice" :
                                                   "bg-danger/10 text-danger"
                      }`}>
                        {r.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {r.status === "PENDING" && (
                        <div className="flex gap-1">
                          <button onClick={() => updateStatus(r.id, "IN_REVIEW")} className="text-[10px] font-mono text-muted hover:text-ice transition-colors">{t("review")}</button>
                          <button onClick={() => updateStatus(r.id, "COMPLETED")} className="text-[10px] font-mono text-muted hover:text-signal transition-colors">{t("complete")}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Legal documents */}
      {(view === "overview" || view === "documents") && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">{t("legalDocuments")}</h2>
            <button
              onClick={() => setCreating((v) => !v)}
              className="rounded-lg bg-signal px-3 py-1.5 text-[10px] font-mono font-semibold text-bg hover:bg-signal/90 transition-colors"
            >
              {creating ? t("cancelDoc") : t("newDoc")}
            </button>
          </div>

          {creating && (
            <div className="rounded-xl border border-signal/30 bg-surface p-5 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="kpi-label mb-1 block">{t("formType")}</label>
                  <select value={form.documentType} onChange={(e) => f("documentType", e.target.value)}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal">
                    {["PRIVACY_POLICY","TERMS_OF_SERVICE","COOKIE_POLICY","DPA","CANDIDATE_CONSENT","ACADEMY_TERMS","MARKETING_CONSENT"].map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="kpi-label mb-1 block">{t("formVersion")}</label>
                  <input value={form.version} onChange={(e) => f("version", e.target.value)}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal" />
                </div>
                <div className="sm:col-span-2">
                  <label className="kpi-label mb-1 block">{t("formTitle")}</label>
                  <input value={form.title} onChange={(e) => f("title", e.target.value)}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal" />
                </div>
                <div className="sm:col-span-2">
                  <label className="kpi-label mb-1 block">{t("formContent")}</label>
                  <textarea value={form.content} onChange={(e) => f("content", e.target.value)}
                    rows={6} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal resize-y" />
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={createDoc} disabled={saving || !form.title || !form.content}
                  className="rounded-lg bg-signal px-5 py-2 text-xs font-mono font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50">
                  {saving ? t("saving") : t("createPublish")}
                </button>
              </div>
            </div>
          )}

          {docs.length > 0 ? (
            <div className="rounded-xl border border-line overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-bg border-b border-line">
                    {[t("docColType"), t("docColTitle"), t("docColVersion"), t("docColLocale"), t("docColStatus"), t("docColUpdated")].map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-muted/70">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {docs.map((d) => (
                    <tr key={d.id} className="hover:bg-bg/50">
                      <td className="px-4 py-3 font-mono text-[10px] text-muted uppercase">{d.documentType.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-ink">{d.title}</td>
                      <td className="px-4 py-3 text-muted">{d.version}</td>
                      <td className="px-4 py-3 text-muted uppercase">{d.locale}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-[9px] font-mono uppercase ${d.isPublished ? "bg-signal/10 text-signal" : "bg-amber-400/10 text-amber-300"}`}>
                          {d.isPublished ? t("published") : t("draft")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{new Date(d.updatedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted text-sm">{t("noDocs")}</p>
          )}
        </section>
      )}
    </div>
  );
}
