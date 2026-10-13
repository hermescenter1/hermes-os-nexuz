"use client";

/**
 * Create or edit one customer of the active organization.
 *
 * Every label arrives from the server page, already translated. The form sends
 * no organization; the API takes it from the session. An edit carries the
 * version it was based on, so a concurrent change is reported (409) instead of
 * silently overwritten. Validation problems come back per field and are shown
 * next to the field they belong to.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isoToLocalInput, localInputToIso, problemsOf, sendJson } from "./request";

export interface CustomerFormValues {
  displayName: string;
  legalName: string | null;
  status: "PROSPECT" | "ACTIVE" | "INACTIVE";
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  followUpOwnerId: string | null;
  nextActionAt: string | null;
  nextActionNote: string | null;
}

export interface CustomerFormLabels {
  displayName: string;
  legalName: string;
  status: string;
  statuses: Record<CustomerFormValues["status"], string>;
  email: string;
  phone: string;
  city: string;
  country: string;
  countryHelp: string;
  notes: string;
  owner: string;
  ownerNone: string;
  nextActionAt: string;
  nextActionAtHelp: string;
  nextActionNote: string;
  submit: string;
  saving: string;
  saved: string;
  conflict: string;
  duplicate: string;
  ownerNotEligible: string;
  archivedLocked: string;
  invalid: string;
  failed: string;
  fieldInvalid: string;
  fieldTooLong: string;
}

type Outcome = "idle" | "saved" | "conflict" | "duplicate" | "owner" | "archived" | "invalid" | "failed";

export function CustomerForm(props: {
  mode: "create" | "edit";
  /** The list page; a created customer opens at `${listHref}/${id}`. */
  listHref: string;
  customerId?: string;
  version?: number;
  initial: CustomerFormValues;
  owners: ReadonlyArray<{ userId: string; name: string }>;
  labels: CustomerFormLabels;
}) {
  const { labels, initial } = props;
  const router = useRouter();
  const [values, setValues] = useState<CustomerFormValues>(initial);
  // Filled after mount: the browser's zone is not the server's.
  const [nextAt, setNextAt] = useState("");
  useEffect(() => setNextAt(isoToLocalInput(initial.nextActionAt)), [initial.nextActionAt]);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) =>
    setValues(v => ({ ...v, [key]: value }));
  const text = (v: string | null) => v ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblems({});
    setOutcome("idle");
    const payload = {
      displayName: values.displayName,
      legalName: text(values.legalName),
      status: values.status,
      email: text(values.email),
      phone: text(values.phone),
      city: text(values.city),
      country: text(values.country),
      notes: text(values.notes),
      followUpOwnerId: values.followUpOwnerId || null,
      nextActionAt: localInputToIso(nextAt),
      nextActionNote: text(values.nextActionNote),
    };
    const answer =
      props.mode === "create"
        ? await sendJson("POST", "/api/tenant/customers", payload)
        : await sendJson("PATCH", `/api/tenant/customers/${props.customerId}`, { ...payload, expectedVersion: props.version });
    setBusy(false);

    const code = String(answer.body.error ?? "");
    if (answer.status === 201 && props.mode === "create" && typeof answer.body.id === "string") {
      router.push(`${props.listHref}/${answer.body.id}`);
      return;
    }
    if (answer.status === 200) {
      setOutcome("saved");
      router.refresh();
      return;
    }
    if (code === "VERSION_CONFLICT") return setOutcome("conflict");
    if (code === "DUPLICATE_NAME") return setOutcome("duplicate");
    if (code === "OWNER_NOT_ELIGIBLE") return setOutcome("owner");
    if (code === "ARCHIVED") return setOutcome("archived");
    if (code === "VALIDATION_FAILED") {
      setProblems(problemsOf(answer.body));
      return setOutcome("invalid");
    }
    setOutcome("failed");
  }

  const fieldClass =
    "mt-1 w-full rounded-md border border-border-default bg-surface-interactive px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-signal";
  const problemText = (field: string) =>
    problems[field] ? (problems[field] === "TOO_LONG" ? labels.fieldTooLong : labels.fieldInvalid) : null;

  const input = (
    id: keyof CustomerFormValues,
    label: string,
    opts: { required?: boolean; maxLength: number; type?: string; help?: string; dir?: "ltr" },
  ) => {
    const problem = problemText(id);
    return (
      <div>
        <label htmlFor={`cf-${id}`} className="text-xs text-muted">
          {label}
        </label>
        <input
          id={`cf-${id}`}
          type={opts.type ?? "text"}
          dir={opts.dir}
          required={opts.required}
          maxLength={opts.maxLength}
          value={text(values[id] as string | null)}
          onChange={e => set(id, e.target.value as never)}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `cf-${id}-problem` : opts.help ? `cf-${id}-help` : undefined}
          className={fieldClass}
        />
        {opts.help && !problem && (
          <p id={`cf-${id}-help`} className="mt-1 text-xs text-muted">
            {opts.help}
          </p>
        )}
        {problem && (
          <p id={`cf-${id}-problem`} className="mt-1 text-xs text-warn">
            {problem}
          </p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {input("displayName", labels.displayName, { required: true, maxLength: 200 })}
        {input("legalName", labels.legalName, { maxLength: 200 })}
        <div>
          <label htmlFor="cf-status" className="text-xs text-muted">
            {labels.status}
          </label>
          <select
            id="cf-status"
            value={values.status}
            onChange={e => set("status", e.target.value as CustomerFormValues["status"])}
            className={fieldClass}
          >
            {(Object.keys(labels.statuses) as Array<CustomerFormValues["status"]>).map(s => (
              <option key={s} value={s}>
                {labels.statuses[s]}
              </option>
            ))}
          </select>
        </div>
        {input("email", labels.email, { maxLength: 254, type: "email", dir: "ltr" })}
        {input("phone", labels.phone, { maxLength: 40, type: "tel", dir: "ltr" })}
        {input("city", labels.city, { maxLength: 100 })}
        {input("country", labels.country, { maxLength: 2, help: labels.countryHelp, dir: "ltr" })}
        <div>
          <label htmlFor="cf-owner" className="text-xs text-muted">
            {labels.owner}
          </label>
          <select
            id="cf-owner"
            value={values.followUpOwnerId ?? ""}
            onChange={e => set("followUpOwnerId", e.target.value || null)}
            className={fieldClass}
          >
            <option value="">{labels.ownerNone}</option>
            {props.owners.map(o => (
              <option key={o.userId} value={o.userId}>
                {o.name}
              </option>
            ))}
          </select>
          {outcome === "owner" && <p className="mt-1 text-xs text-warn">{labels.ownerNotEligible}</p>}
        </div>
        <div>
          <label htmlFor="cf-nextActionAt" className="text-xs text-muted">
            {labels.nextActionAt}
          </label>
          <input
            id="cf-nextActionAt"
            type="datetime-local"
            value={nextAt}
            onChange={e => setNextAt(e.target.value)}
            aria-describedby="cf-nextActionAt-help"
            className={fieldClass}
          />
          <p id="cf-nextActionAt-help" className="mt-1 text-xs text-muted">
            {labels.nextActionAtHelp}
          </p>
        </div>
        {input("nextActionNote", labels.nextActionNote, { maxLength: 500 })}
      </div>
      <div>
        <label htmlFor="cf-notes" className="text-xs text-muted">
          {labels.notes}
        </label>
        <textarea
          id="cf-notes"
          rows={4}
          maxLength={4000}
          value={text(values.notes)}
          onChange={e => set("notes", e.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-signal bg-signalDim px-4 py-2 text-sm text-signal disabled:opacity-60"
        >
          {busy ? labels.saving : labels.submit}
        </button>
        <p role="status" aria-live="polite" className="text-xs">
          {outcome === "saved" && <span className="text-signal">{labels.saved}</span>}
          {outcome === "conflict" && <span className="text-warn">{labels.conflict}</span>}
          {outcome === "duplicate" && <span className="text-warn">{labels.duplicate}</span>}
          {outcome === "archived" && <span className="text-warn">{labels.archivedLocked}</span>}
          {outcome === "invalid" && <span className="text-warn">{labels.invalid}</span>}
          {outcome === "failed" && <span className="text-warn">{labels.failed}</span>}
        </p>
      </div>
    </form>
  );
}
