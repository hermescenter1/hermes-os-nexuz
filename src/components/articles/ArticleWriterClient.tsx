"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

const CONTENT_TYPES = [
  { key: "TECHNICAL_ARTICLE",        en: "Technical Article",        fa: "مقاله فنی"              },
  { key: "INDUSTRIAL_CASE_STUDY",    en: "Industrial Case Study",    fa: "مطالعه موردی صنعتی"     },
  { key: "TROUBLESHOOTING_REPORT",   en: "Troubleshooting Report",   fa: "گزارش عیب‌یابی"         },
  { key: "PROJECT_REPORT",           en: "Project Report",           fa: "گزارش پروژه"            },
  { key: "MAINTENANCE_INSIGHT",      en: "Maintenance Insight",      fa: "بینش نگهداشت"           },
  { key: "PLC_SCADA_TUTORIAL",       en: "PLC/SCADA Tutorial",       fa: "آموزش PLC/SCADA"        },
  { key: "FAILURE_ANALYSIS",         en: "Failure Analysis",         fa: "آنالیز خرابی"           },
  { key: "ASSET_RELIABILITY_NOTE",   en: "Asset Reliability Note",   fa: "یادداشت قابلیت اطمینان" },
  { key: "ENGINEERING_OPINION",      en: "Engineering Opinion",      fa: "دیدگاه مهندسی"         },
  { key: "RESEARCH_SUMMARY",         en: "Research Summary",         fa: "خلاصه پژوهش"           },
  { key: "FIELD_COMMISSIONING_NOTE", en: "Field Commissioning Note", fa: "یادداشت راه‌اندازی"     },
  { key: "SAFETY_COMPLIANCE_NOTE",   en: "Safety & Compliance",      fa: "ایمنی و انطباق"         },
] as const;

const CATEGORIES_EN = [
  "PLC Programming","SCADA & HMI","Industrial Automation","Electrical Engineering",
  "Maintenance & CMMS","Asset Management","Predictive Maintenance","Drives & Motors",
  "Instrumentation","Industrial Networks","Safety Systems","Digital Twin",
  "Industrial AI","Troubleshooting","Case Studies","Project Reports",
  "Energy & Utilities","Factory Operations","Cybersecurity for OT",
];
const CATEGORIES_FA = [
  "برنامه‌نویسی PLC","اسکادا و HMI","اتوماسیون صنعتی","مهندسی برق",
  "نگهداری و تعمیرات","مدیریت دارایی‌های صنعتی","نگهداری پیش‌بینانه","درایوها و موتورها",
  "ابزار دقیق","شبکه‌های صنعتی","سیستم‌های ایمنی","دوقلوی دیجیتال",
  "هوش مصنوعی صنعتی","عیب‌یابی","مطالعات موردی","گزارش پروژه",
  "انرژی و تأسیسات","عملیات کارخانه","امنیت سایبری صنعتی",
];

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
  articleId?: string;
  articleSlug?: string;
  articleStatus?: string;
}

export function ArticleWriterClient() {
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");

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
    const Tag  = rows ? "textarea" : "input";
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold text-faint uppercase tracking-widest font-mono">
          {label}{opts?.required && <span className="text-danger ms-1">*</span>}
        </label>
        <Tag
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

  async function handleSubmit(action: "draft" | "submit") {
    if (!form.title.trim()) {
      setMessage({
        type: "error",
        text: isFa ? "عنوان مقاله الزامی است." : "Article title is required.",
      });
      return;
    }
    if (!form.content.trim()) {
      setMessage({
        type: "error",
        text: isFa ? "محتوای مقاله الزامی است." : "Article content is required.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/articles/submit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...form, action }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg =
          typeof data?.error === "string"
            ? data.error
            : isFa
              ? "ارسال مقاله ناموفق بود. لطفاً دوباره تلاش کنید."
              : "Article submission failed. Please try again.";
        setMessage({ type: "error", text: errMsg });
        return;
      }

      const successText =
        action === "draft"
          ? isFa ? "پیش‌نویس ذخیره شد." : "Draft saved successfully."
          : isFa ? "مقاله برای بررسی ارسال شد." : "Article submitted for review.";

      setMessage({
        type:   "success",
        text:   successText,
        result: {
          articleId:     data.article?.id,
          articleSlug:   data.article?.slug,
          articleStatus: data.article?.status,
        },
      });
    } catch {
      setMessage({
        type: "error",
        text: isFa
          ? "خطای شبکه. لطفاً اتصال اینترنت را بررسی کنید."
          : "Network error. Please check your connection and try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { key: "write" as const, en: "Write",   fa: "نوشتن",  icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z"/>
      </svg>
    )},
    { key: "seo"   as const, en: "SEO",     fa: "SEO",    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
      </svg>
    )},
    { key: "meta"  as const, en: "Meta",    fa: "متادیتا", icon: (
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
              {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
            </p>
            <h1 className="text-sm font-bold text-ink">
              {isFa ? "نوشتن مقاله جدید" : "New Article"}
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={() => handleSubmit("draft")} disabled={saving}
              className="text-xs px-4 py-2 rounded-xl border border-line/60 text-muted hover:text-ink hover:border-signal/30 transition-all disabled:opacity-50 font-medium">
              {saving ? "…" : (isFa ? "ذخیره پیش‌نویس" : "Save Draft")}
            </button>
            <button onClick={() => handleSubmit("submit")} disabled={saving}
              className="inline-flex items-center gap-1.5 text-xs px-5 py-2 rounded-xl bg-signal text-bg font-bold hover:bg-signal/90 transition-colors disabled:opacity-50">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z"/>
              </svg>
              {saving ? "…" : (isFa ? "ارسال برای بررسی" : "Submit for Review")}
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
            <div>
              <p>{message.text}</p>
              {message.result?.articleId && (
                <p className="mt-1 text-[11px] opacity-70 font-mono">
                  {isFa ? "شناسه مقاله:" : "Article ID:"} {message.result.articleId}
                  {message.result.articleStatus && (
                    <span className="ms-2">· {message.result.articleStatus}</span>
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main editor area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-surface2/40 rounded-xl border border-line/30">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs px-4 py-2.5 rounded-lg transition-all font-medium ${
                    tab === t.key
                      ? "bg-signal/10 text-signal border border-signal/20 shadow-[inset_0_1px_0_rgba(30,200,164,0.1)]"
                      : "text-muted hover:text-ink hover:bg-surface3/40"
                  }`}>
                  <span className={tab === t.key ? "text-signal" : "text-faint"}>{t.icon}</span>
                  {isFa ? t.fa : t.en}
                </button>
              ))}
            </div>

            {tab === "write" && (
              <div className="space-y-5">
                {field(isFa ? "عنوان مقاله" : "Article Title", "title", {
                  placeholder: isFa ? "عنوان حرفه‌ای مقاله را وارد کنید…" : "Enter a professional article title…",
                  required: true,
                })}
                {field(isFa ? "زیرعنوان" : "Subtitle", "subtitle", {
                  placeholder: isFa ? "توضیح کوتاه برای تیتر…" : "Short description below the title…",
                })}
                {field(isFa ? "خلاصه" : "Excerpt", "excerpt", {
                  placeholder: isFa ? "خلاصه‌ای که در فید نمایش داده می‌شود…" : "Summary shown in article listings…",
                  rows: 3,
                })}
                {field(isFa ? "محتوای مقاله" : "Article Content", "content", {
                  placeholder: isFa
                    ? "محتوای مقاله خود را بنویسید. از # برای عنوان، ## برای زیرعنوان، ``` برای کد استفاده کنید…"
                    : "Write your article content. Use # for headings, ## for subheadings, ``` for code blocks…",
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
                    {isFa
                      ? "اطلاعات SEO برای رتبه‌بندی بهتر در موتورهای جستجو استفاده می‌شوند. مقالات منتشرشده عمومی توسط خزنده‌ها ایندکس می‌شوند."
                      : "SEO fields improve search engine ranking. Public, published articles are indexable by crawlers."}
                  </p>
                </div>
                {field(isFa ? "عنوان SEO" : "SEO Title", "seoTitle", {
                  placeholder: isFa ? "عنوان برای موتور جستجو (۵۰-۶۰ کاراکتر)" : "Title for search engines (50–60 chars)",
                })}
                {field(isFa ? "توضیحات SEO" : "SEO Description", "seoDesc", {
                  placeholder: isFa ? "توضیحات برای موتور جستجو (۱۵۰-۱۶۰ کاراکتر)" : "Description for search engines (150–160 chars)",
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
                    {isFa
                      ? "متادیتای دانش برای اتصال آینده به حافظه هرمس آماده می‌شود. این داده‌ها هنوز فعال نیستند."
                      : "Knowledge metadata prepares future connection to Hermes Brain memory. These fields are not yet active."}
                  </p>
                </div>
                {field(isFa ? "حوزه صنعتی" : "Industrial Domain", "domain", {
                  placeholder: isFa ? "مثال: اتوماسیون صنعتی، نگهداری دارایی…" : "e.g. Industrial Automation, Asset Management…",
                })}
                {field(isFa ? "نوع دارایی مرتبط" : "Linked Asset Type", "assetType", {
                  placeholder: isFa ? "مثال: PLC، موتور، پمپ، سنسور…" : "e.g. PLC, Motor, Pump, Sensor…",
                })}
                {field(isFa ? "تکنولوژی مرتبط" : "Linked Technology", "technology", {
                  placeholder: isFa ? "مثال: TIA Portal، OPC-UA، PROFINET…" : "e.g. TIA Portal, OPC-UA, PROFINET…",
                })}
                {field(isFa ? "پلتفرم PLC" : "PLC Platform", "plcPlatform", {
                  placeholder: isFa ? "مثال: Siemens S7، ABB، Schneider…" : "e.g. Siemens S7, ABB, Schneider…",
                })}
                <div className="flex items-center gap-3 p-4 rounded-xl border border-danger/15 bg-danger/5">
                  <input type="checkbox" id="safetyCritical" checked={form.safetyCritical}
                    onChange={e => update("safetyCritical", e.target.checked)}
                    className="w-4 h-4 rounded accent-danger shrink-0" />
                  <label htmlFor="safetyCritical" className="text-sm text-muted cursor-pointer">
                    {isFa ? "محتوای ایمنی بحرانی" : "Safety Critical Content"}
                    <span className="ms-2 text-[10px] text-danger/80 font-mono">
                      {isFa ? "(ایمنی بحرانی)" : "(safety critical)"}
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
                  {isFa ? "تنظیمات مقاله" : "Article Settings"}
                </p>
              </div>
              <div className="p-4 space-y-4">
                {/* Content type */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-faint uppercase tracking-widest font-mono">
                    {isFa ? "نوع محتوا" : "Content Type"}
                  </label>
                  <select value={form.contentType} onChange={e => update("contentType", e.target.value)}
                    className={SELECT_CLS}>
                    {CONTENT_TYPES.map(ct => (
                      <option key={ct.key} value={ct.key}>{isFa ? ct.fa : ct.en}</option>
                    ))}
                  </select>
                </div>

                {/* Language */}
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
                    {isFa ? "دسته‌بندی" : "Category"}
                  </label>
                  <select value={form.category} onChange={e => update("category", e.target.value)}
                    className={SELECT_CLS}>
                    <option value="">{isFa ? "— انتخاب کنید —" : "— Select —"}</option>
                    {(isFa ? CATEGORIES_FA : CATEGORIES_EN).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Tags */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-faint uppercase tracking-widest font-mono">
                    {isFa ? "برچسب‌ها" : "Tags"}
                  </label>
                  <input
                    value={form.tags} onChange={e => update("tags", e.target.value)}
                    placeholder={isFa ? "مثال: Siemens, SCADA, PLC" : "e.g. Siemens, SCADA, PLC"}
                    className={SELECT_CLS}
                  />
                  <p className="text-[9px] text-faint font-mono">{isFa ? "با کاما جدا کنید" : "Separate with commas"}</p>
                </div>
              </div>
            </div>

            {/* Writing guide */}
            <div className="rounded-xl border border-line/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-line/30">
                <p className="text-[10px] font-bold text-faint uppercase tracking-widest font-mono">
                  {isFa ? "راهنمای نگارش" : "Writing Guide"}
                </p>
              </div>
              <div className="p-4">
                <ul className="space-y-2">
                  {(isFa ? [
                    { code: "#",    tip: "عنوان اصلی" },
                    { code: "##",   tip: "زیرعنوان" },
                    { code: "###",  tip: "عنوان فرعی" },
                    { code: "```",  tip: "بلوک کد" },
                    { code: "- ",   tip: "فهرست نقطه‌ای" },
                  ] : [
                    { code: "#",    tip: "Main heading" },
                    { code: "##",   tip: "Subheading" },
                    { code: "###",  tip: "Section heading" },
                    { code: "```",  tip: "Code block" },
                    { code: "- ",   tip: "Bullet list" },
                  ]).map(item => (
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
              <button onClick={() => handleSubmit("submit")} disabled={saving}
                className="w-full py-3 rounded-xl bg-signal text-bg font-bold text-sm hover:bg-signal/90 transition-colors disabled:opacity-50">
                {saving ? "…" : (isFa ? "ارسال برای بررسی" : "Submit for Review")}
              </button>
              <button onClick={() => handleSubmit("draft")} disabled={saving}
                className="w-full py-2.5 rounded-xl border border-line/60 text-muted text-sm hover:text-ink hover:border-signal/30 transition-all disabled:opacity-50">
                {saving ? "…" : (isFa ? "ذخیره پیش‌نویس" : "Save Draft")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
