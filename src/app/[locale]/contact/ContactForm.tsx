"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type EnquiryType = "demo" | "sales" | "support" | "partner";

export function ContactForm() {
  const t = useTranslations("contact");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<EnquiryType>("sales");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const typeLabels: Record<EnquiryType, string> = {
      demo: t("formTypeDemo"),
      sales: t("formTypeSales"),
      support: t("formTypeSupport"),
      partner: t("formTypePartner"),
    };
    const subject = encodeURIComponent(
      `[Hermes OS] ${typeLabels[type]} — ${name}${company ? ` / ${company}` : ""}`
    );
    const body = encodeURIComponent(
      `Name: ${name}\nCompany: ${company}\nEmail: ${email}\nPhone: ${phone}\nType: ${type}\n\n${message}`
    );
    window.open(`mailto:info@hermesnovin.com?subject=${subject}&body=${body}`, "_blank");
    setSent(true);
  }

  const enquiryTypes: { value: EnquiryType; label: string }[] = [
    { value: "demo", label: t("formTypeDemo") },
    { value: "sales", label: t("formTypeSales") },
    { value: "support", label: t("formTypeSupport") },
    { value: "partner", label: t("formTypePartner") },
  ];

  const inputClass =
    "w-full rounded-xl border border-line bg-bg px-4 py-2.5 font-body text-sm text-ink placeholder:text-muted/40 focus:border-signal/50 focus:outline-none transition-colors";

  return (
    <div className="rounded-2xl border border-line bg-surface p-8">
      <h2 className="mb-6 font-display text-xl font-semibold text-ink">
        {t("formTitle")}
      </h2>

      {sent ? (
        <div className="rounded-xl border border-signalDim bg-signal/5 p-6 text-center">
          <p className="font-body text-sm text-signal">{t("formSuccess")}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block font-body text-xs text-muted">
                {t("formName")} *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block font-body text-xs text-muted">
                {t("formCompany")}
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block font-body text-xs text-muted">
                {t("formEmail")} *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block font-body text-xs text-muted">
                {t("formPhone")}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block font-body text-xs text-muted">
              {t("formType")}
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as EnquiryType)}
              className={inputClass}
            >
              {enquiryTypes.map((et) => (
                <option key={et.value} value={et.value}>
                  {et.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block font-body text-xs text-muted">
              {t("formMessage")} *
            </label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className={`${inputClass} resize-none`}
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl border border-signal bg-signal/10 py-3 font-mono text-sm text-signal transition-colors hover:bg-signal/15"
          >
            {t("formSubmit")}
          </button>

          <p className="text-center font-body text-xs text-muted/50">
            {t("formNote")}
          </p>
        </form>
      )}
    </div>
  );
}
