"use client";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { enumLabel } from "@/lib/i18n/enum-label";
import type { EdmsTemplate } from "@/lib/document/types";

interface Props { templates: EdmsTemplate[] }

export function TemplateGalleryClient({ templates }: Props) {
  const pathname = usePathname();
  const ted = useTranslations("engineeringDocuments"); // 87L.5: localized enum labels
  const isFa     = pathname.startsWith("/fa");

  if (templates.length === 0) {
    return (
      <div className="card-enterprise rounded-xl px-5 py-12 text-center">
        <p className="text-muted text-sm">{isFa ? "قالبی موجود نیست" : "No templates available"}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {templates.map(tpl => (
        <div
          key={tpl.id}
          className="card-enterprise card-hover rounded-xl p-5 group cursor-pointer border border-line hover:border-signal/30 transition-all"
        >
          {/* Icon + name */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-signal/[0.08] border border-signal/15 flex items-center justify-center text-signal group-hover:bg-signal/[0.14] transition-colors">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0-6a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clipRule="evenodd"/>
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-ink group-hover:text-signal transition-colors leading-snug">{tpl.name}</h3>
          </div>

          {/* Description */}
          {tpl.description && (
            <p className="text-xs text-muted mb-3 line-clamp-2 leading-relaxed">{tpl.description}</p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-line">
            <span className="text-xs text-faint bg-surface3 px-2 py-0.5 rounded border border-line">
              {enumLabel(ted, "docType", tpl.documentType)}
            </span>
            <span className={`text-xs font-medium ${tpl.isActive ? "text-signal" : "text-faint"}`}>
              {tpl.isActive ? (isFa ? "فعال" : "Active") : (isFa ? "غیرفعال" : "Inactive")}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
