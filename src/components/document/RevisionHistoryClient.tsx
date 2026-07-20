"use client";

import { useLocale } from "next-intl";import { usePathname } from "next/navigation";
import type { EdmsRevision } from "@/lib/document/types";
import { formatDate } from "@/lib/i18n/format";

const TYPE_STYLE: Record<string, { bg: string; text: string }> = {
  MAJOR: { bg: "bg-danger/[0.08]",  text: "text-danger"  },
  MINOR: { bg: "bg-ice/[0.08]",     text: "text-ice"     },
  PATCH: { bg: "bg-faint/[0.08]",   text: "text-faint"   },
};

interface Props { revisions: EdmsRevision[] }

export function RevisionHistoryClient({ revisions }: Props) {
  const locale = useLocale();
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");

  if (revisions.length === 0) {
    return (
      <div className="card-enterprise rounded-xl px-5 py-12 text-center">
        <p className="text-muted text-sm">{isFa ? "بازبینی‌ای یافت نشد" : "No revisions found"}</p>
      </div>
    );
  }

  return (
    <div className="card-enterprise rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-line">
        <h3 className="text-sm font-semibold text-ink">{isFa ? "تاریخچه بازبینی" : "Revision History"}</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface2">
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "نسخه" : "Revision"}</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{isFa ? "نوع" : "Type"}</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{isFa ? "سند" : "Document"}</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{isFa ? "خلاصه" : "Summary"}</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "تاریخ" : "Date"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {revisions.map(rev => {
            const s = TYPE_STYLE[rev.revisionType] ?? { bg: "bg-muted/[0.06]", text: "text-muted" };
            return (
              <tr key={rev.id} className="hover:bg-surface2 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-xs font-mono font-bold text-signal bg-signal/[0.08] px-2 py-1 rounded border border-signal/15">
                    {rev.revisionNumber}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium border border-white/[0.05] ${s.bg} ${s.text}`}>
                    {rev.revisionType}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="text-xs font-mono text-faint">{rev.documentId.slice(0, 8)}…</span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-xs text-muted truncate block max-w-[240px]">{rev.summary ?? "—"}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-faint font-mono">{formatDate(rev.createdAt, locale)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
