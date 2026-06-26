"use client";
import { usePathname } from "next/navigation";
import type { EdmsRetentionPolicy } from "@/lib/document/types";
import type { RetentionCheckResult } from "@/lib/document/retention";

const ACTION_STYLE: Record<string, { bg: string; text: string }> = {
  keep:    { bg: "bg-signal/[0.08]", text: "text-signal" },
  archive: { bg: "bg-warn/[0.08]",   text: "text-warn"   },
  delete:  { bg: "bg-danger/[0.08]", text: "text-danger" },
};

interface Props {
  policies: EdmsRetentionPolicy[];
  checks:   RetentionCheckResult[];
}

export function RetentionClient({ policies, checks }: Props) {
  const pathname  = usePathname();
  const isFa      = pathname.startsWith("/fa");
  const toAction  = checks.filter(c => c.action !== "keep");

  return (
    <div className="space-y-5">
      {/* Policies panel */}
      <div className="card-enterprise rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">
            {isFa ? "سیاست‌های نگهداری" : "Retention Policies"}
          </h3>
          <span className="text-xs text-faint">{policies.length}</span>
        </div>
        <div className="divide-y divide-line">
          {policies.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-muted text-sm">{isFa ? "سیاستی تعریف نشده است" : "No retention policies defined"}</p>
            </div>
          ) : (
            policies.map(p => (
              <div key={p.id} className="px-5 py-4 flex items-start justify-between gap-4 hover:bg-surface2 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{p.name}</p>
                  {p.description && <p className="text-xs text-muted mt-0.5">{p.description}</p>}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-faint mt-1.5">
                    <span>{p.retentionDays} {isFa ? "روز" : "days"}</span>
                    <span>{p.documentType ?? (isFa ? "همه انواع" : "All types")}</span>
                    {p.autoArchive && <span>{isFa ? "بایگانی خودکار" : "Auto-archive"}</span>}
                    {p.autoDelete  && <span className="text-danger">{isFa ? "حذف خودکار" : "Auto-delete"}</span>}
                  </div>
                </div>
                <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg border border-white/[0.05] ${
                  p.isActive
                    ? "bg-signal/[0.08] text-signal border-signal/20"
                    : "bg-faint/[0.06] text-faint"
                }`}>
                  {p.isActive ? (isFa ? "فعال" : "Active") : (isFa ? "غیرفعال" : "Inactive")}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Documents requiring action */}
      {toAction.length > 0 && (
        <div className="card-enterprise rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">
              {isFa ? "اسناد نیازمند اقدام" : "Documents Requiring Action"}
            </h3>
            <span className="text-xs text-warn font-mono">{toAction.length}</span>
          </div>
          <div className="divide-y divide-line">
            {toAction.map(c => {
              const s = ACTION_STYLE[c.action] ?? { bg: "bg-muted/[0.06]", text: "text-muted" };
              return (
                <div key={c.documentId} className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-surface2 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{c.title}</p>
                    <p className="text-xs text-faint mt-0.5">
                      {c.ageInDays} {isFa ? "روز" : "days old"} · {isFa ? "سیاست" : "Policy"}: {c.policyName ?? "—"}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg border border-white/[0.05] capitalize ${s.bg} ${s.text}`}>
                    {c.action}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
