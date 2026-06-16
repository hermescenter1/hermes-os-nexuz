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
  const t = useTranslations("knowledgeStudio");
  const tVendor = useTranslations("brain.vendors");
  const tDomain = useTranslations("brain.domains");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pct = locale === "fa" ? "\u066A" : "%";

  // Session-only: plain React state. No database, no localStorage.
  const [form, setForm] = useState<Omit<KnowledgeArticle, "id" | "status">>({ ...EMPTY });
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [query, setQuery] = useState("");
  const [fDomain, setFDomain] = useState("all");
  const [fVendor, setFVendor] = useState("all");
  const [fStatus, setFStatus] = useState("all");

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const metrics = useMemo(() => {
    const drafts = articles.filter((a) => a.status === "draft").length;
    const published = articles.filter((a) => a.status === "published").length;
    const domains = new Set(articles.map((a) => a.domain).filter(Boolean)).size;
    return { total: articles.length, drafts, published, domains };
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
            id: String(a.id),
            title: String(a.title ?? ""),
            domain: String(a.domain ?? ""),
            vendor: String(a.vendor ?? ""),
            summary: String(a.summary ?? ""),
            content: String(a.content ?? ""),
            failureModes: (a.failureModes as string[] ?? []).join("\n"),
            diagnostics: (a.diagnosticGuidance as string[] ?? []).join("\n"),
            verification: (a.verificationSteps as string[] ?? []).join("\n"),
            corrective: (a.correctiveActions as string[] ?? []).join("\n"),
            safety: String(a.safetyNotes ?? ""),
            tags: (a.tags as string[] ?? []).join(", "),
            confidence: Number(a.confidence ?? 70),
            status: (a.status as KnowledgeStatus) ?? "draft",
          }))
        );
      }
    } catch {
      /* best-effort; session state remains */
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  async function save() {
    if (form.title.trim() === "") {
      setError(t("validation.titleRequired"));
      return;
    }
    setError(null);
    try {
      await fetch("/api/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          domain: form.domain,
          vendor: form.vendor,
          summary: form.summary,
          content: form.content,
          failureModes: lines(form.failureModes),
          diagnosticGuidance: lines(form.diagnostics),
          verificationSteps: lines(form.verification),
          correctiveActions: lines(form.corrective),
          safetyNotes: form.safety,
          tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
          confidence: form.confidence,
          status: "draft",
        }),
      });
      await refresh();
      setForm({ ...EMPTY });
    } catch {
      setError(t("validation.titleRequired"));
    }
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
    } catch {
      /* optimistic update applied */
    }
  };
  const remove = async (id: string) => {
    setArticles((a) => a.filter((x) => x.id !== id));
    try {
      await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* optimistic removal applied */
    }
  };

  const vendorLabel = (id: string) => (id ? tVendor(id) : "");
  const domainLabel = (id: string) => (id ? tDomain(id) : "");
  const usedVendors = [...new Set(articles.map((a) => a.vendor).filter(Boolean))];
  const usedDomains = [...new Set(articles.map((a) => a.domain).filter(Boolean))];
  const hasFilters = query !== "" || fDomain !== "all" || fVendor !== "all" || fStatus !== "all";

  const ta =
    "w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none";
  const inp =
    "w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none";

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8">
      <div className="mb-2 flex justify-end">
        <StorageIndicator />
      </div>
      <p className="rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-4 py-3 font-body text-sm leading-relaxed text-[var(--warn)]">
        {t("sessionNote")}
      </p>

      {/* Dashboard KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t("metrics.total")} value={nf.format(metrics.total)} />
        <Metric label={t("metrics.drafts")} value={nf.format(metrics.drafts)} />
        <Metric label={t("metrics.published")} value={nf.format(metrics.published)} />
        <Metric label={t("metrics.domains")} value={nf.format(metrics.domains)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Create form */}
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="font-display text-lg font-bold text-ink">{t("form.heading")}</h2>
          <div className="mt-4 space-y-4">
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
            {error && <p className="font-body text-xs text-[var(--danger)]">{error}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={save} className="rounded-lg bg-signal px-4 py-2 font-body text-sm font-semibold text-bg transition-opacity hover:opacity-90">
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
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted">{t("preview.heading")}</h2>
          <p className="mt-1 font-body text-xs text-muted/70">{t("preview.note")}</p>
          {form.title.trim() !== "" ? (
            <div className="mt-4 rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-base font-semibold leading-snug text-ink">{form.title}</h3>
                <span className={`shrink-0 font-mono text-sm ${confTone(form.confidence)}`}>{nf.format(form.confidence)}{pct}</span>
              </div>
              {(form.domain || form.vendor) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {form.domain && <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.65rem] text-muted">{domainLabel(form.domain)}</span>}
                  {form.vendor && <span className="rounded-full border border-signalDim px-2 py-0.5 font-body text-[0.65rem] text-signal" dir="ltr">{vendorLabel(form.vendor)}</span>}
                </div>
              )}
              {form.summary && <p className="mt-3 font-body text-sm leading-relaxed text-ink">{form.summary}</p>}
              {form.content && <PreviewBlock label={t("preview.content")}>{form.content}</PreviewBlock>}
              {form.verification && <PreviewBlock label={t("preview.verification")}>{firstLine(form.verification)}</PreviewBlock>}
              {form.corrective && <PreviewBlock label={t("preview.corrective")}>{firstLine(form.corrective)}</PreviewBlock>}
              {form.safety && (
                <p className="mt-3 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-3 py-2 font-body text-xs leading-relaxed text-[var(--warn)]">
                  {form.safety}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-line bg-surface px-5 py-8 text-center font-body text-sm text-muted/70">{t("preview.empty")}</p>
          )}
        </section>
      </div>

      {/* Search + filter */}
      <h2 className="mt-10 font-mono text-xs uppercase tracking-widest text-muted">{t("filters.heading")}</h2>
      <div className="mt-3 space-y-3">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("filters.search")} className={inp} />
        <div className="flex flex-wrap gap-3">
          <FilterSelect label={t("filters.domain")} all={t("filters.all")} value={fDomain} onChange={setFDomain} options={usedDomains} render={domainLabel} />
          <FilterSelect label={t("filters.vendor")} all={t("filters.all")} value={fVendor} onChange={setFVendor} options={usedVendors} render={vendorLabel} ltr />
          <FilterSelect label={t("filters.status")} all={t("filters.all")} value={fStatus} onChange={setFStatus}
            options={["draft", "review", "published"]} render={(s) => t(`queue.status${s.charAt(0).toUpperCase()}${s.slice(1)}`)} />
          {hasFilters && (
            <button onClick={() => { setQuery(""); setFDomain("all"); setFVendor("all"); setFStatus("all"); }}
              className="self-end font-body text-xs text-signal hover:underline">{t("filters.clear")}</button>
          )}
        </div>
      </div>

      {/* Knowledge queue */}
      <h2 className="mt-8 font-mono text-xs uppercase tracking-widest text-muted">{t("queue.heading")}</h2>
      {articles.length === 0 ? (
        <p className="mt-4 rounded-xl border border-line bg-surface px-5 py-8 text-center font-body text-sm text-muted/70">{t("queue.empty")}</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 rounded-xl border border-line bg-surface px-5 py-8 text-center font-body text-sm text-muted/70">{t("filters.none")}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {filtered.map((a) => (
            <li key={a.id}
              className={`rounded-xl border bg-surface p-4 transition-colors ${
                a.status === "review" ? "border-signal/40" : a.status === "published" ? "border-signalDim" : "border-line"
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-body text-sm font-semibold text-ink">{a.title}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {a.domain && <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.6rem] text-muted">{domainLabel(a.domain)}</span>}
                    {a.vendor && <span className="rounded-full border border-signalDim px-2 py-0.5 font-body text-[0.6rem] text-signal" dir="ltr">{vendorLabel(a.vendor)}</span>}
                    <span className={`rounded-full px-2 py-0.5 font-body text-[0.6rem] ${
                      a.status === "review" ? "border border-signal/50 text-signal" : a.status === "published" ? "bg-signal/10 text-signal" : "border border-line text-muted"
                    }`}>
                      {t(`queue.status${a.status.charAt(0).toUpperCase()}${a.status.slice(1)}`)}
                    </span>
                  </div>
                </div>
                <span className={`shrink-0 font-mono text-sm ${confTone(a.confidence)}`}>{nf.format(a.confidence)}{pct}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setStatus(a.id, "review")} disabled={a.status !== "draft"}
                  className="rounded-lg border border-line px-3 py-1.5 font-body text-xs text-muted transition-colors hover:border-signal/30 hover:text-ink disabled:opacity-40">
                  {t("actions.ready")}
                </button>
                <button onClick={() => setStatus(a.id, "published")} disabled={a.status === "published"}
                  className="rounded-lg border border-line px-3 py-1.5 font-body text-xs text-muted transition-colors hover:border-signal/30 hover:text-ink disabled:opacity-40">
                  {t("actions.publish")}
                </button>
                <button onClick={() => remove(a.id)}
                  className="rounded-lg border border-line px-3 py-1.5 font-body text-xs text-muted transition-colors hover:border-[var(--danger)]/40 hover:text-[var(--danger)]">
                  {t("actions.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="font-body text-[0.7rem] uppercase tracking-wide text-muted">{label}</p>
      <p className="metric mt-2 text-xl text-ink">{value}</p>
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
      <span className="font-mono text-[0.6rem] uppercase tracking-widest text-muted/70">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 block rounded-lg border border-line bg-bg px-3 py-1.5 font-body text-xs text-ink focus:border-signal/50 focus:outline-none"
        {...(ltr ? { dir: "ltr" } : {})}>
        <option value="all">{all}</option>
        {options.map((o) => (
          <option key={o} value={o}>{render(o)}</option>
        ))}
      </select>
    </label>
  );
}
