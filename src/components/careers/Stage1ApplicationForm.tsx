"use client";

/**
 * The Stage-1 public application form.
 *
 * Rendered by `ApplyFormClient` ONLY when the owner gate is open and the
 * posting was verified as published in this locale. It collects exactly the
 * approved Stage-1 field set (`@/lib/ats/stage1-schema`) and validates with the
 * SAME schema object the server route enforces; the server re-validates all of
 * it and applies every gate of its own (rate limit, Origin, strict schema,
 * idempotency key, eligibility, owner gate, approved retention policy, the
 * organization's intake switch) before anything is written.
 *
 * What the applicant is told is only what is true:
 *   * success — the application was RECEIVED, with its opaque reference. The
 *     answer is identical for a first submission, a replay and a duplicate, so
 *     the page never reveals whether an application already existed;
 *   * refusal — one generic message; never a reason, never a review or a
 *     decision (those happen later, inside the ATS, and are not public);
 *   * network failure — the outcome is unknown, and retrying is safe: the same
 *     application is re-sent with the SAME idempotency key, so it can never be
 *     recorded twice.
 *
 * Nothing is persisted in the browser, nothing is logged, and the form is
 * cleared once the application is received.
 */

import { useCallback, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  STAGE1_FIELD_ORDER,
  STAGE1_IDEMPOTENCY_HEADER,
  STAGE1_INITIAL_FORM,
  classifyApplyResponse,
  newIdempotencyKey,
  validateStage1Form,
  type Stage1Field,
  type Stage1FieldError,
  type Stage1FormState,
  type Stage1SubmitOutcome,
} from "./stage1-contract";

type Phase =
  | { kind: "editing" }
  | { kind: "submitting" }
  | { kind: "received"; reference: string }
  | { kind: "failed"; outcome: Exclude<Stage1SubmitOutcome, { kind: "received" }> };

const inputClass =
  "ds-focus w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted/70 transition-colors disabled:opacity-60";

export function Stage1ApplicationForm({ jobId, jobTitle, locale }: { jobId: string; jobTitle: string; locale: string }) {
  const t = useTranslations("careers.apply");
  const uid = useId();
  const [form, setForm] = useState<Stage1FormState>(STAGE1_INITIAL_FORM);
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [attempted, setAttempted] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  // One key per DISTINCT payload: a retry of the same application re-uses it
  // (the server replays instead of writing twice); any edit gets a new one.
  const keyRef = useRef<{ key: string; body: string } | null>(null);

  const validation = useMemo(() => validateStage1Form(jobId, form), [jobId, form]);
  const errors = attempted ? validation.errors : {};
  const errorFields = STAGE1_FIELD_ORDER.filter((f) => errors[f]);
  const busy = phase.kind === "submitting";

  const id = (f: string) => `${uid}-${f}`;
  const set = <K extends keyof Stage1FormState>(k: K, v: Stage1FormState[K]) => setForm((prev) => ({ ...prev, [k]: v }));

  const errorText = useCallback(
    (field: Stage1Field, code: Stage1FieldError): string => {
      if (code === "invalid" && field === "email") return t("form.errors.email");
      if (code === "invalid" && field === "linkedinUrl") return t("form.errors.linkedin");
      if (code === "invalid" && field === "yearsExperience") return t("form.errors.years");
      if (code === "tooShort" && field === "phone") return t("form.errors.phone");
      return t(`form.errors.${code}`);
    },
    [t],
  );

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (!validation.payload) {
      // Move focus to the summary so a keyboard or screen-reader user hears it.
      setTimeout(() => summaryRef.current?.focus(), 0);
      return;
    }
    const body = JSON.stringify(validation.payload);
    if (keyRef.current?.body !== body) keyRef.current = { key: newIdempotencyKey(), body };
    const key = keyRef.current.key;

    setPhase({ kind: "submitting" });
    let outcome: Stage1SubmitOutcome;
    try {
      const res = await fetch(`/api/careers/apply?locale=${encodeURIComponent(locale)}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", [STAGE1_IDEMPOTENCY_HEADER]: key },
        body,
      });
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        parsed = null;
      }
      outcome = classifyApplyResponse(res.status, parsed, res.headers.get("retry-after"));
    } catch {
      outcome = { kind: "unconfirmed" };
    }

    if (outcome.kind === "received") {
      // The details leave the page's memory once they are safely received.
      setForm(STAGE1_INITIAL_FORM);
      keyRef.current = null;
      setAttempted(false);
      setPhase({ kind: "received", reference: outcome.reference });
    } else {
      setPhase({ kind: "failed", outcome });
    }
    setTimeout(() => statusRef.current?.focus(), 0);
  };

  if (phase.kind === "received") {
    return (
      <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="mx-auto max-w-xl py-20 text-center outline-none">
        <h1 className="type-page-title mb-3">{t("successTitle")}</h1>
        <p className="mx-auto mb-5 max-w-md text-sm leading-relaxed text-muted">{t("form.successBody", { title: jobTitle })}</p>
        <p className="mx-auto mb-1 text-xs text-muted">{t("form.referenceLabel")}</p>
        <p className="mx-auto mb-3 font-mono text-sm text-ink" dir="ltr" data-testid="application-reference">
          {phase.reference}
        </p>
        <p className="mx-auto mb-8 max-w-md text-xs text-muted">{t("form.referenceHint")}</p>
        <Link
          href="/careers"
          className="ds-focus inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-6 py-2.5 text-sm text-muted transition-colors hover:text-ink"
        >
          {t("successAllJobs")}
        </Link>
      </div>
    );
  }

  const failure = phase.kind === "failed" ? phase.outcome : null;
  const failureText = !failure
    ? null
    : failure.kind === "invalid"
      ? t("form.invalidBody")
      : failure.kind === "rateLimited"
        ? failure.retryAfterSeconds !== null
          ? t("form.rateLimited", { minutes: Math.max(1, Math.ceil(failure.retryAfterSeconds / 60)) })
          : t("form.rateLimitedUnknown")
        : failure.kind === "unconfirmed"
          ? t("form.unconfirmed")
          : t("form.notAcceptingNow");

  const field = (
    f: Stage1Field,
    label: string,
    control: (props: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined; disabled: boolean }) => ReactNode,
    opts: { hint?: string; required?: boolean } = {},
  ) => {
    const err = errors[f];
    const describedBy = [opts.hint ? `${id(f)}-hint` : null, err ? `${id(f)}-error` : null].filter(Boolean).join(" ") || undefined;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id(f)} className="text-sm font-medium text-ink">
          {label}
          {opts.required ? (
            <span className="text-signal" aria-hidden="true">
              {" "}*
            </span>
          ) : (
            <span className="text-xs text-muted"> ({t("form.optional")})</span>
          )}
          {opts.required ? <span className="sr-only"> ({t("requiredMark")})</span> : null}
        </label>
        {control({ id: id(f), "aria-invalid": Boolean(err), "aria-describedby": describedBy, disabled: busy })}
        {opts.hint ? (
          <p id={`${id(f)}-hint`} className="text-xs text-muted">
            {opts.hint}
          </p>
        ) : null}
        {err ? (
          <p id={`${id(f)}-error`} className="text-xs text-rose-300">
            {errorText(f, err)}
          </p>
        ) : null}
      </div>
    );
  };

  const border = (f: Stage1Field) => (errors[f] ? "border-rose-400/70" : "border-line");

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="mb-6">
        <Link href={`/careers/${jobId}`} className="ds-focus font-mono text-xs text-muted transition-colors hover:text-ink">
          <span aria-hidden="true" className="inline-block rtl:rotate-180">←</span> {t("backToJob")}
        </Link>
      </div>
      <p className="eyebrow-label mb-2">{t("eyebrow")}</p>
      <h1 className="type-page-title mb-3">{t("titleFor", { title: jobTitle })}</h1>
      <p className="mb-8 max-w-xl text-sm leading-relaxed text-muted">{t("form.processingNote")}</p>

      {attempted && errorFields.length > 0 ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="mb-6 rounded-lg border border-rose-400/50 bg-rose-950/40 p-4 outline-none">
          <p className="text-sm font-semibold text-ink">{t("form.errorSummaryTitle", { count: errorFields.length })}</p>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-xs">
            {errorFields.map((f) => (
              <li key={f}>
                <a href={`#${id(f)}`} className="text-rose-200 underline">
                  {t(`form.fieldNames.${f}`)}: {errorText(f, errors[f]!)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div ref={statusRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {failureText ? (
          <div role="alert" className="mb-6 rounded-lg border border-amber-400/50 bg-amber-950/30 p-4">
            <p className="text-sm font-semibold text-ink">{t("errorHeading")}</p>
            <p className="mt-1 text-xs text-muted">{failureText}</p>
          </div>
        ) : null}
      </div>

      <form noValidate onSubmit={onSubmit} aria-busy={busy} className="flex flex-col gap-8">
        <fieldset className="flex flex-col gap-4" disabled={busy}>
          <legend className="mb-1 text-base font-semibold text-ink">{t("personalSection")}</legend>
          <p className="-mt-2 text-xs text-muted">{t("personalSectionHint")}</p>
          {field("fullName", t("fullName"), (p) => (
            <input {...p} className={`${inputClass} ${border("fullName")}`} autoComplete="name" required maxLength={200} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
          ), { required: true })}
          {field("email", t("emailAddress"), (p) => (
            <input {...p} type="email" dir="ltr" className={`${inputClass} ${border("email")}`} autoComplete="email" required maxLength={320} value={form.email} onChange={(e) => set("email", e.target.value)} />
          ), { required: true })}
          {field("phone", t("phone"), (p) => (
            <input {...p} type="tel" dir="ltr" className={`${inputClass} ${border("phone")}`} autoComplete="tel" maxLength={40} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          ))}
          {field("currentLocation", t("currentLocation"), (p) => (
            <input {...p} className={`${inputClass} ${border("currentLocation")}`} autoComplete="address-level2" maxLength={200} placeholder={t("currentLocationPlaceholder")} value={form.currentLocation} onChange={(e) => set("currentLocation", e.target.value)} />
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-4" disabled={busy}>
          <legend className="mb-1 text-base font-semibold text-ink">{t("profileSection")}</legend>
          <p className="-mt-2 text-xs text-muted">{t("form.profileHint")}</p>
          {field("yearsExperience", t("yearsExperience"), (p) => (
            <input {...p} inputMode="numeric" dir="ltr" className={`${inputClass} ${border("yearsExperience")} max-w-40`} maxLength={2} value={form.yearsExperience} onChange={(e) => set("yearsExperience", e.target.value)} />
          ), { hint: t("form.yearsHint") })}
          {field("keySkills", t("keySkills"), (p) => (
            <input {...p} className={`${inputClass} ${border("keySkills")}`} placeholder={t("form.keySkillsPlaceholder")} value={form.keySkills} onChange={(e) => set("keySkills", e.target.value)} />
          ), { hint: t("keySkillsHint") })}
          {field("resumeText", t("resume"), (p) => (
            <textarea {...p} rows={10} className={`${inputClass} ${border("resumeText")}`} maxLength={20000} placeholder={t("resumePlaceholder")} value={form.resumeText} onChange={(e) => set("resumeText", e.target.value)} />
          ), { hint: t("resumeHint") })}
          {field("fitStatement", t("coverLetterSection"), (p) => (
            <textarea {...p} rows={6} className={`${inputClass} ${border("fitStatement")}`} maxLength={4000} placeholder={t("coverLetterPlaceholder")} value={form.fitStatement} onChange={(e) => set("fitStatement", e.target.value)} />
          ), { hint: t("form.coverLetterHint") })}
          {field("linkedinUrl", t("form.linkedin"), (p) => (
            <input {...p} type="url" dir="ltr" className={`${inputClass} ${border("linkedinUrl")}`} autoComplete="url" maxLength={300} placeholder="https://www.linkedin.com/in/…" value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} />
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-4" disabled={busy}>
          <legend className="mb-1 text-base font-semibold text-ink">{t("form.consentSection")}</legend>
          {(
            [
              ["privacyNoticeAcknowledged", true],
              ["accuracyConfirmed", true],
              ["futureOpeningsConsent", false],
            ] as const
          ).map(([f, required]) => {
            // The optional consent is never an error: it has no Stage1Field.
            const errField: Stage1Field | null = f === "futureOpeningsConsent" ? null : f;
            const err = errField ? errors[errField] : undefined;
            return (
              <div key={f} className="flex flex-col gap-1">
                <label htmlFor={id(f)} className="flex items-start gap-3 text-sm text-ink">
                  <input
                    id={id(f)}
                    type="checkbox"
                    className="ds-focus mt-0.5 h-4 w-4 shrink-0"
                    checked={form[f]}
                    onChange={(e) => set(f, e.target.checked)}
                    aria-invalid={Boolean(err)}
                    aria-describedby={err ? `${id(f)}-error` : undefined}
                    required={required}
                    disabled={busy}
                  />
                  <span>
                    {f === "privacyNoticeAcknowledged"
                      ? t.rich("form.privacyNotice", {
                          link: (chunks) => (
                            <Link href="/careers/privacy" target="_blank" rel="noopener noreferrer" className="text-signal underline">
                              {chunks}
                            </Link>
                          ),
                        })
                      : f === "accuracyConfirmed"
                        ? t("form.accuracy")
                        : t("form.futureOpenings")}
                    {required ? (
                      <span className="text-signal" aria-hidden="true">
                        {" "}*
                      </span>
                    ) : null}
                  </span>
                </label>
                {err && errField ? (
                  <p id={`${id(f)}-error`} className="ps-7 text-xs text-rose-300">
                    {errorText(errField, err)}
                  </p>
                ) : null}
              </div>
            );
          })}
        </fieldset>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link href={`/careers/${jobId}`} className="ds-focus rounded-lg border border-line px-5 py-2.5 text-sm text-muted transition-colors hover:text-ink">
            {t("cancel")}
          </Link>
          <button
            type="submit"
            disabled={busy}
            aria-disabled={busy}
            className="ds-focus inline-flex min-h-11 items-center rounded-lg bg-signal px-6 py-2.5 text-sm font-semibold text-bg transition-colors hover:bg-signal/90 disabled:opacity-60"
          >
            {busy ? t("submitting") : t("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
