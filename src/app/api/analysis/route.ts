import { NextResponse } from "next/server";
import { analysisRepository, type AnalysisCreate } from "@/lib/storage/analysis-repository";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { requireAuthoring, hasAuthoring } from "@/lib/auth/api-guards";
import { resolveBrainOwner } from "@/lib/storage/brain-owner";

/**
 * /api/analysis — durable analysis history (Phase 11B).
 *
 * Phase 82C hardening: POST requires the "authoring" capability; GET stays
 * 200 for everyone (StorageIndicator reads only `storageMode` from it) but
 * the records themselves are returned to authoring callers only.
 */

function asArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

export async function GET() {
  try {
    if (!await hasAuthoring()) {
      return NextResponse.json({ storageMode: getStorageMode(), records: [] });
    }
    // PHASE 90: history is scoped to the caller's tenant, never global.
    const repo = analysisRepository(await resolveBrainOwner());
    return NextResponse.json({ storageMode: getStorageMode(), records: await repo.list() });
  } catch {
    return NextResponse.json({ storageMode: getStorageMode(), records: [] });
  }
}

export async function POST(req: Request) {
  const gate = await requireAuthoring();
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const query = String(body.query ?? "").trim();
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  const input: AnalysisCreate = {
    query,
    locale: String(body.locale ?? "en"),
    mode: String(body.mode ?? "library"),
    domains: asArray(body.domains),
    vendors: asArray(body.vendors),
    cases: asArray(body.cases),
    knowledge: asArray(body.knowledge),
    confidence: Number(body.confidence ?? 0),
    riskLevel: String(body.riskLevel ?? "unknown"),
    isUnknown: Boolean(body.isUnknown),
  };

  // PHASE 90: the new row is attributed to the authenticated caller/org.
  const repo = analysisRepository(await resolveBrainOwner());
  try {
    return NextResponse.json({ storageMode: getStorageMode(), record: await repo.create(input) });
  } catch {
    return NextResponse.json({ error: "record failed" }, { status: 500 });
  }
}
