import { GlassCard }      from "@/components/ui/GlassCard";
import { getLocale } from "next-intl/server";
import { formatDate } from "@/lib/i18n/format";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import type { ArticleRecord } from "@/lib/knowledge/types";

interface Props { article: ArticleRecord }

const STATUS_COLORS: Record<string, string> = {
  draft:     "text-ink/40  border-white/10",
  review:    "text-amber-300 border-amber-500/20",
  published: "text-cyan-300  border-cyan-500/20",
};

export async function ArticleCard({ article }: Props) {
  let requestLocale: string = DEFAULT_LOCALE;
  try { requestLocale = await getLocale(); } catch { /* header unavailable */ }
  const locale = requestLocale;
  const statusCls = STATUS_COLORS[article.status] ?? STATUS_COLORS.draft;

  return (
    <GlassCard className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-ink text-sm leading-tight" dir="auto">
          {article.title}
        </p>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded border font-mono ${statusCls}`}>
          {article.status}
        </span>
      </div>

      {article.summary && (
        <p className="text-ink/40 text-xs leading-relaxed" dir="auto">{article.summary}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <span className="font-mono text-xs text-ink/25">v{article.version}</span>
        {article.sourceType && (
          <span className="text-xs text-ink/25">{article.sourceType.replace(/_/g, " ")}</span>
        )}
        {article.updatedAt && (
          <span className="text-xs text-ink/20 ml-auto">
            {formatDate(article.updatedAt, locale)}
          </span>
        )}
      </div>
    </GlassCard>
  );
}
