"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { VENDORS } from "@/lib/industrial/vendors";
import { StorageIndicator } from "@/components/StorageIndicator";
import {
  KNOWLEDGE_DOMAINS,
  type KnowledgeArticle,
  type KnowledgeStatus,
} from "@/lib/knowledge/types";

const EMPTY: Omit<KnowledgeArticle, "id" | "status"> = {
  title: "",
  domain: "",
  vendor: "",
  summary: "",
  content: "",
  failureModes: "",
  diagnostics: "",
  verification: "",
  corrective: "",
  safety: "",
  tags: "",
  confidence: 70,
};

function confTone(c: number): string {
  if (c >= 70) return "text-signal";
  if (c >= 40) return "text-[var(--warn)]";
  return "text-muted";
}
function firstLine(s: string): string {
  return s.split("\n").map((x) => x.trim()).filter(Boolean)[0] ?? "";
}

export function KnowledgeStudioClient() {
  const t       = useTranslations("knowledgeStudio");
  const tVendor = useTranslations("brain.vendors");
  const tDomain = useTranslations("brain.domains");
  const locale  = useLocale();
  const nf  = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pct = locale === "fa" ? "٪" : "%";

  const [form, setForm] = useState<Omit<KnowledgeArticle, "id" | "status">>({ ...EMPTY });
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [query,   setQuery]   = useState("");
  const [fDomain, setFDomain] = useState("all");
  const [fVendor, setFVendor] = useState("all");
  const [fStatus, setFStatus] = useState("all");

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const metrics = useMemo(() => {
    const drafts    = articles.filter((a) => a.status === "draft").length;
    const review    = articles.filter((a) => a.status === "review").length;
    const published = articles.filter((a) => a.status === "published").length;
    const domains   = new Set(articles.map((a) => a.domain).filter(Boolean)).size;
    const avgConf   = articles.length > 0
      ? Math.round(articles.reduce((s, a) => s + a.confidence, 0) / articles.length)
      : 0;
    const domainCounts: Record<string, number> = {};
    const vendorCounts: Record<string, number> = {};
    articles.forEach((a) => {
      if (a.domain) domainCounts[a.domain] = (domainCounts[a.domain] ?? 0) + 1;
      if (a.vendor) vendorCounts[a.vendor] = (vendorCounts[a.vendor] ?? 0) + 1;
    });
    return { total: articles.length, drafts, review, published, domains, avgConf, domainCounts, vendorCounts };
  }, [articles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (fDomain !== "all" && a.domain !== fDomain) return false;
      if (fVendor !== "all" && a.vendor !== fVendor) return false;
      if (fStatus !== "all" && a.status !== fStatus) return false;
      if (q) {
        const blob = `${a.title} ${a.tags} ${a.summary}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [articles, query, fDomain, fVendor, fStatus]);

  async function refresh() {
    try {
      const r = await fetch("/api/knowledge", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (Array.isArray(j.articles)) {
        setArticles(
          j.articles.map((a: Record<string, unknown>) => ({
            id:           String(a.id),
            title:        String(a.title ?? ""),
            domain:       String(a.domain ?? ""),
            vendor:       String(a.vendor ?? ""),
            summary:      String(a.summary ?? ""),
            content:      String(a.content ?? ""),
            failureModes: (a.failureModes as string[] ?? []).join("\n"),
            diagnostics:  (a.diagnosticGuidance as string[] ?? []).join("\n"),
            verification: (a.verificationSteps as string[] ?? []).join("\n"),
            corrective:   (a.correctiveActions as string[] ?? []).join("\n"),
            safety:       String(a.safetyNotes ?? ""),
            tags:         (a.tags as string[] ?? []).join(", "),
            confidence:   Number(a.confidence ?? 70),
            status:       (a.status as KnowledgeStatus) ?? "draft",
          }))
        );
      }
    } catch { /* session state remains */ }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  async function save() {
    if (form.title.trim() === "") { setError(t("validation.titleRequired")); return; }
    setError(null);
    try {
      await fetch("/api/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title:             form.title,
          domain:            form.domain,
          vendor:            form.vendor,
          summary:           form.summary,
          content:           form.content,
          failureModes:      lines(form.failureModes),
          diagnosticGuidance:lines(form.diagnostics),
          verificationSteps: lines(form.verification),
          correctiveActions: lines(form.corrective),
          safetyNotes:       form.safety,
          tags:              form.tags.split(",").map((s) => s.trim()).filter(Boolean),
          confidence:        form.confidence,
          status:            "draft",
        }),
      });
      await refresh();
      setForm({ ...EMPTY });
    } catch { setError(t("validation.titleRequired")); }
  }

  const setStatus = async (id: string, status: KnowledgeStatus) => {
    setArticles((a) => a.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      await fetch("/api/knowledge", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await refresh();
    } catch { /* optimistic update applied */ }
  };

  const remove = async (id: string) => {
    setArticles((a) => a.filter((x) => x.id !== id));
    try {
      await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch { /* optimistic removal */ }
  };

  const vendorLabel  = (id: string) => (id ? tVendor(id) : "");
  const domainLabel  = (id: string) => (id ? tDomain(id) : "");
  const usedVendors  = [...new Set(articles.map((a) => a.vendor).filter(Boolean))];
  const usedDomains  = [...new Set(articles.map((a) => a.domain).filter(Boolean))];
  const hasFilters   = query !== "" || fDomain !== "all" || fVendor !== "all" || fStatus !== "all";

  const ta  = "w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none";
  const inp = "w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none";

  const recentArticles = articles.slice(-4).reverse();

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8">

      {/* Storage indicator */}
      <div className="mb-4 flex items-center justify-between">
        <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 font-body text-xs leading-relaxed text-warn flex-1 me-4">
          {t("sessionNote")}
        </p>
        <StorageIndicator />
      </div>

      {/* ── KPI Strip ────────────────────────────────────────────────────── */}
      <div
        className="flex items-stretch divide-x divide-line border border-line rounded-xl overflow-x-auto mb-6"
        style={{ background: "var(--surface)" }}
      >
        {[
          { label: t("metrics.total"),     value: nf.format(metrics.total),     note: "in library",          color: "text-ink" },
          { label: t("metrics.published"), value: nf.format(metrics.published), note: "live in system",      color: metrics.published > 0 ? "text-signal" : "text-ink" },
          { label: t("metrics.drafts"),    value: nf.format(metrics.drafts),    note: "pending review",      color: metrics.drafts > 0 ? "text-warn" : "text-ink" },
          { label: "Review",               value: nf.format(metrics.review),    note: "awaiting publish",    color: metrics.review > 0 ? "text-ice" : "text-ink" },
          { label: t("metrics.domains"),   value: nf.format(metrics.domains),   note: "domains covered",     color: "text-ink" },
          { label: "Avg Confidence",       value: metrics.total > 0 ? `${nf.format(metrics.avgConf)}${pct}` : "—",  note: "quality score",  color: metrics.avgConf >= 70 ? "text-signal" : metrics.avgConf >= 40 ? "text-warn" : "text-ink" },
        ].map((kpi) => (
          <div key={kpi.label} className="flex-1 min-w-[95px] px-4 py-4">
            <p className="type-eyebrow mb-1.5">{kpi.label}</p>
            <p className={`metric text-xl ${kpi.color}`}>{kpi.value}</p>
            <p className="mt-1 type-caption">{kpi.note}</p>
          </div>
        ))}
      </div>

      {/* ── Operations Overview ───────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3 mb-8">

        {/* Library Health (2/3) */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Publishing Pipeline */}
          <section
            className="rounded-xl border border-line bg-surface p-5"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
          >
            <h2 className="type-panel-title mb-4">Publishing Pipeline</h2>
            <div className="flex items-center gap-0 mb-5">
              {[
                { label: "Draft",     count: metrics.drafts,    color: "border-line text-muted",        dot: "bg-muted/50"  },
                { label: "Review",    count: metrics.review,    color: "border-signal/30 text-ice",     dot: "bg-ice/70"    },
                { label: "Published", count: metrics.published, color: "border-signal/40 text-signal",  dot: "bg-signal"    },
              ].map((stage, i) => (
                <div key={stage.label} className="flex items-center flex-1 min-w-0">
                  <div className={`flex-1 rounded-lg border ${stage.color} px-3 py-3 text-center`}>
                    <p className={`metric text-2xl`}>{nf.format(stage.count)}</p>
                    <div className="flex items-center justify-center gap-1.5 mt-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
                      <p className="type-eyebrow">{stage.label}</p>
                    </div>
                  </div>
                  {i < 2 && (
                    <div className="flex-shrink-0 mx-1.5 text-faint text-xs">→</div>
                  )}
                </div>
              ))}
            </div>

            {/* Recent articles feed */}
            {recentArticles.length > 0 ? (
              <div className="border-t border-line pt-4">
                <p className="type-eyebrow mb-3">Recent Articles</p>
                <ul className="space-y-2.5">
                  {recentArticles.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 rounded-lg border border-line/50 bg-surface2/40 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm font-medium text-ink truncate">{a.title}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {a.domain && (
                            <span className="rounded border border-line px-1.5 py-0.5 font-body text-[0.60rem] text-muted">
                              {domainLabel(a.domain)}
                            </span>
                          )}
                          {a.vendor && (
                            <span className="rounded border border-line/60 px-1.5 py-0.5 font-body text-[0.60rem] text-muted" dir="ltr">
                              {vendorLabel(a.vendor)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`font-mono text-xs ${confTone(a.confidence)}`}>
                          {nf.format(a.confidence)}{pct}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 font-body text-[0.60rem] ${
                          a.status === "published" ? "bg-signal/10 text-signal"
                          : a.status === "review"  ? "border border-line text-ice"
                          : "border border-line text-muted"
                        }`}>
                          {t(`queue.status${a.status.charAt(0).toUpperCase()}${a.status.slice(1)}`)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* Domain Distribution */}
          {metrics.total > 0 && (
            <section
              className="rounded-xl border border-line bg-surface p-5"
              style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
            >
              <h2 className="type-panel-title mb-4">Domain Distribution</h2>
              {Object.keys(metrics.domainCounts).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(metrics.domainCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([d, count]) => {
                      const maxCount = Math.max(...Object.values(metrics.domainCounts));
                      return (
                        <div key={d}>
                          <div className="flex justify-between font-body text-xs mb-1">
                            <span className="text-muted">{domainLabel(d)}</span>
                            <span className="font-mono text-ink">{nf.format(count)}</span>
                          </div>
                          <div className="h-1 rounded bg-line">
                            <div
                              className="h-1 rounded bg-signal/70"
                              style={{ inlineSize: `${Math.round((count / maxCount) * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="type-caption">No domain data yet — add articles to see distribution</p>
              )}
            </section>
          )}
        </div>

        {/* Library Health (1/3) */}
        <div className="flex flex-col gap-5">

          {/* Health overview */}
          <section
            className="rounded-xl border border-line bg-surface p-5"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
          >
            <h2 className="type-panel-title mb-4">Library Health</h2>
            <ul className="space-y-3 mb-5">
              {[
                {
                  label: "Publication Rate",
                  value: metrics.total > 0
                    ? `${nf.format(Math.round((metrics.published / metrics.total) * 100))}${pct}`
                    : "—",
                  tone: metrics.total > 0 && (metrics.published / metrics.total) >= 0.5 ? "text-signal" : "text-muted",
                },
                {
                  label: "Avg Quality Score",
                  value: metrics.total > 0 ? `${nf.format(metrics.avgConf)}${pct}` : "—",
                  tone: confTone(metrics.avgConf),
                },
                {
                  label: "Domains Covered",
                  value: `${nf.format(metrics.domains)} / ${KNOWLEDGE_DOMAINS.length}`,
                  tone: metrics.domains >= KNOWLEDGE_DOMAINS.length * 0.5 ? "text-signal" : "text-muted",
                },
                {
                  label: "Vendors Represented",
                  value: `${nf.format(Object.keys(metrics.vendorCounts).length)} / ${VENDORS.length}`,
                  tone: "text-ink",
                },
              ].map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-2">
                  <span className="font-body text-xs text-muted">{row.label}</span>
                  <span className={`font-mono text-sm font-medium ${row.tone}`}>{row.value}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line pt-4">
              <p className="type-eyebrow mb-3">Safety Compliance</p>
              <ul className="space-y-2">
                {["Read-only — no PLC writes", "Deterministic — no LLM", "Audit trail on all mutations"].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-signal flex-shrink-0 mt-1.5" />
                    <span className="type-caption leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Vendor Distribution */}
          {Object.keys(metrics.vendorCounts).length > 0 && (
            <section
              className="rounded-xl border border-line bg-surface p-5"
              style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
            >
              <h2 className="type-panel-title mb-4">Vendor Distribution</h2>
              <ul className="space-y-2">
                {Object.entries(metrics.vendorCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([v, count]) => (
                    <li key={v} className="flex items-center justify-between gap-2">
                      <span className="font-body text-xs text-muted" dir="ltr">{vendorLabel(v)}</span>
                      <span className="font-mono text-xs text-ink">{nf.format(count)}</span>
                    </li>
                  ))}
              </ul>
            </section>
          )}

        </div>
      </div>

      {/* ── Article Management ─────────────────────────────────────────────── */}
      <div className="border-t border-line pt-8">
        <p className="type-eyebrow mb-6">Article Management</p>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Create form */}
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="type-panel-title mb-4">{t("form.heading")}</h2>
            <div className="space-y-4">
              <Field label={t("form.title")}>
                <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)} className={inp} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("form.domain")}>
                  <select value={form.domain} onChange={(e) => set("domain", e.target.value as typeof form.domain)} className={inp}>
                    <option value="">{t("form.selectDomain")}</option>
                    {KNOWLEDGE_DOMAINS.map((d) => (
                      <option key={d} value={d}>{tDomain(d)}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t("form.vendor")}>
                  <select value={form.vendor} onChange={(e) => set("vendor", e.target.value)} className={inp}>
                    <option value="">{t("form.vendorNone")}</option>
                    {VENDORS.map((v) => (
                      <option key={v.id} value={v.id}>{tVendor(v.id)}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label={t("form.summary")}>
                <textarea value={form.summary} onChange={(e) => set("summary", e.target.value)} rows={2} className={ta} />
              </Field>
              <Field label={t("form.content")}>
                <textarea value={form.content} onChange={(e) => set("content", e.target.value)} rows={3} className={ta} />
              </Field>
              <Field label={t("form.failureModes")} hint={t("form.multiHint")}>
                <textarea value={form.failureModes} onChange={(e) => set("failureModes", e.target.value)} rows={2} className={ta} />
              </Field>
              <Field label={t("form.diagnostics")} hint={t("form.multiHint")}>
                <textarea value={form.diagnostics} onChange={(e) => set("diagnostics", e.target.value)} rows={2} className={ta} />
              </Field>
              <Field label={t("form.verification")} hint={t("form.multiHint")}>
                <textarea value={form.verification} onChange={(e) => set("verification", e.target.value)} rows={2} className={ta} />
              </Field>
              <Field label={t("form.corrective")} hint={t("form.multiHint")}>
                <textarea value={form.corrective} onChange={(e) => set("corrective", e.target.value)} rows={2} className={ta} />
              </Field>
              <Field label={t("form.safety")}>
                <textarea value={form.safety} onChange={(e) => set("safety", e.target.value)} rows={2} className={ta} />
              </Field>
              <Field label={t("form.tags")} hint={t("form.tagsHint")}>
                <input type="text" value={form.tags} onChange={(e) => set("tags", e.target.value)} className={inp} dir="ltr" />
              </Field>
              <Field label={`${t("form.confidence")} — ${nf.format(form.confidence)}${pct}`}>
                <input type="range" min={0} max={100} step={5} value={form.confidence}
                  onChange={(e) => set("confidence", Number(e.target.value))}
                  className="w-full accent-[color:var(--signal)]" dir="ltr" />
              </Field>
              {error && <p className="font-body text-xs text-danger">{error}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={save}
                  className="rounded-lg bg-signal px-4 py-2 font-body text-sm font-semibold text-bg transition-opacity hover:opacity-90">
                  {t("actions.save")}
                </button>
                <button onClick={() => { setForm({ ...EMPTY }); setError(null); }}
                  className="rounded-lg border border-line px-4 py-2 font-body text-sm text-muted transition-colors hover:text-ink">
                  {t("form.reset")}
                </button>
              </div>
            </div>
          </section>

          {/* Live preview */}
          <section>
            <h2 className="type-eyebrow mb-1">{t("preview.heading")}</h2>
            <p className="mb-4 font-body text-xs text-muted/70">{t("preview.note")}</p>
            {form.title.trim() !== "" ? (
              <div className="rounded-xl border border-line bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-base font-semibold leading-snug text-ink">{form.title}</h3>
                  <span className={`shrink-0 font-mono text-sm ${confTone(form.confidence)}`}>{nf.format(form.confidence)}{pct}</span>
                </div>
                {(form.domain || form.vendor) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {form.domain && <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.65rem] text-muted">{domainLabel(form.domain)}</span>}
                    {form.vendor && <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.65rem] text-muted" dir="ltr">{vendorLabel(form.vendor)}</span>}
                  </div>
                )}
                {form.summary    && <p className="mt-3 font-body text-sm leading-relaxed text-ink">{form.summary}</p>}
                {form.content    && <PreviewBlock label={t("preview.content")}>{form.content}</PreviewBlock>}
                {form.verification && <PreviewBlock label={t("preview.verification")}>{firstLine(form.verification)}</PreviewBlock>}
                {form.corrective && <PreviewBlock label={t("preview.corrective")}>{firstLine(form.corrective)}</PreviewBlock>}
                {form.safety && (
                  <p className="mt-3 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 font-body text-xs leading-relaxed text-warn">
                    {form.safety}
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-xl border border-line bg-surface px-5 py-8 text-center font-body text-sm text-muted/70">
                {t("preview.empty")}
              </p>
            )}
          </section>
        </div>
      </div>

      {/* ── Article Queue ─────────────────────────────────────────────────── */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="type-panel-title">{t("queue.heading")}</h2>
          <span className="font-mono text-xs text-muted">{nf.format(filtered.length)} / {nf.format(articles.length)}</span>
        </div>

        {/* Filters */}
        <div className="mb-4 space-y-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("filters.search")}
            className={inp}
          />
          <div className="flex flex-wrap gap-3">
            <FilterSelect label={t("filters.domain")} all={t("filters.all")} value={fDomain} onChange={setFDomain} options={usedDomains} render={domainLabel} />
            <FilterSelect label={t("filters.vendor")} all={t("filters.all")} value={fVendor} onChange={setFVendor} options={usedVendors} render={vendorLabel} ltr />
            <FilterSelect label={t("filters.status")} all={t("filters.all")} value={fStatus} onChange={setFStatus}
              options={["draft", "review", "published"]}
              render={(s) => t(`queue.status${s.charAt(0).toUpperCase()}${s.slice(1)}`)} />
            {hasFilters && (
              <button
                onClick={() => { setQuery(""); setFDomain("all"); setFVendor("all"); setFStatus("all"); }}
                className="self-end font-body text-xs text-signal hover:underline"
              >
                {t("filters.clear")}
              </button>
            )}
          </div>
        </div>

        {/* List */}
        {articles.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-5 py-8 text-center font-body text-sm text-muted/70">
            {t("queue.empty")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-5 py-8 text-center font-body text-sm text-muted/70">
            {t("filters.none")}
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((a) => (
              <li
                key={a.id}
                className={`rounded-xl border bg-surface p-4 transition-colors ${
                  a.status === "review"    ? "border-signal/40"
                  : a.status === "published" ? "border-line2"
                  : "border-line"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-body text-sm font-semibold text-ink">{a.title}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {a.domain && <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.6rem] text-muted">{domainLabel(a.domain)}</span>}
                      {a.vendor && <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.6rem] text-muted" dir="ltr">{vendorLabel(a.vendor)}</span>}
                      <span className={`rounded-full px-2 py-0.5 font-body text-[0.6rem] ${
                        a.status === "review"    ? "border border-signal/50 text-signal"
                        : a.status === "published" ? "bg-signal/10 text-signal"
                        : "border border-line text-muted"
                      }`}>
                        {t(`queue.status${a.status.charAt(0).toUpperCase()}${a.status.slice(1)}`)}
                      </span>
                    </div>
                  </div>
                  <span className={`shrink-0 font-mono text-sm ${confTone(a.confidence)}`}>
                    {nf.format(a.confidence)}{pct}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => setStatus(a.id, "review")}
                    disabled={a.status !== "draft"}
                    className="rounded-lg border border-line px-3 py-1.5 font-body text-xs text-muted transition-colors hover:border-signal/30 hover:text-ink disabled:opacity-40"
                  >
                    {t("actions.ready")}
                  </button>
                  <button
                    onClick={() => setStatus(a.id, "published")}
                    disabled={a.status === "published"}
                    className="rounded-lg border border-line px-3 py-1.5 font-body text-xs text-muted transition-colors hover:border-signal/30 hover:text-ink disabled:opacity-40"
                  >
                    {t("actions.publish")}
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="rounded-lg border border-line px-3 py-1.5 font-body text-xs text-muted transition-colors hover:border-danger/40 hover:text-danger"
                  >
                    {t("actions.delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-body text-xs text-muted">
        {label}
        {hint && <span className="ms-2 text-muted/60">({hint})</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function PreviewBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="font-mono text-[0.6rem] uppercase tracking-widest text-muted/70">{label}</p>
      <p className="mt-0.5 font-body text-xs leading-relaxed text-ink">{children}</p>
    </div>
  );
}

function FilterSelect({
  label, all, value, onChange, options, render, ltr = false,
}: {
  label: string; all: string; value: string; onChange: (v: string) => void;
  options: string[]; render: (v: string) => string; ltr?: boolean;
}) {
  return (
    <label className="block">
      <span className="type-eyebrow">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block rounded-lg border border-line bg-bg px-3 py-1.5 font-body text-xs text-ink focus:border-signal/50 focus:outline-none"
        {...(ltr ? { dir: "ltr" } : {})}
      >
        <option value="all">{all}</option>
        {options.map((o) => (
          <option key={o} value={o}>{render(o)}</option>
        ))}
      </select>
    </label>
  );
}
