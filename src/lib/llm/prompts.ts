import type { BrainDomainId } from "@/lib/services/types";
import type { LlmTask } from "./gateway";
import { SYSTEM_GUARDRAILS } from "./guardrails";

/**
 * Prompt Template System (Step 5).
 *
 * One structured template per industrial analysis task. Every template:
 *  - embeds SYSTEM_GUARDRAILS verbatim (no template can ship without policy)
 *  - constrains the model to the provided library excerpts (RAG-shaped:
 *    when real retrieval lands, `context` becomes retrieved chunks and the
 *    templates do not change)
 *  - demands the same strict JSON output schema in the user's locale
 */

const OUTPUT_CONTRACT = [
  'Respond ONLY with JSON: {"summary": string, "cause": string, "analysis": string[], "checks": string[]}.',
  "summary: 1-2 sentence problem restatement. cause: single most likely cause.",
  "analysis: 3-5 engineering points grounded in the provided excerpts.",
  "checks: 3-4 concrete, ordered verification steps.",
  "No markdown, no code fences, no text outside the JSON object.",
].join(" ");

function langLine(locale: "fa" | "en"): string {
  return locale === "fa"
    ? "Write every JSON string value in fluent technical Persian (Farsi)."
    : "Write every JSON string value in precise technical English.";
}

interface PromptTemplate {
  task: LlmTask;
  persona: string;
  emphasis: string;
}

const TEMPLATES: Record<LlmTask, PromptTemplate> = {
  plcAnalysis: {
    task: "plcAnalysis",
    persona:
      "You are a senior PLC engineer (Siemens S7, ladder, SCL) analyzing controller behavior.",
    emphasis:
      "Reason about scan cycle, block structure, I/O image, and online diagnostics. Distinguish program logic faults from hardware/configuration faults.",
  },
  scadaHmiAnalysis: {
    task: "scadaHmiAnalysis",
    persona:
      "You are a SCADA/HMI engineer analyzing supervisory systems, tags, alarms, and operator displays.",
    emphasis:
      "Reason about tag mapping, polling, data quality, alarm rationalization, and display hierarchy. Distinguish communication faults from configuration faults.",
  },
  electricalTroubleshooting: {
    task: "electricalTroubleshooting",
    persona:
      "You are an industrial electrical engineer analyzing motors, drives, contactors, MCCs, and protection.",
    emphasis:
      "Reason about protection coordination, thermal behavior, and switching. Trip events are data: anchor analysis in measured current, voltage, and timing before suggesting setting changes.",
  },
  otCybersecurity: {
    task: "otCybersecurity",
    persona:
      "You are an OT security engineer (IEC 62443) analyzing industrial networks defensively.",
    emphasis:
      "Reason about segmentation, access paths, monitoring coverage, and audit evidence. Give defensive guidance only; never assist exploitation or evasion.",
  },
  maintenanceDiagnosis: {
    task: "maintenanceDiagnosis",
    persona:
      "You are a reliability engineer performing systematic fault diagnosis and root cause analysis.",
    emphasis:
      "Apply half-split isolation across the signal chain and one-variable-at-a-time discipline. Separate verified facts from hypotheses explicitly.",
  },
  generalTriage: {
    task: "generalTriage",
    persona:
      "You are an industrial automation engineer performing first-line triage of a plant-floor problem.",
    emphasis:
      "Identify the most likely subsystem, state what information is missing, and direct the engineer to the highest-value first checks.",
  },
};

/** Top classified domain → task template. */
const DOMAIN_TASK: Record<BrainDomainId, LlmTask> = {
  plc: "plcAnalysis",
  scada: "scadaHmiAnalysis",
  hmi: "scadaHmiAnalysis",
  electrical: "electricalTroubleshooting",
  drives: "electricalTroubleshooting",
  motors: "electricalTroubleshooting",
  otNetwork: "otCybersecurity",
  cybersecurity: "otCybersecurity",
  sensors: "generalTriage",
  digitalIo: "generalTriage",
  analogIo: "generalTriage",
  maintenance: "maintenanceDiagnosis",
};

export function taskForDomain(domain: BrainDomainId): LlmTask {
  return DOMAIN_TASK[domain] ?? "generalTriage";
}

export function buildPrompt(
  task: LlmTask,
  locale: "fa" | "en",
  question: string,
  context: string
): { system: string; user: string } {
  const t = TEMPLATES[task];
  const system = [
    t.persona,
    t.emphasis,
    SYSTEM_GUARDRAILS,
    langLine(locale),
    OUTPUT_CONTRACT,
  ].join("\n\n");
  const user = `Knowledge library excerpts (your only reference material):\n${context}\n\nEngineer's question:\n${question}`;
  return { system, user };
}
