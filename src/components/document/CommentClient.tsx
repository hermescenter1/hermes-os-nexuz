"use client";

import { useLocale } from "next-intl";import { usePathname } from "next/navigation";
import type { EdmsComment } from "@/lib/document/types";
import { formatDateTime } from "@/lib/i18n/format";

interface Props { comments: EdmsComment[] }

export function CommentClient({ comments }: Props) {
  const locale = useLocale();
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");

  if (comments.length === 0) {
    return (
      <div className="card-enterprise rounded-xl px-5 py-12 text-center">
        <p className="text-muted text-sm">{isFa ? "نظری ثبت نشده است" : "No comments yet"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {comments.map(c => (
        <div
          key={c.id}
          className={[
            "card-enterprise rounded-xl p-4 border-s-2 transition-colors",
            c.isResolved ? "border-signal/40 opacity-70" : "border-signal",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-ink leading-relaxed">{c.content}</p>
            {c.isResolved && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-signal/[0.08] text-signal border border-signal/20 shrink-0">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd"/>
                </svg>
                {isFa ? "حل‌شده" : "Resolved"}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-faint">
            <span className="font-mono">{c.documentId.slice(0, 8)}…</span>
            <span>{formatDateTime(c.createdAt, locale)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
