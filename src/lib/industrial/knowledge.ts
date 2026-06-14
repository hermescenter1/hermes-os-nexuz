import type { BrainDomainId } from "@/lib/services/types";
import plc from "./knowledge-data/plc.json";
import scadaHmi from "./knowledge-data/scada-hmi.json";
import electrical from "./knowledge-data/electrical.json";
import instrumentation from "./knowledge-data/instrumentation.json";
import protocols from "./knowledge-data/protocols.json";
import cybersecurity from "./knowledge-data/cybersecurity.json";
import maintenance from "./knowledge-data/maintenance.json";

/**
 * Hermes Brain — knowledge library loader (V1, Step 4B).
 *
 * Libraries are defined as structured JSON under ./knowledge-data/, one file
 * per category (7 categories, 30 libraries). The JSON holds structure and
 * bilingual MATCHING keywords only; all VISIBLE text lives in
 * messages/{fa,en}.json under `knowledge.<id>.*` (name, summary, p1-p3,
 * c1-c2) so FA/EN completeness is enforced by the message files themselves.
 *
 * No database, no embeddings, no RAG — a deliberate V1 boundary. Phase 2
 * moves this corpus to Postgres behind the same KnowledgeService interface.
 */

export interface KnowledgeLib {
  id: string;
  category: string;
  domains: BrainDomainId[];
  keywords: string[];
  /** optional vendor association (e.g. Siemens-specific libraries) */
  vendor?: string;
  /** RAG-readiness marker: this record is chunk-shaped for Phase 2 embedding */
  futureEmbeddingReady: boolean;
}

interface CategoryFile {
  category: string;
  libraries: { id: string; domains: string[]; keywords: string[]; vendor?: string }[];
}

const FILES: CategoryFile[] = [
  plc,
  scadaHmi,
  electrical,
  instrumentation,
  protocols,
  cybersecurity,
  maintenance,
];

export const CATEGORIES: string[] = FILES.map((f) => f.category);

export const KNOWLEDGE: KnowledgeLib[] = FILES.flatMap((f) =>
  f.libraries.map((l) => ({
    id: l.id,
    category: f.category,
    domains: l.domains as BrainDomainId[],
    keywords: l.keywords,
    ...(l.vendor ? { vendor: l.vendor } : {}),
    futureEmbeddingReady: true,
  }))
);

// Fail fast on duplicate ids at module load (build-time safety).
const seen = new Set<string>();
for (const lib of KNOWLEDGE) {
  if (seen.has(lib.id)) throw new Error(`duplicate knowledge id: ${lib.id}`);
  seen.add(lib.id);
}

/** Domain -> ordered default libraries (used when classification is broad). */
export const DOMAIN_LIBS: Record<BrainDomainId, string[]> = {
  plc: ["plcBasics", "s71200", "s71500", "ladder", "structuredText"],
  scada: ["scadaTags", "historian", "alarms"],
  hmi: ["hmiDesign", "alarms"],
  electrical: ["protection", "mcc", "contactors", "motors"],
  sensors: ["sensors", "transmitters", "analogInputs"],
  digitalIo: ["digitalInputs", "plcBasics"],
  analogIo: ["analogInputs", "transmitters", "sensors"],
  drives: ["vfd", "motors", "mcc"],
  motors: ["motors", "vfd", "protection"],
  otNetwork: ["protocols", "opcua", "modbusTcp", "mqtt", "s7comm"],
  cybersecurity: ["segmentation", "accessControl", "monitoring", "audit"],
  maintenance: ["troubleshooting", "rca", "predictive", "alarms"],
};

/** Domain classification keywords — bilingual, lowercase. */
export const DOMAIN_KEYWORDS: Record<BrainDomainId, string[]> = {
  plc: ["plc", "s7", "1200", "1500", "ladder", "rung", "ob1", "tia", "cpu", "scl", "structured text", "پی‌ال‌سی", "لدر", "زیمنس", "منطق"],
  scada: ["scada", "tag", "historian", "trend", "wincc", "supervisory", "alarm", "اسکادا", "تگ", "ترند", "هیستورین", "آلارم", "هشدار"],
  hmi: ["hmi", "screen", "panel", "display", "operator", "touch", "اچ‌ام‌آی", "اپراتور", "نمایشگر", "صفحه", "پنل"],
  electrical: ["voltage", "current", "phase", "breaker", "cable", "panel", "230", "400", "fuse", "contactor", "mcc", "overload", "ولتاژ", "جریان", "فاز", "کابل", "تابلو", "فیوز", "برق", "کنتاکتور", "حفاظت"],
  sensors: ["sensor", "proximity", "pt100", "rtd", "thermocouple", "transmitter", "سنسور", "پراکسیمیتی", "ترموکوپل", "ترانسمیتر"],
  digitalIo: ["digital input", "digital output", "di", "dq", "pnp", "npn", "dry contact", "chatter", "ورودی دیجیتال", "خروجی دیجیتال", "کنتاکت"],
  analogIo: ["analog", "4-20", "4–20", "0-10v", "ma loop", "scaling", "آنالوگ", "میلیامپر", "میلیآمپر", "مقیاس"],
  drives: ["vfd", "drive", "inverter", "frequency", "ramp", "درایو", "اینورتر", "فرکانس", "رمپ"],
  motors: ["motor", "winding", "bearing", "rpm", "torque", "insulation", "موتور", "سیمپیچ", "بلبرینگ", "یاتاقان", "گشتاور"],
  otNetwork: ["network", "opc", "modbus", "mqtt", "profinet", "switch", "ethernet", "put/get", "شبکه", "مدباس", "سوییچ", "اترنت"],
  cybersecurity: ["security", "firewall", "attack", "vpn", "dmz", "malware", "unauthorized", "62443", "audit", "segmentation", "امنیت", "نفوذ", "حمله", "فایروال", "بدافزار", "غیرمجاز", "ممیزی", "تفکیک"],
  maintenance: ["fault", "fails", "broken", "intermittent", "maintenance", "vibration", "noise", "stopped", "trip", "root cause", "predictive", "خرابی", "عیب", "نگهداشت", "ارتعاش", "صدا", "تریپ", "متوقف", "کار نمیکند", "علت ریشه‌ای", "پیش‌بینانه"],
};

export const ALL_DOMAINS = Object.keys(DOMAIN_KEYWORDS) as BrainDomainId[];
