"use client";

import { useState } from "react";

// ── Constants for selects ─────────────────────────────────────────────────────

const INTERESTS = [
  { value: "INDUSTRIAL_BRAIN", en: "Industrial Brain",       fa: "مغز صنعتی" },
  { value: "PREDICTIVE_MAINT", en: "Predictive Maintenance", fa: "نگهداری پیش‌بینانه" },
  { value: "EDMS",             en: "EDMS",                   fa: "EDMS" },
  { value: "CMMS",             en: "CMMS",                   fa: "CMMS" },
  { value: "EXPERT_NETWORK",   en: "Expert Network",         fa: "شبکه متخصصان" },
  { value: "ENTERPRISE_SAAS",  en: "Enterprise SaaS",        fa: "SaaS سازمانی" },
];

const COMPANY_SIZES = [
  { value: "1-10",     en: "1–10",       fa: "۱–۱۰" },
  { value: "11-50",    en: "11–50",      fa: "۱۱–۵۰" },
  { value: "51-200",   en: "51–200",     fa: "۵۱–۲۰۰" },
  { value: "201-1000", en: "201–1000",   fa: "۲۰۱–۱۰۰۰" },
  { value: "1000+",    en: "1000+",      fa: "بیش از ۱۰۰۰" },
];

// Shared dark input class — avoids CSS var opacity failures (Phase 78A lesson)
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

// ── Label helper ──────────────────────────────────────────────────────────────

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-[10px] font-mono uppercase tracking-wider text-[#8A9BB0] mb-1.5">
      {label}{required && <span className="text-[#1EC8A4] ms-0.5">*</span>}
    </label>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

interface Props { isFa: boolean; locale: string; }

export function DemoRequestForm({ isFa, locale }: Props) {
  const [busy,    setBusy]    = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const T = {
    fullName:      isFa ? "نام کامل"             : "Full Name",
    email:         isFa ? "ایمیل"                : "Email",
    phone:         isFa ? "تلفن (اختیاری)"       : "Phone (optional)",
    company:       isFa ? "شرکت"                 : "Company",
    role:          isFa ? "سمت / عنوان شغلی"    : "Role / Title",
    country:       isFa ? "کشور"                 : "Country",
    industry:      isFa ? "صنعت"                 : "Industry",
    companySize:   isFa ? "اندازه شرکت (اختیاری)": "Company Size (optional)",
    interest:      isFa ? "حوزه اصلی مورد علاقه": "Main Interest",
    useCase:       isFa ? "توضیح مشکل / کاربرد" : "Use Case / Problem Description",
    preferred:     isFa ? "زمان دمو (اختیاری)"  : "Preferred Demo Time (optional)",
    message:       isFa ? "پیام اضافی (اختیاری)": "Additional Message (optional)",
    selectPlease:  isFa ? "انتخاب کنید..."       : "Select…",
    submit:        isFa ? "ارسال درخواست دمو"    : "Request Demo",
    submitting:    isFa ? "در حال ارسال..."       : "Submitting…",
    successTitle:  isFa ? "درخواست دریافت شد"    : "Request Received",
    successMsg:    isFa
      ? "از شما متشکریم. درخواست دمو شما دریافت شد. تیم ما آن را بررسی کرده و با شما تماس خواهد گرفت."
      : "Thank you. Your demo request has been received. Our team will review it and contact you.",
    privacy:       isFa
      ? "از اطلاعات شما فقط برای پاسخ به درخواست دمو استفاده می‌شود."
      : "We use your information only to respond to your demo request.",
    industry_ph:   isFa ? "مثال: اتوماسیون صنعتی، نفت و گاز، برق" : "e.g. Industrial Automation, Oil & Gas, Power",
    useCase_ph:    isFa ? "مشکل فعلی یا نیاز اتوماسیون خود را شرح دهید..." : "Describe your current challenge or automation need…",
    preferred_ph:  isFa ? "مثال: هفته آینده، پنج‌شنبه صبح" : "e.g. Next week, Thursday morning",
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const fd  = new FormData(e.currentTarget);
    const obj = Object.fromEntries(fd.entries());

    try {
      const res  = await fetch("/api/sales/leads", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...obj, locale }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;

      if (!res.ok || !data.ok) {
        setError(typeof data.error === "string" ? data.error : (isFa ? "خطا در ارسال. دوباره تلاش کنید." : "Submission failed. Please try again."));
      } else {
        setSuccess(true);
      }
    } catch {
      setError(isFa ? "خطا در ارسال. دوباره تلاش کنید." : "Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-[rgba(30,200,164,0.25)] bg-[rgba(30,200,164,0.05)] p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-[rgba(30,200,164,0.15)] border border-[rgba(30,200,164,0.3)] flex items-center justify-center mx-auto">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-[#1EC8A4]">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
          </svg>
        </div>
        <h3 className="text-lg font-bold text-[#F0F4F8]">{T.successTitle}</h3>
        <p className="text-sm text-[#8A9BB0] max-w-sm mx-auto leading-relaxed">{T.successMsg}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Honeypot — visually hidden, must stay empty */}
      <input type="text" name="_gotcha" defaultValue="" tabIndex={-1} aria-hidden="true"
        className="sr-only" autoComplete="off" />

      {/* Row: fullName + email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel label={T.fullName} required />
          <input type="text" name="fullName" required maxLength={100}
            placeholder={isFa ? "نام و نام خانوادگی" : "Jane Smith"}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </div>
        <div>
          <FieldLabel label={T.email} required />
          <input type="email" name="email" required maxLength={200}
            placeholder={isFa ? "email@company.com" : "jane@company.com"}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </div>
      </div>

      {/* Row: phone + company */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel label={T.phone} />
          <input type="tel" name="phone" maxLength={30}
            placeholder={isFa ? "+98 21 xxxxxxxx" : "+1 555 000 0000"}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </div>
        <div>
          <FieldLabel label={T.company} required />
          <input type="text" name="company" required maxLength={150}
            placeholder={isFa ? "نام شرکت" : "Acme Industrial"}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </div>
      </div>

      {/* Row: roleTitle + country */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel label={T.role} required />
          <input type="text" name="roleTitle" required maxLength={100}
            placeholder={isFa ? "مثال: مدیر اتوماسیون" : "e.g. Automation Manager"}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </div>
        <div>
          <FieldLabel label={T.country} required />
          <input type="text" name="country" required maxLength={80}
            placeholder={isFa ? "مثال: ایران، آلمان" : "e.g. Germany, USA"}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </div>
      </div>

      {/* Row: industry + companySize */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel label={T.industry} required />
          <input type="text" name="industry" required maxLength={80}
            placeholder={T.industry_ph}
            style={{ colorScheme: "dark" }} className={INPUT_CLS} />
        </div>
        <div>
          <FieldLabel label={T.companySize} />
          <select name="companySize" defaultValue=""
            style={{ colorScheme: "dark" }} className={SELECT_CLS}>
            <option value="">{T.selectPlease}</option>
            {COMPANY_SIZES.map(s => (
              <option key={s.value} value={s.value}>{isFa ? s.fa : s.en}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Interest */}
      <div>
        <FieldLabel label={T.interest} required />
        <select name="interest" required defaultValue=""
          style={{ colorScheme: "dark" }} className={SELECT_CLS}>
          <option value="" disabled>{T.selectPlease}</option>
          {INTERESTS.map(i => (
            <option key={i.value} value={i.value}>{isFa ? i.fa : i.en}</option>
          ))}
        </select>
      </div>

      {/* Use case */}
      <div>
        <FieldLabel label={T.useCase} required />
        <textarea name="useCase" required maxLength={2000} rows={4}
          placeholder={T.useCase_ph}
          style={{ colorScheme: "dark" }} className={TEXTAREA_CLS} />
      </div>

      {/* Preferred demo time */}
      <div>
        <FieldLabel label={T.preferred} />
        <input type="text" name="preferredDemo" maxLength={100}
          placeholder={T.preferred_ph}
          style={{ colorScheme: "dark" }} className={INPUT_CLS} />
      </div>

      {/* Additional message */}
      <div>
        <FieldLabel label={T.message} />
        <textarea name="message" maxLength={1000} rows={3}
          placeholder={isFa ? "هر اطلاعات اضافی..." : "Anything else you'd like us to know…"}
          style={{ colorScheme: "dark" }} className={TEXTAREA_CLS} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)] px-4 py-3 text-sm text-[#F87171]">
          {error}
        </div>
      )}

      {/* Privacy note */}
      <p className="text-[10px] text-[#4A5A6E] font-mono">{T.privacy}</p>

      {/* Submit */}
      <button
        type="submit"
        disabled={busy}
        className="w-full h-11 rounded-xl text-sm font-semibold text-[#0C1420] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: busy ? "#1EC8A4" : "linear-gradient(135deg, #1EC8A4 0%, #60B4F0 100%)" }}>
        {busy ? T.submitting : T.submit}
      </button>
    </form>
  );
}
