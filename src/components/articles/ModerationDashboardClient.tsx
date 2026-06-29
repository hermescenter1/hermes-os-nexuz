"use client";

import { useState }    from "react";
import Link             from "next/link";
import { useLocale }   from "next-intl";
import type { ArticleListItem } from "@/lib/articles/types";

function fmtDate(d: string, isFa = false) {
  const date = new Date(d);
  if (isFa) {
    try { return date.toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" }); }
    catch { return date.toLocaleDateString(); }
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtNum(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function statusConfig(s: string): { color: string; dot: string; label_en: string; label_fa: string } {
  const map: Record<string, { color: string; dot: string; label_en: string; label_fa: string }> = {
    DRAFT:      { color: "bg-surface3 text-faint border-line/40",          dot: "bg-faint",   label_en: "Draft",     label_fa: "پیش‌نویس"  },
    SUBMITTED:  { color: "bg-warn/[0.10] text-warn border-warn/20",        dot: "bg-warn",    label_en: "Submitted", label_fa: "ارسال‌شده"  },
    IN_REVIEW:  { color: "bg-ice/[0.10] text-ice border-ice/20",           dot: "bg-ice",     label_en: "In Review", label_fa: "در بررسی"   },
    PUBLISHED:  { color: "bg-signal/[0.10] text-signal border-signal/20",  dot: "bg-signal",  label_en: "Published", label_fa: "منتشرشده"   },
    REJECTED:   { color: "bg-danger/[0.10] text-danger border-danger/20",  dot: "bg-danger",  label_en: "Rejected",  label_fa: "رد شده"     },
    ARCHIVED:   { color: "bg-surface3 text-muted border-line/40",          dot: "bg-muted",   label_en: "Archived",  label_fa: "آرشیوشده"   },
  };
  return map[s] ?? { color: "bg-surface3 text-faint border-line/40", dot: "bg-faint", label_en: s, label_fa: s };
}

interface ArticleActionState {
  loading:        boolean;
  error:          string | null;
  overrideStatus: string | null;
  showRejectForm: boolean;
  rejectReason:   string;
}

const defaultState: ArticleActionState = {
  loading: false, error: null, overrideStatus: null, showRejectForm: false, rejectReason: "",
};

interface Props {
  articles: ArticleListItem[];
  mode: "moderation" | "submissions" | "review-queue" | "reports" | "editorial" | "all";
}

export function ModerationDashboardClient({ articles, mode }: Props) {
  const locale = useLocale();
  const isFa   = locale === "fa";

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch]             = useState("");
  const [actionStates, setActionStates] = useState<Record<string, ArticleActionState>>({});

  function getState(id: string): ArticleActionState {
    return actionStates[id] ?? defaultState;
  }

  function patch(id: string, delta: Partial<ArticleActionState>) {
    setActionStates(prev => ({ ...prev, [id]: { ...(prev[id] ?? defaultState), ...delta } }));
  }

  async function handleApprove(id: string) {
    const st = getState(id);
    if (st.loading) return;
    patch(id, { loading: true, error: null });
    try {
      const res  = await fetch(`/api/articles/review/${id}/approve`, { method: "POST" });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) {
        const errMsg = typeof (data as { error?: string }).error === "string"
          ? (data as { error: string }).error
          : (isFa ? "خطا در تأیید مقاله" : "Approval failed");
        patch(id, { loading: false, error: errMsg });
        return;
      }
      patch(id, { loading: false, overrideStatus: "PUBLISHED", error: null });
    } catch {
      patch(id, { loading: false, error: isFa ? "خطای شبکه" : "Network error" });
    }
  }

  function openRejectForm(id: string) {
    patch(id, { showRejectForm: true, error: null });
  }

  function cancelReject(id: string) {
    patch(id, { showRejectForm: false, rejectReason: "", error: null });
  }

  async function submitReject(id: string) {
    const st = getState(id);
    if (st.loading) return;
    patch(id, { loading: true, error: null });
    try {
      const res  = await fetch(`/api/articles/review/${id}/reject`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ reason: st.rejectReason }),
      });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) {
        const errMsg = typeof (data as { error?: string }).error === "string"
          ? (data as { error: string }).error
          : (isFa ? "خطا در رد مقاله" : "Rejection failed");
        patch(id, { loading: false, error: errMsg });
        return;
      }
      patch(id, { loading: false, overrideStatus: "REJECTED", showRejectForm: false, rejectReason: "", error: null });
    } catch {
      patch(id, { loading: false, error: isFa ? "خطای شبکه" : "Network error" });
    }
  }

  const statuses = ["ALL", ...Array.from(new Set(articles.map(a => a.status)))];

  const filtered = articles.filter(a => {
    const effStatus = getState(a.id).overrideStatus ?? a.status;
    if (statusFilter !== "ALL" && effStatus !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !a.author.displayName.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const stats = {
    total:     articles.length,
    pending:   articles.filter(a => { const e = getState(a.id).overrideStatus ?? a.status; return e === "SUBMITTED" || e === "IN_REVIEW"; }).length,
    published: articles.filter(a => (getState(a.id).overrideStatus ?? a.status) === "PUBLISHED").length,
    rejected:  articles.filter(a => (getState(a.id).overrideStatus ?? a.status) === "REJECTED").length,
  };

  const titles: Record<Props["mode"], { en: string; fa: string }> = {
    moderation:    { en: "Content Moderation",   fa: "اعتدال محتوا"       },
    submissions:   { en: "Submitted Articles",   fa: "مقالات ارسال‌شده"   },
    "review-queue":{ en: "Review Queue",         fa: "صف بررسی"           },
    reports:       { en: "Content Reports",      fa: "گزارش‌های محتوا"    },
    editorial:     { en: "Editorial Dashboard",  fa: "داشبورد تحریریه"    },
    all:           { en: "All Articles",         fa: "همه مقالات"         },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative rounded-xl border border-line/40 overflow-hidden p-6"
        style={{ background: "linear-gradient(145deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-20"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.15) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="absolute -top-8 end-0 w-48 h-48 rounded-full blur-[60px] pointer-events-none"
          style={{ background: "rgba(30,200,164,0.05)" }} />
        <div className="relative">
          <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
            {isFa ? "ژورنال صنعتی هرمس — مدیریت محتوا" : "HERMES INDUSTRIAL JOURNAL — EDITORIAL"}
          </p>
          <h1 className="text-2xl font-bold text-ink">
            {isFa ? titles[mode].fa : titles[mode].en}
          </h1>
          <p className="text-xs text-muted mt-1">
            {isFa
              ? `${filtered.length} مورد از ${articles.length} کل`
              : `${filtered.length} of ${articles.length} total`}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: isFa ? "کل مقالات" : "Total",    value: stats.total,     color: "text-ink",    border: "border-line/40",   bg: "bg-surface/50"  },
          { label: isFa ? "در انتظار" : "Pending",   value: stats.pending,   color: "text-warn",   border: "border-warn/15",   bg: "bg-warn/5"      },
          { label: isFa ? "منتشرشده" : "Published",  value: stats.published, color: "text-signal", border: "border-signal/15", bg: "bg-signal/5"    },
          { label: isFa ? "رد شده" : "Rejected",     value: stats.rejected,  color: "text-danger", border: "border-danger/15", bg: "bg-danger/5"    },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-4 border ${s.border} ${s.bg}`}>
            <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-faint mt-1 uppercase tracking-wider font-mono">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={isFa ? "جست‌وجو در مقالات…" : "Search articles…"}
            className="bg-surface/80 border border-line/60 text-sm text-ink rounded-xl px-4 py-2 ps-9 focus:outline-none focus:border-signal/40 w-52 placeholder:text-faint"
          />
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-faint absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
          </svg>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {statuses.map(s => {
            const cfg = statusConfig(s);
            const label = s === "ALL"
              ? (isFa ? "همه وضعیت‌ها" : "All Statuses")
              : (isFa ? cfg.label_fa : cfg.label_en);
            return (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all font-mono ${
                  statusFilter === s
                    ? (s === "ALL" ? "border-signal text-signal bg-signal/8 font-semibold" : cfg.color + " font-semibold")
                    : "border-line/50 text-muted hover:border-signal/30 hover:text-ink"
                }`}>
                {s !== "ALL" && <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Article list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 border border-line/30 rounded-2xl bg-surface/20">
          <div className="w-12 h-12 rounded-full border border-line/40 bg-surface2 flex items-center justify-center mb-4">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-faint">
              <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z" clipRule="evenodd"/>
            </svg>
          </div>
          <p className="text-muted text-sm">{isFa ? "موردی یافت نشد" : "No articles found"}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(a => {
            const st          = getState(a.id);
            const effStatus   = st.overrideStatus ?? a.status;
            const cfg         = statusConfig(effStatus);
            const isPending   = effStatus === "SUBMITTED" || effStatus === "IN_REVIEW";
            const isPublished = effStatus === "PUBLISHED";
            const isDone      = st.overrideStatus !== null;

            return (
              <div key={a.id} className="rounded-xl border border-line/30 bg-surface/50 hover:border-signal/15 hover:bg-surface2/40 transition-all overflow-hidden">
                {/* Main row */}
                <div className="flex gap-4 items-start p-4">
                  <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${cfg.dot}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {isPublished ? (
                        <Link href={`/${locale}/articles/${a.slug}`}
                          className="text-sm font-semibold text-ink hover:text-signal transition-colors line-clamp-1">
                          {a.title}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-ink line-clamp-1">{a.title}</span>
                      )}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider ${cfg.color}`}>
                        {isFa ? cfg.label_fa : cfg.label_en}
                      </span>
                      {a.author.verifiedExpert && (
                        <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "متخصص" : "EXPERT"}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-faint font-mono">
                      <span>{a.author.displayName}</span>
                      {a.category && (
                        <>
                          <span className="text-line">·</span>
                          <span>{isFa ? a.category.nameFa : a.category.name}</span>
                        </>
                      )}
                      <span className="text-line">·</span>
                      <span>{fmtDate(a.updatedAt, isFa)}</span>
                      <span className="text-line">·</span>
                      <span>{fmtNum(a.viewCount)} {isFa ? "بازدید" : "views"}</span>
                    </div>

                    {st.error && (
                      <p className="mt-1.5 text-[10px] text-danger font-mono">{st.error}</p>
                    )}
                    {isDone && (
                      <p className="mt-1.5 text-[10px] text-signal font-mono">
                        {effStatus === "PUBLISHED"
                          ? (isFa ? "✓ مقاله منتشر شد" : "✓ Article published")
                          : (isFa ? "✓ مقاله رد شد" : "✓ Article rejected")}
                      </p>
                    )}
                  </div>

                  {/* Actions column */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isPublished && (
                      <Link href={`/${locale}/articles/${a.slug}`}
                        className="text-[10px] px-2.5 py-1.5 rounded-lg border border-line/50 text-muted hover:border-signal/30 hover:text-signal transition-all font-mono">
                        {isFa ? "مشاهده" : "View"}
                      </Link>
                    )}
                    {isPending && !st.showRejectForm && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApprove(a.id)}
                          disabled={st.loading}
                          className="text-[10px] px-2.5 py-1.5 rounded-lg border border-signal/25 text-signal hover:bg-signal/8 transition-all font-mono font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                          {st.loading ? "…" : (isFa ? "تأیید" : "Approve")}
                        </button>
                        <button
                          type="button"
                          onClick={() => openRejectForm(a.id)}
                          disabled={st.loading}
                          className="text-[10px] px-2.5 py-1.5 rounded-lg border border-danger/25 text-danger hover:bg-danger/8 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed">
                          {isFa ? "رد" : "Reject"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Rejection reason form */}
                {st.showRejectForm && isPending && (
                  <div className="border-t border-line/30 px-4 pb-4 pt-3 bg-danger/[0.03]">
                    <p className="text-[10px] text-danger font-mono mb-2">
                      {isFa ? "دلیل رد مقاله (اختیاری):" : "Rejection reason (optional):"}
                    </p>
                    <textarea
                      value={st.rejectReason}
                      onChange={e => patch(a.id, { rejectReason: e.target.value })}
                      rows={2}
                      placeholder={isFa ? "توضیح دهید چرا این مقاله رد شد…" : "Explain why this article is being rejected…"}
                      className="w-full bg-surface border border-line/50 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-danger/40 resize-none mb-2.5"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => submitReject(a.id)}
                        disabled={st.loading}
                        className="text-[10px] px-3 py-1.5 rounded-lg bg-danger/10 border border-danger/30 text-danger hover:bg-danger/15 transition-all font-mono font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                        {st.loading ? (isFa ? "در حال ارسال…" : "Sending…") : (isFa ? "تأیید رد" : "Confirm Reject")}
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelReject(a.id)}
                        disabled={st.loading}
                        className="text-[10px] px-3 py-1.5 rounded-lg border border-line/50 text-muted hover:text-ink transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed">
                        {isFa ? "لغو" : "Cancel"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-[10px] text-faint font-mono text-center pt-2">
          {isFa
            ? `${filtered.length} مقاله نمایش داده شده`
            : `Showing ${filtered.length} article${filtered.length !== 1 ? "s" : ""}`}
        </p>
      )}
    </div>
  );
}
