import type { BrainDomainId } from "@/lib/services/types";
import type { VendorId } from "./vendors";

/**
 * Engineering Reasoning Engine (Step 8A).
 *
 * A fully deterministic rule layer behind the Brain pipeline. NO LLM
 * involvement: rules are data, evaluation is pure functions, identical
 * input always yields identical output. The LLM (when configured)
 * receives this engine's output as additional grounding — it never
 * replaces it.
 *
 * Inputs (all produced by the existing pipeline):
 *   - domain detection (ranked BrainDomainId list)
 *   - vendor detection (VendorId list)
 *   - matched engineering cases (ids)
 *   - selected knowledge libraries (ids)
 *   - the normalized question text (for keyword conditions)
 *
 * Rule semantics — a rule fires when ALL declared conditions hold:
 *   - domains: at least one listed domain is present (omitted = any)
 *   - vendors: at least one listed vendor is present (omitted = any)
 *   - keywordGroups: AND of ORs — every group must have >=1 keyword hit
 * Output text is bilingual at the data level (same pattern as the case
 * database); the engine resolves to the caller's locale.
 */

export interface ReasoningResult {
  probableCauses: string[];
  evidence: string[];
  recommendedActions: string[];
  riskLevel: "low" | "medium" | "high";
}

export interface ReasoningInput {
  text: string; // raw question; normalized internally
  domains: BrainDomainId[];
  vendors: VendorId[];
  caseIds: string[];
  libraries: string[];
  /** pipeline's risk assessment; result risk never falls below it */
  baseRisk: "low" | "medium" | "high";
}

export interface Bi {
  en: string;
  fa: string;
}

export interface ReasoningRule {
  id: string;
  when: {
    domains?: BrainDomainId[];
    vendors?: VendorId[];
    /** AND of ORs: every inner group needs at least one hit */
    keywordGroups: string[][];
  };
  riskLevel: "low" | "medium" | "high";
  causes: Bi[];
  actions: Bi[];
  /** libraries that constitute supporting evidence for this rule */
  evidenceLibs: string[];
  evidenceLabel: Bi;
}

const RISK_ORDER = { low: 0, medium: 1, high: 2 } as const;

function normalize(q: string): string {
  return q
    .toLowerCase()
    .replace(/\u064A/g, "\u06CC")
    .replace(/\u0643/g, "\u06A9")
    .replace(/\u200C/g, "");
}

function maxRisk(
  a: ReasoningResult["riskLevel"],
  b: ReasoningResult["riskLevel"]
): ReasoningResult["riskLevel"] {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

/* ------------------------------- rule table ------------------------------- */

export const REASONING_RULES: ReasoningRule[] = [
  {
    id: "siemens-profinet-comm-loss",
    when: {
      domains: ["plc", "otNetwork"],
      vendors: ["siemens"],
      keywordGroups: [
        ["profinet", "پروفینت"],
        ["communication", "comm", "bf", "ارتباط"],
        ["loss", "lost", "lose", "drop", "unreachable", "fail", "قطع", "ناموفق"],
      ],
    },
    riskLevel: "medium",
    causes: [
      { en: "PROFINET device name mismatch after hardware replacement", fa: "عدم تطابق نام دستگاه PROFINET پس از تعویض سخت‌افزار" },
      { en: "Duplicate IP address on the cell network", fa: "آدرس IP تکراری در شبکهٔ سلول" },
      { en: "Switch buffering or unmanaged switch in the real-time path", fa: "بافرینگ سوییچ یا سوییچ مدیریت‌نشده در مسیر بلادرنگ" },
      { en: "IRT timing violation from topology change", fa: "نقض زمان‌بندی IRT بر اثر تغییر توپولوژی" },
    ],
    actions: [
      { en: "Verify topology against the configured plan in TIA Portal", fa: "توپولوژی را با طرح پیکربندی‌شده در TIA Portal تطبیق دهید" },
      { en: "Read the CPU diagnostics buffer for the first fault entry", fa: "بافر تشخیصی CPU را برای نخستین رخداد خطا بخوانید" },
      { en: "Validate device names and IP assignments via accessible devices", fa: "نام دستگاه‌ها و تخصیص IP را از مسیر دستگاه‌های قابل‌دسترس اعتبارسنجی کنید" },
      { en: "Verify network load and switch port diagnostics", fa: "بار شبکه و تشخیص پورت سوییچ را بررسی کنید" },
    ],
    evidenceLibs: ["s7comm", "protocols", "s71200", "s71500"],
    evidenceLabel: { en: "Siemens communication libraries matched", fa: "کتابخانه‌های ارتباطی زیمنس منطبق شدند" },
  },
  {
    id: "network-hardware-replacement",
    when: {
      domains: ["otNetwork", "plc", "scada"],
      keywordGroups: [
        ["switch", "سوییچ"],
        ["replac", "swap", "chang", "new", "تعویض", "جایگزین", "جدید"],
      ],
    },
    riskLevel: "medium",
    causes: [
      { en: "Switch configuration mismatch — VLAN, QoS, or IGMP settings not migrated to the replacement switch", fa: "عدم تطابق پیکربندی سوییچ — تنظیمات VLAN، QoS یا IGMP به سوییچ جایگزین منتقل نشده" },
      { en: "Port speed or duplex mismatch on the new switch", fa: "ناجوری سرعت یا دوطرفهٔ پورت در سوییچ جدید" },
      { en: "Real-time (PROFINET/IRT) priority settings missing on the replacement switch", fa: "نبود تنظیمات اولویت بلادرنگ (PROFINET/IRT) روی سوییچ جایگزین" },
      { en: "Topology change breaking configured port assignments", fa: "تغییر توپولوژی و شکستن تخصیص پورت‌های پیکربندی‌شده" },
    ],
    actions: [
      { en: "Compare the replacement switch configuration against the backup of the old unit", fa: "پیکربندی سوییچ جایگزین را با پشتیبان واحد قدیمی مقایسه کنید" },
      { en: "Verify port speed/duplex and VLAN membership per the network plan", fa: "سرعت/دوطرفهٔ پورت و عضویت VLAN را با طرح شبکه تطبیق دهید" },
      { en: "Check real-time priority and IGMP settings required by the cell", fa: "تنظیمات اولویت بلادرنگ و IGMP موردنیاز سلول را بررسی کنید" },
      { en: "Validate topology and port assignments after the hardware change", fa: "توپولوژی و تخصیص پورت‌ها را پس از تغییر سخت‌افزار اعتبارسنجی کنید" },
    ],
    evidenceLibs: ["protocols", "s7comm", "segmentation"],
    evidenceLabel: { en: "Network hardware replacement libraries matched", fa: "کتابخانه‌های تعویض سخت‌افزار شبکه منطبق شدند" },
  },
  {
    id: "cpu-replacement-identity",
    when: {
      domains: ["plc"],
      keywordGroups: [
        ["cpu"],
        ["swap", "replac", "chang", "تعویض", "جایگزین"],
      ],
    },
    riskLevel: "medium",
    causes: [
      { en: "PROFINET device name or IP not restored after the CPU replacement", fa: "بازنگشتن نام دستگاه PROFINET یا IP پس از تعویض CPU" },
      { en: "Hardware configuration mismatch with the replacement CPU", fa: "عدم تطابق پیکربندی سخت‌افزار با CPU جایگزین" },
      { en: "Retentive data or licensing not migrated to the new CPU", fa: "منتقل‌نشدن دادهٔ ماندگار یا مجوز به CPU جدید" },
    ],
    actions: [
      { en: "Assign the configured device name and IP from the topology view", fa: "نام دستگاه و IP پیکربندی‌شده را از نمای توپولوژی تخصیص دهید" },
      { en: "Compare online hardware configuration against the project", fa: "پیکربندی سخت‌افزار آنلاین را با پروژه مقایسه کنید" },
      { en: "Verify retentive memory and licensing state on the new CPU", fa: "حافظهٔ ماندگار و وضعیت مجوز را روی CPU جدید بررسی کنید" },
    ],
    evidenceLibs: ["s71200", "s71500", "plcBasics"],
    evidenceLabel: { en: "Controller replacement libraries matched", fa: "کتابخانه‌های تعویض کنترلر منطبق شدند" },
  },
  {
    id: "comm-loss-general",
    when: {
      domains: ["plc", "scada", "hmi", "otNetwork"],
      keywordGroups: [
        ["communication", "comm", "ارتباط"],
        ["loss", "lost", "lose", "drop", "fail", "fault", "intermittent", "frozen", "قطع", "متناوب", "خطا"],
      ],
    },
    riskLevel: "medium",
    causes: [
      { en: "Intermittent cable or connector fault on the communication path", fa: "عیب متناوب کابل یا کانکتور در مسیر ارتباطی" },
      { en: "Switch port errors or misconfiguration on the segment", fa: "خطا یا بدپیکربندی پورت سوییچ در سگمنت" },
      { en: "Duplicate IP or device identity collision", fa: "IP تکراری یا تصادم هویت دستگاه" },
      { en: "EMI coupling onto communication cabling near power runs", fa: "تزویج نویز الکترومغناطیسی روی کابل ارتباطی مجاور مسیر قدرت" },
    ],
    actions: [
      { en: "Read switch port error counters for the affected segment", fa: "شمارنده‌های خطای پورت سوییچ سگمنت آسیب‌دیده را بخوانید" },
      { en: "Inspect connectors and cable runs at both ends", fa: "کانکتورها و مسیر کابل را در دو سر بازرسی کنید" },
      { en: "Scan the segment for duplicate IP or name collisions", fa: "سگمنت را برای IP یا نام تکراری پویش کنید" },
      { en: "Correlate drop times with machine or power events", fa: "زمان قطع‌ها را با رویدادهای ماشین یا قدرت همبسته کنید" },
    ],
    evidenceLibs: ["protocols", "opcua", "modbusTcp"],
    evidenceLabel: { en: "Communication diagnostics libraries matched", fa: "کتابخانه‌های تشخیص ارتباط منطبق شدند" },
  },
  {
    id: "vfd-overcurrent-acceleration",
    when: {
      domains: ["drives", "electrical", "motors"],
      keywordGroups: [
        ["overcurrent", "2310", "ocf", "oc fault", "اضافه جریان", "اضافهجریان"],
        ["accel", "start", "ramp", "شتاب", "استارت", "رمپ"],
      ],
    },
    riskLevel: "high",
    causes: [
      { en: "Acceleration ramp shorter than the load inertia allows", fa: "رمپ شتاب کوتاه‌تر از حد مجاز اینرسی بار" },
      { en: "Mechanical drag or partial jam on the driven load", fa: "درگ مکانیکی یا گیر نسبی در بار متحرک" },
      { en: "Motor nameplate data mismatch in drive parameters", fa: "عدم تطابق دادهٔ پلاک موتور در پارامترهای درایو" },
      { en: "Output cable or motor insulation breakdown", fa: "شکست عایق کابل خروجی یا موتور" },
    ],
    actions: [
      { en: "Read the complete drive fault history before any reset", fa: "پیش از هر ریست تاریخچهٔ کامل خطای درایو را بخوانید" },
      { en: "Extend the acceleration ramp and retest under load", fa: "رمپ شتاب را افزایش دهید و زیر بار دوباره آزمایش کنید" },
      { en: "Check mechanics with the load decoupled where possible", fa: "در صورت امکان مکانیک را با بار جداشده بررسی کنید" },
      { en: "Megger cable and motor separately if trips persist", fa: "در تداوم تریپ، کابل و موتور را جداگانه مگر کنید" },
    ],
    evidenceLibs: ["vfd", "motors", "protection"],
    evidenceLabel: { en: "Drive and motor protection libraries matched", fa: "کتابخانه‌های درایو و حفاظت موتور منطبق شدند" },
  },
  {
    id: "plc-scan-overrun",
    when: {
      domains: ["plc"],
      keywordGroups: [
        ["scan", "cycle", "watchdog", "سیکل", "اسکن", "واچداگ"],
        ["overrun", "exceed", "trip", "timeout", "long", "تجاوز", "طولانی", "تریپ"],
      ],
    },
    riskLevel: "medium",
    causes: [
      { en: "Unbounded loop executing within a single scan", fa: "حلقهٔ بی‌کران در حال اجرا در یک اسکن" },
      { en: "Heavy communication load charged to the cycle", fa: "بار ارتباطی سنگین تحمیل‌شده به چرخه" },
      { en: "Bulk data operations in the cyclic program path", fa: "عملیات دادهٔ حجیم در مسیر برنامهٔ چرخه‌ای" },
    ],
    actions: [
      { en: "Measure cycle time under worst-case data conditions", fa: "زمان چرخه را در بدترین شرایط داده اندازه بگیرید" },
      { en: "Bound all loops and verify exit conditions", fa: "همهٔ حلقه‌ها را کران‌دار و شرایط خروج را تأیید کنید" },
      { en: "Move bulk processing to a lower-priority cyclic OB", fa: "پردازش حجیم را به OB چرخه‌ای با اولویت پایین‌تر منتقل کنید" },
    ],
    evidenceLibs: ["plcBasics", "structuredText", "s71500"],
    evidenceLabel: { en: "PLC scan-behavior libraries matched", fa: "کتابخانه‌های رفتار اسکن PLC منطبق شدند" },
  },
  {
    id: "digital-input-chatter",
    when: {
      domains: ["digitalIo"],
      keywordGroups: [["chatter", "flicker", "bounce", "نوسان", "لرزش", "سوسو"]],
    },
    riskLevel: "low",
    causes: [
      { en: "Unshielded signal run routed near power or VFD cables", fa: "مسیر سیگنال بدون شیلد در مجاورت کابل قدرت یا درایو" },
      { en: "Missing debounce on a mechanical contact", fa: "نبود حذف لرزش روی کنتاکت مکانیکی" },
      { en: "Marginal sensor supply or PNP/NPN mismatch", fa: "تغذیهٔ مرزی سنسور یا ناجوری PNP/NPN" },
      { en: "Loose terminal connection", fa: "اتصال شل ترمینال" },
    ],
    actions: [
      { en: "Compare the input status LED against the logic state", fa: "LED وضعیت ورودی را با حالت منطق مقایسه کنید" },
      { en: "Reroute or shield the affected signal run", fa: "مسیر سیگنال را تغییر دهید یا شیلد کنید" },
      { en: "Add debounce matched to the fastest legitimate signal", fa: "حذف لرزش متناسب با سریع‌ترین سیگنال مشروع بیفزایید" },
      { en: "Verify terminal tightness and sensor supply voltage", fa: "سفتی ترمینال و ولتاژ تغذیهٔ سنسور را بررسی کنید" },
    ],
    evidenceLibs: ["digitalInputs", "sensors"],
    evidenceLabel: { en: "Digital I/O libraries matched", fa: "کتابخانه‌های ورودی/خروجی دیجیتال منطبق شدند" },
  },
  {
    id: "analog-loop-fault",
    when: {
      domains: ["analogIo", "sensors"],
      keywordGroups: [
        ["4-20", "4–20", "analog", "transmitter", "ma", "آنالوگ", "ترانسمیتر", "میلیامپر", "میلیآمپر"],
        ["zero", "drift", "stuck", "wrong", "frozen", "صفر", "رانش", "ثابت", "غلط"],
      ],
    },
    riskLevel: "medium",
    causes: [
      { en: "Loop wiring break — live zero below 3.6 mA indicates a fault, not a low reading", fa: "قطعی سیم حلقه — صفر زنده زیر ۳٫۶ میلی‌آمپر یعنی خطا، نه قرائت کم" },
      { en: "Double scaling applied in both PLC and SCADA layers", fa: "مقیاس دوگانه در هر دو لایهٔ PLC و اسکادا" },
      { en: "Ground loop or induced noise on the signal pair", fa: "حلقهٔ زمین یا نویز القایی روی زوج سیگنال" },
      { en: "Plugged or gas-locked impulse line imitating sensor failure", fa: "گرفتگی یا حبس گاز در لولهٔ ضربه با ادای خرابی سنسور" },
    ],
    actions: [
      { en: "Inject a calibrated mA signal at the field end and verify end-to-end", fa: "سیگنال میلی‌آمپر کالیبره از سمت میدان تزریق و سرتاسر تأیید کنید" },
      { en: "Read HART device status before replacing the transmitter", fa: "پیش از تعویض ترانسمیتر وضعیت دستگاه را از HART بخوانید" },
      { en: "Verify scaling exists in exactly one layer", fa: "وجود مقیاس فقط در یک لایه را تأیید کنید" },
      { en: "Inspect impulse lines before condemning the instrument", fa: "پیش از محکوم‌کردن ابزار، لوله‌های ضربه را بازرسی کنید" },
    ],
    evidenceLibs: ["analogInputs", "transmitters", "sensors"],
    evidenceLabel: { en: "Instrumentation libraries matched", fa: "کتابخانه‌های ابزار دقیق منطبق شدند" },
  },
  {
    id: "ot-unknown-device",
    when: {
      domains: ["cybersecurity", "otNetwork"],
      keywordGroups: [
        ["unknown", "unauthorized", "new device", "rogue", "ناشناس", "غیرمجاز"],
      ],
    },
    riskLevel: "high",
    causes: [
      { en: "Unmanaged contractor or maintenance laptop on the OT segment", fa: "لپ‌تاپ مدیریت‌نشدهٔ پیمانکار یا تعمیرات روی سگمنت OT" },
      { en: "Misconfigured device with an address inside the OT range", fa: "دستگاه بدپیکربندی‌شده با آدرسی در محدودهٔ OT" },
      { en: "Compromised host establishing new connections", fa: "میزبان آلوده در حال برقراری اتصال‌های جدید" },
      { en: "Undocumented but legitimate device missing from inventory", fa: "دستگاه مشروع اما مستندنشدهٔ غایب از فهرست دارایی" },
    ],
    actions: [
      { en: "Locate the device physically via switch port (passive methods first)", fa: "دستگاه را از طریق پورت سوییچ مکان‌یابی کنید (ابتدا روش غیرفعال)" },
      { en: "Check the asset inventory before assuming hostility", fa: "پیش از فرض خصومت، فهرست دارایی را بررسی کنید" },
      { en: "Review firewall and connection logs for its traffic history", fa: "لاگ فایروال و اتصال‌ها را برای تاریخچهٔ ترافیک آن مرور کنید" },
      { en: "Follow the incident-response runbook for isolation decisions", fa: "برای تصمیم جداسازی، ران‌بوک پاسخ به حادثه را دنبال کنید" },
    ],
    evidenceLibs: ["monitoring", "segmentation", "accessControl", "audit"],
    evidenceLabel: { en: "OT security libraries matched", fa: "کتابخانه‌های امنیت OT منطبق شدند" },
  },
  {
    id: "modbus-timeout",
    when: {
      domains: ["otNetwork"],
      keywordGroups: [
        ["modbus", "مدباس"],
        ["timeout", "slow", "وقفه", "کند"],
      ],
    },
    riskLevel: "low",
    causes: [
      { en: "Aggregate polling exceeding the device's processing budget", fa: "مجموع پایش فراتر از بودجهٔ پردازشی دستگاه" },
      { en: "Unbatched register reads multiplying request count", fa: "خواندن رجیسترهای دسته‌نشده و تکثیر درخواست‌ها" },
      { en: "Network congestion or duplex mismatch on the segment", fa: "ازدحام شبکه یا ناجوری دوطرفه در سگمنت" },
    ],
    actions: [
      { en: "Batch contiguous registers and lengthen poll intervals for slow signals", fa: "رجیسترهای پیوسته را دسته‌بندی و بازهٔ پایش سیگنال‌های کند را بلند کنید" },
      { en: "Reproduce reads with an independent Modbus client", fa: "خواندن‌ها را با کلاینت مستقل مدباس بازتولید کنید" },
      { en: "Capture traffic with a port mirror at the device segment", fa: "ترافیک را با Port Mirror در سگمنت دستگاه ضبط کنید" },
    ],
    evidenceLibs: ["modbusTcp", "protocols"],
    evidenceLabel: { en: "Modbus and protocol libraries matched", fa: "کتابخانه‌های مدباس و پروتکل منطبق شدند" },
  },
  {
    id: "motor-overheat",
    when: {
      domains: ["motors", "electrical"],
      keywordGroups: [
        ["motor", "موتور"],
        ["hot", "overheat", "burning", "smell", "داغ", "گرم", "بو", "سوختگی"],
      ],
    },
    riskLevel: "high",
    causes: [
      { en: "Phase current imbalance heating one winding", fa: "عدم تعادل جریان فاز و گرم‌شدن یک سیم‌پیچ" },
      { en: "Blocked cooling path or failed fan", fa: "انسداد مسیر خنک‌کاری یا خرابی فن" },
      { en: "Sustained overload beyond the duty rating", fa: "اضافه‌بار پایدار فراتر از ردهٔ کاری" },
      { en: "Bearing friction converting to heat", fa: "اصطکاک یاتاقان در حال تبدیل به گرما" },
    ],
    actions: [
      { en: "Measure all three phase currents under load", fa: "جریان هر سه فاز را زیر بار اندازه بگیرید" },
      { en: "Thermo-scan the motor body and supply connections", fa: "بدنهٔ موتور و اتصالات تغذیه را ترموگرافی کنید" },
      { en: "Verify the cooling path and fan operation", fa: "مسیر خنک‌کاری و کارکرد فن را بررسی کنید" },
      { en: "Take a vibration reading to screen the bearings", fa: "برای غربال یاتاقان‌ها قرائت ارتعاش بگیرید" },
    ],
    evidenceLibs: ["motors", "protection", "mcc"],
    evidenceLabel: { en: "Motor and protection libraries matched", fa: "کتابخانه‌های موتور و حفاظت منطبق شدند" },
  },
  {
    id: "estop-no-reset",
    when: {
      keywordGroups: [
        ["e-stop", "estop", "emergency stop", "اضطراری"],
        ["reset", "ریست"],
        ["not", "won't", "wont", "no effect", "stays", "نمی", "بی‌اثر", "بیاثر"],
      ],
    },
    riskLevel: "high",
    causes: [
      { en: "EDM feedback contact open — a welded contactor correctly blocks reset", fa: "بازبودن کنتاکت بازخورد EDM — کنتاکتور جوش‌خورده به‌درستی ریست را سد می‌کند" },
      { en: "Reset sequence order not matching the safety configuration", fa: "ترتیب توالی ریست ناهماهنگ با پیکربندی ایمنی" },
      { en: "Channel discrepancy fault latched in the safety controller", fa: "خطای اختلاف کانال قفل‌شده در کنترلر ایمنی" },
    ],
    actions: [
      { en: "Read the safety controller diagnostics for the blocking condition", fa: "تشخیص کنترلر ایمنی را برای شرط مسدودکننده بخوانید" },
      { en: "Test the contactor mirror contact in the EDM loop", fa: "کنتاکت آینه‌ای کنتاکتور را در حلقهٔ EDM آزمایش کنید" },
      { en: "Verify reset wiring and sequence against the safety manual — never bridge or defeat the feedback loop", fa: "سیم‌کشی و توالی ریست را با دفترچهٔ ایمنی تطبیق دهید — حلقهٔ بازخورد را هرگز پل یا حذف نکنید" },
    ],
    evidenceLibs: ["plcBasics", "contactors"],
    evidenceLabel: { en: "Safety-circuit related libraries matched", fa: "کتابخانه‌های مرتبط با مدار ایمنی منطبق شدند" },
  },
  {
    id: "hmi-comm-loss",
    when: {
      domains: ["hmi", "scada"],
      keywordGroups: [
        ["hmi", "panel", "اچام", "پنل"],
        ["communication", "comm", "lost", "loses", "disconnect", "ارتباط", "قطع"],
      ],
    },
    riskLevel: "low",
    causes: [
      { en: "RS-485 termination or bias missing on an extended segment", fa: "نبود پایان‌خط یا بایاس RS-485 در سگمنت توسعه‌یافته" },
      { en: "IP conflict or changed controller address", fa: "تعارض IP یا تغییر آدرس کنترلر" },
      { en: "Driver or tag configuration drift after a PLC change", fa: "رانش پیکربندی درایور یا تگ پس از تغییر PLC" },
      { en: "Damaged or intermittent cable run", fa: "مسیر کابل آسیب‌دیده یا متناوب" },
    ],
    actions: [
      { en: "Verify termination (120 Ω) at both ends and bias at the master", fa: "پایان‌خط (۱۲۰ اهم) در دو سر و بایاس در مستر را بررسی کنید" },
      { en: "Test basic reachability (ping/port) to the controller", fa: "دسترس‌پذیری پایه (پینگ/پورت) به کنترلر را آزمایش کنید" },
      { en: "Re-validate driver mapping against the current PLC program", fa: "نگاشت درایور را با برنامهٔ فعلی PLC دوباره اعتبارسنجی کنید" },
      { en: "Inspect the physical cable run for damage points", fa: "مسیر فیزیکی کابل را برای نقاط آسیب بازرسی کنید" },
    ],
    evidenceLibs: ["hmiDesign", "scadaTags", "protocols"],
    evidenceLabel: { en: "HMI and SCADA libraries matched", fa: "کتابخانه‌های HMI و اسکادا منطبق شدند" },
  },
  {
    id: "mqtt-disconnect",
    when: {
      keywordGroups: [
        ["mqtt"],
        ["disconnect", "drop", "قطع"],
      ],
    },
    riskLevel: "low",
    causes: [
      { en: "Keep-alive longer than a firewall's NAT idle timeout", fa: "Keep-alive بزرگ‌تر از مهلت بیکاری NAT فایروال" },
      { en: "Broker connection or session limits reached", fa: "رسیدن به سقف اتصال یا نشست بروکر" },
      { en: "TLS session renegotiation failures", fa: "شکست در ازسرگیری نشست TLS" },
    ],
    actions: [
      { en: "Set keep-alive below the path's NAT idle timeout", fa: "Keep-alive را کمتر از مهلت NAT مسیر تنظیم کنید" },
      { en: "Monitor reconnect counts per client at the broker", fa: "شمار اتصال مجدد هر کلاینت را در بروکر پایش کنید" },
      { en: "Enable persistent sessions and verify Last Will behavior", fa: "نشست ماندگار را فعال و رفتار Last Will را تأیید کنید" },
    ],
    evidenceLibs: ["mqtt", "protocols"],
    evidenceLabel: { en: "MQTT and protocol libraries matched", fa: "کتابخانه‌های MQTT و پروتکل منطبق شدند" },
  },
];

/* ------------------------------ fallback ------------------------------ */

const FALLBACK: { causes: Bi[]; actions: Bi[]; evidenceLabel: Bi } = {
  causes: [
    { en: "Signature too broad for rule-based cause isolation — structured triage required", fa: "امضای مسئله برای جداسازی قاعده‌محور علت بسیار کلی است — تریاژ ساختاریافته لازم است" },
  ],
  actions: [
    { en: "Half-split the signal chain: test at the midpoint between field device and logic", fa: "زنجیرهٔ سیگنال را دونیم کنید: در میانهٔ مسیر تجهیز میدانی تا منطق آزمایش کنید" },
    { en: "Record the exact conditions under which the fault appears", fa: "شرایط دقیق بروز خطا را ثبت کنید" },
    { en: "Change one variable at a time and re-verify", fa: "هر بار فقط یک متغیر را تغییر دهید و دوباره راستی‌آزمایی کنید" },
  ],
  evidenceLabel: { en: "No specific rule fired; maintenance methodology applies", fa: "هیچ قاعدهٔ خاصی فعال نشد؛ روش‌شناسی نگهداشت حاکم است" },
};

/* ------------------------------ evaluation ------------------------------ */

function ruleFires(rule: ReasoningRule, input: ReasoningInput, text: string): boolean {
  const w = rule.when;
  if (w.domains && !w.domains.some((d) => input.domains.includes(d))) return false;
  if (w.vendors && !w.vendors.some((v) => input.vendors.includes(v))) return false;
  for (const group of w.keywordGroups) {
    const hit = group.some((k) => text.includes(normalize(k)));
    if (!hit) return false;
  }
  return true;
}

function resolve(items: Bi[], locale: "fa" | "en"): string[] {
  return items.map((b) => b[locale]);
}

/** Step: cause ranking — expose which rules fire for a given input. */
export function getFiredRules(input: ReasoningInput): ReasoningRule[] {
  const text = normalize(input.text);
  return REASONING_RULES.filter((r) => ruleFires(r, input, text));
}

export function runReasoning(
  input: ReasoningInput,
  locale: "fa" | "en" = "en"
): ReasoningResult {
  const text = normalize(input.text);
  const fired = REASONING_RULES.filter((r) => ruleFires(r, input, text));

  const evidence: string[] = [];
  const libLabel = locale === "fa" ? "کتابخانهٔ دانش" : "Knowledge library";
  const caseLabel = locale === "fa" ? "سابقهٔ مهندسی" : "Engineering case";

  let causes: string[] = [];
  let actions: string[] = [];
  let risk: ReasoningResult["riskLevel"] = input.baseRisk;

  if (fired.length > 0) {
    for (const r of fired) {
      causes.push(...resolve(r.causes, locale));
      actions.push(...resolve(r.actions, locale));
      evidence.push(r.evidenceLabel[locale]);
      for (const lib of r.evidenceLibs) {
        if (input.libraries.includes(lib)) evidence.push(`${libLabel}: ${lib}`);
      }
      risk = maxRisk(risk, r.riskLevel);
    }
  } else {
    causes = resolve(FALLBACK.causes, locale);
    actions = resolve(FALLBACK.actions, locale);
    evidence.push(FALLBACK.evidenceLabel[locale]);
  }

  for (const id of input.caseIds) evidence.push(`${caseLabel}: ${id}`);

  const dedupe = (a: string[]) => [...new Set(a)];
  return {
    probableCauses: dedupe(causes).slice(0, 6),
    evidence: dedupe(evidence).slice(0, 8),
    recommendedActions: dedupe(actions).slice(0, 6),
    riskLevel: risk,
  };
}

/** One-line localized synthesis of the evidence basis (Step 8B). */
export function summarizeEvidence(
  result: ReasoningResult,
  locale: "fa" | "en" = "en"
): string {
  const label = locale === "fa" ? "مبنای شواهد" : "Evidence basis";
  const sep = locale === "fa" ? "؛ " : "; ";
  return `${label}: ${result.evidence.join(sep)}`;
}
