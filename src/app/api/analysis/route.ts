import { NextResponse } from "next/server";
import { analysisRepository, type AnalysisCreate } from "@/lib/storage/analysis-repository";
import { getStorageMode } from "@/lib/storage/storage-mode";

/** /api/analysis — durable analysis history (Phase 11B). */

function asArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

export async function GET() {
  const repo = analysisRepository();
  try {
    return NextResponse.json({ storageMode: getStorageMode(), records: await repo.list() });
  } catch {
    return NextResponse.json({ storageMode: getStorageMode(), records: [] });
  }
}

export async function POST(req: Request) {
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
