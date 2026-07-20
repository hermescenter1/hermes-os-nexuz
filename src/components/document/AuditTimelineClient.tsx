"use client";

import { useLocale } from "next-intl";import { usePathname } from "next/navigation";
import type { EdmsAudit } from "@/lib/document/types";
import { formatDate } from "@/lib/i18n/format";

const ACTION_CONFIG: Record<string, { dot: string; label_color: string; bg: string }> = {
  CREATE:   { dot: "bg-signal",  label_color: "text-signal",  bg: "bg-signal/[0.08]"  },
  UPDATE:   { dot: "bg-ice",     label_color: "text-ice",     bg: "bg-ice/[0.08]"     },
  DELETE:   { dot: "bg-danger",  label_color: "text-danger",  bg: "bg-danger/[0.08]"  },
  APPROVE:  { dot: "bg-signal",  label_color: "text-signal",  bg: "bg-signal/[0.08]"  },
  REJECT:   { dot: "bg-danger",  label_color: "text-danger",  bg: "bg-danger/[0.08]"  },
  CHECKOUT: { dot: "bg-warn",    label_color: "text-warn",    bg: "bg-warn/[0.08]"    },
  CHECKIN:  { dot: "bg-ice",     label_color: "text-ice",     bg: "bg-ice/[0.08]"     },
  VIEW:     { dot: "bg-faint",   label_color: "text-faint",   bg: "bg-faint/[0.08]"   },
};

interface Props { entries: EdmsAudit[] }

export function AuditTimelineClient({ entries }: Props) {
  const locale = useLocale();
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");

  if (entries.length === 0) {
    return (
      <div className="card-enterprise rounded-xl px-5 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-muted/[0.08] border border-line flex items-center justify-center mx-auto mb-4">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-faint"><path fillRule="evenodd" d="M2 10C2 5.58 5.58 2 10 2s8 3.58 8 8-3.58 8-8 8-8-3.58-8-8Zm8.75-1.25a.75.75 0 0 0-1.5 0v2.5c0 .414.336.75.75.75h2.5a.75.75 0 0 0 0-1.5h-1.75v-1.75Z" clipRule="evenodd"/></svg>
        </div>
        <p className="text-muted text-sm">{isFa ? "رخدادی یافت نشد" : "No audit entries found"}</p>
      </div>
    );
  }

  return (
    <div className="card-enterprise rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{isFa ? "رویدادهای حسابرسی" : "Audit Timeline"}</h3>
        <span className="text-xs text-faint">{entries.length} {isFa ? "رویداد" : "events"}</span>
      </div>
      <div className="px-5 py-5">
        <div className="relative space-y-0">
          {/* Timeline line */}
          <div className="absolute start-[11px] top-4 bottom-4 w-px bg-line" aria-hidden />

          {entries.map((entry, i) => {
            const c = ACTION_CONFIG[entry.action] ?? { dot: "bg-muted", label_color: "text-muted", bg: "bg-muted/[0.06]" };
            return (
              <div key={entry.id} className={`relative flex items-start gap-4 ${i > 0 ? "pt-4" : ""}`}>
                {/* Dot */}
                <div className={`relative z-10 w-6 h-6 rounded-full border-2 border-surface flex items-center justify-center shrink-0 ${c.dot}`} />

                {/* Card */}
                <div className="flex-1 min-w-0 pb-1">
                  <div className="card-surface rounded-lg px-4 py-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border border-white/[0.05] ${c.bg} ${c.label_color}`}>
                          {entry.action}
                        </span>
                        {entry.details && (
                          <span className="text-xs text-muted truncate max-w-[200px]">{entry.details}</span>
                        )}
                      </div>
                      <span className="text-xs text-faint shrink-0 font-mono">
                        {formatDate(entry.createdAt, locale)}
                      </span>
                    </div>
                    <p className="text-xs text-faint mt-1.5 font-mono">
                      doc: {entry.documentId.slice(0, 12)}…
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
