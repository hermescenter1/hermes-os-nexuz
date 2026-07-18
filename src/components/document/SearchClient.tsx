"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { enumLabel } from "@/lib/i18n/enum-label";
import { usePathname } from "next/navigation";
import type { EdmsSearchResult } from "@/lib/document/types";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT:    { bg: "bg-ice/[0.08]",    text: "text-ice"    },
  REVIEW:   { bg: "bg-warn/[0.08]",   text: "text-warn"   },
  APPROVED: { bg: "bg-signal/[0.08]", text: "text-signal" },
  REJECTED: { bg: "bg-danger/[0.08]", text: "text-danger" },
  ARCHIVED: { bg: "bg-faint/[0.08]",  text: "text-faint"  },
};

interface Props { initial: EdmsSearchResult }

export function SearchClient({ initial }: Props) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";
  const ted = useTranslations("engineeringDocuments"); // 87L.5: localized enum labels
  const isFa     = locale === "fa";
  const [result, setResult]   = useState(initial);
  const [q, setQ]             = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/edms/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Search form */}
      <form onSubmit={handleSearch} className="card-enterprise rounded-xl p-4 flex gap-3">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 start-3 flex items-center pointer-events-none">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-faint">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
            </svg>
          </div>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={isFa ? "جستجوی اسناد بر اساس عنوان، نوع، کلیدواژه…" : "Search documents by title, type, keywords…"}
            className="w-full ps-9 pe-3 py-2.5 rounded-lg border border-line bg-surface2 text-ink text-sm placeholder:text-faint focus:outline-none focus:border-signal/40 focus:ring-1 focus:ring-signal/20 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-signal/[0.10] text-signal border border-signal/25 rounded-lg text-sm font-medium hover:bg-signal/[0.18] disabled:opacity-40 transition-colors"
        >
          {loading ? "…" : (isFa ? "جستجو" : "Search")}
        </button>
      </form>

      {/* Result count */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs text-faint">
          {result.total} {isFa ? "نتیجه" : (result.total !== 1 ? "results" : "result")}
        </span>
      </div>

      {/* Results table */}
      <div className="card-enterprise rounded-xl overflow-hidden">
        {result.documents.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-muted text-sm">{isFa ? "سندی یافت نشد" : "No documents found"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface2">
                <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "عنوان" : "Title"}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{isFa ? "نوع" : "Type"}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "وضعیت" : "Status"}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{isFa ? "نسخه" : "Revision"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.documents.map(doc => {
                const s = STATUS_STYLE[doc.status] ?? { bg: "bg-muted/[0.06]", text: "text-muted" };
                return (
                  <tr key={doc.id} className="hover:bg-surface2 transition-colors">
                    <td className="px-4 py-3 max-w-[260px]">
                      <Link href={`/${locale}/documents/${doc.id}`} className="font-medium text-ink hover:text-signal transition-colors truncate block">
                        {doc.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-muted">{enumLabel(ted, "docType", doc.documentType)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-white/[0.05] ${s.bg} ${s.text}`}>
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs font-mono text-faint">{doc.currentRevision ?? "—"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
