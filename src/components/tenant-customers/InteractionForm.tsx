"use client";

/** Record one contact with a customer. The log is append-only: there is no edit or delete. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isoToLocalInput, localInputToIso, sendJson } from "./request";

const KINDS = ["CALL", "MEETING", "EMAIL", "VISIT", "NOTE"] as const;

export interface InteractionFormLabels {
  kind: string;
  kinds: Record<(typeof KINDS)[number], string>;
  occurredAt: string;
  summary: string;
  add: string;
  adding: string;
  added: string;
  future: string;
  archived: string;
  failed: string;
}

export function InteractionForm({ customerId, labels }: { customerId: string; labels: InteractionFormLabels }) {
  const router = useRouter();
  const [kind, setKind] = useState<(typeof KINDS)[number]>("CALL");
  const [at, setAt] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"idle" | "added" | "future" | "archived" | "failed">("idle");
  // "Now", in the browser's zone, once mounted.
  useEffect(() => setAt(isoToLocalInput(new Date().toISOString())), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOutcome("idle");
    const answer = await sendJson("POST", `/api/tenant/customers/${customerId}/interactions`, {
      kind,
      occurredAt: localInputToIso(at) ?? "",
      summary,
    });
    setBusy(false);
    const code = String(answer.body.error ?? "");
    if (answer.status === 201) {
      setSummary("");
      setOutcome("added");
      router.refresh();
      return;
    }
    if (code === "OCCURRED_IN_FUTURE") return setOutcome("future");
    if (code === "ARCHIVED") return setOutcome("archived");
    setOutcome("failed");
  }

  const fieldClass =
    "mt-1 w-full rounded-md border border-border-default bg-surface-interactive px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-signal";

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="if-kind" className="text-xs text-muted">
            {labels.kind}
          </label>
          <select id="if-kind" value={kind} onChange={e => setKind(e.target.value as (typeof KINDS)[number])} className={fieldClass}>
            {KINDS.map(k => (
              <option key={k} value={k}>
                {labels.kinds[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="if-at" className="text-xs text-muted">
            {labels.occurredAt}
          </label>
          <input id="if-at" type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className={fieldClass} />
        </div>
      </div>
      <div>
        <label htmlFor="if-summary" className="text-xs text-muted">
          {labels.summary}
        </label>
        <textarea
          id="if-summary"
          rows={3}
          required
          maxLength={2000}
          value={summary}
          onChange={e => setSummary(e.target.value)}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || summary.trim() === ""}
          className="rounded-md border border-signal bg-signalDim px-4 py-2 text-sm text-signal disabled:opacity-60"
        >
          {busy ? labels.adding : labels.add}
        </button>
        <p role="status" aria-live="polite" className="text-xs">
          {outcome === "added" && <span className="text-signal">{labels.added}</span>}
          {outcome === "future" && <span className="text-warn">{labels.future}</span>}
          {outcome === "archived" && <span className="text-warn">{labels.archived}</span>}
          {outcome === "failed" && <span className="text-warn">{labels.failed}</span>}
        </p>
      </div>
    </form>
  );
}
