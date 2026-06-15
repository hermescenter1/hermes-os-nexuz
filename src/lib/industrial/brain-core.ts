import type { BrainDomainId, SafetyKind } from "@/lib/services/types";
import {
  KNOWLEDGE,
  DOMAIN_KEYWORDS,
  DOMAIN_LIBS,
  ALL_DOMAINS,
} from "./knowledge";

/**
 * Hermes Brain core — V1 rule-based reasoning layer.
 *
 * Pure functions, no I/O, no device communication. Classifies a question
 * into industrial domains, selects knowledge libraries, detects safety
 * context, and estimates confidence. The LLM (when a key exists) only
 * REPHRASES analysis grounded in these libraries — it never gains the
 * ability to execute anything.
 */

export interface Classification {
  domains: { id: BrainDomainId; score: number }[];
  libraries: string[];
  confidence: number;
  safety: SafetyKind;
  /** true when evidence was insufficient for any domain */
  unknown?: boolean;
}

function normalize(q: string): string {
  return (
    q
      .toLowerCase()
      // Persian text normalization: unify arabic ي/ك, strip ZWNJ for matching
      .replace(/\u064A/g, "\u06CC")
      .replace(/\u0643/g, "\u06A9")
      .replace(/\u200C/g, "")
  );
}

function hits(text: string, keywords: string[]): number {
  let n = 0;
  for (const k of keywords) {
    const kk = k.replace(/\u200C/g, "");
    // Short ASCII tokens ("ip", "di", "ob1") need word boundaries, or they
    // false-positive inside words ("trips" contains "ip"). Persian script
    // has no \b semantics in JS, and long tokens are specific enough.
    const isAscii = /^[\x00-\x7F]+$/.test(kk);
    const matched =
      isAscii && kk.length <= 4
        ? new RegExp(`(^|[^a-z0-9])${kk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(text)
        : text.includes(kk);
    if (matched) n += kk.length >= 5 ? 2 : 1;
  }
  return n;
}

const ELECTRICAL_SAFETY = [
  "voltage", "230", "400", "690", "live", "busbar", "panel", "breaker",
  "shock", "arc", "تابلو", "ولتاژ", "برقدار", "شین", "قوس", "برق",
];
const MECHANICAL_SAFETY = [
  "motor", "rotating", "conveyor", "coupling", "fan", "gearbox", "moving",
  "موتور", "نقاله", "چرخان", "کوپلینگ", "گیربکس", "متحرک", "فن",
];

/**
 * Unknown/Fallback layer: generic complaint words may support a domain but
 * can never establish one alone. Their combined contribution per domain is
 * capped at 1 point, below DOMAIN_THRESHOLD.
 */
const WEAK_TERMS = new Set([
  "fault", "fails", "broken", "intermittent", "maintenance", "stopped",
  "خرابی", "عیب", "نگهداشت", "متوقف", "کار نمیکند",
]);

/** Minimum best-domain score required for a known classification. */
export const DOMAIN_THRESHOLD = 2;

/* ----------------------------- Domain Expansion ---------------------------- */

/** Expansion keyword groups (normalized, bilingual where natural). */
const EXP = {
  // anomaly / unauthorized-presence signals
  cyberAnomaly: [
    "unknown mac", "unknown device", "unauthorized device", "unauthorised device",
    "new device", "rogue device", "unexpected device", "intrusion", "anomaly",
    "مک ناشناس", "دستگاه ناشناس", "دستگاه غیرمجاز", "نفوذ",
  ],
  // OT / network context terms (the co-occurrence gate for cyber)
  otTerms: [
    "ot network", "industrial network", "switch", "vlan", "profinet",
    "modbus", "opc ua", "opcua", "ethernet/ip", "ethernet ip",
    "شبکه صنعتی", "سوییچ", "سوئیچ", "پروفینت", "مدباس",
  ],
  maintenance: [
    "after maintenance", "maintenance shutdown", "after replacement",
    "replacement", "replaced", "replacing", "swapped", "changed",
    "after work", "shutdown",
    "پس از تعمیر", "تعمیرات", "تعویض", "جایگزین", "پس از کار", "خاموشی",
  ],
  plc: [
    "profinet", "plc", "s7", "siemens", "controller", "i/o", "io ",
    "line stops", "machine stops", "packaging line stops", "line stop",
    "stops every", "randomly stops",
    "پی‌ال‌سی", "کنترلر", "زیمنس", "خط متوقف", "توقف خط",
  ],
  scada: [
    "wincc", "hmi", "scada", "alarms", "live values", "process values",
    "tags", "frozen values", "values freeze", "values frozen",
    "اسکادا", "آلارم", "هشدار", "مقادیر فرآیند", "تگ", "مقادیر منجمد",
  ],
} as const;

const anyHit = (text: string, terms: readonly string[]) =>
  terms.some((t) => text.includes(t));

/** Add a domain at a deliberately modest score if not already present, so
 *  expansion never outranks a genuinely-scored primary domain. */
function ensureDomain(
  domains: { id: BrainDomainId; score: number }[],
  id: BrainDomainId,
  score = 0.5
): void {
  if (!domains.some((d) => d.id === id)) domains.push({ id, score });
}

/**
 * Mutates `domains` in place, applying the expansion rules. Caller guarantees
 * this runs only for non-Unknown classifications.
 */
export function expandDomains(
  text: string,
  domains: { id: BrainDomainId; score: number }[]
): void {
  const has = (id: BrainDomainId) => domains.some((d) => d.id === id);

  // Rule 1 — Cybersecurity: anomaly/unauthorized-presence AND OT/network context
  if (anyHit(text, EXP.cyberAnomaly) && anyHit(text, EXP.otTerms)) {
    ensureDomain(domains, "cybersecurity", 0.55);
    // such phrasing implies an OT-network concern even if not scored
    ensureDomain(domains, "otNetwork", 0.5);
  }

  // Rule 2 — Maintenance context
  if (anyHit(text, EXP.maintenance)) {
    ensureDomain(domains, "maintenance", 0.5);
  }

  // Rule 3 — PLC: controller/line-stop terms, but only once OT network present
  if (anyHit(text, EXP.plc) && (has("otNetwork") || anyHit(text, EXP.otTerms))) {
    ensureDomain(domains, "plc", 0.5);
  }

  // Rule 4 — SCADA / supervisory layer
  if (anyHit(text, EXP.scada)) {
    ensureDomain(domains, "scada", 0.5);
  }

  // Rule 5 is structural: this function is never called for Unknown queries,
  // so vague inputs ("something is wrong") cannot be expanded into a domain.
}

function scoreDomain(text: string, keywords: string[]): number {
  let strong = 0;
  let weakHits = 0;
  for (const k of keywords) {
    const kk = k.toLowerCase().replace(/\u200C/g, "");
    const matched =
      kk.length <= 4 && /^[a-z0-9-]+$/.test(kk)
        ? new RegExp(`(^|[^a-z0-9])${kk.replace(/[-]/g, "\\-")}([^a-z0-9]|$)`).test(text)
        : text.includes(kk);
    if (!matched) continue;
    if (WEAK_TERMS.has(k.toLowerCase())) weakHits += 1;
    else strong += kk.length >= 5 ? 2 : 1;
  }
  return strong + Math.min(weakHits, 1);
}

export function classify(question: string): Classification {
  const text = normalize(question);

  // --- domain scores (weak generic terms capped at 1 per domain) ---
  const scored = ALL_DOMAINS.map((id) => ({
    id,
    raw: scoreDomain(text, DOMAIN_KEYWORDS[id]),
  }));
  const maxRaw = Math.max(...scored.map((s) => s.raw), 0);

  // Unknown/Fallback layer: insufficient evidence -> never force a domain.
  // (Vendor/case evidence can still rescue this at the pipeline level.)
  if (maxRaw < DOMAIN_THRESHOLD) {
    return {
      domains: [],
      libraries: [],
      confidence: 0.2,
      safety: "general",
      unknown: true,
    };
  }

  const domains: { id: BrainDomainId; score: number }[] = scored
    .filter((s) => s.raw > 0)
    .map((s) => ({ id: s.id, score: Math.round((s.raw / maxRaw) * 100) / 100 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  // --- Domain Expansion Patch ---
  // Multi-domain industrial queries that already cleared the Unknown
  // threshold can still classify too narrowly because the keyword scorer
  // under-weights cross-cutting concerns (security, maintenance context).
  // Expansion only AUGMENTS an already-valid classification; it never runs
  // on Unknown queries (we returned above) and never invents a primary.
  expandDomains(text, domains);

  domains.sort((a, b) => b.score - a.score);
  const trimmed = domains.slice(0, 5);
  domains.length = 0;
  domains.push(...trimmed);

  // --- library selection: direct keyword hits first, then domain defaults
  // interleaved round-robin so one broad domain can't crowd out the rest ---
  const libScores = KNOWLEDGE.map((lib) => ({
    id: lib.id,
    raw: hits(text, lib.keywords.map((k) => k.toLowerCase())),
  }))
    .filter((l) => l.raw > 0)
    .sort((a, b) => b.raw - a.raw)
    .map((l) => l.id);

  const domainLists = domains.map((d) => [...DOMAIN_LIBS[d.id]]);
  const interleaved: string[] = [];
  for (let i = 0; i < 4; i++) {
    for (const list of domainLists) {
      if (list[i]) interleaved.push(list[i]);
    }
  }
  const libraries = [...new Set([...libScores, ...interleaved])].slice(0, 4);

  // --- confidence: signal strength + agreement, hard-capped.
  // Rule-based matching can never be "certain" — cap well below 1.
  const signal = Math.min(maxRaw / 6, 1);
  const focus = domains.length > 0 ? domains[0].score : 0;
  const confidence =
    maxRaw === 0
      ? 0.3
      : Math.round(Math.min(0.45 + signal * 0.3 + focus * 0.13, 0.88) * 100) / 100;

  // --- safety context: every analysis carries a notice; specific hazards
  // (electrical, mechanical) override the general permit-to-work note ---
  let safety: SafetyKind = "general";
  if (
    hits(text, ELECTRICAL_SAFETY) > 0 ||
    domains.some((d) => d.id === "electrical")
  ) {
    safety = "electrical";
  } else if (
    hits(text, MECHANICAL_SAFETY) > 0 ||
    domains.some((d) => d.id === "drives" || d.id === "motors")
  ) {
    safety = "mechanical";
  }

  return { domains, libraries, confidence, safety, unknown: false };
}
