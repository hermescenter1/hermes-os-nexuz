import { KNOWLEDGE } from "@/lib/industrial/knowledge";
import { VENDORS } from "@/lib/industrial/vendors";
import casesData from "@/lib/industrial/knowledge-data/cases.json";

/**
 * Platform facts for the Executive Dashboard (Phase A; Phase 11B-B adds the
 * database-mode dynamic counts).
 *
 * `PLATFORM_FACTS` stays exactly as before: static corpus counts derived
 * from the shipped knowledge base, computed synchronously at module load,
 * with no I/O. It remains the immediate, always-available baseline/fallback
 * value — kept unchanged for full backward compatibility.
 *
 * `getDynamicPlatformFacts()` is additive: in database mode it overrides
 * `engineeringCases`/`knowledgeLibraries` with live counts of `published`
 * rows. It is implemented with `fetch()` against the existing `/api/cases`
 * and `/api/knowledge` routes — never importing the repositories/Prisma
 * directly — because this module is bundled into the client-side
 * `ExecutiveOverview` component. `supportedVendors` has no "published
 * record" concept and is always the static count.
 */

export const PLATFORM_FACTS = {
  knowledgeLibraries: KNOWLEDGE.length,
  engineeringCases: (casesData as { cases: unknown[] }).cases.length,
  supportedVendors: VENDORS.length,
} as const;

export type PlatformFacts = typeof PLATFORM_FACTS;

/**
 * Best-effort dynamic counts. Returns the static `PLATFORM_FACTS` unchanged
 * in session mode or on any fetch/parse failure, so the dashboard always has
 * a value and the static fallback is never at risk.
 */
export async function getDynamicPlatformFacts(): Promise<PlatformFacts> {
  try {
    const [caseRes, knowledgeRes] = await Promise.all([
      fetch("/api/cases", { cache: "no-store" }),
      fetch("/api/knowledge", { cache: "no-store" }),
    ]);
    if (!caseRes.ok || !knowledgeRes.ok) return PLATFORM_FACTS;

    const caseJson = (await caseRes.json()) as {
      storageMode?: string;
      cases?: { status?: string }[];
    };
    const knowledgeJson = (await knowledgeRes.json()) as {
      storageMode?: string;
      articles?: { status?: string }[];
    };

    const inDatabaseMode =
      caseJson.storageMode === "database" || knowledgeJson.storageMode === "database";
    if (!inDatabaseMode) return PLATFORM_FACTS;

    const publishedCases = (caseJson.cases ?? []).filter((c) => c.status === "published").length;
    const publishedArticles = (knowledgeJson.articles ?? []).filter(
      (a) => a.status === "published"
    ).length;

    return {
      ...PLATFORM_FACTS,
      engineeringCases: publishedCases,
      knowledgeLibraries: publishedArticles,
    };
  } catch {
    return PLATFORM_FACTS;
  }
}

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
