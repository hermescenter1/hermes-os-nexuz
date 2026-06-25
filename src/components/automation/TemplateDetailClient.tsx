"use client";

import Link            from "next/link";
import { usePathname } from "next/navigation";
import type { WorkflowTemplate } from "@/lib/automation/types";

export function TemplateDetailClient({ template }: { template: WorkflowTemplate }) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">{template.name}</h1>
          {template.description && <p className="text-muted-foreground">{template.description}</p>}
        </div>
        <Link
          href={`/${locale}/automation/workflows/new?templateId=${template.id}`}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
        >
          Use Template
        </Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 text-sm">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Category</div>
          <div className="font-medium">{template.category}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Trigger</div>
          <div className="font-mono text-xs">{template.triggerType}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Usage</div>
          <div className="font-medium">{template.usageCount} workflows</div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="font-semibold">Conditions ({template.definition.conditions.length})</h3>
        {template.definition.conditions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Always executes.</p>
        ) : (
          template.definition.conditions.map((c, i) => (
            <div key={i} className="text-sm flex items-center gap-3">
              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{c.type}</span>
              {c.value && <span className="text-muted-foreground">value: {c.value}</span>}
            </div>
          ))
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="font-semibold">Actions ({template.definition.actions.length})</h3>
        {template.definition.actions.map(a => (
          <div key={a.order} className="flex items-start gap-3 text-sm">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">{a.order}</span>
            <div>
              <div className="font-mono text-xs font-medium">{a.type}</div>
              <pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                {JSON.stringify(a.config, null, 2)}
              </pre>
            </div>
          </div>
        ))}
      </div>

      <Link href={`/${locale}/automation/templates`} className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to Templates
      </Link>
    </div>
  );
}
