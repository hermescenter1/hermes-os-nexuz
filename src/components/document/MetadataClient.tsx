"use client";

import { useLocale } from "next-intl";import { usePathname } from "next/navigation";
import type { EdmsMetadata } from "@/lib/document/types";
import { getMetadataDisplayLabel } from "@/lib/document/metadata";
import { formatDate } from "@/lib/i18n/format";

interface Props { metadata: EdmsMetadata[] }

export function MetadataClient({ metadata }: Props) {
  const locale = useLocale();
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");

  if (metadata.length === 0) {
    return (
      <div className="card-enterprise rounded-xl px-5 py-12 text-center">
        <p className="text-muted text-sm">{isFa ? "ورودی‌های فراداده یافت نشد" : "No metadata entries"}</p>
      </div>
    );
  }

  return (
    <div className="card-enterprise rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{isFa ? "فراداده‌ها" : "Metadata"}</h3>
        <span className="text-xs text-faint">{metadata.length} {isFa ? "ورودی" : "entries"}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface2">
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "کلید" : "Key"}</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "مقدار" : "Value"}</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{isFa ? "سند" : "Document"}</th>
            <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{isFa ? "بروزرسانی" : "Updated"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {metadata.map(m => (
            <tr key={m.id} className="hover:bg-surface2 transition-colors">
              <td className="px-4 py-3">
                <span className="text-xs font-mono font-medium text-ice">{getMetadataDisplayLabel(m.key)}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-ink">{m.value}</span>
              </td>
              <td className="px-4 py-3 hidden md:table-cell">
                <span className="text-xs font-mono text-faint">{m.documentId.slice(0, 8)}…</span>
              </td>
              <td className="px-4 py-3 hidden lg:table-cell">
                <span className="text-xs text-faint font-mono">{formatDate(m.updatedAt, locale)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
