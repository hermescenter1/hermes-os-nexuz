"use client";

import Link            from "next/link";
import { usePathname } from "next/navigation";
import type { WorkflowDefinition } from "@/lib/automation/types";

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:   "bg-green-500/15 text-green-700 dark:text-green-400",
  PAUSED:   "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  DRAFT:    "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  ARCHIVED: "bg-red-500/15 text-red-400",
};

const TRIGGER_LABELS: Record<string, string> = {
  MANUAL:                          "Manual",
  SCHEDULED:                       "Scheduled",
  CRM_LEAD_CREATED:                "CRM: Lead Created",
  CRM_OPPORTUNITY_WON:             "CRM: Opportunity Won",
  CRM_CUSTOMER_AT_RISK:            "CRM: Customer At Risk",
  ATS_CANDIDATE_CREATED:           "ATS: Candidate Created",
  ATS_APPLICATION_SUBMITTED:       "ATS: Application",
  ACADEMY_COURSE_COMPLETED:        "Academy: Completion",
  VENDOR_ONBOARDING_REQUESTED:     "Vendor: Onboarding",
  CUSTOMER_SUPPORT_TICKET_CREATED: "Support: Ticket",
  INDUSTRIAL_ASSET_RISK_HIGH:      "Industrial: Risk High",
  KNOWLEDGE_ARTICLE_CREATED:       "Knowledge: Article",
};

export function WorkflowListClient({ workflows }: { workflows: WorkflowDefinition[] }) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{workflows.length} Workflow{workflows.length !== 1 ? "s" : ""}</h2>
        <Link
          href={`/${locale}/automation/workflows/new`}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          New Workflow
        </Link>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Trigger</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {workflows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No workflows yet.{" "}
                  <Link href={`/${locale}/automation/workflows/new`} className="text-primary hover:underline">
                    Create one
                  </Link>
                </td>
              </tr>
            ) : (
              workflows.map(wf => (
                <tr key={wf.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/${locale}/automation/workflows/${wf.id}`} className="hover:text-primary">
                      {wf.name}
                    </Link>
                    {wf.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{wf.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {TRIGGER_LABELS[wf.triggerType] ?? wf.triggerType}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[wf.status] ?? ""}`}>
                      {wf.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(wf.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <Link href={`/${locale}/automation/workflows/${wf.id}/builder`} className="text-xs text-muted-foreground hover:text-primary">
                        Edit
                      </Link>
                      <Link href={`/${locale}/automation/workflows/${wf.id}`} className="text-xs text-primary hover:underline">
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
