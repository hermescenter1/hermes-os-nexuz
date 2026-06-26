"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IndustrialAsset, AssetDocumentLink } from "@/lib/assets/types";

function docTypeBadge(t: string) {
  if (t === "MANUAL")      return "bg-ice/[0.08] text-ice";
  if (t === "DRAWING")     return "bg-signal/[0.08] text-signal";
  if (t === "CERTIFICATE") return "bg-warn/[0.10] text-warn";
  if (t === "DATASHEET")   return "bg-surface2 text-faint";
  return "bg-surface2 text-faint";
}

interface AssetWithDocs extends IndustrialAsset {
  documentLinks: AssetDocumentLink[];
}

interface Props { assets: AssetWithDocs[] }

export function AssetDocumentsClient({ assets }: Props) {
  const pathname = usePathname();
  const isFa    = pathname.startsWith("/fa");
  const locale  = isFa ? "fa" : "en";
  const hasLinks = assets.filter(a => a.documentLinks?.length > 0);
  const missingDocs = assets.filter(a => !a.documentLinks?.length);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow-mono text-ice mb-1">{isFa ? "اسناد دارایی" : "ASSET DOCUMENTS"}</p>
        <h1 className="text-xl font-semibold text-ink">{isFa ? "اسناد مرتبط دارایی‌ها" : "Asset Document Links"}</h1>
        <p className="text-sm text-muted mt-1">
          {isFa ? "دستورالعمل‌ها، نقشه‌ها، و گواهی‌نامه‌های دارایی‌ها" : "Manuals, drawings, and certificates linked to industrial assets"}
        </p>
      </div>

      {/* Missing docs alert */}
      {missingDocs.length > 0 && (
        <div className="bg-warn/[0.08] border border-warn/20 rounded-xl p-4">
          <p className="text-sm text-warn font-medium">
            {missingDocs.length} {isFa ? "دارایی بدون سند هستند" : "assets have no linked documents"}
          </p>
          <p className="text-xs text-warn/70 mt-1">
            {missingDocs.map(a => a.assetNumber).join(", ")}
          </p>
        </div>
      )}

      {hasLinks.length === 0 ? (
        <div className="card-surface rounded-xl p-12 text-center">
          <p className="text-muted">{isFa ? "هیچ سندی پیوند داده نشده" : "No document links found"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {hasLinks.map(a => (
            <div key={a.id} className="card-surface rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-mono text-xs text-ice mb-0.5">{a.assetNumber}</p>
                  <Link href={`/${locale}/assets/${a.id}`} className="text-sm font-medium text-ink hover:text-ice">
                    {a.name}
                  </Link>
                </div>
                <span className="text-xs text-faint">{a.documentLinks.length} {isFa ? "سند" : "docs"}</span>
              </div>

              <div className="space-y-2">
                {a.documentLinks.map(doc => (
                  <div key={doc.id} className="flex items-start gap-3 bg-surface2 rounded-lg px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${docTypeBadge(doc.docType)}`}>
                      {doc.docType}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink font-medium">{doc.title}</p>
                      {doc.description && <p className="text-xs text-faint mt-0.5">{doc.description}</p>}
                      {doc.documentId && (
                        <p className="font-mono text-xs text-ice/70 mt-0.5">{doc.documentId}</p>
                      )}
                    </div>
                    {doc.fileRef && (
                      <span className="text-xs text-ice shrink-0">{isFa ? "مشاهده" : "View"}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
