import { NextResponse } from "next/server";
import { analysisRepository, type AnalysisCreate } from "@/lib/storage/analysis-repository";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { requireAuthoring, hasAuthoring } from "@/lib/auth/api-guards";

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
  const repo = analysisRepository();
  try {
    if (!await hasAuthoring()) {
      return NextResponse.json({ storageMode: getStorageMode(), records: [] });
    }
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

  const repo = analysisRepository();
  try {
    return NextResponse.json({ storageMode: getStorageMode(), record: await repo.create(input) });
  } catch {
    return NextResponse.json({ error: "record failed" }, { status: 500 });
  }
}
