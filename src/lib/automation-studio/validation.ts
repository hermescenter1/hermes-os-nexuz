/**
 * PHASE 109-C1 — the validation engine.
 *
 * Pure: project in, findings out. It never reads a clock (the caller supplies
 * the instant), never touches the network, and never returns display text — a
 * finding carries a stable code and a message KEY, because the same finding has
 * to render in English, German and Persian.
 *
 * The UI must not hard-code findings. If a rule is not here, the workspace does
 * not report it.
 */

import {
  DIAGNOSTIC_CODES,
  isLiveOrigin,
  type AutomationProject,
  type DiagnosticCode,
  type DiagnosticFinding,
  type EngineeringArtifact,
  type ValidationRun,
} from "./contract";
import { buildSymbolIndex, type SymbolIndex } from "./symbols";

/** Data types that denote a physical or time quantity and need a unit. */
const QUANTITY_TYPES = new Set(["Real", "Time"]);

/**
 * Command/feedback naming convention for this project family, declared here
 * rather than inferred so the rule can be argued with.
 *
 * A command is `<Device>_<Verb>Cmd`. Its feedback is any symbol on the SAME
 * device ending in `Fb` or `Feedback` — `Motor_101_StartCmd` is answered by
 * `Motor_101_RunFb`, not by a hypothetical `Motor_101_StartFb`, because the
 * feedback reports the resulting STATE rather than echoing the verb.
 *
 * An `Out` suffix is deliberately NOT feedback. `Valve_201_OpenOut` is the
 * output the controller drives; treating it as feedback would mean a valve
 * commanded with no position sensor looks correctly instrumented, which is the
 * exact defect this rule exists to find.
 */
const COMMAND_SUFFIX = "Cmd";
const FEEDBACK_SUFFIXES = ["Fb", "Feedback"] as const;

/** `Motor_101_StartCmd` -> `Motor_101`. Empty when the name has no device part. */
function deviceOf(symbolName: string): string {
  const parts = symbolName.split("_");
  return parts.length >= 3 ? parts.slice(0, -1).join("_") : "";
}

function artifactById(project: AutomationProject): ReadonlyMap<string, EngineeringArtifact> {
  return new Map(project.artifacts.map((a) => [a.id, a]));
}

function finding(
  code: DiagnosticCode,
  severity: DiagnosticFinding["severity"],
  messageKey: string,
  params: Record<string, string>,
  location: {
    artifactId?: string | null;
    artifactPath?: string | null;
    line?: number | null;
    symbolName?: string | null;
  } = {},
): DiagnosticFinding {
  return {
    code,
    severity,
    messageKey,
    params,
    artifactId: location.artifactId ?? null,
    artifactPath: location.artifactPath ?? null,
    line: location.line ?? null,
    symbolName: location.symbolName ?? null,
  };
}

/**
 * Run every rule.
 *
 * `nowEpochMs` is a parameter rather than a `Date.now()` call so the run is
 * reproducible: two invocations with the same project and instant produce
 * byte-identical output, which is what makes the result testable.
 */
export function validateProject(
  project: AutomationProject,
  nowEpochMs: number,
  prebuiltIndex?: SymbolIndex,
): ValidationRun {
  const index = prebuiltIndex ?? buildSymbolIndex(project);
  const artifacts = artifactById(project);
  const findings: DiagnosticFinding[] = [];
  const fired = new Set<DiagnosticCode>();

  const push = (f: DiagnosticFinding) => {
    findings.push(f);
    fired.add(f.code);
  };

  const pathOf = (id: string | null | undefined) =>
    id ? (artifacts.get(id)?.path ?? null) : null;

  /* AES-C1-001 — referenced but never declared. */
  for (const entry of index.entries) {
    if (!entry.unresolved) continue;
    const first = entry.all[0];
    push(
      finding(DIAGNOSTIC_CODES.UNRESOLVED_SYMBOL, "error", "unresolvedSymbol",
        { symbol: entry.name },
        { artifactId: first?.artifactId ?? null, artifactPath: pathOf(first?.artifactId), line: first?.line ?? null, symbolName: entry.name }),
    );
  }

  /* AES-C1-002 — the same name declared more than once. */
  for (const entry of index.entries) {
    if (!entry.duplicate) continue;
    const second = entry.declarations[1];
    push(
      finding(DIAGNOSTIC_CODES.DUPLICATE_SYMBOL, "error", "duplicateSymbol",
        { symbol: entry.name, count: String(entry.declarations.length) },
        { artifactId: second?.declaredIn ?? null, artifactPath: pathOf(second?.declaredIn), line: second?.declaredAtLine ?? null, symbolName: entry.name }),
    );
  }

  /* AES-C1-003 — declared and never used. */
  for (const entry of index.entries) {
    if (!entry.orphan) continue;
    const declaration = entry.declarations[0];
    push(
      finding(DIAGNOSTIC_CODES.UNUSED_SYMBOL, "warning", "unusedSymbol",
        { symbol: entry.name },
        { artifactId: declaration?.declaredIn ?? null, artifactPath: pathOf(declaration?.declaredIn), line: declaration?.declaredAtLine ?? null, symbolName: entry.name }),
    );
  }

  /* AES-C1-004 — an HMI/SCADA binding whose symbol no block declares. */
  for (const entry of index.entries) {
    if (entry.declarations.length > 0) continue;
    for (const binding of entry.bindings) {
      push(
        finding(DIAGNOSTIC_CODES.HMI_BINDING_WITHOUT_PLC_SYMBOL, "error", "bindingWithoutSymbol",
          { symbol: entry.name },
          { artifactId: binding.artifactId, artifactPath: pathOf(binding.artifactId), line: binding.line, symbolName: entry.name }),
      );
    }
  }

  /* AES-C1-005 — an alarm reference with no priority in its declaration text. */
  for (const entry of index.entries) {
    for (const alarm of entry.alarms) {
      if (/\bpriority\s*=\s*\d+/i.test(alarm.context)) continue;
      push(
        finding(DIAGNOSTIC_CODES.ALARM_WITHOUT_PRIORITY, "warning", "alarmWithoutPriority",
          { symbol: entry.name },
          { artifactId: alarm.artifactId, artifactPath: pathOf(alarm.artifactId), line: alarm.line, symbolName: entry.name }),
      );
    }
  }

  /* AES-C1-006 — a command symbol with no corresponding feedback symbol. */
  for (const entry of index.entries) {
    if (!entry.name.endsWith(COMMAND_SUFFIX)) continue;
    if (entry.declarations.length === 0) continue;
    const device = deviceOf(entry.name);
    if (device.length === 0) continue;
    const hasFeedback = index.entries.some(
      (candidate) =>
        candidate.declarations.length > 0 &&
        candidate.name.startsWith(`${device}_`) &&
        FEEDBACK_SUFFIXES.some((suffix) => candidate.name.endsWith(suffix)),
    );
    if (hasFeedback) continue;
    const declaration = entry.declarations[0];
    push(
      finding(DIAGNOSTIC_CODES.COMMAND_WITHOUT_FEEDBACK, "warning", "commandWithoutFeedback",
        { symbol: entry.name },
        { artifactId: declaration.declaredIn, artifactPath: pathOf(declaration.declaredIn), line: declaration.declaredAtLine, symbolName: entry.name }),
    );
  }

  /* AES-C1-007 — a physical or time quantity with no engineering unit. */
  for (const entry of index.entries) {
    for (const declaration of entry.declarations) {
      if (!QUANTITY_TYPES.has(declaration.dataType)) continue;
      if (declaration.engineeringUnit && declaration.engineeringUnit.trim().length > 0) continue;
      push(
        finding(DIAGNOSTIC_CODES.QUANTITY_WITHOUT_UNIT, "warning", "quantityWithoutUnit",
          { symbol: entry.name, dataType: declaration.dataType },
          { artifactId: declaration.declaredIn, artifactPath: pathOf(declaration.declaredIn), line: declaration.declaredAtLine, symbolName: entry.name }),
      );
    }
  }

  /* AES-C1-008 — a write to a symbol declared read-only. */
  for (const entry of index.entries) {
    const readOnly = entry.declarations.some((d) => !d.writable);
    if (!readOnly) continue;
    for (const write of entry.writes) {
      push(
        finding(DIAGNOSTIC_CODES.WRITE_TO_READ_ONLY_SYMBOL, "error", "writeToReadOnly",
          { symbol: entry.name },
          { artifactId: write.artifactId, artifactPath: pathOf(write.artifactId), line: write.line, symbolName: entry.name }),
      );
    }
  }

  /* AES-C1-009 — an artifact with no provenance record. */
  for (const artifact of project.artifacts) {
    if (artifact.provenance && typeof artifact.provenance.origin === "string") continue;
    push(
      finding(DIAGNOSTIC_CODES.ARTIFACT_WITHOUT_PROVENANCE, "error", "artifactWithoutProvenance",
        { artifact: artifact.name },
        { artifactId: artifact.id, artifactPath: artifact.path }),
    );
  }

  /* AES-C1-010 — simulated data that does not disclose itself. */
  for (const artifact of project.artifacts) {
    const p = artifact.provenance;
    if (!p || typeof p.origin !== "string") continue; // already reported by 009
    if (p.origin !== "simulated") continue;
    if (p.disclosure && p.disclosure.trim().length > 0) continue;
    push(
      finding(DIAGNOSTIC_CODES.SIMULATED_VALUE_WITHOUT_DISCLOSURE, "error", "simulatedWithoutDisclosure",
        { artifact: artifact.name },
        { artifactId: artifact.id, artifactPath: artifact.path }),
    );
  }

  /* AES-C1-011 — any claim of a live origin. Round 1 permits none. */
  const originBearers: { name: string; origin: string; id: string | null; path: string | null }[] = [
    { name: project.name, origin: project.provenance?.origin ?? "", id: null, path: null },
    ...project.artifacts.map((a) => ({
      name: a.name,
      origin: a.provenance?.origin ?? "",
      id: a.id,
      path: a.path,
    })),
  ];
  for (const bearer of originBearers) {
    if (!bearer.origin) continue;
    if (!isLiveOrigin(bearer.origin as never)) continue;
    push(
      finding(DIAGNOSTIC_CODES.FORBIDDEN_LIVE_ORIGIN, "error", "forbiddenLiveOrigin",
        { artifact: bearer.name, origin: bearer.origin },
        { artifactId: bearer.id, artifactPath: bearer.path }),
    );
  }

  // Deterministic order: severity first, then code, then path, then line. Two
  // runs over the same project must produce the same list in the same order.
  const severityRank = { error: 0, warning: 1, info: 2 } as const;
  findings.sort((a, b) =>
    severityRank[a.severity] - severityRank[b.severity] ||
    (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) ||
    ((a.artifactPath ?? "") < (b.artifactPath ?? "") ? -1 : (a.artifactPath ?? "") > (b.artifactPath ?? "") ? 1 : 0) ||
    (a.line ?? 0) - (b.line ?? 0) ||
    ((a.symbolName ?? "") < (b.symbolName ?? "") ? -1 : (a.symbolName ?? "") > (b.symbolName ?? "") ? 1 : 0),
  );

  const passedCodes = (Object.values(DIAGNOSTIC_CODES) as DiagnosticCode[])
    .filter((code) => !fired.has(code))
    .sort();

  return {
    runAtEpochMs: nowEpochMs,
    findings,
    checkedArtifacts: project.artifacts.length,
    checkedSymbols: index.symbolCount,
    checkedReferences: index.referenceCount,
    passedCodes,
  };
}

export function countBySeverity(run: ValidationRun): { error: number; warning: number; info: number } {
  const out = { error: 0, warning: 0, info: 0 };
  for (const f of run.findings) out[f.severity] += 1;
  return out;
}
