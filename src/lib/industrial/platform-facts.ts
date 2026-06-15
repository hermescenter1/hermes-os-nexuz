import { KNOWLEDGE } from "@/lib/industrial/knowledge";
import { VENDORS } from "@/lib/industrial/vendors";
import casesData from "@/lib/industrial/knowledge-data/cases.json";

/**
 * Platform facts for the Executive Dashboard (Phase A).
 *
 * These are static corpus counts and component-status declarations derived
 * from the shipped knowledge base — NOT live telemetry. They describe what
 * Hermes OS V1 contains and which subsystems are active in this build.
 * No database, no network: the numbers come straight from the bundled data.
 */

export const PLATFORM_FACTS = {
  knowledgeLibraries: KNOWLEDGE.length,
  engineeringCases: (casesData as { cases: unknown[] }).cases.length,
  supportedVendors: VENDORS.length,
} as const;

export type ComponentState = "online" | "simulated" | "phase2";

export interface PlatformComponent {
  key: string;
  state: ComponentState;
}

/** Industrial Platform Status rows (order is presentation order). */
export const PLATFORM_COMPONENTS: PlatformComponent[] = [
  { key: "brainEngine", state: "online" },
  { key: "knowledgeCloud", state: "online" },
  { key: "caseEngine", state: "online" },
  { key: "telemetry", state: "simulated" },
  { key: "plcConnectivity", state: "phase2" },
];
