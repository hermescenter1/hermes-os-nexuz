"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname }  from "next/navigation";
import type { WorkflowDefinitionFull } from "@/lib/automation/types";

type Step = 1 | 2 | 3 | 4 | 5;

const TRIGGER_OPTIONS = [
  { value: "MANUAL",                          label: "Manual"                    },
  { value: "SCHEDULED",                       label: "Scheduled"                 },
  { value: "CRM_LEAD_CREATED",                label: "CRM: Lead Created"         },
  { value: "CRM_OPPORTUNITY_WON",             label: "CRM: Opportunity Won"      },
  { value: "CRM_CUSTOMER_AT_RISK",            label: "CRM: Customer At Risk"     },
  { value: "ATS_APPLICATION_SUBMITTED",       label: "ATS: Application Submitted"},
  { value: "ACADEMY_COURSE_COMPLETED",        label: "Academy: Course Completed" },
  { value: "VENDOR_ONBOARDING_REQUESTED",     label: "Vendor: Onboarding"        },
  { value: "CUSTOMER_SUPPORT_TICKET_CREATED", label: "Support: Ticket Created"   },
  { value: "INDUSTRIAL_ASSET_RISK_HIGH",      label: "Industrial: Asset Risk"    },
  { value: "KNOWLEDGE_ARTICLE_CREATED",       label: "Knowledge: Article Created"},
];

const CONDITION_TYPES = ["ALWAYS","FIELD_EQUALS","FIELD_NOT_EQUALS","FIELD_GREATER_THAN","FIELD_LESS_THAN","STATUS_IS","ROLE_IS","HEALTH_SCORE_BELOW","PRIORITY_IS"];
const ACTION_TYPES    = ["CREATE_NOTIFICATION","CREATE_TASK","CREATE_SUPPORT_TICKET","CREATE_CRM_ACTIVITY","UPDATE_RECORD_STATUS","ASSIGN_OWNER","CREATE_AUDIT_LOG","SEND_WEBHOOK","CREATE_KNOWLEDGE_NOTE","CREATE_MAINTENANCE_ALERT"];
const STATUSES        = ["DRAFT","ACTIVE","PAUSED","ARCHIVED"] as const;

const STEP_LABELS: Record<Step, string> = {
  1: "Basics",
  2: "Trigger",
  3: "Conditions",
  4: "Actions",
  5: "Review",
};

export function WorkflowBuilderClient({ initial }: { initial?: WorkflowDefinitionFull | null }) {
  const router    = useRouter();
  const pathname  = usePathname();
  const locale    = pathname.startsWith("/fa") ? "fa" : "en";
  const [pending, startTransition] = useTransition();

  const [step,        setStep]        = useState<Step>(1);
  const [name,        setName]        = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status,      setStatus]      = useState<string>(initial?.status ?? "DRAFT");
  const [triggerType, setTriggerType] = useState<string>(initial?.triggerType ?? "MANUAL");
  const [conditions,  setConditions]  = useState<Array<{ type: string; field: string; value: string }>>(
    initial?.conditions.map(c => ({ type: c.type, field: c.field ?? "", value: c.value ?? "" })) ?? []
  );
  const [actions,     setActions]     = useState<Array<{ type: string; config: string }>>(
    initial?.actions.map(a => ({ type: a.type, config: JSON.stringify(a.config, null, 2) })) ?? []
  );
  const [error, setError] = useState("");

  const addCondition = () => setConditions(prev => [...prev, { type: "ALWAYS", field: "", value: "" }]);
  const rmCondition  = (i: number) => setConditions(prev => prev.filter((_, idx) => idx !== i));
  const updCondition = (i: number, k: string, v: string) =>
    setConditions(prev => prev.map((c, idx) => idx === i ? { ...c, [k]: v } : c));

  const addAction = () => setActions(prev => [...prev, { type: "CREATE_NOTIFICATION", config: '{"channel":"in_app","message":""}' }]);
  const rmAction  = (i: number) => setActions(prev => prev.filter((_, idx) => idx !== i));
  const updAction = (i: number, k: string, v: string) =>
    setActions(prev => prev.map((a, idx) => idx === i ? { ...a, [k]: v } : a));

  const canNext = () => {
    if (step === 1 && name.trim().length < 1) return false;
    return true;
  };

  const handleSave = () => {
    if (!name.trim()) { setError("Name is required"); return; }
    const url    = initial ? `/api/automation/workflows/${initial.id}` : "/api/automation/workflows";
    const method = initial ? "PATCH" : "POST";
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      triggerType,
      ...(initial ? { status } : {}),
    };
    startTransition(async () => {
      try {
        const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) { setError("Save failed — try again"); return; }
        router.push(`/${locale}/automation/workflows`);
        router.refresh();
      } catch {
        setError("Network error — try again");
      }
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex gap-1">
        {([1, 2, 3, 4, 5] as Step[]).map(s => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
              step === s ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            {STEP_LABELS[s]}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="My Workflow"
              maxLength={120}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              rows={3}
              maxLength={500}
            />
          </div>
          {initial && (
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <label className="block text-sm font-medium mb-1">Trigger</label>
          <select
            value={triggerType}
            onChange={e => setTriggerType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {TRIGGER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">
            This workflow fires whenever the selected event occurs in Hermes OS.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Conditions</h3>
            <button onClick={addCondition} className="text-xs text-primary hover:underline">+ Add</button>
          </div>
          {conditions.length === 0 && (
            <p className="text-sm text-muted-foreground">No conditions — workflow always executes when triggered.</p>
          )}
          {conditions.map((c, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={c.type}
                  onChange={e => updCondition(i, "type", e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded border bg-background text-xs focus:outline-none"
                >
                  {CONDITION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => rmCondition(i)} className="text-xs text-red-500 hover:text-red-700">✕</button>
              </div>
              {c.type !== "ALWAYS" && (
                <>
                  <input
                    value={c.field}
                    onChange={e => updCondition(i, "field", e.target.value)}
                    className="w-full px-2 py-1.5 rounded border bg-background text-xs focus:outline-none"
                    placeholder="field (e.g. status)"
                  />
                  <input
                    value={c.value}
                    onChange={e => updCondition(i, "value", e.target.value)}
                    className="w-full px-2 py-1.5 rounded border bg-background text-xs focus:outline-none"
                    placeholder="value (e.g. ACTIVE)"
                  />
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Actions</h3>
            <button onClick={addAction} className="text-xs text-primary hover:underline">+ Add</button>
          </div>
          {actions.length === 0 && (
            <p className="text-sm text-muted-foreground">No actions configured.</p>
          )}
          {actions.map((a, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                <select
                  value={a.type}
                  onChange={e => updAction(i, "type", e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded border bg-background text-xs focus:outline-none"
                >
                  {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => rmAction(i)} className="text-xs text-red-500 hover:text-red-700">✕</button>
              </div>
              <textarea
                value={a.config}
                onChange={e => updAction(i, "config", e.target.value)}
                className="w-full px-2 py-1.5 rounded border bg-background font-mono text-xs focus:outline-none resize-none"
                rows={3}
                placeholder='{"key":"value"}'
              />
            </div>
          ))}
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <h3 className="font-medium">Review</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-4"><dt className="text-muted-foreground w-24">Name</dt><dd className="font-medium">{name || "—"}</dd></div>
            <div className="flex gap-4"><dt className="text-muted-foreground w-24">Trigger</dt><dd className="font-mono text-xs">{triggerType}</dd></div>
            <div className="flex gap-4"><dt className="text-muted-foreground w-24">Conditions</dt><dd>{conditions.length}</dd></div>
            <div className="flex gap-4"><dt className="text-muted-foreground w-24">Actions</dt><dd>{actions.length}</dd></div>
          </dl>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t">
        <button
          onClick={() => setStep(prev => Math.max(1, prev - 1) as Step)}
          disabled={step === 1}
          className="px-4 py-2 rounded-lg border text-sm disabled:opacity-40"
        >
          Back
        </button>
        {step < 5 ? (
          <button
            onClick={() => canNext() && setStep(prev => (prev + 1) as Step)}
            disabled={!canNext()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-40"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={pending}
            className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-60"
          >
            {pending ? "Saving…" : initial ? "Save Changes" : "Create Workflow"}
          </button>
        )}
      </div>
    </div>
  );
}
