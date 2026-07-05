import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }            from "@/lib/auth/roles";
import { caseRepository, type CaseCreate } from "@/lib/storage/case-repository";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";

export const dynamic = "force-dynamic";

/**
 * Phase 82: save an Industrial Brain analysis as an EngineeringCase draft.
 *
 * Authenticated + authoring-gated (same capability as Case Studio) — the
 * public demo stays stateless and never writes. Deliberately does NOT reuse
 * the public POST /api/cases; this route enforces auth server-side and maps
 * the analysis payload itself, so the client never shapes case content.
 *
 * Zod validates the envelope (meta fields bounded, analysis must be an
 * object); the mapper below then treats every nested analysis field as
 * untrusted — clipping strings, slicing arrays, whitelisting the domain,
 * and clamping confidence — so an oversized or hand-crafted payload can
 * only ever produce a bounded draft case.
 */

// ── Payload envelope ──────────────────────────────────────────────────────────

const MAX_BODY_CHARS = 300_000;

const SaveCaseSchema = z.object({
  analysis: z.record(z.string(), z.unknown()),
  meta: z.object({
    problemTitle: z.string().trim().max(200).optional(),
    assetType:    z.string().trim().max(150).optional(),
    systemArea:   z.string().trim().max(150).optional(),
    plcPlatform:  z.string().trim().max(100).optional(),
  }),
});

// ── Untrusted-field helpers ───────────────────────────────────────────────────

const clip = (v: unknown, n: number): string =>
  typeof v === "string" ? v.trim().slice(0, n) : "";

const rec = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

const arr = (v: unknown, cap: number): Record<string, unknown>[] =>
  Array.isArray(v) ? v.slice(0, cap).map(rec) : [];

const strArr = (v: unknown, itemLen: number, cap: number): string[] =>
  Array.isArray(v)
    ? v.slice(0, cap).map((s) => clip(s, itemLen)).filter(Boolean)
    : [];

/** Engine domains we accept verbatim; anything else falls back. */
const KNOWN_DOMAINS = new Set([
  "PLC", "SCADA", "HMI", "MOTOR", "SENSOR",
  "NETWORK", "MECHANICAL", "ELECTRICAL", "MAINTENANCE", "VFD", "UNKNOWN",
]);

function clampConfidence(...candidates: unknown[]): number {
  for (const c of candidates) {
    const n = typeof c === "number" ? c : Number(c);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  }
  return 50;
}

// ── Analysis → CaseCreate mapping (Part D) ────────────────────────────────────

interface SaveMeta {
  problemTitle?: string;
  assetType?:    string;
  systemArea?:   string;
  plcPlatform?:  string;
}

function mapAnalysisToCase(analysis: Record<string, unknown>, meta: SaveMeta): CaseCreate {
  const classification = rec(analysis.classification);
  const uncertainty    = rec(analysis.uncertainty);
  const risk           = rec(analysis.risk);
  const likelyCauses   = arr(analysis.likelyCauses, 8);
  const alarms         = arr(analysis.alarms, 10);
  const signalMatrix   = arr(analysis.signalMatrix, 12);
  const checklist      = arr(analysis.inspectionChecklist, 30);
  const evidenceGaps   = arr(analysis.evidenceGaps, 15);
  const actionGroups   = arr(analysis.recommendedActions, 10);

  const rawDomain = clip(classification.domain, 40).toUpperCase();
  const domain    = KNOWN_DOMAINS.has(rawDomain) ? rawDomain : "INDUSTRIAL_BRAIN";

  // problem — summary + context + top alarm + top signals + evidence entropy
  const problemLines: string[] = [];
  const summary = clip(analysis.summary, 2000);
  if (summary) problemLines.push(summary);
  const context = [
    meta.assetType  ? `Asset type: ${clip(meta.assetType, 150)}`   : "",
    meta.systemArea ? `System area: ${clip(meta.systemArea, 150)}` : "",
  ].filter(Boolean).join(" · ");
  if (context) problemLines.push(context);
  const topAlarm = alarms[0];
  if (topAlarm) {
    const alarmText = clip(topAlarm.alarmText, 300);
    if (alarmText) {
      const sev = clip(topAlarm.severity, 20);
      const interp = clip(topAlarm.interpretation, 400);
      problemLines.push(`Top alarm${sev ? ` [${sev}]` : ""}: ${alarmText}${interp ? ` — ${interp}` : ""}`);
    }
  }
  const signalLines = signalMatrix.slice(0, 4)
    .map((s) => {
      const name = clip(s.signalName, 120);
      if (!name) return "";
      const observed = clip(s.observedValue, 120);
      const status   = clip(s.status, 20);
      return `${name}: ${observed || "n/a"}${status ? ` (${status})` : ""}`;
    })
    .filter(Boolean);
  if (signalLines.length) problemLines.push(`Key signals: ${signalLines.join("; ")}`);
  const entropyLevel = clip(uncertainty.level, 10);
  const entropyExpl  = clip(uncertainty.explanation, 600);
  if (entropyLevel || entropyExpl) {
    problemLines.push(`Evidence entropy: ${entropyLevel || "UNKNOWN"}${entropyExpl ? ` — ${entropyExpl}` : ""}`);
  }

  // rootCause / secondaryCauses
  const first = likelyCauses[0];
  const firstTitle = first ? clip(first.title, 200) : "";
  const rootCause = firstTitle
    ? `${firstTitle}${clip(first.explanation, 800) ? ` — ${clip(first.explanation, 800)}` : ""}`
    : "Pending verification";
  const secondaryCauses = likelyCauses.slice(1).map((c) => {
    const title = clip(c.title, 200);
    if (!title) return "";
    const conf = clampConfidence(c.confidence);
    const support = strArr(c.supportingEvidence, 200, 6).join("; ");
    return `${title} (${conf}% confidence)${support ? ` — supported by: ${support}` : ""}`;
  }).filter(Boolean);

  // verificationSteps — suggested checks + checklist + gaps + missing signals
  const verificationSteps: string[] = [];
  for (const c of likelyCauses) {
    const check = clip(c.suggestedCheck, 400);
    if (check) verificationSteps.push(`Verify: ${check}`);
  }
  for (const item of checklist) {
    const text = clip(item.text, 300);
    if (text) verificationSteps.push(item.requiresQualifiedPersonnel === true ? `${text} [qualified personnel]` : text);
  }
  for (const gap of evidenceGaps) {
    const signal = clip(gap.signal, 200);
    if (signal) verificationSteps.push(`Collect missing evidence: ${signal}${clip(gap.reason, 250) ? ` — ${clip(gap.reason, 250)}` : ""}`);
  }
  for (const s of strArr(uncertainty.missingCriticalSignals, 200, 10)) {
    verificationSteps.push(`Collect missing signal: ${s}`);
  }

  // correctiveActions — flatten groups, preserve category labels
  const correctiveActions: string[] = [];
  for (const g of actionGroups) {
    const category = clip(g.category, 100);
    for (const item of arr(g.items, 15)) {
      const text = clip(item.en, 300);
      if (text) correctiveActions.push(category ? `[${category}] ${text}` : text);
    }
  }

  // safetyNotes — risk impact + decision-support disclaimers
  const safetyLines: string[] = [];
  const safetyImpact = clip(risk.safetyImpact, 500);
  const safetyLevel  = clip(risk.safetyImpactLevel, 10);
  if (safetyImpact) safetyLines.push(`Safety impact${safetyLevel ? ` [${safetyLevel}]` : ""}: ${safetyImpact}`);
  const urgency = clip(risk.urgency, 300);
  if (urgency) safetyLines.push(`Urgency: ${urgency}`);
  safetyLines.push(
    "Decision-support analysis — not a certified safety determination.",
    "Verification by qualified personnel is required before any intervention.",
    "Never bypass or disable safety interlocks. Apply LOTO and site procedures before physical contact.",
  );

  // tags
  const tags = Array.from(new Set([
    "industrial-brain",
    "evidence-pack",
    domain.toLowerCase(),
    clip(analysis.engineVersion, 40),
    clip(meta.assetType, 40),
    clip(meta.systemArea, 40),
  ].filter(Boolean))).slice(0, 10);

  return {
    title: clip(meta.problemTitle, 200) || "Industrial Brain Analysis",
    vendor: clip(meta.plcPlatform, 100) || "Hermes Industrial Brain",
    domain,
    problem: problemLines.join("\n").slice(0, 6000),
    rootCause: rootCause.slice(0, 1200),
    secondaryCauses: secondaryCauses.slice(0, 8),
    verificationSteps: verificationSteps.slice(0, 40),
    correctiveActions: correctiveActions.slice(0, 40),
    safetyNotes: safetyLines.join("\n").slice(0, 2000),
    tags,
    confidence: clampConfidence(analysis.confidence, classification.confidence),
    status: "draft",
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!can(user.role, "authoring")) {
    return NextResponse.json({ ok: false, error: "Insufficient permissions." }, { status: 403 });
  }

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) {
      return NextResponse.json({ ok: false, error: "Payload too large." }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const parsed = SaveCaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input." }, { status: 400 });
  }

  const input = mapAnalysisToCase(parsed.data.analysis, parsed.data.meta);

  const repo = caseRepository();
  try {
    // Same title-dedupe semantics as the existing case API: re-saving the
    // same analysis title updates the draft instead of duplicating it.
    const existing = repo.findByTitle ? await repo.findByTitle(input.title) : null;
    const saved = existing
      ? await repo.update(existing.id, input)
      : await repo.create(input);

    await recordAuditEvent({
      userId: user.id,
      action: existing ? AUDIT_ACTIONS.CASE_UPDATED : AUDIT_ACTIONS.CASE_CREATED,
      entityType: "case",
      entityId: saved?.id ?? null,
      metadata: { title: input.title, source: "industrial-brain" },
    });

    return NextResponse.json({
      ok: true,
      caseId: saved?.id ?? null,
      title: input.title,
      updated: !!existing,
      storageMode: getStorageMode(),
      message: "Analysis saved as engineering case draft.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[industrial-brain/save-case] save error:", msg);
    return NextResponse.json({ ok: false, error: "Could not save case." }, { status: 500 });
  }
}
