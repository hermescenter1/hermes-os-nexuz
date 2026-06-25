"use client";

import { useState }                from "react";
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

const EMPLOYEE_OPTIONS = ["1–10", "11–50", "51–200", "201–500", "500+"];

function CheckGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label:    string;
  options:  readonly string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(opt: string) {
    onChange(
      selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt]
    );
  }
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                checked
                  ? "border-signal/50 bg-signal/10 text-signal"
                  : "border-line bg-surface/50 text-muted hover:text-ink hover:border-signal/30"
              }`}
            >
              {checked && "✓ "}{opt}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label:    string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
        {label}{required && <span className="ml-1 text-signal">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded-lg border border-line bg-bg px-4 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-signal/50 focus:outline-none";

export function VendorApplicationForm() {
  const router = useRouter();

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
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);

  function set<K extends keyof VendorApplyPayload>(k: K, v: VendorApplyPayload[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function handleFocus() {
    track.vendorApplicationStarted();
  }

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
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Submission failed. Please check your input.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-signal/30 bg-signal/5 p-10 text-center space-y-4">
        <div className="text-4xl">✓</div>
        <h2 className="text-xl font-bold text-ink">Application Submitted!</h2>
        <p className="text-sm text-muted max-w-md mx-auto">
          Thank you for applying to join the Hermes OS Vendor Ecosystem. We will review your application and contact you at your provided email within 5 business days.
        </p>
        <button
          onClick={() => router.push("/vendors")}
          className="mt-4 inline-flex items-center rounded-lg bg-signal px-6 py-2.5 text-sm font-semibold text-bg hover:bg-signal/90 transition-colors"
        >
          Browse Vendor Directory →
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} onFocus={handleFocus} className="mx-auto max-w-3xl space-y-10">

      {/* Section 1 — Company */}
      <section className="rounded-xl border border-line bg-surface p-6 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Company Information</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField label="Company Name (English)" required>
            <input required className={inputCls} placeholder="Acme Industrial Solutions"
              value={form.companyNameEn ?? ""}
              onChange={(e) => set("companyNameEn", e.target.value)} />
          </FormField>
          <FormField label="Company Name (Persian)">
            <input className={inputCls} placeholder="نام شرکت" dir="rtl"
              value={form.companyNameFa ?? ""}
              onChange={(e) => set("companyNameFa", e.target.value)} />
          </FormField>
          <FormField label="Website URL">
            <input type="url" className={inputCls} placeholder="https://example.com" dir="ltr"
              value={form.websiteUrl ?? ""}
              onChange={(e) => set("websiteUrl", e.target.value)} />
          </FormField>
          <FormField label="Vendor Type" required>
            <select required className={inputCls}
              value={form.vendorType ?? "TECHNOLOGY_PROVIDER"}
              onChange={(e) => set("vendorType", e.target.value as VendorType)}>
              {VENDOR_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Country">
            <input className={inputCls} placeholder="Iran"
              value={form.headquartersCountry ?? "Iran"}
              onChange={(e) => set("headquartersCountry", e.target.value)} />
          </FormField>
          <FormField label="City">
            <input className={inputCls} placeholder="Tehran"
              value={form.headquartersCity ?? ""}
              onChange={(e) => set("headquartersCity", e.target.value)} />
          </FormField>
          <FormField label="Founded Year">
            <input type="number" className={inputCls} placeholder="2010" min="1900" max="2025" dir="ltr"
              value={form.foundedYear ?? ""}
              onChange={(e) => set("foundedYear", Number(e.target.value) || undefined)} />
          </FormField>
          <FormField label="Employee Count">
            <select className={inputCls}
              value={form.employeeCount ?? ""}
              onChange={(e) => set("employeeCount", e.target.value)}>
              <option value="">Select range</option>
              {EMPLOYEE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </FormField>
        </div>
      </section>

      {/* Section 2 — Contact */}
      <section className="rounded-xl border border-line bg-surface p-6 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Contact Person</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField label="Full Name (English)" required>
            <input required className={inputCls} placeholder="John Smith"
              value={form.contactNameEn ?? ""}
              onChange={(e) => set("contactNameEn", e.target.value)} />
          </FormField>
          <FormField label="Full Name (Persian)">
            <input className={inputCls} placeholder="نام و نام خانوادگی" dir="rtl"
              value={form.contactNameFa ?? ""}
              onChange={(e) => set("contactNameFa", e.target.value)} />
          </FormField>
          <FormField label="Email Address" required>
            <input required type="email" className={inputCls} placeholder="contact@company.com" dir="ltr"
              value={form.contactEmail ?? ""}
              onChange={(e) => set("contactEmail", e.target.value)} />
          </FormField>
          <FormField label="Phone">
            <input type="tel" className={inputCls} placeholder="+98 21 0000 0000" dir="ltr"
              value={form.contactPhone ?? ""}
              onChange={(e) => set("contactPhone", e.target.value)} />
          </FormField>
          <FormField label="Title / Position">
            <input className={inputCls} placeholder="Business Development Manager"
              value={form.contactTitle ?? ""}
              onChange={(e) => set("contactTitle", e.target.value)} />
          </FormField>
        </div>
      </section>

      {/* Section 3 — Expertise */}
      <section className="rounded-xl border border-line bg-surface p-6 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Industrial Expertise & Services</h2>
        <CheckGroup
          label="Services Offered"
          options={SERVICES_OPTIONS}
          selected={form.servicesOffered ?? []}
          onChange={(v) => set("servicesOffered", v)}
        />
        <CheckGroup
          label="Industrial Expertise"
          options={INDUSTRIAL_EXPERTISE_OPTIONS}
          selected={form.industrialExpertise ?? []}
          onChange={(v) => set("industrialExpertise", v)}
        />
        <CheckGroup
          label="Regions Served"
          options={REGIONS_OPTIONS}
          selected={form.regionsServed ?? []}
          onChange={(v) => set("regionsServed", v)}
        />
        <CheckGroup
          label="Certifications"
          options={CERTIFICATIONS_OPTIONS}
          selected={form.certifications ?? []}
          onChange={(v) => set("certifications", v)}
        />
      </section>

      {/* Section 4 — Description */}
      <section className="rounded-xl border border-line bg-surface p-6 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Company Description</h2>
        <FormField label="Description (English)">
          <textarea
            className={`${inputCls} min-h-[120px] resize-y`}
            placeholder="Describe your company, capabilities, and unique value proposition…"
            value={form.companyDescEn ?? ""}
            onChange={(e) => set("companyDescEn", e.target.value)}
          />
        </FormField>
        <FormField label="Description (Persian)">
          <textarea
            className={`${inputCls} min-h-[120px] resize-y`}
            placeholder="توضیح شرکت، قابلیت‌ها و ارزش پیشنهادی شما…"
            dir="rtl"
            value={form.companyDescFa ?? ""}
            onChange={(e) => set("companyDescFa", e.target.value)}
          />
        </FormField>
      </section>

      {/* Section 5 — Legal */}
      <section className="rounded-xl border border-signal/20 bg-signal/5 p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Legal & Compliance</h2>
        {[
          { key: "privacyAccepted" as const, label: "I have read and accept the Privacy Policy" },
          { key: "termsAccepted"   as const, label: "I accept the Terms of Service" },
          { key: "gdprAccepted"    as const, label: "I consent to GDPR-compliant data processing for this application" },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              required
              checked={Boolean(form[key])}
              onChange={(e) => set(key, e.target.checked as never)}
              className="mt-0.5 h-4 w-4 rounded border-line accent-signal shrink-0"
            />
            <span className="text-sm text-ink">{label}</span>
          </label>
        ))}
      </section>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-signal px-8 py-3 text-sm font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50"
        >
          {saving ? "Submitting…" : "Submit Application →"}
        </button>
      </div>
    </form>
  );
}
