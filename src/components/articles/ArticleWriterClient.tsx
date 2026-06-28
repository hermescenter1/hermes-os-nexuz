"use client";

import { useState } from "react";
import { useRouter }    from "next/navigation";
import { usePathname }  from "next/navigation";

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

interface FormData {
  title:       string;
  subtitle:    string;
  excerpt:     string;
  content:     string;
  contentType: string;
  language:    string;
  category:    string;
  tags:        string;
  seoTitle:    string;
  seoDesc:     string;
  domain:      string;
  assetType:   string;
  technology:  string;
  plcPlatform: string;
  safetyCritical: boolean;
}

export function ArticleWriterClient() {
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");
  const locale   = isFa ? "fa" : "en";
  const router   = useRouter();

  const [form, setForm] = useState<FormData>({
    title: "", subtitle: "", excerpt: "", content: "",
    contentType: "TECHNICAL_ARTICLE", language: isFa ? "FA" : "EN",
    category: "", tags: "", seoTitle: "", seoDesc: "",
    domain: "", assetType: "", technology: "", plcPlatform: "",
    safetyCritical: false,
  });
  const [tab, setTab]         = useState<"write" | "seo" | "meta">("write");
  const [saving, setSaving]   = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function update(field: keyof FormData, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function field(label: string, key: keyof FormData, opts?: { placeholder?: string; rows?: number; required?: boolean }) {
    const val = form[key] as string;
    const rows = opts?.rows;
    const Tag  = rows ? "textarea" : "input";
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted uppercase tracking-wider">
          {label} {opts?.required && <span className="text-danger">*</span>}
        </label>
        <Tag
          value={val}
          onChange={e => update(key, e.target.value)}
          placeholder={opts?.placeholder}
          required={opts?.required}
          rows={rows}
          className="bg-surface border border-line text-sm text-ink rounded-lg px-4 py-2.5 focus:outline-none focus:border-signal/50 resize-none transition-colors"
        />
      </div>
    );
  }

  async function handleSubmit(action: "draft" | "submit") {
    if (!form.title.trim() || !form.content.trim()) {
      setMessage({ type: "error", text: isFa ? "عنوان و محتوا الزامی هستند." : "Title and content are required." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await new Promise(r => setTimeout(r, 600));
      setMessage({
        type: "success",
        text: action === "draft"
          ? (isFa ? "پیش‌نویس ذخیره شد." : "Draft saved successfully.")
          : (isFa ? "مقاله برای بررسی ارسال شد." : "Article submitted for review."),
      });
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { key: "write" as const, en: "Write",  fa: "نوشتن"      },
    { key: "seo"   as const, en: "SEO",    fa: "SEO"         },
    { key: "meta"  as const, en: "Meta",   fa: "متادیتا"     },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="border-b border-line/50 bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow-mono text-signal text-[10px]">
              {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
            </p>
            <h1 className="text-sm font-semibold text-ink">
              {isFa ? "نوشتن مقاله جدید" : "Write New Article"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => handleSubmit("draft")} disabled={saving}
              className="text-xs px-4 py-2 rounded-lg border border-line text-muted hover:text-ink hover:border-signal/40 transition-all disabled:opacity-50">
              {saving ? "…" : (isFa ? "ذخیره پیش‌نویس" : "Save Draft")}
            </button>
            <button onClick={() => handleSubmit("submit")} disabled={saving}
              className="text-xs px-4 py-2 rounded-lg bg-signal text-bg font-semibold hover:bg-signal/90 transition-colors disabled:opacity-50">
              {saving ? "…" : (isFa ? "ارسال برای بررسی" : "Submit for Review")}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {message && (
          <div className={`mb-6 p-4 rounded-xl border text-sm ${
            message.type === "success"
              ? "border-signal/30 bg-signal/5 text-signal"
              : "border-danger/30 bg-danger/5 text-danger"
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tabs */}
            <div className="flex gap-1 border-b border-line/40 pb-0">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`text-xs px-4 py-2 rounded-t-lg transition-all -mb-px ${
                    tab === t.key
                      ? "border border-b-bg border-line/60 text-signal bg-surface font-medium"
                      : "text-muted hover:text-ink"
                  }`}>
                  {isFa ? t.fa : t.en}
                </button>
              ))}
            </div>

            {tab === "write" && (
              <div className="space-y-5">
                {field(isFa ? "عنوان مقاله *" : "Article Title *", "title", {
                  placeholder: isFa ? "عنوان حرفه‌ای مقاله را وارد کنید…" : "Enter a professional article title…",
                  required: true,
                })}
                {field(isFa ? "زیرعنوان" : "Subtitle", "subtitle", {
                  placeholder: isFa ? "توضیح کوتاه برای تیتر…" : "Short description below the title…",
                })}
                {field(isFa ? "خلاصه (Excerpt)" : "Excerpt", "excerpt", {
                  placeholder: isFa ? "خلاصه‌ای که در فید نمایش داده می‌شود…" : "Summary shown in article listings…",
                  rows: 3,
                })}
                {field(isFa ? "محتوای مقاله *" : "Article Content *", "content", {
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
                <div className="p-4 rounded-xl border border-signal/20 bg-signal/5 text-xs text-signal/80">
                  {isFa
                    ? "اطلاعات SEO برای رتبه‌بندی بهتر در موتورهای جستجو استفاده می‌شوند. مقالات عمومی و منتشرشده توسط خزنده‌ها ایندکس می‌شوند."
                    : "SEO fields improve search engine ranking. Public, published articles are indexable by crawlers."}
                </div>
                {field(isFa ? "عنوان SEO" : "SEO Title", "seoTitle", {
                  placeholder: isFa ? "عنوان برای موتور جستجو (پیشنهاد: ۵۰-۶۰ کاراکتر)" : "Title for search engines (50-60 chars recommended)",
                })}
                {field(isFa ? "توضیحات SEO" : "SEO Description", "seoDesc", {
                  placeholder: isFa ? "توضیحات برای موتور جستجو (پیشنهاد: ۱۵۰-۱۶۰ کاراکتر)" : "Description for search engines (150-160 chars)",
                  rows: 3,
                })}
              </div>
            )}

            {tab === "meta" && (
              <div className="space-y-5">
                <div className="p-4 rounded-xl border border-ice/20 bg-ice/5 text-xs text-ice/80">
                  {isFa
                    ? "متادیتای دانش برای اتصال آینده به حافظه هرمس (Hermes Brain) آماده می‌شود. این داده‌ها هنوز فعال نیستند."
                    : "Knowledge metadata prepares future connection to Hermes Brain memory. These fields are not yet active."}
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
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="safetyCritical" checked={form.safetyCritical}
                    onChange={e => update("safetyCritical", e.target.checked)}
                    className="w-4 h-4 rounded accent-signal" />
                  <label htmlFor="safetyCritical" className="text-sm text-muted">
                    {isFa ? "محتوای ایمنی بحرانی" : "Safety Critical Content"}
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar settings */}
          <div className="space-y-5">
            {/* Content type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted uppercase tracking-wider">
                {isFa ? "نوع محتوا" : "Content Type"}
              </label>
              <select value={form.contentType} onChange={e => update("contentType", e.target.value)}
                className="bg-surface border border-line text-sm text-ink rounded-lg px-4 py-2.5 focus:outline-none focus:border-signal/50">
                {CONTENT_TYPES.map(ct => (
                  <option key={ct.key} value={ct.key}>{isFa ? ct.fa : ct.en}</option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted uppercase tracking-wider">
                {isFa ? "زبان مقاله" : "Article Language"}
              </label>
              <select value={form.language} onChange={e => update("language", e.target.value)}
                className="bg-surface border border-line text-sm text-ink rounded-lg px-4 py-2.5 focus:outline-none focus:border-signal/50">
                <option value="EN">English</option>
                <option value="FA">فارسی</option>
              </select>
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted uppercase tracking-wider">
                {isFa ? "دسته‌بندی" : "Category"}
              </label>
              <select value={form.category} onChange={e => update("category", e.target.value)}
                className="bg-surface border border-line text-sm text-ink rounded-lg px-4 py-2.5 focus:outline-none focus:border-signal/50">
                <option value="">{isFa ? "— انتخاب کنید —" : "— Select —"}</option>
                {(isFa ? CATEGORIES_FA : CATEGORIES_EN).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted uppercase tracking-wider">
                {isFa ? "برچسب‌ها (جداشده با کاما)" : "Tags (comma-separated)"}
              </label>
              <input
                value={form.tags} onChange={e => update("tags", e.target.value)}
                placeholder={isFa ? "مثال: Siemens, SCADA, PLC" : "e.g. Siemens, SCADA, PLC"}
                className="bg-surface border border-line text-sm text-ink rounded-lg px-4 py-2.5 focus:outline-none focus:border-signal/50"
              />
            </div>

            {/* Writing tips */}
            <div className="p-4 rounded-xl border border-line/40 bg-surface2/40">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
                {isFa ? "راهنمای نگارش" : "Writing Guide"}
              </p>
              <ul className="space-y-1.5">
                {(isFa ? [
                  "از # برای عنوان اصلی استفاده کنید",
                  "از ## برای زیرعنوان استفاده کنید",
                  "کد را در ``` قرار دهید",
                  "فهرست را با - شروع کنید",
                  "پاراگراف‌ها با خط خالی جدا می‌شوند",
                ] : [
                  "Use # for main heading",
                  "Use ## for subheadings",
                  "Wrap code in ``` blocks",
                  "Start lists with -",
                  "Separate paragraphs with blank lines",
                ]).map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-faint">
                    <span className="mt-1 w-1 h-1 rounded-full bg-signal/50 shrink-0" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
