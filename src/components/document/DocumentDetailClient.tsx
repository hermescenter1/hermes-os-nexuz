"use client";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { enumLabel } from "@/lib/i18n/enum-label";
import type { EdmsDocumentFull } from "@/lib/document/types";

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  DRAFT:    { bg: "bg-ice/[0.08]",    text: "text-ice",    dot: "bg-ice"    },
  REVIEW:   { bg: "bg-warn/[0.08]",   text: "text-warn",   dot: "bg-warn"   },
  APPROVED: { bg: "bg-signal/[0.08]", text: "text-signal", dot: "bg-signal" },
  REJECTED: { bg: "bg-danger/[0.08]", text: "text-danger", dot: "bg-danger" },
  ARCHIVED: { bg: "bg-faint/[0.08]",  text: "text-faint",  dot: "bg-faint"  },
  OBSOLETE: { bg: "bg-muted/[0.08]",  text: "text-muted",  dot: "bg-muted"  },
};

const APPROVAL_STYLE: Record<string, { bg: string; text: string }> = {
  PENDING:  { bg: "bg-warn/[0.08]",   text: "text-warn"   },
  APPROVED: { bg: "bg-signal/[0.08]", text: "text-signal" },
  REJECTED: { bg: "bg-danger/[0.08]", text: "text-danger" },
};

interface Props { document: EdmsDocumentFull }

export function DocumentDetailClient({ document: doc }: Props) {
  const pathname = usePathname();
  const ted = useTranslations("engineeringDocuments"); // 87L.5: localized enum labels
  const isFa     = pathname.startsWith("/fa");

  const status = STATUS_STYLE[doc.status] ?? { bg: "bg-muted/[0.06]", text: "text-muted", dot: "bg-muted" };

  return (
    <div className="space-y-5">
      {/* Document header */}
      <div className="card-enterprise rounded-xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-ink leading-snug">{doc.title}</h2>
            {doc.description && <p className="text-sm text-muted mt-1.5 leading-relaxed">{doc.description}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {doc.isLocked && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-warn/[0.08] text-warn border border-warn/20">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd"/>
                </svg>
                {isFa ? "قفل‌شده" : "Locked"}
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-white/[0.06] ${status.bg} ${status.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {doc.status}
            </span>
          </div>
        </div>

        {/* Info grid */}
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-line">
          {[
            { label: isFa ? "نوع" : "Type",        value: enumLabel(ted, "docType", doc.documentType) },
            { label: isFa ? "نسخه" : "Revision",   value: doc.currentRevision ?? "—", mono: true },
            { label: isFa ? "زبان" : "Language",   value: doc.language.toUpperCase() },
            { label: isFa ? "ویرایش" : "Updated",  value: new Date(doc.updatedAt).toLocaleDateString() },
          ].map(d => (
            <div key={d.label}>
              <dt className="text-xs text-faint mb-1">{d.label}</dt>
              <dd className={`text-sm font-medium text-ink ${d.mono ? "font-mono" : ""}`}>{d.value}</dd>
            </div>
          ))}
        </dl>

        {doc.keywords.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {doc.keywords.map(kw => (
              <span key={kw} className="text-xs bg-surface3 text-muted px-2 py-0.5 rounded border border-line">
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Panels grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revision History */}
        <div className="card-enterprise rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">{isFa ? "تاریخچه بازبینی" : "Revision History"}</h3>
            <span className="text-xs text-faint">{doc.revisions.length}</span>
          </div>
          <div className="divide-y divide-line">
            {doc.revisions.length === 0 ? (
              <div className="px-5 py-6 text-center"><p className="text-xs text-faint">{isFa ? "بازبینی‌ای یافت نشد" : "No revisions yet"}</p></div>
            ) : (
              doc.revisions.slice(0, 6).map(rev => (
                <div key={rev.id} className="px-5 py-3 flex items-center justify-between hover:bg-surface2 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-signal">{rev.revisionNumber}</span>
                      <span className="text-xs text-faint">{rev.revisionType}</span>
                    </div>
                    {rev.summary && <p className="text-xs text-muted mt-0.5 truncate max-w-[200px]">{rev.summary}</p>}
                  </div>
                  <span className="text-xs text-faint font-mono">{new Date(rev.createdAt).toLocaleDateString()}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Approvals */}
        <div className="card-enterprise rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">{isFa ? "تأییدیه‌ها" : "Approvals"}</h3>
            <span className="text-xs text-faint">{doc.approvals.length}</span>
          </div>
          <div className="divide-y divide-line">
            {doc.approvals.length === 0 ? (
              <div className="px-5 py-6 text-center"><p className="text-xs text-faint">{isFa ? "تأییدیه‌ای یافت نشد" : "No approvals yet"}</p></div>
            ) : (
              doc.approvals.slice(0, 6).map(apr => {
                const a = APPROVAL_STYLE[apr.status] ?? { bg: "bg-muted/[0.06]", text: "text-muted" };
                return (
                  <div key={apr.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-surface2 transition-colors">
                    <div>
                      <p className="text-xs font-medium text-ink">
                        {isFa ? "مرحله" : "Stage"} {apr.stage} — {apr.approverRole}
                      </p>
                      {apr.comment && <p className="text-xs text-muted mt-0.5 truncate max-w-[180px] italic">{apr.comment}</p>}
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded border border-white/[0.05] ${a.bg} ${a.text}`}>
                      {apr.status}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Comments */}
        <div className="card-enterprise rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">{isFa ? "نظرات" : "Comments"}</h3>
            <span className="text-xs text-faint">{doc.comments.length}</span>
          </div>
          <div className="divide-y divide-line">
            {doc.comments.length === 0 ? (
              <div className="px-5 py-6 text-center"><p className="text-xs text-faint">{isFa ? "نظری ثبت نشده" : "No comments yet"}</p></div>
            ) : (
              doc.comments.slice(0, 5).map(cmt => (
                <div key={cmt.id} className="px-5 py-3 hover:bg-surface2 transition-colors">
                  <p className="text-xs text-ink leading-relaxed">{cmt.content}</p>
                  <p className="text-xs text-faint mt-1 font-mono">{new Date(cmt.createdAt).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="card-enterprise rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">{isFa ? "فراداده" : "Metadata"}</h3>
            <span className="text-xs text-faint">{doc.metadata.length}</span>
          </div>
          <div className="divide-y divide-line">
            {doc.metadata.length === 0 ? (
              <div className="px-5 py-6 text-center"><p className="text-xs text-faint">{isFa ? "فراداده‌ای یافت نشد" : "No metadata"}</p></div>
            ) : (
              doc.metadata.slice(0, 8).map(m => (
                <div key={m.id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-surface2 transition-colors">
                  <span className="text-xs font-mono text-ice min-w-[100px] shrink-0">{m.key}</span>
                  <span className="text-xs text-ink font-medium truncate">{m.value}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Audit trail */}
      {doc.audit.length > 0 && (
        <div className="card-enterprise rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">{isFa ? "مسیر حسابرسی" : "Audit Trail"}</h3>
            <span className="text-xs text-faint">{doc.audit.length} {isFa ? "رویداد" : "events"}</span>
          </div>
          <div className="divide-y divide-line">
            {doc.audit.map(a => (
              <div key={a.id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-surface2 transition-colors">
                <span className="text-xs font-mono font-semibold text-signal bg-signal/[0.08] px-1.5 py-0.5 rounded border border-signal/15 shrink-0">
                  {a.action}
                </span>
                <span className="text-xs text-muted truncate flex-1">{a.details ?? a.action}</span>
                <span className="text-xs text-faint font-mono shrink-0 whitespace-nowrap">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
