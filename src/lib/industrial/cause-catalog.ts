import type { BrainDomainId } from "@/lib/services/types";

/**
 * Candidate Cause Catalog (Case-Memory-Bias fix).
 *
 * Query analysis generates candidate causes from this catalog BEFORE any
 * case is consulted; stored cases corroborate or contribute candidates but
 * never dictate the primary cause directly. Each cause carries:
 *   - anchors: at least one MUST appear in the query for the cause to have
 *     query evidence at all (evidence validation, requirement 3)
 *   - support: additional keywords that strengthen query evidence
 * Keywords are normalized stems matched by containment (e.g. "replac"
 * matches replacing/replaced/replacement) in EN and FA.
 */

export interface Bi {
  en: string;
  fa: string;
}

export interface CatalogCause {
  id: string;
  domains: BrainDomainId[];
  anchors: string[];
  support: string[];
  text: Bi;
  verify: Bi[];
}

export const CAUSE_CATALOG: CatalogCause[] = [
  /* ---------------- plc / otNetwork: communication & identity ---------------- */
  {
    id: "switch-config-mismatch",
    domains: ["otNetwork", "plc", "scada"],
    anchors: ["switch", "سوییچ", "سوئیچ"],
    support: ["replac", "تعویض", "config", "vlan", "port", "unmanaged", "new", "جدید", "پیکربندی"],
    text: {
      en: "Switch configuration mismatch — the replacement switch lacks the VLAN/port/QoS configuration of the original",
      fa: "عدم تطابق پیکربندی سوییچ — سوییچ جایگزین پیکربندی VLAN/پورت/QoS سوییچ قبلی را ندارد",
    },
    verify: [
      { en: "Compare the replacement switch configuration against the documented original", fa: "پیکربندی سوییچ جایگزین را با مستندات سوییچ قبلی مقایسه کنید" },
      { en: "Check port diagnostics and VLAN membership on the affected links", fa: "تشخیص پورت و عضویت VLAN لینک‌های درگیر را بررسی کنید" },
    ],
  },
  {
    id: "device-name-ip-issue",
    domains: ["plc", "otNetwork"],
    anchors: ["cpu", "device name", "نام دستگاه"],
    support: ["replac", "swap", "تعویض", "offline", "new", "assign", "bf", "آفلاین"],
    text: {
      en: "PROFINET device name / IP not assigned after controller hardware replacement",
      fa: "تخصیص‌نشدن نام دستگاه / IP پروفینت پس از تعویض سخت‌افزار کنترلر",
    },
    verify: [
      { en: "Browse accessible devices and compare assigned names against the project", fa: "دستگاه‌های قابل‌دسترس را مرور و نام‌های تخصیص‌یافته را با پروژه مقایسه کنید" },
      { en: "Read the CPU diagnostics buffer for name/IP resolution faults", fa: "بافر تشخیصی CPU را برای خطاهای نام/IP بخوانید" },
    ],
  },
  {
    id: "duplicate-ip",
    domains: ["otNetwork", "plc", "scada"],
    anchors: ["ip"],
    support: ["duplicate", "conflict", "تکراری", "تعارض", "address", "آدرس"],
    text: {
      en: "Duplicate IP address conflict on the cell network",
      fa: "تعارض آدرس IP تکراری در شبکهٔ سلول",
    },
    verify: [
      { en: "ARP-scan the segment for duplicate address responses", fa: "سگمنت را برای پاسخ‌های آدرس تکراری ARP-اسکن کنید" },
      { en: "Check DHCP scope against statically assigned devices", fa: "محدودهٔ DHCP را با دستگاه‌های آدرس ثابت تطبیق دهید" },
    ],
  },
  {
    id: "cable-connector-damage",
    domains: ["otNetwork", "plc", "hmi", "digitalIo"],
    anchors: ["cable", "connector", "کابل", "کانکتور", "intermittent", "متناوب"],
    support: ["damage", "communication", "آسیب", "ارتباط", "loose", "شل", "bent", "fault"],
    text: {
      en: "Damaged or intermittent cable / connector on the affected link",
      fa: "کابل یا کانکتور آسیب‌دیده یا متناوب در لینک درگیر",
    },
    verify: [
      { en: "Inspect and reseat connectors; flex-test the suspect run", fa: "کانکتورها را بازرسی و دوباره جا بزنید؛ مسیر مشکوک را با خم‌کردن تست کنید" },
      { en: "Swap with a known-good cable to isolate", fa: "با کابل سالم تعویض کنید تا عیب جدا شود" },
    ],
  },
  {
    id: "network-load-congestion",
    domains: ["otNetwork", "scada"],
    anchors: ["communication", "network", "ارتباط", "شبکه", "comm"],
    support: ["timeout", "slow", "load", "وقفه", "کند", "بار", "drop", "قطع", "loss", "intermittent", "متناوب"],
    text: {
      en: "Network load or congestion degrading cyclic communication",
      fa: "بار یا ازدحام شبکه و تضعیف ارتباط چرخه‌ای",
    },
    verify: [
      { en: "Capture traffic with a port mirror at the suspect segment", fa: "ترافیک سگمنت مشکوک را با Port Mirror ضبط کنید" },
      { en: "Check switch port counters for drops and errors", fa: "شمارنده‌های پورت سوییچ را برای افت و خطا بررسی کنید" },
    ],
  },
  {
    id: "firewall-blocking",
    domains: ["otNetwork", "cybersecurity"],
    anchors: ["firewall", "فایروال"],
    support: ["block", "port", "rule", "مسدود", "قانون", "102"],
    text: {
      en: "Firewall or conduit policy silently dropping the required protocol port",
      fa: "فایروال یا سیاست مجرا در حال انداختن بی‌صدای پورت پروتکل موردنیاز",
    },
    verify: [
      { en: "Test TCP reachability of the protocol port from the client segment", fa: "دسترس‌پذیری TCP پورت پروتکل را از سگمنت کلاینت آزمایش کنید" },
      { en: "Review firewall logs for drops between the zones", fa: "لاگ فایروال را برای انداختن‌ها میان نواحی مرور کنید" },
    ],
  },
  {
    id: "emc-noise-comm",
    domains: ["otNetwork", "digitalIo", "analogIo"],
    anchors: ["noise", "vfd", "نویز", "درایو", "intermittent", "متناوب"],
    support: ["shield", "unshielded", "tray", "شیلد", "سینی", "interference"],
    text: {
      en: "EMC interference from power electronics coupling into signal or network cabling",
      fa: "تداخل EMC الکترونیک قدرت روی کابل سیگنال یا شبکه",
    },
    verify: [
      { en: "Inspect cable routing for shared trays with VFD output cables", fa: "مسیر کابل را از نظر سینی مشترک با کابل خروجی درایو بازرسی کنید" },
      { en: "Correlate fault onset with drive run state", fa: "شروع خطا را با وضعیت کار درایو همبسته کنید" },
    ],
  },
  /* ---------------- plc: program behavior ---------------- */
  {
    id: "scan-overrun-loop",
    domains: ["plc"],
    anchors: ["scan", "cycle", "watchdog", "loop", "سیکل", "اسکن", "واچداگ", "حلقه"],
    support: ["overrun", "timeout", "scl", "trip", "تجاوز", "تریپ", "long"],
    text: {
      en: "Unbounded SCL loop or bulk processing consuming the scan-cycle budget",
      fa: "حلقهٔ SCL بی‌کران یا پردازش حجیم در حال مصرف بودجهٔ چرخهٔ اسکن",
    },
    verify: [
      { en: "Measure cycle time under worst-case data conditions", fa: "زمان چرخه را در بدترین شرایط داده اندازه بگیرید" },
      { en: "Review loops for explicit iteration bounds", fa: "حلقه‌ها را از نظر کران تکرار صریح مرور کنید" },
    ],
  },
  {
    id: "forced-io-leftover",
    domains: ["plc", "digitalIo"],
    anchors: ["force", "فورس"],
    support: ["maintenance", "left", "stuck", "تعمیرات", "مانده"],
    text: {
      en: "Forced I/O left active after maintenance overriding real signals",
      fa: "Force باقی‌مانده از تعمیرات در حال لغو سیگنال‌های واقعی",
    },
    verify: [
      { en: "List active forces in the engineering tool", fa: "فهرست Forceهای فعال را در ابزار مهندسی ببینید" },
      { en: "Clear forces per the change-control procedure", fa: "Forceها را طبق روال کنترل تغییر پاک کنید" },
    ],
  },
  /* ---------------- drives ---------------- */
  {
    id: "ramp-vs-inertia",
    domains: ["drives", "motors"],
    anchors: ["ramp", "accel", "رمپ", "شتاب"],
    support: ["overcurrent", "trip", "inertia", "اضافه جریان", "اضافهجریان", "تریپ", "اینرسی", "2310", "ocf", "start", "استارت"],
    text: {
      en: "Acceleration ramp shorter than the load inertia allows",
      fa: "رمپ شتاب کوتاه‌تر از حد مجاز اینرسی بار",
    },
    verify: [
      { en: "Review acceleration parameters against load inertia", fa: "پارامترهای شتاب را با اینرسی بار بازبینی کنید" },
      { en: "Trend motor current through the acceleration window", fa: "جریان موتور را در پنجرهٔ شتاب‌گیری روند بگیرید" },
    ],
  },
  {
    id: "drive-motor-data-mismatch",
    domains: ["drives", "motors"],
    anchors: ["nameplate", "motor data", "پلاک", "داده موتور"],
    support: ["parameter", "mismatch", "پارامتر", "ناجور", "wrong"],
    text: {
      en: "Motor nameplate data mismatch in drive parameters",
      fa: "عدم تطابق دادهٔ پلاک موتور در پارامترهای درایو",
    },
    verify: [
      { en: "Compare drive motor parameters against the nameplate", fa: "پارامترهای موتورِ درایو را با پلاک مقایسه کنید" },
      { en: "Run motor identification where supported", fa: "در صورت پشتیبانی، شناسایی موتور را اجرا کنید" },
    ],
  },
  {
    id: "drive-cooling",
    domains: ["drives"],
    anchors: ["overheat", "oh", "heatsink", "داغ", "هیت"],
    support: ["fan", "filter", "temperature", "فن", "فیلتر", "دما", "summer", "تابستان"],
    text: {
      en: "Drive cooling degraded — clogged heatsink or blocked enclosure airflow",
      fa: "تضعیف خنک‌کاری درایو — گرفتگی هیت‌سینک یا انسداد جریان هوای تابلو",
    },
    verify: [
      { en: "Inspect heatsink fins and cabinet filters", fa: "پره‌های هیت‌سینک و فیلترهای تابلو را بازرسی کنید" },
      { en: "Correlate trips with ambient temperature", fa: "تریپ‌ها را با دمای محیط همبسته کنید" },
    ],
  },
  {
    id: "output-insulation",
    domains: ["drives", "electrical", "motors"],
    anchors: ["earth", "ground fault", "insulation", "زمین", "عایق"],
    support: ["megger", "cable", "short", "مگر", "کابل", "اتصال"],
    text: {
      en: "Output cable or motor insulation breakdown to earth",
      fa: "شکست عایق کابل خروجی یا موتور به زمین",
    },
    verify: [
      { en: "Megger the cable and motor separately", fa: "کابل و موتور را جداگانه مگر کنید" },
      { en: "Inspect glands and terminations for damage or moisture", fa: "گلندها و سربندی‌ها را از نظر آسیب یا رطوبت بازرسی کنید" },
    ],
  },
  /* ---------------- motors ---------------- */
  {
    id: "phase-imbalance",
    domains: ["motors", "electrical"],
    anchors: ["imbalance", "phase", "عدم تعادل", "فاز"],
    support: ["current", "hot", "winding", "جریان", "داغ", "سیم پیچ", "سیمپیچ"],
    text: {
      en: "Phase current imbalance heating one winding — often an upstream connection issue",
      fa: "عدم تعادل جریان فاز و گرم‌شدن یک سیم‌پیچ — اغلب مشکل اتصال بالادست",
    },
    verify: [
      { en: "Measure all three phase currents under load", fa: "جریان هر سه فاز را زیر بار اندازه بگیرید" },
      { en: "Thermo-scan upstream connections and bus joints", fa: "اتصالات بالادست و مفاصل شینه را ترموگرافی کنید" },
    ],
  },
  {
    id: "bearing-wear",
    domains: ["motors", "maintenance"],
    anchors: ["bearing", "vibration", "یاتاقان", "ارتعاش", "بلبرینگ"],
    support: ["noise", "صدا", "grease", "گریس", "alignment"],
    text: {
      en: "Bearing wear from misalignment, contamination, or lubrication failure",
      fa: "فرسایش یاتاقان از ناهم‌محوری، آلودگی یا نقص روان‌کاری",
    },
    verify: [
      { en: "Take a vibration reading and compare against baseline", fa: "قرائت ارتعاش بگیرید و با خط مبنا مقایسه کنید" },
      { en: "Check alignment and lubrication records", fa: "هم‌محوری و سوابق روان‌کاری را بررسی کنید" },
    ],
  },
  {
    id: "winding-insulation",
    domains: ["motors", "electrical"],
    anchors: ["winding", "burn", "سیم پیچ", "سیمپیچ", "سوخت"],
    support: ["smell", "insulation", "بو", "عایق", "hot", "داغ", "overload"],
    text: {
      en: "Winding insulation degradation — thermal overload or ageing approaching failure",
      fa: "تحلیل عایق سیم‌پیچ — اضافه‌بار حرارتی یا فرسودگی در آستانهٔ خرابی",
    },
    verify: [
      { en: "Measure insulation resistance, temperature-corrected, and trend it", fa: "مقاومت عایق را با تصحیح دما اندازه بگیرید و روند کنید" },
      { en: "Inspect for discoloration and verify protection settings", fa: "تغییر رنگ را بازرسی و تنظیمات حفاظت را تأیید کنید" },
    ],
  },
  /* ---------------- electrical ---------------- */
  {
    id: "protection-coordination",
    domains: ["electrical"],
    anchors: ["trip", "breaker", "feeder", "تریپ", "کلید", "فیدر"],
    support: ["coordination", "selectivity", "هماهنگی", "گزینش", "upstream", "بالادست", "mcc", "close", "وصل"],
    text: {
      en: "Protection coordination issue — settings or device curves not selective for the fault path",
      fa: "مشکل هماهنگی حفاظت — تنظیمات یا منحنی تجهیز برای مسیر خطا گزینشی نیست",
    },
    verify: [
      { en: "Log the actual current at the trip event before changing settings", fa: "جریان واقعی لحظهٔ تریپ را پیش از تغییر تنظیم ثبت کنید" },
      { en: "Verify installed devices against the coordination study", fa: "تجهیزات نصب‌شده را با مطالعهٔ هماهنگی تطبیق دهید" },
    ],
  },
  {
    id: "loose-connection-hot-joint",
    domains: ["electrical"],
    anchors: ["joint", "connection", "مفصل", "اتصال"],
    support: ["hot", "torque", "داغ", "گشتاور", "loose", "شل", "bus", "شینه"],
    text: {
      en: "Loose or degraded power connection creating a hot joint",
      fa: "اتصال قدرت شل یا فرسوده و ایجاد مفصل داغ",
    },
    verify: [
      { en: "Thermo-scan joints at representative load", fa: "مفاصل را در بار نمونه ترموگرافی کنید" },
      { en: "Re-torque to schedule with witness marks", fa: "طبق جدول و با علامت شاهد باز-گشتاور کنید" },
    ],
  },
  {
    id: "supply-sag",
    domains: ["electrical", "drives", "plc"],
    anchors: ["sag", "undervoltage", "dip", "افت ولتاژ", "کم ولتاژ"],
    support: ["supply", "trip", "reset", "تغذیه", "brownout"],
    text: {
      en: "Supply voltage sag or dip causing transient faults across equipment",
      fa: "افت یا نشست ولتاژ تغذیه و خطاهای گذرا در تجهیزات",
    },
    verify: [
      { en: "Trend supply voltage at the affected panel during events", fa: "ولتاژ تغذیه را در تابلوی درگیر هنگام رویدادها روند بگیرید" },
      { en: "Correlate faults across devices sharing the supply", fa: "خطاها را میان تجهیزات هم‌تغذیه همبسته کنید" },
    ],
  },
  /* ---------------- scada / hmi ---------------- */
  {
    id: "tag-driver-drift",
    domains: ["scada", "hmi"],
    anchors: ["tag", "driver", "تگ", "درایور", "wincc"],
    support: ["mapping", "frozen", "stale", "نگاشت", "یخ", "کهنه", "value", "مقدار", "plc change"],
    text: {
      en: "Tag/driver mapping drift after a controller change — values frozen or wrong",
      fa: "رانش نگاشت تگ/درایور پس از تغییر کنترلر — مقادیر یخ‌زده یا غلط",
    },
    verify: [
      { en: "Cross-check sample tag addresses against the current PLC symbol table", fa: "نمونه آدرس تگ‌ها را با جدول نماد فعلی PLC تطبیق دهید" },
      { en: "Check data-quality flags at the driver", fa: "پرچم‌های کیفیت داده را در درایور بررسی کنید" },
    ],
  },
  {
    id: "polling-starvation",
    domains: ["scada", "otNetwork"],
    anchors: ["poll", "پایش"],
    support: ["rate", "starv", "timeout", "نرخ", "وقفه", "group", "گروه"],
    text: {
      en: "Polling configuration starving the channel — one fast group consuming the budget",
      fa: "پیکربندی پایش در حال گرسنه‌کردن کانال — یک گروه سریع بودجه را می‌بلعد",
    },
    verify: [
      { en: "Review polling group rates against process dynamics", fa: "نرخ گروه‌های پایش را با دینامیک فرآیند بازبینی کنید" },
      { en: "Measure request rate at the device", fa: "نرخ درخواست را در دستگاه اندازه بگیرید" },
    ],
  },
  /* ---------------- instrumentation ---------------- */
  {
    id: "loop-break-livezero",
    domains: ["analogIo", "sensors"],
    anchors: ["4-20", "loop", "حلقه", "میلیامپر", "میلیآمپر"],
    support: ["zero", "break", "صفر", "قطع", "stuck", "ثابت"],
    text: {
      en: "Loop wiring break — live zero below 3.6 mA indicates a fault, not a low reading",
      fa: "قطعی سیم حلقه — صفر زنده زیر ۳٫۶ میلی‌آمپر یعنی خطا، نه قرائت کم",
    },
    verify: [
      { en: "Inject a calibrated mA signal at the field end", fa: "سیگنال میلی‌آمپر کالیبره از سمت میدان تزریق کنید" },
      { en: "Read HART device status before replacing hardware", fa: "پیش از تعویض سخت‌افزار وضعیت HART را بخوانید" },
    ],
  },
  {
    id: "sensor-drift-installation",
    domains: ["sensors", "analogIo"],
    anchors: ["drift", "رانش"],
    support: ["calibration", "impulse", "کالیبراسیون", "ضربه", "temperature", "دما"],
    text: {
      en: "Measurement drift from calibration loss, impulse-line condition, or installation effects",
      fa: "رانش اندازه‌گیری از افت کالیبراسیون، وضعیت لولهٔ ضربه یا اثرات نصب",
    },
    verify: [
      { en: "Compare against an independent local reference", fa: "با مرجع مستقل محلی مقایسه کنید" },
      { en: "Inspect impulse lines before condemning the instrument", fa: "پیش از محکوم‌کردن ابزار، لوله‌های ضربه را بازرسی کنید" },
    ],
  },
  {
    id: "di-chatter-noise",
    domains: ["digitalIo"],
    anchors: ["chatter", "flicker", "نوسان", "سوسو"],
    support: ["debounce", "shield", "لرزش", "شیلد", "bounce"],
    text: {
      en: "Input chatter from induced noise or missing debounce",
      fa: "نوسان ورودی از نویز القایی یا نبود حذف لرزش",
    },
    verify: [
      { en: "Compare the input LED against the logic state", fa: "LED ورودی را با حالت منطق مقایسه کنید" },
      { en: "Inspect routing for shared trays with power cables", fa: "مسیر را از نظر سینی مشترک با کابل قدرت بازرسی کنید" },
    ],
  },
  /* ---------------- maintenance-correlated ---------------- */
  {
    id: "post-maintenance-regression",
    domains: ["maintenance", "plc", "otNetwork", "electrical"],
    anchors: ["maintenance", "after replac", "تعمیرات", "نگهداشت", "پس از تعویض"],
    support: ["after", "changed", "since", "پس از", "تغییر", "swap"],
    text: {
      en: "Post-maintenance regression — a change during the work window introduced the fault",
      fa: "پسرفت پس از تعمیرات — تغییری در پنجرهٔ کار عامل خطا شده است",
    },
    verify: [
      { en: "List every change made in the maintenance window and review one by one", fa: "هر تغییر پنجرهٔ تعمیرات را فهرست و یک‌به‌یک مرور کنید" },
      { en: "Compare current configuration against the pre-work backup", fa: "پیکربندی فعلی را با نسخهٔ پشتیبان پیش از کار مقایسه کنید" },
    ],
  },
];
