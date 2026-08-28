"use client";

import { useId, useState }         from "react";
import { useTranslations }         from "next-intl";
import { useRouter }               from "@/i18n/navigation";
import { track }                   from "@/lib/analytics/events";
import {
  VENDOR_TYPES,
  INDUSTRIAL_EXPERTISE_OPTIONS,
  REGIONS_OPTIONS,
  CERTIFICATIONS_OPTIONS,
  SERVICES_OPTIONS,
} from "@/lib/vendors/types";
import type { VendorApplyPayload, VendorType } from "@/lib/vendors/types";

// Numeric head-count bands. Locale-neutral tokens, deliberately not translated.
const EMPLOYEE_OPTIONS = ["1–10", "11–50", "51–200", "201–500", "500+"];

/**
 * A multi-select rendered as toggle chips.
 *
 * PHASE 104-I3 — the chip VALUE stays canonical because it is what gets
 * persisted (servicesOffered / industrialExpertise / regionsServed). Only the
 * rendered label is localized, via `labelFor`. A value with no catalogue entry
 * falls back to itself, so an option added to the domain list still renders
 * truthfully in English instead of leaking a raw message key.
 */
function CheckGroup({
  legend,
  options,
  selected,
  onChange,
  labelFor,
  hint,
  countHint,
}: {
  legend:    string;
  options:   readonly string[];
  selected:  string[];
  onChange:  (v: string[]) => void;
  labelFor:  (value: string) => string;
  hint?:     string;
  countHint: (n: number) => string;
}) {
  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  }
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{legend}</legend>
      {hint && <p className="mb-2 text-xs leading-relaxed text-muted/80">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              // Toggle semantics: colour alone must not carry the selected state.
              aria-pressed={checked}
              onClick={() => toggle(opt)}
              className={`ds-focus min-h-11 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                checked
                  ? "border-signal/50 bg-signal/10 text-signal"
                  : "border-line bg-surface/50 text-muted hover:border-signal/30 hover:text-ink"
              }`}
            >
              <span aria-hidden="true">{checked ? "✓ " : ""}</span>{labelFor(opt)}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] tabular-nums text-muted/70">{countHint(selected.length)}</p>
    </fieldset>
  );
}

/**
 * Label + control with a real programmatic association.
 *
 * The previous version wrapped the control in a <label> with no `htmlFor`/`id`
 * pair and marked "required" with a bare `*` glyph, which carries no meaning to
 * assistive technology. Each field now owns an id, and the required state is
 * announced as a word as well as shown as a mark.
 */
function FormField({
  id,
  label,
  required,
  requiredWord,
  hint,
  children,
}: {
  id:            string;
  label:         string;
  required?:     boolean;
  requiredWord:  string;
  hint?:         string;
  children:      React.ReactNode;
}) {
  return (
    <div className="block">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="ms-1 text-signal">*</span>
            <span className="sr-only"> ({requiredWord})</span>
          </>
        )}
      </label>
      {hint && <p id={`${id}-hint`} className="mb-1.5 text-xs leading-relaxed text-muted/80">{hint}</p>}
      {children}
    </div>
  );
}

const inputCls =
  "ds-focus w-full rounded-lg border border-line bg-bg px-4 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-signal/50 focus:outline-none";

export function VendorApplicationForm() {
  const router = useRouter();
  const t  = useTranslations("vendors.apply.form");
  const tt = useTranslations("vendors.types");
  const ts = useTranslations("vendors.services");
  const te = useTranslations("vendors.expertise");
  const trg = useTranslations("vendors.regions");

  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;

  const [form, setForm] = useState<Partial<VendorApplyPayload>>({
    vendorType:          "TECHNOLOGY_PROVIDER",
    servicesOffered:     [],
    industrialExpertise: [],
    regionsServed:       [],
    certifications:      [],
    privacyAccepted:     false,
    termsAccepted:       false,
    gdprAccepted:        false,
  });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function set<K extends keyof VendorApplyPayload>(k: K, v: VendorApplyPayload[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function handleFocus() {
    track.vendorApplicationStarted();
  }

  /**
   * Localized label for a canonical option value, falling back to the value.
   * `has` keeps an unmapped option rendering as itself rather than as a key.
   */
  const optLabel = (tf: ReturnType<typeof useTranslations>) => (v: string) => {
    try {
      return tf.has(v) ? tf(v) : v;
    } catch {
      return v;
    }
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/vendors/apply", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      if (res.ok) {
        track.vendorApplicationSubmit();
        setSuccess(true);
      } else {
        // The API's own message is not surfaced verbatim: it is a server-side
        // string that is neither localized nor guaranteed to be fit for public
        // display. The catalogue message states the outcome without leaking it.
        setError(t("errorGeneric"));
      }
    } catch {
      setError(t("errorNetwork"));
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div
        role="status"
        className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-signal/30 bg-signal/5 p-10 text-center"
      >
        <div aria-hidden="true" className="text-4xl text-signal">✓</div>
        {/* h2, not h1: the page heading above this form owns the document h1. */}
        <h2 className="text-xl font-bold text-ink">{t("successTitle")}</h2>
        {/* States that the application was recorded. It does NOT promise a
            review turnaround — nothing in the product evidences one. */}
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted">{t("successBody")}</p>
        <button
          type="button"
          onClick={() => router.push("/vendors")}
          className="ds-focus mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-signal px-6 py-2.5 text-sm font-semibold text-bg transition-colors hover:bg-signal/90"
        >
          {t("successCta")}
          <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span>
        </button>
      </div>
    );
  }

  const req = t("requiredMark");

  return (
    <form onSubmit={submit} onFocus={handleFocus} className="mx-auto max-w-3xl space-y-8">

      {/* Section 1 — Company */}
      <section aria-labelledby={fid("company-h")} className="space-y-5 rounded-xl border border-line bg-surface p-6">
        <div>
          <h2 id={fid("company-h")} className="text-sm font-semibold uppercase tracking-wider text-muted">
            {t("companySection")}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted/80">{t("companySectionHint")}</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField id={fid("cnEn")} label={t("companyNameEn")} required requiredWord={req}>
            <input id={fid("cnEn")} required className={inputCls} placeholder={t("companyNameEnPlaceholder")}
              value={form.companyNameEn ?? ""} onChange={(e) => set("companyNameEn", e.target.value)} />
          </FormField>
          <FormField id={fid("cnFa")} label={t("companyNameFa")} requiredWord={req}>
            {/* dir="rtl" on the field itself: it collects Persian-script data
                regardless of the locale the visitor is reading the page in. */}
            <input id={fid("cnFa")} className={inputCls} placeholder={t("companyNameFaPlaceholder")} dir="rtl" lang="fa"
              value={form.companyNameFa ?? ""} onChange={(e) => set("companyNameFa", e.target.value)} />
          </FormField>
          <div className="sm:col-span-2">
            <p className="text-xs leading-relaxed text-muted/70">{t("bilingualHint")}</p>
          </div>
          <FormField id={fid("web")} label={t("websiteUrl")} requiredWord={req}>
            <input id={fid("web")} type="url" className={inputCls} placeholder={t("websiteUrlPlaceholder")} dir="ltr"
              value={form.websiteUrl ?? ""} onChange={(e) => set("websiteUrl", e.target.value)} />
          </FormField>
          <FormField id={fid("vtype")} label={t("vendorType")} required requiredWord={req}>
            <select id={fid("vtype")} required className={inputCls}
              value={form.vendorType ?? "TECHNOLOGY_PROVIDER"}
              onChange={(e) => set("vendorType", e.target.value as VendorType)}>
              {VENDOR_TYPES.map((v) => <option key={v} value={v}>{tt(v)}</option>)}
            </select>
          </FormField>
          <FormField id={fid("country")} label={t("country")} requiredWord={req}>
            <input id={fid("country")} className={inputCls} placeholder={t("countryPlaceholder")}
              value={form.headquartersCountry ?? ""} onChange={(e) => set("headquartersCountry", e.target.value)} />
          </FormField>
          <FormField id={fid("city")} label={t("city")} requiredWord={req}>
            <input id={fid("city")} className={inputCls} placeholder={t("cityPlaceholder")}
              value={form.headquartersCity ?? ""} onChange={(e) => set("headquartersCity", e.target.value)} />
          </FormField>
          <FormField id={fid("founded")} label={t("foundedYear")} requiredWord={req}>
            <input id={fid("founded")} type="number" className={inputCls} min="1900" max={new Date().getFullYear()} dir="ltr"
              value={form.foundedYear ?? ""} onChange={(e) => set("foundedYear", Number(e.target.value) || undefined)} />
          </FormField>
          <FormField id={fid("emp")} label={t("employeeCount")} requiredWord={req}>
            <select id={fid("emp")} className={inputCls}
              value={form.employeeCount ?? ""} onChange={(e) => set("employeeCount", e.target.value)}>
              <option value="">{t("selectRange")}</option>
              {EMPLOYEE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </FormField>
        </div>
      </section>

      {/* Section 2 — Contact */}
      <section aria-labelledby={fid("contact-h")} className="space-y-5 rounded-xl border border-line bg-surface p-6">
        <div>
          <h2 id={fid("contact-h")} className="text-sm font-semibold uppercase tracking-wider text-muted">
            {t("contactSection")}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted/80">{t("contactSectionHint")}</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField id={fid("pnEn")} label={t("contactNameEn")} required requiredWord={req}>
            <input id={fid("pnEn")} required className={inputCls} placeholder={t("contactNameEnPlaceholder")}
              value={form.contactNameEn ?? ""} onChange={(e) => set("contactNameEn", e.target.value)} />
          </FormField>
          <FormField id={fid("pnFa")} label={t("contactNameFa")} requiredWord={req}>
            <input id={fid("pnFa")} className={inputCls} placeholder={t("contactNameFaPlaceholder")} dir="rtl" lang="fa"
              value={form.contactNameFa ?? ""} onChange={(e) => set("contactNameFa", e.target.value)} />
          </FormField>
          <FormField id={fid("email")} label={t("contactEmail")} required requiredWord={req}>
            <input id={fid("email")} required type="email" className={inputCls} placeholder={t("contactEmailPlaceholder")} dir="ltr"
              value={form.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} />
          </FormField>
          <FormField id={fid("phone")} label={t("contactPhone")} requiredWord={req}>
            <input id={fid("phone")} type="tel" className={inputCls} dir="ltr"
              value={form.contactPhone ?? ""} onChange={(e) => set("contactPhone", e.target.value)} />
          </FormField>
          <FormField id={fid("ctitle")} label={t("contactTitle")} requiredWord={req}>
            <input id={fid("ctitle")} className={inputCls} placeholder={t("contactTitlePlaceholder")}
              value={form.contactTitle ?? ""} onChange={(e) => set("contactTitle", e.target.value)} />
          </FormField>
        </div>
      </section>

      {/* Section 3 — Expertise */}
      <section aria-labelledby={fid("exp-h")} className="space-y-6 rounded-xl border border-line bg-surface p-6">
        <div>
          <h2 id={fid("exp-h")} className="text-sm font-semibold uppercase tracking-wider text-muted">
            {t("expertiseSection")}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted/80">{t("expertiseSectionHint")}</p>
        </div>
        <CheckGroup legend={t("servicesOffered")} options={SERVICES_OPTIONS} labelFor={optLabel(ts)}
          selected={form.servicesOffered ?? []} onChange={(v) => set("servicesOffered", v)}
          countHint={(n) => t("toggleHint", { count: n })} />
        <CheckGroup legend={t("industrialExpertise")} options={INDUSTRIAL_EXPERTISE_OPTIONS} labelFor={optLabel(te)}
          selected={form.industrialExpertise ?? []} onChange={(v) => set("industrialExpertise", v)}
          countHint={(n) => t("toggleHint", { count: n })} />
        <CheckGroup legend={t("regionsServed")} options={REGIONS_OPTIONS} labelFor={optLabel(trg)}
          selected={form.regionsServed ?? []} onChange={(v) => set("regionsServed", v)}
          countHint={(n) => t("toggleHint", { count: n })} />
        {/* Certifications are standard designations and registered partner marks
            (ISO 9001, IEC 62443, TÜV, Siemens Solution Partner). They are shown
            in their registered form in every locale — translating them would
            misstate what the applicant actually holds. */}
        <CheckGroup legend={t("certifications")} options={CERTIFICATIONS_OPTIONS} labelFor={(v) => v}
          hint={t("certificationsHint")}
          selected={form.certifications ?? []} onChange={(v) => set("certifications", v)}
          countHint={(n) => t("toggleHint", { count: n })} />
      </section>

      {/* Section 4 — Description */}
      <section aria-labelledby={fid("desc-h")} className="space-y-5 rounded-xl border border-line bg-surface p-6">
        <h2 id={fid("desc-h")} className="text-sm font-semibold uppercase tracking-wider text-muted">
          {t("descriptionSection")}
        </h2>
        <FormField id={fid("descEn")} label={t("descriptionEn")} requiredWord={req}>
          <textarea id={fid("descEn")} className={`${inputCls} min-h-[140px] resize-y`}
            placeholder={t("descriptionEnPlaceholder")}
            value={form.companyDescEn ?? ""} onChange={(e) => set("companyDescEn", e.target.value)} />
        </FormField>
        <FormField id={fid("descFa")} label={t("descriptionFa")} requiredWord={req}>
          <textarea id={fid("descFa")} className={`${inputCls} min-h-[140px] resize-y`}
            placeholder={t("descriptionFaPlaceholder")} dir="rtl" lang="fa"
            value={form.companyDescFa ?? ""} onChange={(e) => set("companyDescFa", e.target.value)} />
        </FormField>
      </section>

      {/* Section 5 — Legal */}
      <section aria-labelledby={fid("legal-h")} className="space-y-4 rounded-xl border border-signal/20 bg-signal/5 p-6">
        <h2 id={fid("legal-h")} className="text-sm font-semibold uppercase tracking-wider text-muted">
          {t("legalSection")}
        </h2>
        {([
          ["privacyAccepted", t("privacyAccepted")],
          ["termsAccepted",   t("termsAccepted")],
          ["gdprAccepted",    t("gdprAccepted")],
        ] as const).map(([key, label]) => (
          <label key={key} htmlFor={fid(key)} className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
            <input
              id={fid(key)}
              type="checkbox"
              required
              checked={Boolean(form[key as keyof VendorApplyPayload])}
              onChange={(e) => set(key as keyof VendorApplyPayload, e.target.checked as never)}
              className="ds-focus mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-signal"
            />
            <span className="text-sm leading-relaxed text-ink">{label}</span>
          </label>
        ))}
      </section>

      {error && (
        /* role="alert" so the failure is announced; it is also the focus-order
           neighbour of the submit button rather than a silent colour change. */
        <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3">
          <p className="text-sm font-semibold text-red-400">{t("errorHeading")}</p>
          <p className="mt-1 text-sm leading-relaxed text-red-400/90">{error}</p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="ds-focus inline-flex items-center gap-1.5 rounded-lg bg-signal px-8 py-3 text-sm font-semibold text-bg transition-colors hover:bg-signal/90 disabled:opacity-50"
        >
          {saving ? t("submitting") : t("submit")}
          {!saving && <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span>}
        </button>
      </div>
    </form>
  );
}
