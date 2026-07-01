import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeIndustrialFault } from "@/lib/industrial-brain/analyzer";

export const dynamic = "force-dynamic";

const AnalyzeSchema = z.object({
  problemTitle:      z.string().trim().min(3, "Problem title required").max(200),
  assetType:         z.string().trim().max(150).optional().or(z.literal("")),
  systemArea:        z.string().trim().max(150).optional().or(z.literal("")),
  plcPlatform:       z.string().trim().max(100).optional().or(z.literal("")),
  observedSymptoms:  z.string().trim().min(5, "Describe at least one symptom").max(3000),
  recentChanges:     z.string().trim().max(1000).optional().or(z.literal("")),
  activeAlarms:      z.string().trim().max(1500).optional().or(z.literal("")),
  observedSignals:   z.string().trim().max(1000).optional().or(z.literal("")),
  hmiCommandState:   z.string().trim().max(500).optional().or(z.literal("")),
  plcOutputState:    z.string().trim().max(500).optional().or(z.literal("")),
  vfdMccState:       z.string().trim().max(500).optional().or(z.literal("")),
  interlockStatus:   z.string().trim().max(500).optional().or(z.literal("")),
  sensorFeedback:    z.string().trim().max(500).optional().or(z.literal("")),
  safetyImpact:      z.enum(["NONE","LOW","MEDIUM","HIGH","CRITICAL"]).optional(),
  productionImpact:  z.enum(["NONE","LOW","MEDIUM","HIGH","CRITICAL"]).optional(),
  alreadyChecked:    z.string().trim().max(1000).optional().or(z.literal("")),
  additionalInfo:    z.string().trim().max(1000).optional().or(z.literal("")),
  locale:            z.enum(["en","fa"]).optional().default("en"),
});

// Backward-compatible field aliases — mapped only when the canonical field is absent.
// Does not weaken validation: the canonical schema still applies after mapping.
function applyFieldAliases(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  const alias = (canonical: string, legacy: string) => {
    if (obj[canonical] === undefined && typeof obj[legacy] === "string") {
      obj[canonical] = obj[legacy];
    }
  };
  alias("problemTitle", "title");
  alias("plcPlatform", "platform");
  alias("observedSymptoms", "symptoms");
  alias("activeAlarms", "alarms");
  return obj;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = applyFieldAliases(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AnalyzeSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ ok: false, error: firstError }, { status: 400 });
  }

  try {
    const analysis = analyzeIndustrialFault(parsed.data);
    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analysis engine error";
    console.error("[industrial-brain/analyze] error:", msg);
    return NextResponse.json({ ok: false, error: "Analysis could not be completed. Please try again." }, { status: 500 });
  }
}
