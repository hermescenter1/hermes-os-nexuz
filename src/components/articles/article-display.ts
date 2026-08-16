// PHASE 104-F — the Persian display overlay for the Journal, extracted.
//
// PRE-EXISTING behaviour, preserved unchanged: the article data model has no
// Persian title/subtitle columns, so the 72.5 clients carried this hardcoded
// slug→Persian overlay for the seeded articles — DUPLICATED in
// ArticlesFeedClient and ArticleDetailClient. 104-F consolidates it into one
// module so the landing, the feed client and the detail client render the
// same Persian title for the same slug, and so a future titleFa column can
// retire it in exactly one place.
//
// This is data, not UI chrome, and it is a CLEANUP CANDIDATE: the durable fix
// is a localised title field on the article model, which is a data change and
// therefore out of scope for a visual phase. Not extended, not shortened.
export const FA_ARTICLE_MAP: Record<string, { title: string; subtitle?: string; excerpt?: string }> = {
  "siemens-s7-1500-programming-best-practices": {
    title:    "بهترین شیوه‌های برنامه‌نویسی PLC زیمنس S7-1500",
    subtitle: "راهنمای جامع ساختاردهی و بهینه‌سازی پروژه‌های TIA Portal V18",
  },
  "scada-modernization-tehran-refinery-case-study": {
    title:    "مدرن‌سازی SCADA در پالایشگاه تهران: مطالعه موردی",
    subtitle: "مهاجرت ۱۸ ماهه از DCS قدیمی به SCADA مدرن بدون وقفه تولید",
  },
  "predictive-maintenance-vibration-analysis-field-results": {
    title:    "نگهداری پیش‌بینانه با آنالیز ارتعاشات: نتایج ۱۸ ماهه میدانی",
    subtitle: "نتایج کمّی پایش آنلاین ارتعاشات روی ۶۴ ماشین دوار در فولاد مبارکه",
  },
  "iec-61850-substation-protection-implementation": {
    title:    "پیاده‌سازی IEC 61850 در حفاظت پست‌های فشار قوی",
    subtitle: "راهنمای عملی GOOSE Messaging و Sampled Values در طرح‌های حفاظتی مدرن",
  },
  "vfd-motor-overheating-high-temperature-troubleshooting": {
    title:    "عیب‌یابی اضافه‌حرارت موتور VFD در محیط‌های با دمای بالا",
    subtitle: "تشخیص سیستماتیک تریپ حرارتی موتورهای ۲۵۰kW کمپرسور یک کارخانه سیمان",
  },
  "opc-ua-server-implementation-process-integration": {
    title:    "پیاده‌سازی سرور OPC-UA برای یکپارچه‌سازی داده فرآیندی",
    subtitle: "معماری امن و مقیاس‌پذیر OPC-UA برای یکپارچه‌سازی داده در سطح کارخانه",
  },
  "ai-anomaly-detection-gas-turbine": {
    title:    "تشخیص ناهنجاری با هوش مصنوعی در سیستم‌های توربین گاز",
    subtitle: "چگونه مدل‌های یادگیری ماشین تشخیص خرابی در جریان‌های سنسور توربین را متحول می‌کنند",
  },
  "digital-twin-pump-station-roi-analysis": {
    title:    "دوقلوی دیجیتال ایستگاه پمپاژ: تحلیل ROI پس از ۲۴ ماه",
    subtitle: "بازگشت سرمایه کمّی از دوقلوی دیجیتال با شبیه‌سازی هیدرولیکی آنی",
  },
  "ot-cybersecurity-scada-protection": {
    title:    "امنیت سایبری OT: حفاظت SCADA در برابر تهدیدات مدرن",
    subtitle: "راهنمای عملی پیاده‌سازی IEC 62443 در محیط‌های فناوری عملیاتی",
  },
  "future-industrial-ai-cognitive-automation": {
    title:    "آینده هوش مصنوعی صنعتی: از سیستم‌های قانون‌محور تا اتوماسیون شناختی",
    subtitle: "چشم‌انداز مهندسی از مسیر هوش ماشین در سیستم‌های صنعتی",
  },
  "bearing-failure-analysis-2mw-induction-motor": {
    title:    "آنالیز خرابی: شکست فاجعه‌بار بلبرینگ در موتور القایی ۲.۲ مگاواتی",
    subtitle: "تحلیل ریشه‌ای متالورژیکی و عملیاتی خرابی بلبرینگ موتور کیلن سیمان",
  },
  "sil-verification-process-plants-guide": {
    title:    "تأیید سطح یکپارچگی ایمنی (SIL): راهنمای گام‌به‌گام برای واحدهای فرآیندی",
    subtitle: "مرور عملی تأیید SIL طبق IEC 61511 برای سیستم ESD فشار بالا",
  },
};

export interface ArticleDisplay {
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  /** The English title when a Persian overlay replaced it, else null. */
  titleEn: string | null;
}

export function getArticleDisplay(
  article: { title: string; slug: string; subtitle?: string | null; excerpt?: string | null },
  isFa: boolean,
): ArticleDisplay {
  if (!isFa) return { title: article.title, subtitle: article.subtitle ?? null, excerpt: article.excerpt ?? null, titleEn: null };
  const fa = FA_ARTICLE_MAP[article.slug];
  return {
    title:    fa?.title    ?? article.title,
    subtitle: fa?.subtitle ?? (article.subtitle ?? null),
    excerpt:  fa?.excerpt  ?? (article.excerpt  ?? null),
    titleEn:  fa ? article.title : null,
  };
}
