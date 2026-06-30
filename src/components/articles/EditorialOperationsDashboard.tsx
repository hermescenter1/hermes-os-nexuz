import Link from "next/link";
import type {
  EditorialOperationsDashboard,
  OpsTopArticle,
  OpsTopAuthor,
  OpsEditorialEvent,
} from "@/lib/articles/db";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000)      return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function fmtDate(d: string | null | undefined, isFa = false) {
  if (!d) return "—";
  try {
    const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
    return new Date(d).toLocaleDateString(isFa ? "fa-IR" : "en-US", opts);
  } catch { return d.slice(0, 10); }
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, accent = false, sub }: {
  label: string; value: string | number; accent?: boolean; sub?: string;
}) {
  return (
    <div className={`rounded-xl p-4 border text-center ${
      accent
        ? "border-signal/25 bg-signal/[0.05]"
        : "border-line/40 bg-surface/50"
    }`}>
      <p className={`text-2xl font-bold font-mono ${accent ? "text-signal" : "text-ink"}`}>
        {typeof value === "number" ? fmtNum(value) : value}
      </p>
      <p className="text-[10px] text-faint uppercase tracking-wider font-mono mt-0.5">{label}</p>
      {sub && <p className="text-[9px] text-faint/60 mt-0.5 font-mono">{sub}</p>}
    </div>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  DRAFT:      "bg-surface3 text-faint border-line/40",
  SUBMITTED:  "bg-warn/[0.10] text-warn border-warn/20",
  IN_REVIEW:  "bg-ice/[0.10] text-ice border-ice/20",
  PUBLISHED:  "bg-signal/[0.10] text-signal border-signal/20",
  REJECTED:   "bg-danger/[0.10] text-danger border-danger/20",
  ARCHIVED:   "bg-surface3 text-muted border-line/30",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status] ?? "bg-surface3 text-faint border-line/40";
  return (
    <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}

// ── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="eyebrow-mono text-signal text-[9px] mb-1 tracking-[0.2em]">{eyebrow}</p>
      <div className="flex items-center gap-2.5">
        <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-signal to-signal/20" />
        <h2 className="text-sm font-bold text-ink uppercase tracking-wider">{title}</h2>
      </div>
    </div>
  );
}

// ── Top Articles Table ────────────────────────────────────────────────────────

function TopArticlesSection({ articles, isFa, locale }: {
  articles: OpsTopArticle[]; isFa: boolean; locale: string;
}) {
  if (articles.length === 0) return null;
  return (
    <section>
      <SectionHeader
        eyebrow={isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
        title={isFa ? "مقالات برتر" : "Top Articles"}
      />
      <div className="rounded-xl border border-line/40 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line/30 bg-surface/60">
              <th className="text-start px-4 py-2.5 text-faint font-mono uppercase tracking-wider text-[9px] w-full">
                {isFa ? "عنوان" : "Title"}
              </th>
              <th className="text-end px-4 py-2.5 text-faint font-mono uppercase tracking-wider text-[9px] whitespace-nowrap">
                {isFa ? "بازدید" : "Views"}
              </th>
              <th className="text-end px-4 py-2.5 text-faint font-mono uppercase tracking-wider text-[9px] whitespace-nowrap hidden sm:table-cell">
                {isFa ? "واکنش" : "React."}
              </th>
              <th className="text-end px-4 py-2.5 text-faint font-mono uppercase tracking-wider text-[9px] whitespace-nowrap hidden md:table-cell">
                {isFa ? "تاریخ" : "Date"}
              </th>
            </tr>
          </thead>
          <tbody>
            {articles.map((a, i) => (
              <tr key={a.id} className={`border-b border-line/20 hover:bg-surface2/40 transition-colors ${i % 2 === 0 ? "" : "bg-surface/30"}`}>
                <td className="px-4 py-2.5">
                  <Link href={`/${locale}/articles/${a.slug}`}
                    className="text-ink hover:text-signal transition-colors font-medium line-clamp-1">
                    {a.title}
                  </Link>
                  <p className="text-faint text-[10px] mt-0.5 font-mono">{a.authorDisplayName}</p>
                </td>
                <td className="px-4 py-2.5 text-end font-mono text-signal font-semibold whitespace-nowrap">
                  {fmtNum(a.viewCount)}
                </td>
                <td className="px-4 py-2.5 text-end font-mono text-muted whitespace-nowrap hidden sm:table-cell">
                  {fmtNum(a.reactionCount)}
                </td>
                <td className="px-4 py-2.5 text-end text-faint font-mono whitespace-nowrap hidden md:table-cell">
                  {fmtDate(a.publishedAt, isFa)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Top Authors ───────────────────────────────────────────────────────────────

function TopAuthorsSection({ authors, isFa, locale }: {
  authors: OpsTopAuthor[]; isFa: boolean; locale: string;
}) {
  if (authors.length === 0) return null;
  return (
    <section>
      <SectionHeader
        eyebrow={isFa ? "شبکه متخصصان" : "EXPERT NETWORK"}
        title={isFa ? "متخصصان برتر" : "Top Experts"}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {authors.map(a => (
          <Link key={a.id} href={`/${locale}/articles/author/${a.handle}`}
            className="group flex items-center gap-3 p-3.5 rounded-xl border border-line/40 hover:border-signal/20 bg-surface/50 hover:bg-surface2/40 transition-all">
            {/* Avatar */}
            {a.avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={a.avatarUrl} alt={`${a.displayName} profile photo`} width={36} height={36}
                className="w-9 h-9 rounded-lg object-cover border border-signal/20 shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-signal/30 to-ice/20 border border-signal/20 flex items-center justify-center text-sm font-bold text-signal shrink-0">
                {a.displayName.charAt(0)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-ink group-hover:text-signal transition-colors truncate">{a.displayName}</p>
              <p className="text-[10px] text-faint font-mono truncate">@{a.handle}</p>
              <div className="flex items-center gap-2 mt-0.5 text-[9px] text-faint font-mono">
                <span>{a.publishedCount} {isFa ? "مقاله" : "pub"}</span>
                <span className="text-line">·</span>
                <span>{fmtNum(a.totalViews)} {isFa ? "بازدید" : "views"}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Status Distribution ───────────────────────────────────────────────────────

function StatusDistributionSection({ lifecycleCounts, visibilityCounts, isFa }: {
  lifecycleCounts: Array<{ status: string; count: number }>;
  visibilityCounts: Array<{ visibility: string; count: number }>;
  isFa: boolean;
}) {
  const total = lifecycleCounts.reduce((s, r) => s + r.count, 0);
  return (
    <section>
      <SectionHeader
        eyebrow={isFa ? "تحلیل وضعیت" : "STATUS ANALYSIS"}
        title={isFa ? "توزیع وضعیت مقالات" : "Article Status Distribution"}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Lifecycle */}
        <div className="rounded-xl border border-line/40 p-4">
          <p className="text-[10px] text-faint uppercase tracking-wider font-mono mb-3">
            {isFa ? "چرخه حیات" : "Lifecycle"}
          </p>
          <div className="space-y-2">
            {lifecycleCounts.map(r => (
              <div key={r.status} className="flex items-center gap-2.5">
                <StatusBadge status={r.status} />
                <div className="flex-1 h-1.5 rounded-full bg-surface3 overflow-hidden">
                  <div className="h-full rounded-full bg-signal/40"
                    style={{ width: total > 0 ? `${(r.count / total) * 100}%` : "0%" }} />
                </div>
                <span className="text-xs font-mono font-semibold text-ink w-8 text-end">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Visibility */}
        <div className="rounded-xl border border-line/40 p-4">
          <p className="text-[10px] text-faint uppercase tracking-wider font-mono mb-3">
            {isFa ? "دید" : "Visibility"}
          </p>
          <div className="space-y-2">
            {visibilityCounts.map(r => (
              <div key={r.visibility} className="flex items-center gap-2.5">
                <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider bg-surface3 text-muted border-line/40 shrink-0 w-20 text-center">
                  {r.visibility}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-surface3 overflow-hidden">
                  <div className="h-full rounded-full bg-ice/40"
                    style={{ width: total > 0 ? `${(r.count / total) * 100}%` : "0%" }} />
                </div>
                <span className="text-xs font-mono font-semibold text-ink w-8 text-end">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Recent Editorial Activity ─────────────────────────────────────────────────

function RecentActivitySection({ events, isFa }: {
  events: OpsEditorialEvent[]; isFa: boolean;
}) {
  if (events.length === 0) return (
    <section>
      <SectionHeader
        eyebrow={isFa ? "سردبیری" : "EDITORIAL"}
        title={isFa ? "فعالیت‌های اخیر سردبیری" : "Recent Editorial Activity"}
      />
      <div className="rounded-xl border border-line/30 bg-surface/20 p-8 text-center">
        <p className="text-faint text-xs font-mono">
          {isFa ? "فعالیت سردبیری یافت نشد" : "No editorial activity yet"}
        </p>
      </div>
    </section>
  );

  return (
    <section>
      <SectionHeader
        eyebrow={isFa ? "سردبیری" : "EDITORIAL"}
        title={isFa ? "فعالیت‌های اخیر سردبیری" : "Recent Editorial Activity"}
      />
      <div className="space-y-2">
        {events.map(e => (
          <div key={e.id} className="flex items-start gap-3 p-3.5 rounded-xl border border-line/30 bg-surface/40 hover:bg-surface2/40 transition-colors">
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
              e.action === "APPROVED" || e.action === "approve" ? "bg-signal" :
              e.action === "REJECTED" || e.action === "reject"  ? "bg-danger" :
              "bg-warn"
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-ink truncate">{e.articleTitle}</p>
              {e.reason && (
                <p className="text-[10px] text-muted mt-0.5 line-clamp-1">{e.reason}</p>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <StatusBadge status={e.action.toUpperCase()} />
              <span className="text-[9px] text-faint font-mono">{fmtDate(e.createdAt, isFa)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

interface Props {
  data:   EditorialOperationsDashboard;
  isFa:   boolean;
  locale: string;
}

export function EditorialOperationsDashboard({ data, isFa, locale }: Props) {
  const { pendingReview, publicPerformance, lifecycleCounts } = data;

  const published = lifecycleCounts.find(r => r.status === "PUBLISHED")?.count ?? 0;
  const rejected  = lifecycleCounts.find(r => r.status === "REJECTED")?.count  ?? 0;
  const drafts    = lifecycleCounts.find(r => r.status === "DRAFT")?.count     ?? 0;

  return (
    <div className="space-y-8">
      {/* ── Page Header ───────────────────────────────────────────────── */}
      <div className="relative border-b border-line/30 overflow-hidden -mx-6 px-6 py-10"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.06) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.12) 1px, transparent 1px)", backgroundSize: "28px 28px", opacity: 0.35 }} />
        <div className="absolute -top-16 start-0 w-72 h-72 rounded-full blur-[90px] pointer-events-none"
          style={{ background: "rgba(30,200,164,0.08)" }} />
        <div className="relative">
          <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-2xl font-bold text-ink mb-0.5">
            {isFa ? "مرکز عملیات ژورنال" : "Journal Operations Center"}
          </h1>
          <p className="text-xs text-muted">
            {isFa ? "هوشمندی سردبیری" : "Editorial Intelligence"}
            <span className="ms-3 text-[9px] text-faint font-mono">
              {isFa ? "آخرین به‌روزرسانی:" : "Last updated:"} {fmtDate(data.generatedAt, isFa)}
            </span>
          </p>
          {!data.dbAvailable && (
            <p className="mt-2 text-xs text-warn font-mono">
              {isFa ? "پایگاه داده در دسترس نیست — داده‌های آماری موجود نیست" : "Database unavailable — metrics not available"}
            </p>
          )}
        </div>
      </div>

      {/* ── KPI Grid ──────────────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label={isFa ? "در انتظار بررسی" : "Pending Review"}    value={pendingReview.count}            accent />
          <KpiCard label={isFa ? "مقالات منتشرشده" : "Published Articles"} value={published}                     accent />
          <KpiCard label={isFa ? "مقالات ردشده"   : "Rejected Articles"}  value={rejected} />
          <KpiCard label={isFa ? "پیش‌نویس‌ها"    : "Drafts"}             value={drafts} />
          <KpiCard label={isFa ? "بازدید عمومی"   : "Public Views"}       value={publicPerformance.totalViews} />
          <KpiCard label={isFa ? "نویسندگان عمومی" : "Public Authors"}     value={publicPerformance.authorCount} />
        </div>
      </section>

      {/* ── Review Queue Health ───────────────────────────────────────── */}
      {pendingReview.count > 0 && (
        <section>
          <SectionHeader
            eyebrow={isFa ? "کنترل صف" : "QUEUE CONTROL"}
            title={isFa ? "سلامت صف بررسی" : "Review Queue Health"}
          />
          <div className="rounded-xl border border-warn/20 bg-warn/[0.03] p-5 flex flex-wrap gap-6 items-center">
            <div>
              <p className="text-2xl font-bold text-warn font-mono">{pendingReview.count}</p>
              <p className="text-[10px] text-faint uppercase tracking-wider font-mono mt-0.5">
                {isFa ? "در انتظار بررسی" : "Pending Review"}
              </p>
            </div>
            {pendingReview.oldestAt && (
              <div>
                <p className="text-xs font-semibold text-ink">{fmtDate(pendingReview.oldestAt, isFa)}</p>
                <p className="text-[10px] text-faint font-mono uppercase tracking-wider">
                  {isFa ? "قدیمی‌ترین ارسال" : "Oldest Submission"}
                </p>
              </div>
            )}
            {pendingReview.latestAt && (
              <div>
                <p className="text-xs font-semibold text-ink">{fmtDate(pendingReview.latestAt, isFa)}</p>
                <p className="text-[10px] text-faint font-mono uppercase tracking-wider">
                  {isFa ? "آخرین ارسال" : "Latest Submission"}
                </p>
              </div>
            )}
            <div className="ms-auto">
              <Link href={`/${locale}/articles/review-queue`}
                className="text-xs px-3.5 py-2 rounded-lg border border-warn/30 text-warn hover:bg-warn/[0.08] transition-colors font-medium">
                {isFa ? "باز کردن صف بررسی" : "Open Review Queue"}
                <svg viewBox="0 0 20 20" fill="currentColor" className={`inline-block w-3.5 h-3.5 ms-1.5 ${isFa ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd"/>
                </svg>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Public Performance ────────────────────────────────────────── */}
      <section>
        <SectionHeader
          eyebrow={isFa ? "عملکرد عمومی" : "PUBLIC PERFORMANCE"}
          title={isFa ? "عملکرد محتوای عمومی" : "Public Content Performance"}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label={isFa ? "مقالات منتشرشده عمومی" : "Published + Public"} value={publicPerformance.articleCount} accent />
          <KpiCard label={isFa ? "مجموع بازدید"           : "Total Views"}       value={publicPerformance.totalViews} />
          <KpiCard label={isFa ? "مجموع واکنش‌ها"          : "Total Reactions"}   value={publicPerformance.totalReactions} />
          <KpiCard label={isFa ? "نویسندگان عمومی"         : "Public Authors"}    value={publicPerformance.authorCount} />
        </div>
      </section>

      {/* ── Top Articles ──────────────────────────────────────────────── */}
      <TopArticlesSection articles={data.topArticles} isFa={isFa} locale={locale} />

      {/* ── Top Authors ───────────────────────────────────────────────── */}
      <TopAuthorsSection authors={data.topAuthors} isFa={isFa} locale={locale} />

      {/* ── Status Distribution ───────────────────────────────────────── */}
      <StatusDistributionSection
        lifecycleCounts={data.lifecycleCounts}
        visibilityCounts={data.visibilityCounts}
        isFa={isFa}
      />

      {/* ── Recent Editorial Activity ─────────────────────────────────── */}
      <RecentActivitySection events={data.recentEditorialActivity} isFa={isFa} />
    </div>
  );
}
