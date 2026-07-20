"use client";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { enumLabel } from "@/lib/i18n/enum-label";
import type { EdmsShare } from "@/lib/document/types";
import { formatDate } from "@/lib/i18n/format";

const ACCESS_STYLE: Record<string, { bg: string; text: string }> = {
  VIEW:        { bg: "bg-faint/[0.08]",  text: "text-faint"  },
  DOWNLOAD:    { bg: "bg-ice/[0.08]",    text: "text-ice"    },
  COMMENT:     { bg: "bg-warn/[0.08]",   text: "text-warn"   },
  EDIT:        { bg: "bg-signal/[0.08]", text: "text-signal" },
  FULL_ACCESS: { bg: "bg-danger/[0.08]", text: "text-danger" },
};

interface Props { shares: EdmsShare[] }

export function ShareClient({ shares }: Props) {
  const locale = useLocale();
  const pathname = usePathname();
  const ted = useTranslations("engineeringDocuments"); // 87L.5: localized enum labels
  const isFa     = pathname.startsWith("/fa");

  if (shares.length === 0) {
    return (
      <div className="card-enterprise rounded-xl px-5 py-12 text-center">
        <p className="text-muted text-sm">{isFa ? "اشتراک‌گذاری فعالی وجود ندارد" : "No active shares"}</p>
      </div>
    );
  }

  return (
    <div className="card-enterprise rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{isFa ? "اشتراک‌گذاری‌ها" : "Document Shares"}</h3>
        <span className="text-xs text-faint">{shares.length} {isFa ? "مورد" : "items"}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface2">
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "سند" : "Document"}</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "با" : "Shared With"}</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{isFa ? "سطح دسترسی" : "Access"}</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{isFa ? "انقضا" : "Expires"}</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{isFa ? "تاریخ" : "Created"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shares.map(s => {
            const a = ACCESS_STYLE[s.accessLevel] ?? { bg: "bg-muted/[0.06]", text: "text-muted" };
            return (
              <tr key={s.id} className="hover:bg-surface2 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-xs font-mono text-faint">{s.documentId.slice(0, 8)}…</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-ink">{s.sharedWith}</span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-white/[0.05] ${a.bg} ${a.text}`}>
                    {enumLabel(ted, "accessLevel", s.accessLevel)}
                  </span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-xs text-faint">
                    {s.expiresAt ? formatDate(s.expiresAt, locale) : (isFa ? "هرگز" : "Never")}
                  </span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-xs text-faint font-mono">{formatDate(s.createdAt, locale)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
