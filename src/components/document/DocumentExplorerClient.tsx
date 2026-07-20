"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { enumLabel } from "@/lib/i18n/enum-label";
import { usePathname } from "next/navigation";
import type { EdmsDocument, EdmsFolder } from "@/lib/document/types";
import { formatDate } from "@/lib/i18n/format";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT:    { bg: "bg-ice/[0.08]",    text: "text-ice"    },
  REVIEW:   { bg: "bg-warn/[0.08]",   text: "text-warn"   },
  APPROVED: { bg: "bg-signal/[0.08]", text: "text-signal" },
  REJECTED: { bg: "bg-danger/[0.08]", text: "text-danger" },
  ARCHIVED: { bg: "bg-faint/[0.08]",  text: "text-faint"  },
};

interface Props {
  documents: EdmsDocument[];
  folders:   EdmsFolder[];
}

export function DocumentExplorerClient({ documents, folders }: Props) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";
  const ted = useTranslations("engineeringDocuments"); // 87L.5: localized enum labels
  const isFa     = locale === "fa";

  return (
    <div className="space-y-7">
      {/* Folders */}
      <section>
        <p className="eyebrow-label text-muted mb-3">{isFa ? "پوشه‌ها" : "Folders"}</p>
        {folders.length === 0 ? (
          <div className="card-enterprise rounded-xl px-5 py-10 text-center">
            <p className="text-muted text-sm">{isFa ? "پوشه‌ای یافت نشد" : "No folders yet"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {folders.map(folder => (
              <div
                key={folder.id}
                className="card-enterprise card-hover rounded-xl p-4 flex flex-col gap-2 cursor-pointer group"
              >
                <span className="text-2xl">{folder.icon ?? "📁"}</span>
                <div>
                  <p className="text-sm font-medium text-ink leading-snug group-hover:text-signal transition-colors">{folder.name}</p>
                  {folder.description && (
                    <p className="text-xs text-faint mt-0.5 line-clamp-1">{folder.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Documents table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="eyebrow-label text-muted">
            {isFa ? "اسناد" : "Documents"}
          </p>
          <span className="text-xs text-faint">{documents.length} {isFa ? "سند" : "items"}</span>
        </div>

        <div className="card-enterprise rounded-xl overflow-hidden">
          {documents.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-muted text-sm">{isFa ? "سندی در این پوشه یافت نشد" : "No documents in this folder"}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface2">
                  <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "عنوان" : "Title"}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{isFa ? "نوع" : "Type"}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{isFa ? "بازبینی" : "Rev"}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "وضعیت" : "Status"}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{isFa ? "ویرایش" : "Updated"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {documents.map(doc => {
                  const s = STATUS_STYLE[doc.status] ?? { bg: "bg-muted/[0.06]", text: "text-muted" };
                  return (
                    <tr key={doc.id} className="hover:bg-surface2 transition-colors">
                      <td className="px-4 py-3 max-w-[260px]">
                        <Link
                          href={`/${locale}/documents/${doc.id}`}
                          className="font-medium text-ink hover:text-signal transition-colors truncate block"
                        >
                          {doc.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-muted">{enumLabel(ted, "docType", doc.documentType)}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs font-mono text-faint">{doc.currentRevision ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-white/[0.05] ${s.bg} ${s.text}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-faint">{formatDate(doc.updatedAt, locale)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
