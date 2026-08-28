"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

// ── Canonical option values ───────────────────────────────────────────────────
//
// These are the values the sales-lead API stores and filters on. They are NEVER
// translated — only their display labels are. Translating a persisted value
// would silently change what the backend receives when the reader switches
// language, which is how a German visitor's "Vorausschauende Wartung" would
// arrive as an unrecognised interest.

const INTEREST_VALUES = [
  "INDUSTRIAL_BRAIN",
  "PREDICTIVE_MAINT",
  "EDMS",
  "CMMS",
  "EXPERT_NETWORK",
  "ENTERPRISE_SAAS",
] as const;

/** [lower, upper] — `null` upper means "and above". */
const COMPANY_SIZE_BANDS: readonly (readonly [number, number | null])[] = [
  [1, 10],
  [11, 50],
  [51, 200],
  [201, 1000],
  [1000, null],
];

// ── Shared dark control classes ───────────────────────────────────────────────
// Avoids CSS var opacity failures (Phase 78A lesson). The 44px minimum comes
// from the `#public-content` rule in globals.css, so `h-10` is a floor, not a cap.

const INPUT_CLS =
  "w-full h-10 rounded-xl px-3 text-sm " +
  "bg-[#0C1420] text-[#F0F4F8] border border-[#1E2E40] " +
  "placeholder:text-[#5A6B80] " +
  "focus:outline-none focus:border-[rgba(30,200,164,0.5)] focus:ring-2 focus:ring-[rgba(30,200,164,0.12)] " +
  "transition-all";

const SELECT_CLS =
  "w-full h-10 rounded-xl px-3 text-sm " +
  "bg-[#0C1420] text-[#F0F4F8] border border-[#1E2E40] " +
  "focus:outline-none focus:border-[rgba(30,200,164,0.5)] focus:ring-2 focus:ring-[rgba(30,200,164,0.12)] " +
  "transition-all";

const TEXTAREA_CLS =
  "w-full rounded-xl px-3 py-2.5 text-sm resize-none " +
  "bg-[#0C1420] text-[#F0F4F8] border border-[#1E2E40] " +
  "placeholder:text-[#5A6B80] " +
  "focus:outline-none focus:border-[rgba(30,200,164,0.5)] focus:ring-2 focus:ring-[rgba(30,200,164,0.12)] " +
  "transition-all";

// ── Field wrapper ─────────────────────────────────────────────────────────────

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  requiredWord: string;
  optionalWord: string;
  children: React.ReactNode;
}

/**
 * Binds the visible label to its control with `htmlFor`/`id`.
 *
 * The previous version rendered a bare `<label>` with no `htmlFor` and controls
 * with no `id`, so all twelve fields reached the accessibility tree unnamed: a
 * screen reader announced "edit text" twelve times and the label text was not
 * a click target either. The `*` is decorative — the requirement is also stated
 * in words for readers who never see the glyph.
 */
function Field({ id, label, required, requiredWord, optionalWord, children }: FieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[10px] font-mono uppercase tracking-wider text-[#8A9BB0] mb-1.5"
      >
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="text-[#1EC8A4] ms-0.5">*</span>
            <span className="sr-only"> ({requiredWord})</span>
          </>
        ) : (
          <span className="ms-1 normal-case tracking-normal text-[#4A5A6E]">({optionalWord})</span>
        )}
      </label>
      {children}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

interface Props {
  locale: string;
}

export function DemoRequestForm({ locale }: Props) {
  const t = useTranslations("demo.form");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;

  // Company-size labels are numbers, so they are formatted for the reader's
  // locale rather than translated — /fa gets Persian digits automatically.
  const num = new Intl.NumberFormat(locale);
  const sizeOptions = COMPANY_SIZE_BANDS.map(([lo, hi]) => ({
    value: hi === null ? `${lo}+` : `${lo}-${hi}`,
    label: hi === null ? `${num.format(lo)}+` : `${num.format(lo)}–${num.format(hi)}`,
  }));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const obj = Object.fromEntries(fd.entries());

    try {
      const res = await fetch("/api/sales/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...obj, locale }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok || !data.ok) {
        // The API's own `error` string is not surfaced: it is server-side text,
        // neither localized nor written for a public reader, and it can carry
        // validation internals. The visitor gets a localized message instead.
        setError(t("errorGeneric"));
      } else {
        setSuccess(true);
      }
    } catch {
      setError(t("errorNetwork"));
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-[rgba(30,200,164,0.25)] bg-[rgba(30,200,164,0.05)] p-8 text-center space-y-3"
      >
        <div className="w-12 h-12 rounded-full bg-[rgba(30,200,164,0.15)] border border-[rgba(30,200,164,0.3)] flex items-center justify-center mx-auto">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="w-6 h-6 text-[#1EC8A4]">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
          </svg>
        </div>
        <h3 className="text-lg font-bold text-[#F0F4F8]">{t("successTitle")}</h3>
        <p className="text-sm text-[#8A9BB0] max-w-sm mx-auto leading-relaxed">{t("successBody")}</p>
      </div>
    );
  }

  const req = t("required");
  const opt = t("optional");

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={busy} noValidate>
      {/* Honeypot — hidden from sight and from the accessibility tree, must stay empty */}
      <input type="text" name="_gotcha" defaultValue="" tabIndex={-1} aria-hidden="true"
        className="sr-only" autoComplete="off" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id={fid("fullName")} label={t("labelFullName")} required requiredWord={req} optionalWord={opt}>
          <input id={fid("fullName")} type="text" name="fullName" required maxLength={100}
            autoComplete="name" placeholder={t("phFullName")}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </Field>
        <Field id={fid("email")} label={t("labelEmail")} required requiredWord={req} optionalWord={opt}>
          <input id={fid("email")} type="email" name="email" required maxLength={200}
            autoComplete="email" dir="ltr" placeholder={t("phEmail")}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id={fid("phone")} label={t("labelPhone")} requiredWord={req} optionalWord={opt}>
          <input id={fid("phone")} type="tel" name="phone" maxLength={30}
            autoComplete="tel" dir="ltr" placeholder={t("phPhone")}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </Field>
        <Field id={fid("company")} label={t("labelCompany")} required requiredWord={req} optionalWord={opt}>
          <input id={fid("company")} type="text" name="company" required maxLength={150}
            autoComplete="organization" placeholder={t("phCompany")}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id={fid("roleTitle")} label={t("labelRole")} required requiredWord={req} optionalWord={opt}>
          <input id={fid("roleTitle")} type="text" name="roleTitle" required maxLength={100}
            autoComplete="organization-title" placeholder={t("phRole")}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </Field>
        <Field id={fid("country")} label={t("labelCountry")} required requiredWord={req} optionalWord={opt}>
          <input id={fid("country")} type="text" name="country" required maxLength={80}
            autoComplete="country-name" placeholder={t("phCountry")}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id={fid("industry")} label={t("labelIndustry")} required requiredWord={req} optionalWord={opt}>
          <input id={fid("industry")} type="text" name="industry" required maxLength={80}
            placeholder={t("phIndustry")}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </Field>
        <Field id={fid("companySize")} label={t("labelCompanySize")} requiredWord={req} optionalWord={opt}>
          <select id={fid("companySize")} name="companySize" defaultValue=""
            style={{ colorScheme: "dark" }} className={SELECT_CLS}>
            <option value="">{t("selectPlease")}</option>
            {sizeOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field id={fid("interest")} label={t("labelInterest")} required requiredWord={req} optionalWord={opt}>
        <select id={fid("interest")} name="interest" required defaultValue=""
          style={{ colorScheme: "dark" }} className={SELECT_CLS}>
          <option value="" disabled>{t("selectPlease")}</option>
          {INTEREST_VALUES.map((v) => (
            <option key={v} value={v}>{t(`interests.${v}`)}</option>
          ))}
        </select>
      </Field>

      <Field id={fid("useCase")} label={t("labelUseCase")} required requiredWord={req} optionalWord={opt}>
        <textarea id={fid("useCase")} name="useCase" required maxLength={2000} rows={4}
          placeholder={t("phUseCase")}
          style={{ colorScheme: "dark" }} className={TEXTAREA_CLS} />
      </Field>

      <Field id={fid("preferredDemo")} label={t("labelPreferred")} requiredWord={req} optionalWord={opt}>
        <input id={fid("preferredDemo")} type="text" name="preferredDemo" maxLength={100}
          placeholder={t("phPreferred")}
          style={{ colorScheme: "dark" }} className={INPUT_CLS} />
      </Field>

      <Field id={fid("message")} label={t("labelMessage")} requiredWord={req} optionalWord={opt}>
        <textarea id={fid("message")} name="message" maxLength={1000} rows={3}
          placeholder={t("phMessage")}
          style={{ colorScheme: "dark" }} className={TEXTAREA_CLS} />
      </Field>

      {error && (
        <div role="alert"
          className="rounded-xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)] px-4 py-3 text-sm text-[#F87171]">
          {error}
        </div>
      )}

      <p className="text-[10px] text-[#4A5A6E] font-mono">{t("privacy")}</p>

      <button
        type="submit"
        disabled={busy}
        className="ds-focus w-full min-h-11 rounded-xl text-sm font-semibold text-[#0C1420] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: busy ? "#1EC8A4" : "linear-gradient(135deg, #1EC8A4 0%, #60B4F0 100%)" }}>
        {busy ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
