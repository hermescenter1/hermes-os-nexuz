"use client";

import { useState, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";

// Content-type enum values; display labels come from journal.contentType.*
const CONTENT_TYPE_KEYS = [
  "TECHNICAL_ARTICLE", "INDUSTRIAL_CASE_STUDY", "TROUBLESHOOTING_REPORT",
  "PROJECT_REPORT", "MAINTENANCE_INSIGHT", "PLC_SCADA_TUTORIAL",
  "FAILURE_ANALYSIS", "ASSET_RELIABILITY_NOTE", "ENGINEERING_OPINION",
  "RESEARCH_SUMMARY", "FIELD_COMMISSIONING_NOTE", "SAFETY_COMPLIANCE_NOTE",
] as const;

/* Input/textarea/select base classes — uses .hs-writer-field from globals.css
   to guarantee dark surface + visible ink text before/during/after focus. */
const FIELD_CLS =
  "hs-writer-field rounded-xl px-4 py-3 text-sm w-full resize-none border border-line/60";
const SELECT_CLS =
  "hs-writer-field rounded-xl px-3 py-2.5 text-sm w-full border border-line/60";

interface FormData {
  title:          string;
  subtitle:       string;
  excerpt:        string;
  content:        string;
  contentType:    string;
  language:       string;
  category:       string;
  tags:           string;
  seoTitle:       string;
  seoDesc:        string;
  domain:         string;
  assetType:      string;
  technology:     string;
  plcPlatform:    string;
  safetyCritical: boolean;
}

interface SubmitResult {
  articleId?:     string;
  articleStatus?: string;
  forReview:      boolean; // true = submit action, false = draft
}

export function ArticleWriterClient() {
  // useLocale() reads from the next-intl request context — always a stable string,
  // never null. Do NOT use usePathname() from next/navigation for locale detection:
  // next-intl middleware rewrites paths before Next.js sees them, making usePathname()
  // from next/navigation unstable (can return null on async re-renders in App Router).
  const locale = useLocale();
  const isFa   = locale === "fa";
  const t      = useTranslations("journalWriter");
  const tc     = useTranslations("journal");

  // useRef guard prevents double-submit from impatient multi-clicks during the
  // async fetch. React's disabled={saving} is not instantaneous — the ref fires
  // synchronously, before any re-render can happen.
  const submittingRef = useRef(false);

  const [form, setForm] = useState<FormData>({
    title: "", subtitle: "", excerpt: "", content: "",
    contentType: "TECHNICAL_ARTICLE", language: isFa ? "FA" : "EN",
    category: "", tags: "", seoTitle: "", seoDesc: "",
    domain: "", assetType: "", technology: "", plcPlatform: "",
    safetyCritical: false,
  });
  const [tab, setTab]         = useState<"write" | "seo" | "meta">("write");
  const [saving, setSaving]   = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
    result?: SubmitResult;
  } | null>(null);

  const categories = t.raw("categories") as string[];
  const guide      = t.raw("guide") as { code: string; tip: string }[];

  function update(f: keyof FormData, value: string | boolean) {
    setForm(prev => ({ ...prev, [f]: value }));
  }

  function field(
    label: string,
    key: keyof FormData,
    opts?: { placeholder?: string; rows?: number; required?: boolean },
  ) {
    const val  = form[key] as string;
    const rows = opts?.rows;
    if (rows) {
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-faint uppercase tracking-widest font-mono">
            {label}{opts?.required && <span className="text-danger ms-1">*</span>}
          </label>
          <textarea
            value={val}
            onChange={e => update(key, e.target.value)}
            placeholder={opts?.placeholder}
            required={opts?.required}
            rows={rows}
            className={FIELD_CLS}
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold text-faint uppercase tracking-widest font-mono">
          {label}{opts?.required && <span className="text-danger ms-1">*</span>}
        </label>
        <input
          value={val}
          onChange={e => update(key, e.target.value)}
          placeholder={opts?.placeholder}
          required={opts?.required}
          className={FIELD_CLS}
        />
      </div>
    );
  }

  async function handleSubmit(action: "draft" | "submit") {
    // Synchronous guard — fires before any re-render, so even rapid multi-clicks
    // before React's disabled={saving} takes effect are blocked.
    if (submittingRef.current) return;

    if (!form.title.trim()) {
      setMessage({ type: "error", text: t("err.titleRequired") });
      return;
    }
    if (!form.content.trim()) {
      setMessage({ type: "error", text: t("err.contentRequired") });
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/articles/submit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...form, action }),
      });

      // Safe parse: never crash if body is empty or malformed
      let data: Record<string, unknown> = {};
      try {
        const raw = await res.json();
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          data = raw as Record<string, unknown>;
        }
      } catch { /* non-JSON or empty body — keep data = {} */ }

      if (!res.ok) {
        const errMsg =
          typeof data.error === "string"
            ? data.error
            : t("err.submitFailed");
        setMessage({ type: "error", text: errMsg });
        return;
      }

      // Safe article extraction — never assume shape.
      // Intentionally NOT extracting slug — DRAFT/SUBMITTED are PRIVATE and must
      // never be navigated to via the public /articles/[slug] route.
      const artRaw        = (data.article && typeof data.article === "object" && !Array.isArray(data.article))
        ? (data.article as Record<string, unknown>)
        : {};
      const articleId     = typeof artRaw.id     === "string" ? artRaw.id     : undefined;
      const articleStatus = typeof artRaw.status === "string" ? artRaw.status : undefined;

      // Stay on the write page for both draft and submit.
      // Do NOT call router.push, router.replace, or window.location.href.
      // Any automatic navigation in Next.js 15 App Router triggers a hybrid
      // browser-native + RSC navigation simultaneously, which inserts two document
      // roots and causes HierarchyRequestError in the browser console.
      setMessage({
        type:   "success",
        text:   action === "draft" ? t("err.draftSaved") : t("err.submittedForReview"),
        result: { articleId, articleStatus, forReview: action === "submit" },
      });
    } catch {
      setMessage({ type: "error", text: t("err.networkError") });
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }

  const tabs = [
    { key: "write" as const, icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z"/>
      </svg>
    )},
    { key: "seo"   as const, icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
      </svg>
    )},
    { key: "meta"  as const, icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd"/>
      </svg>
    )},
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Sticky header */}
      <div className="border-b border-line/30 bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow-mono text-signal text-[9px] mb-0.5 tracking-[0.2em]">
              {tc("brandUpper")}
            </p>
            <h1 className="text-sm font-bold text-ink">
              {t("newArticle")}
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => handleSubmit("draft")} disabled={saving}
              className="text-xs px-4 py-2 rounded-xl border border-line/60 text-muted hover:text-ink hover:border-signal/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium">
              {saving ? "…" : t("saveDraft")}
            </button>
            <button type="button" onClick={() => handleSubmit("submit")} disabled={saving}
              className="inline-flex items-center gap-1.5 text-xs px-5 py-2 rounded-xl bg-signal text-bg font-bold hover:bg-signal/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z"/>
              </svg>
              {saving ? "…" : t("submitForReview")}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Status message */}
        {message && (
          <div className={`mb-6 flex items-start gap-3 p-4 rounded-xl border text-sm ${
            message.type === "success"
              ? "border-signal/20 bg-signal/5 text-signal"
              : "border-danger/20 bg-danger/5 text-danger"
          }`}>
            {message.type === "success" ? (
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0 mt-0.5">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/>
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0 mt-0.5">
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
              </svg>
            )}
            <div className="min-w-0 flex-1">
              <p>{message.text}</p>
              {message.type === "success" && message.result?.articleStatus && (
                <p className="mt-1 text-[11px] opacity-70 font-mono">
                  {message.result.articleStatus}
                  {message.result.articleId && (
                    <span className="ms-2 opacity-60">· {message.result.articleId.slice(0, 8)}</span>
                  )}
                </p>
              )}
              {message.type === "success" && (
                <a
                  href={`/${locale}/articles/my-articles${message.result?.forReview ? "?submitted=1" : ""}`}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium opacity-80 hover:opacity-100 underline underline-offset-2"
                >
                  {t("viewMyArticles")}
                </a>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main editor area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-surface2/40 rounded-xl border border-line/30">
              {tabs.map(tb => (
                <button key={tb.key} onClick={() => setTab(tb.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs px-4 py-2.5 rounded-lg transition-all font-medium ${
                    tab === tb.key
                      ? "bg-signal/10 text-signal border border-signal/20 shadow-[inset_0_1px_0_rgba(30,200,164,0.1)]"
                      : "text-muted hover:text-ink hover:bg-surface3/40"
                  }`}>
                  <span className={tab === tb.key ? "text-signal" : "text-faint"}>{tb.icon}</span>
                  {t(`tab.${tb.key}`)}
                </button>
              ))}
            </div>

            {tab === "write" && (
              <div className="space-y-5">
                {field(t("titleLabel"), "title", {
                  placeholder: t("titlePlaceholder"),
                  required: true,
                })}
                {field(t("subtitleLabel"), "subtitle", {
                  placeholder: t("subtitlePlaceholder"),
                })}
                {field(t("excerptLabel"), "excerpt", {
                  placeholder: t("excerptPlaceholder"),
                  rows: 3,
                })}
                {field(t("contentLabel"), "content", {
                  placeholder: t("contentPlaceholder"),
                  rows: 24,
                  required: true,
                })}
              </div>
            )}

            {tab === "seo" && (
              <div className="space-y-5">
                <div className="flex items-start gap-3 p-4 rounded-xl border border-signal/15 bg-signal/5">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-signal shrink-0 mt-0.5">
                    <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd"/>
                  </svg>
                  <p className="text-xs text-signal/80 leading-relaxed">
                    {t("seoInfo")}
                  </p>
                </div>
                {field(t("seoTitleLabel"), "seoTitle", {
                  placeholder: t("seoTitlePlaceholder"),
                })}
                {field(t("seoDescLabel"), "seoDesc", {
                  placeholder: t("seoDescPlaceholder"),
                  rows: 3,
                })}
              </div>
            )}

            {tab === "meta" && (
              <div className="space-y-5">
                <div className="flex items-start gap-3 p-4 rounded-xl border border-ice/15 bg-ice/5">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-ice shrink-0 mt-0.5">
                    <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd"/>
                  </svg>
                  <p className="text-xs text-ice/80 leading-relaxed">
                    {t("metaInfo")}
                  </p>
                </div>
                {field(t("domainLabel"), "domain", {
                  placeholder: t("domainPlaceholder"),
                })}
                {field(t("assetTypeLabel"), "assetType", {
                  placeholder: t("assetTypePlaceholder"),
                })}
                {field(t("technologyLabel"), "technology", {
                  placeholder: t("technologyPlaceholder"),
                })}
                {field(t("plcPlatformLabel"), "plcPlatform", {
                  placeholder: t("plcPlatformPlaceholder"),
                })}
                <div className="flex items-center gap-3 p-4 rounded-xl border border-danger/15 bg-danger/5">
                  <input type="checkbox" id="safetyCritical" checked={form.safetyCritical}
                    onChange={e => update("safetyCritical", e.target.checked)}
                    className="w-4 h-4 rounded accent-danger shrink-0" />
                  <label htmlFor="safetyCritical" className="text-sm text-muted cursor-pointer">
                    {t("safetyCriticalLabel")}
                    <span className="ms-2 text-[10px] text-danger/80 font-mono">
                      {t("safetyCriticalHint")}
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Article settings */}
            <div className="rounded-xl border border-line/40 overflow-hidden" style={{ background: "var(--surface)" }}>
              <div className="px-4 py-3 border-b border-line/30"
                style={{ background: "linear-gradient(90deg, rgba(30,200,164,0.05) 0%, transparent 100%)" }}>
                <p className="text-[10px] font-bold text-faint uppercase tracking-widest font-mono">
                  {t("articleSettings")}
                </p>
              </div>
              <div className="p-4 space-y-4">
                {/* Content type */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-faint uppercase tracking-widest font-mono">
                    {t("contentTypeLabel")}
                  </label>
                  <select value={form.contentType} onChange={e => update("contentType", e.target.value)}
                    className={SELECT_CLS}>
                    {CONTENT_TYPE_KEYS.map(key => (
                      <option key={key} value={key}>{tc(`contentType.${key}`)}</option>
                    ))}
                  </select>
                </div>

                {/* Language — article language selector (ArtLanguage); left as-is by design */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-faint uppercase tracking-widest font-mono">
                    {isFa ? "زبان مقاله" : "Language"}
                  </label>
                  <select value={form.language} onChange={e => update("language", e.target.value)}
                    className={SELECT_CLS}>
                    <option value="EN">English</option>
                    <option value="FA">فارسی</option>
                  </select>
                </div>

                {/* Category */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-faint uppercase tracking-widest font-mono">
                    {t("categoryLabel")}
                  </label>
                  <select value={form.category} onChange={e => update("category", e.target.value)}
                    className={SELECT_CLS}>
                    <option value="">{t("categorySelect")}</option>
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Tags */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-faint uppercase tracking-widest font-mono">
                    {t("tagsLabel")}
                  </label>
                  <input
                    value={form.tags} onChange={e => update("tags", e.target.value)}
                    placeholder={t("tagsPlaceholder")}
                    className={SELECT_CLS}
                  />
                  <p className="text-[9px] text-faint font-mono">{t("tagsHint")}</p>
                </div>
              </div>
            </div>

            {/* Writing guide */}
            <div className="rounded-xl border border-line/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-line/30">
                <p className="text-[10px] font-bold text-faint uppercase tracking-widest font-mono">
                  {t("writingGuide")}
                </p>
              </div>
              <div className="p-4">
                <ul className="space-y-2">
                  {guide.map(item => (
                    <li key={item.code} className="flex items-center gap-2 text-xs text-faint">
                      <code className="text-[10px] px-1.5 py-0.5 rounded bg-surface3 border border-line/30 text-signal font-mono shrink-0">{item.code}</code>
                      <span>{item.tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Action buttons (mobile duplicate) */}
            <div className="flex flex-col gap-2.5 lg:hidden">
              <button type="button" onClick={() => handleSubmit("submit")} disabled={saving}
                className="w-full py-3 rounded-xl bg-signal text-bg font-bold text-sm hover:bg-signal/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? "…" : t("submitForReview")}
              </button>
              <button type="button" onClick={() => handleSubmit("draft")} disabled={saving}
                className="w-full py-2.5 rounded-xl border border-line/60 text-muted text-sm hover:text-ink hover:border-signal/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? "…" : t("saveDraft")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
