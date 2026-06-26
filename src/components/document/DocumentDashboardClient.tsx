"use client";
import { usePathname } from "next/navigation";
import type { EdmsDashboard } from "@/lib/document/types";

interface Props { dashboard: EdmsDashboard }

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  DRAFT:    { bg: "bg-ice/[0.08]",    text: "text-ice",    dot: "bg-ice"    },
  REVIEW:   { bg: "bg-warn/[0.08]",   text: "text-warn",   dot: "bg-warn"   },
  APPROVED: { bg: "bg-signal/[0.08]", text: "text-signal", dot: "bg-signal" },
  REJECTED: { bg: "bg-danger/[0.08]", text: "text-danger", dot: "bg-danger" },
  ARCHIVED: { bg: "bg-faint/[0.10]",  text: "text-faint",  dot: "bg-faint"  },
  OBSOLETE: { bg: "bg-muted/[0.08]",  text: "text-muted",  dot: "bg-muted"  },
};

const ACTION_STYLE: Record<string, string> = {
  CREATE:   "text-signal",
  UPDATE:   "text-ice",
  DELETE:   "text-danger",
  APPROVE:  "text-signal",
  REJECT:   "text-danger",
  CHECKOUT: "text-warn",
  CHECKIN:  "text-muted",
  VIEW:     "text-faint",
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: "bg-muted/[0.08]", text: "text-muted", dot: "bg-muted" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border border-white/[0.06] ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

export function DocumentDashboardClient({ dashboard }: Props) {
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");

  const kpis = [
    { label: isFa ? "کل اسناد"          : "Total Documents",    value: dashboard.totalDocuments,   accent: "text-ink",    sub: "border-line" },
    { label: isFa ? "پیش‌نویس"           : "Drafts",             value: dashboard.draftCount,       accent: "text-ice",    sub: "border-ice/20" },
    { label: isFa ? "در بررسی"           : "In Review",          value: dashboard.reviewCount,      accent: "text-warn",   sub: "border-warn/20" },
    { label: isFa ? "تأیید شده"          : "Approved",           value: dashboard.approvedCount,    accent: "text-signal", sub: "border-signal/20" },
    { label: isFa ? "تأییدیه‌های معلق"   : "Pending Approvals",  value: dashboard.pendingApprovals, accent: dashboard.pendingApprovals > 0 ? "text-warn" : "text-muted", sub: dashboard.pendingApprovals > 0 ? "border-warn/20" : "border-line" },
    { label: isFa ? "برداشت‌های فعال"    : "Active Checkouts",   value: dashboard.activeCheckouts,  accent: dashboard.activeCheckouts > 0 ? "text-ice" : "text-muted",  sub: "border-line" },
  ];

  return (
    <div className="space-y-7">
      {/* Module hero header */}
      <div className="rounded-xl border border-signal/15 bg-signal/[0.04] px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow-mono text-signal mb-1">{isFa ? "سیستم مدیریت اسناد سازمانی" : "Enterprise Document Management System"}</p>
          <h1 className="text-xl font-bold text-ink">{isFa ? "داشبورد EDMS" : "EDMS Dashboard"}</h1>
          <p className="text-sm text-muted mt-1">
            {isFa ? "نظارت بر وضعیت اسناد، تأییدیه‌ها و فعالیت مخزن" : "Monitor document status, approvals, and repository activity"}
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-signal/20 bg-signal/[0.06] text-xs font-medium text-signal">
            <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
            {isFa ? "سیستم فعال" : "System Active"}
          </span>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(k => (
          <div key={k.label} className={`card-enterprise card-hover rounded-xl p-4 border-s-2 ${k.sub}`}>
            <div className={`text-2xl font-bold font-mono ${k.accent}`}>{k.value}</div>
            <div className="text-xs text-muted mt-1.5 leading-snug">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Documents + Audit side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Documents */}
        <div className="card-enterprise rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">
              {isFa ? "آخرین اسناد" : "Recent Documents"}
            </h3>
            <span className="text-xs text-faint">{dashboard.recentDocuments.length} {isFa ? "سند" : "docs"}</span>
          </div>
          <div className="divide-y divide-line">
            {dashboard.recentDocuments.length === 0 ? (
              <div className="px-5 py-8 text-center text-muted text-sm">{isFa ? "سندی یافت نشد" : "No documents found"}</div>
            ) : (
              dashboard.recentDocuments.map(doc => (
                <div key={doc.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-surface2 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{doc.title}</p>
                    <p className="text-xs text-faint mt-0.5">{doc.documentType.replace(/_/g, " ")}</p>
                  </div>
                  <StatusBadge status={doc.status} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Audit Activity */}
        <div className="card-enterprise rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">
              {isFa ? "فعالیت اخیر" : "Recent Audit Activity"}
            </h3>
            <span className="text-xs text-faint">{dashboard.recentAudit.length} {isFa ? "رخداد" : "events"}</span>
          </div>
          <div className="relative px-5 py-4">
            {dashboard.recentAudit.length === 0 ? (
              <p className="text-center text-muted text-sm py-4">{isFa ? "رخدادی یافت نشد" : "No audit entries"}</p>
            ) : (
              <div className="space-y-3">
                {dashboard.recentAudit.map((entry, i) => (
                  <div key={entry.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center shrink-0 pt-0.5">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-surface3 ${ACTION_STYLE[entry.action] ?? "text-muted"}`}>
                        {entry.action.charAt(0)}
                      </span>
                      {i < dashboard.recentAudit.length - 1 && (
                        <div className="w-px h-full min-h-[12px] bg-line mt-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono font-semibold ${ACTION_STYLE[entry.action] ?? "text-muted"}`}>
                          {entry.action}
                        </span>
                        {entry.details && (
                          <span className="text-xs text-muted truncate">{entry.details}</span>
                        )}
                      </div>
                      <p className="text-xs text-faint mt-0.5">
                        <span className="font-mono">{entry.documentId.slice(0, 8)}…</span>
                        {" · "}
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Documents by type */}
      <div className="card-enterprise rounded-xl p-5">
        <h3 className="text-sm font-semibold text-ink mb-4">
          {isFa ? "اسناد بر اساس نوع" : "Documents by Type"}
        </h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(dashboard.documentsByType).map(([type, count]) => (
            <div key={type} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface2 border border-line hover:border-line2 transition-colors">
              <span className="text-sm font-bold text-ink font-mono">{count}</span>
              <span className="text-xs text-muted">{type.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
