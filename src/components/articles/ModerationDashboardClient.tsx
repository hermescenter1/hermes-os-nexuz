"use client";

import { useState } from "react";
import Link          from "next/link";
import { usePathname } from "next/navigation";
import type { ArticleListItem } from "@/lib/articles/types";

function fmtDate(d: string, isFa = false) {
  const date = new Date(d);
  if (isFa) {
    try { return date.toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" }); }
    catch { return date.toLocaleDateString(); }
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function statusColor(s: string) {
  if (s === "PUBLISHED")  return "bg-signal/[0.10] text-signal";
  if (s === "SUBMITTED")  return "bg-warn/[0.10] text-warn";
  if (s === "IN_REVIEW")  return "bg-ice/[0.10] text-ice";
  if (s === "REJECTED")   return "bg-danger/[0.10] text-danger";
  if (s === "ARCHIVED")   return "bg-muted/[0.10] text-muted";
  return "bg-surface3 text-faint";
}

const STATUS_LABELS: Record<string, { en: string; fa: string }> = {
  DRAFT:      { en: "Draft",      fa: "پیش‌نویس"  },
  SUBMITTED:  { en: "Submitted",  fa: "ارسال‌شده"  },
  IN_REVIEW:  { en: "In Review",  fa: "در بررسی"   },
  PUBLISHED:  { en: "Published",  fa: "منتشرشده"   },
  REJECTED:   { en: "Rejected",   fa: "رد شده"     },
  ARCHIVED:   { en: "Archived",   fa: "آرشیوشده"   },
};

interface Props {
  articles: ArticleListItem[];
  mode: "moderation" | "submissions" | "review-queue" | "reports" | "editorial" | "all";
}

export function ModerationDashboardClient({ articles, mode }: Props) {
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");
  const locale   = isFa ? "fa" : "en";

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch]             = useState("");

  const statuses = ["ALL", ...Array.from(new Set(articles.map(a => a.status)))];

  let filtered = articles;
  if (statusFilter !== "ALL") filtered = filtered.filter(a => a.status === statusFilter);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(a => a.title.toLowerCase().includes(q) || a.author.displayName.toLowerCase().includes(q));
  }

  const stats = {
    total:     articles.length,
    pending:   articles.filter(a => a.status === "SUBMITTED" || a.status === "IN_REVIEW").length,
    published: articles.filter(a => a.status === "PUBLISHED").length,
    rejected:  articles.filter(a => a.status === "REJECTED").length,
  };

  const titles: Record<Props["mode"], { en: string; fa: string }> = {
    moderation:   { en: "Content Moderation",   fa: "اعتدال محتوا"       },
    submissions:  { en: "Submitted Articles",   fa: "مقالات ارسال‌شده"   },
    "review-queue":{ en: "Review Queue",        fa: "صف بررسی"           },
    reports:      { en: "Content Reports",      fa: "گزارش‌های محتوا"    },
    editorial:    { en: "Editorial Board",      fa: "هیئت تحریریه"       },
    all:          { en: "All Articles",         fa: "همه مقالات"         },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="eyebrow-mono text-signal text-[10px] mb-1">
          {isFa ? "ژورنال صنعتی هرمس — مدیریت محتوا" : "HERMES INDUSTRIAL JOURNAL — EDITORIAL"}
        </p>
        <h1 className="text-2xl font-bold text-ink">
          {isFa ? titles[mode].fa : titles[mode].en}
        </h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: isFa ? "کل مقالات" : "Total Articles", value: stats.total,    color: "text-ink"    },
          { label: isFa ? "در انتظار" : "Pending Review",  value: stats.pending,  color: "text-warn"   },
          { label: isFa ? "منتشرشده" : "Published",        value: stats.published, color: "text-signal" },
          { label: isFa ? "رد شده" : "Rejected",           value: stats.rejected,  color: "text-danger" },
        ].map(s => (
          <div key={s.label} className="bg-surface border border-line/60 rounded-xl p-4">
            <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-faint mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={isFa ? "جست‌وجو…" : "Search…"}
          className="bg-surface border border-line text-sm text-ink rounded-lg px-4 py-2 focus:outline-none focus:border-signal/50 w-48"
        />
        <div className="flex flex-wrap gap-2">
          {statuses.map(s => {
            const label = s === "ALL"
              ? (isFa ? "همه" : "All")
              : (isFa ? (STATUS_LABELS[s]?.fa ?? s) : (STATUS_LABELS[s]?.en ?? s));
            return (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-1 rounded-full border transition-all ${
                  statusFilter === s
                    ? "border-signal text-signal bg-signal/10 font-medium"
                    : "border-line text-muted hover:border-signal/40 hover:text-ink"
                }`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 border border-line/40 rounded-xl">
          <p className="text-muted text-sm">{isFa ? "موردی یافت نشد" : "No articles found"}</p>
        </div>
      ) : (
        <div className="border border-line/60 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/60 bg-surface2/40">
                  {[
                    isFa ? "عنوان" : "Title",
                    isFa ? "نویسنده" : "Author",
                    isFa ? "وضعیت" : "Status",
                    isFa ? "تاریخ" : "Date",
                    isFa ? "بازدید" : "Views",
                    isFa ? "عملیات" : "Actions",
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-start text-xs font-medium text-faint uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/30">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-surface2/40 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <Link href={`/${locale}/articles/${a.slug}`}
                        className="text-ink hover:text-signal transition-colors font-medium line-clamp-1 text-sm">
                        {a.title}
                      </Link>
                      {a.category && (
                        <p className="text-xs text-faint mt-0.5">
                          {isFa ? a.category.nameFa : a.category.name}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-ink">{a.author.displayName}</p>
                      {a.author.verifiedExpert && (
                        <span className="hs-badge hs--knowledge text-[9px]">{isFa ? "متخصص" : "EXPERT"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase tracking-wider ${statusColor(a.status)}`}>
                        {isFa ? (STATUS_LABELS[a.status]?.fa ?? a.status) : (STATUS_LABELS[a.status]?.en ?? a.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-faint whitespace-nowrap">
                      {fmtDate(a.updatedAt, isFa)}
                    </td>
                    <td className="px-4 py-3 text-xs text-faint font-mono">
                      {a.viewCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/${locale}/articles/${a.slug}`}
                          className="text-[10px] px-2 py-1 rounded border border-signal/30 text-signal hover:bg-signal/10 transition-colors">
                          {isFa ? "مشاهده" : "View"}
                        </Link>
                        {(a.status === "SUBMITTED" || a.status === "IN_REVIEW") && (
                          <>
                            <button className="text-[10px] px-2 py-1 rounded border border-signal/30 text-signal hover:bg-signal/10 transition-colors">
                              {isFa ? "تأیید" : "Approve"}
                            </button>
                            <button className="text-[10px] px-2 py-1 rounded border border-danger/30 text-danger hover:bg-danger/10 transition-colors">
                              {isFa ? "رد" : "Reject"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
