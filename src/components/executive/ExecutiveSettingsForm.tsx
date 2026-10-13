"use client";

/**
 * The editable part of the executive settings page.
 *
 * A client component only because it holds form state and submits. Every
 * label arrives already translated from the server, and every decision —
 * validation, permission, the organization written to, the version check — is
 * made by the API, not here. This form never sends an organization id.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SettingsFormLabels {
  readonly timeZone: string;
  readonly timeZoneHelp: string;
  readonly dayCutoff: string;
  readonly dayCutoffHelp: string;
  readonly approvalStaleDays: string;
  readonly approvalCriticalDays: string;
  readonly alertAgeHours: string;
  readonly maxItems: string;
  readonly save: string;
  readonly saving: string;
  readonly saved: string;
  readonly conflict: string;
  readonly failed: string;
  readonly problems: Readonly<Record<string, string>>;
}

export interface SettingsFormInitial {
  readonly timeZone: string;
  readonly dayCutoffMinutes: number;
  readonly approvalStaleDays: number;
  readonly approvalCriticalDays: number;
  readonly alertAgeHours: number;
  readonly maxItems: number;
}

type Field = keyof SettingsFormInitial;

const toHhMm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function fromHhMm(value: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  // An unparseable value is sent as NaN (-> null in JSON) and refused by the
  // server with a named problem, rather than silently becoming midnight.
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
}

const intOrNaN = (value: string) => (/^-?\d+$/.test(value.trim()) ? Number(value) : Number.NaN);

export function ExecutiveSettingsForm({
  initial,
  version,
  timeZones,
  labels,
}: {
  initial: SettingsFormInitial;
  version: number;
  timeZones: readonly string[];
  labels: SettingsFormLabels;
}) {
  const router = useRouter();
  const [timeZone, setTimeZone] = useState(initial.timeZone);
  const [cutoff, setCutoff] = useState(toHhMm(initial.dayCutoffMinutes));
  const [stale, setStale] = useState(String(initial.approvalStaleDays));
  const [critical, setCritical] = useState(String(initial.approvalCriticalDays));
  const [alertHours, setAlertHours] = useState(String(initial.alertAgeHours));
  const [maxItems, setMaxItems] = useState(String(initial.maxItems));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "conflict" | "failed">("idle");
  const [problems, setProblems] = useState<Partial<Record<Field, string>>>({});

  const problemFieldMap: Record<string, Field> = {
    timeZone: "timeZone",
    dayCutoffMinutes: "dayCutoffMinutes",
    approvalStaleDays: "approvalStaleDays",
    approvalCriticalDays: "approvalCriticalDays",
    alertAgeHours: "alertAgeHours",
    maxItems: "maxItems",
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("idle");
    setProblems({});
    try {
      const res = await fetch("/api/executive/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version,
          timeZone,
          dayCutoffMinutes: fromHhMm(cutoff),
          priority: {
            approvalStaleDays: intOrNaN(stale),
            approvalCriticalDays: intOrNaN(critical),
            alertAgeHours: intOrNaN(alertHours),
            maxItems: intOrNaN(maxItems),
          },
        }),
      });
      if (res.ok) {
        setStatus("saved");
        router.refresh();
        return;
      }
      if (res.status === 409) {
        setStatus("conflict");
        return;
      }
      if (res.status === 422) {
        const body = (await res.json().catch(() => ({}))) as {
          problems?: { field: string; problem: string }[];
        };
        const next: Partial<Record<Field, string>> = {};
        for (const p of body.problems ?? []) {
          const field = problemFieldMap[p.field];
          if (field && !next[field]) next[field] = labels.problems[p.problem] ?? labels.failed;
        }
        setProblems(next);
        return;
      }
      setStatus("failed");
    } catch {
      setStatus("failed");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "mt-1 w-full rounded-md border border-border-default bg-surface-interactive px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-signal";

  const numberField = (id: Field, label: string, value: string, set: (v: string) => void) => (
    <div>
      <label htmlFor={id} className="text-xs text-muted">
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={e => set(e.target.value)}
        aria-invalid={problems[id] ? true : undefined}
        aria-describedby={problems[id] ? `${id}-problem` : undefined}
        className={fieldClass}
      />
      {problems[id] && (
        <p id={`${id}-problem`} className="mt-1 text-xs text-warn">
          {problems[id]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="timeZone" className="text-xs text-muted">
            {labels.timeZone}
          </label>
          <select
            id="timeZone"
            value={timeZone}
            onChange={e => setTimeZone(e.target.value)}
            aria-invalid={problems.timeZone ? true : undefined}
            aria-describedby="timeZone-help"
            className={fieldClass}
          >
            {timeZones.map(z => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <p id="timeZone-help" className="mt-1 text-xs text-muted">
            {labels.timeZoneHelp}
          </p>
          {problems.timeZone && <p className="mt-1 text-xs text-warn">{problems.timeZone}</p>}
        </div>
        <div>
          <label htmlFor="dayCutoffMinutes" className="text-xs text-muted">
            {labels.dayCutoff}
          </label>
          <input
            id="dayCutoffMinutes"
            type="time"
            step={60}
            value={cutoff}
            onChange={e => setCutoff(e.target.value)}
            aria-invalid={problems.dayCutoffMinutes ? true : undefined}
            aria-describedby="dayCutoff-help"
            className={fieldClass}
          />
          <p id="dayCutoff-help" className="mt-1 text-xs text-muted">
            {labels.dayCutoffHelp}
          </p>
          {problems.dayCutoffMinutes && <p className="mt-1 text-xs text-warn">{problems.dayCutoffMinutes}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {numberField("approvalStaleDays", labels.approvalStaleDays, stale, setStale)}
        {numberField("approvalCriticalDays", labels.approvalCriticalDays, critical, setCritical)}
        {numberField("alertAgeHours", labels.alertAgeHours, alertHours, setAlertHours)}
        {numberField("maxItems", labels.maxItems, maxItems, setMaxItems)}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-signal bg-signalDim px-4 py-2 text-sm text-signal disabled:opacity-60"
        >
          {busy ? labels.saving : labels.save}
        </button>
        <p role="status" aria-live="polite" className="text-xs">
          {status === "saved" && <span className="text-signal">{labels.saved}</span>}
          {status === "conflict" && <span className="text-warn">{labels.conflict}</span>}
          {status === "failed" && <span className="text-warn">{labels.failed}</span>}
        </p>
      </div>
    </form>
  );
}
