// PHASE 94 — deterministic engineering analysis rules.
//
// ADVISORY ONLY. Every rule returns a DESCRIPTION of something observed in the
// imported metadata plus a human-readable recommendation. No rule emits a
// command, an address change, a tag mutation or any executable instruction —
// there is no code path from a finding to a device. Findings whose subject
// touches safety or production carry `humanApprovalRequired: true`.
//
// DETERMINISM. Rules are pure functions of the parsed envelope. They read no
// clock, no random source and no environment. The same envelope always yields
// the same findings in the same order, so a re-analysis is idempotent and the
// (projectId, ruleId, artifactRef) uniqueness constraint holds.

import {
  KNOWN_DATA_TYPES,
  normalizeIdentifier,
  type EnvelopeTag,
  type ImportEnvelope,
} from "./import-envelope";

export type FindingSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ArtifactType = "PROJECT" | "DEVICE" | "TAG" | "ALARM" | "NETWORK_NODE";

export interface Finding {
  ruleId: string;
  ruleVersion: string;
  category: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  artifactType: ArtifactType;
  /** Identity of the offending artifact — a normalized name, never a value. */
  artifactRef: string;
  evidenceRefs: string[];
  recommendation: string;
  humanApprovalRequired: boolean;
}

/** Every rule ships at this version until its logic changes. */
export const RULE_VERSION = "1.0";

export const RULE_IDS = [
  "OT-TAG-DUPLICATE-NAME",
  "OT-TAG-DUPLICATE-ADDRESS",
  "OT-TAG-MISSING-DESCRIPTION",
  "OT-TAG-MISSING-UNIT",
  "OT-TAG-INVALID-TYPE",
  "OT-ALARM-NO-CONDITION",
  "OT-ALARM-DUPLICATE-CODE",
  "OT-ALARM-CRITICAL-NO-MESSAGE",
  "OT-DEVICE-UNREFERENCED",
  "OT-NET-DUPLICATE-ADDRESS",
  "OT-NET-ZONE-CONFLICT",
  "OT-DEVICE-MISSING-METADATA",
  "OT-DEVICE-UNLINKED-ASSET",
  "OT-PROJECT-STALE-REVISION",
  "OT-PROJECT-DUPLICATE-CHECKSUM",
  "OT-TAG-WRITABLE-IN-READONLY",
  "OT-SAFETY-REVIEW-REQUIRED",
  "OT-PROJECT-UNSUPPORTED-PLATFORM",
  "OT-NAME-MALFORMED",
  "OT-PROJECT-NO-REVISION",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** Context the engine cannot derive from the envelope alone. */
export interface AnalysisContext {
  /** Import profile: a read-only profile must not carry writable tags. */
  readOnlyProfile: boolean;
  /** Revision of the newest project already stored under this identity. */
  latestKnownRevision?: number;
  /** True when this exact checksum was already imported for the tenant. */
  checksumAlreadySeen?: boolean;
  /** engineeringIds that resolved to an existing IndustrialAsset. */
  linkedDeviceRefs?: ReadonlySet<string>;
}

const VENDOR_PLATFORMS: Record<string, readonly string[]> = {
  SIEMENS: ["TIA PORTAL", "STEP 7", "WINCC", "PCS 7"],
  ROCKWELL: ["STUDIO 5000", "RSLOGIX", "FACTORYTALK"],
  SCHNEIDER: ["ECOSTRUXURE", "UNITY PRO", "CONTROL EXPERT"],
  BECKHOFF: ["TWINCAT"],
  ABB: ["AUTOMATION BUILDER", "800XA"],
  MITSUBISHI: ["GX WORKS"],
  OMRON: ["SYSMAC STUDIO"],
};

/** Analogue types that should carry an engineering unit. */
const ANALOGUE_TYPES = new Set(["REAL", "LREAL", "INT", "DINT", "UINT", "UDINT", "SINT", "LINT"]);

const MALFORMED_NAME = /[^\p{L}\p{N}_\-./: ]/u;
const MAX_SANE_NAME = 128;

const isSafety = (v: string) => v === "SAFETY_RELATED" || v === "SAFETY_CRITICAL";

function finding(f: Finding): Finding {
  return f;
}

/**
 * Group by an identity key, returning only the groups with more than one member.
 */
function duplicates<T>(items: T[], key: (t: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null || k === "") continue;
    const bucket = groups.get(k);
    if (bucket) bucket.push(item);
    else groups.set(k, [item]);
  }
  for (const [k, v] of groups) if (v.length < 2) groups.delete(k);
  return groups;
}

/**
 * Run every Phase 94 rule. Pure: same envelope + context → same findings.
 * Output is sorted by (ruleId, artifactRef) so ordering is stable across runs.
 */
export function analyzeEnvelope(env: ImportEnvelope, ctx: AnalysisContext): Finding[] {
  const out: Finding[] = [];
  const V = RULE_VERSION;

  /* ── Tags ──────────────────────────────────────────────────────────────── */

  for (const [key, group] of duplicates(env.tags, (t) => normalizeIdentifier(t.name))) {
    out.push(finding({
      ruleId: "OT-TAG-DUPLICATE-NAME", ruleVersion: V, category: "TAG_INTEGRITY",
      severity: "HIGH", title: "Duplicate symbolic tag name",
      description: `${group.length} tags share the symbolic identity "${key}" within this project. Duplicate symbols make address resolution ambiguous.`,
      artifactType: "TAG", artifactRef: key,
      evidenceRefs: group.map((t) => t.sourceReference ?? t.name),
      recommendation: "Confirm in the engineering tool which symbol is authoritative and rename the duplicates at source, then re-export.",
      humanApprovalRequired: true,
    }));
  }

  for (const [addr, group] of duplicates(env.tags, (t) => t.address?.trim().toUpperCase() ?? null)) {
    const names = group.map((t) => normalizeIdentifier(t.name));
    out.push(finding({
      ruleId: "OT-TAG-DUPLICATE-ADDRESS", ruleVersion: V, category: "TAG_INTEGRITY",
      severity: group.some((t) => isSafety(t.safetyClass)) ? "CRITICAL" : "HIGH",
      title: "Duplicate logical address",
      description: `${group.length} tags declare the same logical address. Overlapping addresses can alias unrelated process values.`,
      artifactType: "TAG", artifactRef: addr,
      evidenceRefs: names,
      recommendation: "Verify the address map in the engineering project. Aliasing is occasionally intentional (multi-symbol overlays) — confirm before changing anything.",
      humanApprovalRequired: true,
    }));
  }

  for (const t of env.tags) {
    const ref = normalizeIdentifier(t.name);
    const critical = isSafety(t.safetyClass) || t.accessMode === "READ_WRITE" || t.accessMode === "WRITE";

    if (critical && !t.description?.trim()) {
      out.push(finding({
        ruleId: "OT-TAG-MISSING-DESCRIPTION", ruleVersion: V, category: "DOCUMENTATION",
        severity: isSafety(t.safetyClass) ? "MEDIUM" : "LOW",
        title: "Engineering-critical tag has no description",
        description: "This tag is safety-related or writable but carries no description, so its intent cannot be verified from the export alone.",
        artifactType: "TAG", artifactRef: ref, evidenceRefs: [t.sourceReference ?? ref],
        recommendation: "Add a description in the engineering tool so downstream reviewers can confirm the tag's purpose.",
        humanApprovalRequired: false,
      }));
    }

    const declaredType = t.dataType.trim().toUpperCase();
    if (ANALOGUE_TYPES.has(declaredType) && !t.unit?.trim()) {
      out.push(finding({
        ruleId: "OT-TAG-MISSING-UNIT", ruleVersion: V, category: "DOCUMENTATION",
        severity: "LOW", title: "Analogue tag has no engineering unit",
        description: `Tag declares the analogue type ${declaredType} but no engineering unit, so its scale is ambiguous.`,
        artifactType: "TAG", artifactRef: ref, evidenceRefs: [t.sourceReference ?? ref],
        recommendation: "Record the engineering unit (e.g. bar, °C, rpm) in the source project.",
        humanApprovalRequired: false,
      }));
    }

    if (!(KNOWN_DATA_TYPES as readonly string[]).includes(declaredType)) {
      out.push(finding({
        ruleId: "OT-TAG-INVALID-TYPE", ruleVersion: V, category: "TAG_INTEGRITY",
        severity: "MEDIUM", title: "Unsupported data type",
        description: "The declared data type is not one Hermes recognises, so type-aware analysis is skipped for this tag.",
        artifactType: "TAG", artifactRef: ref, evidenceRefs: [declaredType],
        recommendation: "Confirm the type against the controller's type system; a vendor-specific alias may need mapping.",
        humanApprovalRequired: false,
      }));
    }

    if (ctx.readOnlyProfile && (t.accessMode === "WRITE" || t.accessMode === "READ_WRITE")) {
      out.push(finding({
        ruleId: "OT-TAG-WRITABLE-IN-READONLY", ruleVersion: V, category: "SAFETY_POSTURE",
        severity: "HIGH", title: "Writable tag inside a read-only import profile",
        description: "The export declares this tag as writable while the import profile is read-only. Hermes never writes to devices; this is flagged so the mismatch is reviewed at source.",
        artifactType: "TAG", artifactRef: ref, evidenceRefs: [t.accessMode],
        recommendation: "Confirm the intended access mode in the engineering project. Hermes will not, and cannot, write this tag.",
        humanApprovalRequired: true,
      }));
    }

    if (t.name.length > MAX_SANE_NAME || MALFORMED_NAME.test(t.name)) {
      out.push(finding({
        ruleId: "OT-NAME-MALFORMED", ruleVersion: V, category: "NAMING",
        severity: "LOW", title: "Malformed or excessively long engineering name",
        description: "The name exceeds the supported length or contains characters outside the engineering-identifier set.",
        artifactType: "TAG", artifactRef: ref, evidenceRefs: [String(t.name.length)],
        recommendation: "Normalise the identifier in the source project to keep cross-tool references reliable.",
        humanApprovalRequired: false,
      }));
    }
  }

  /* ── Alarms ────────────────────────────────────────────────────────────── */

  for (const [code, group] of duplicates(env.alarms, (a) => normalizeIdentifier(a.code))) {
    out.push(finding({
      ruleId: "OT-ALARM-DUPLICATE-CODE", ruleVersion: V, category: "ALARM_INTEGRITY",
      severity: "HIGH", title: "Duplicate alarm code",
      description: `${group.length} alarm definitions share the code "${code}". Operators cannot distinguish them in an alarm list.`,
      artifactType: "ALARM", artifactRef: code,
      evidenceRefs: group.map((a) => a.sourceReference ?? a.code),
      recommendation: "Assign unique alarm codes in the engineering project before the next export.",
      humanApprovalRequired: true,
    }));
  }

  for (const a of env.alarms) {
    const ref = normalizeIdentifier(a.code);
    if (!a.conditionReference?.trim()) {
      out.push(finding({
        ruleId: "OT-ALARM-NO-CONDITION", ruleVersion: V, category: "ALARM_INTEGRITY",
        severity: "MEDIUM", title: "Alarm has no source condition reference",
        description: "The alarm carries no reference to the condition that raises it, so its trigger cannot be traced.",
        artifactType: "ALARM", artifactRef: ref, evidenceRefs: [a.sourceReference ?? ref],
        recommendation: "Export the alarm together with its condition reference so the trigger logic stays traceable.",
        humanApprovalRequired: false,
      }));
    }
    if ((a.severity === "CRITICAL" || a.severity === "HIGH") && (a.message ?? "").trim().length < 3) {
      out.push(finding({
        ruleId: "OT-ALARM-CRITICAL-NO-MESSAGE", ruleVersion: V, category: "ALARM_INTEGRITY",
        severity: "HIGH", title: "High-severity alarm has no meaningful message",
        description: "A high-severity alarm carries no operator-readable message, so the operator response cannot be determined from the alarm alone.",
        artifactType: "ALARM", artifactRef: ref, evidenceRefs: [a.severity],
        recommendation: "Provide an operator message describing the condition and the expected response.",
        humanApprovalRequired: true,
      }));
    }
  }

  /* ── Devices ───────────────────────────────────────────────────────────── */

  const referencedDevices = new Set<string>();
  for (const t of env.tags) if (t.deviceRef) referencedDevices.add(normalizeIdentifier(t.deviceRef));
  for (const a of env.alarms) if (a.deviceRef) referencedDevices.add(normalizeIdentifier(a.deviceRef));
  for (const n of env.networkNodes) if (n.deviceRef) referencedDevices.add(normalizeIdentifier(n.deviceRef));

  for (const d of env.devices) {
    const ref = normalizeIdentifier(d.engineeringId);

    if (!referencedDevices.has(ref)) {
      out.push(finding({
        ruleId: "OT-DEVICE-UNREFERENCED", ruleVersion: V, category: "PROJECT_STRUCTURE",
        severity: "LOW", title: "Device is not referenced by any project artifact",
        description: "No tag, alarm or network node in this project references the device, so it may be an orphaned export entry.",
        artifactType: "DEVICE", artifactRef: ref, evidenceRefs: [d.name],
        recommendation: "Confirm whether the device belongs to this project scope.",
        humanApprovalRequired: false,
      }));
    }

    if (!d.model?.trim() || !d.firmwareVersion?.trim()) {
      const missing = [!d.model?.trim() && "model", !d.firmwareVersion?.trim() && "firmware"]
        .filter(Boolean).join(" and ");
      out.push(finding({
        ruleId: "OT-DEVICE-MISSING-METADATA", ruleVersion: V, category: "DOCUMENTATION",
        severity: isSafety(d.safetyClass) ? "MEDIUM" : "LOW",
        title: "Device metadata incomplete",
        description: `The device declares no ${missing}, which limits obsolescence and vulnerability assessment.`,
        artifactType: "DEVICE", artifactRef: ref, evidenceRefs: [d.category],
        recommendation: "Record the device model and firmware revision in the engineering project.",
        humanApprovalRequired: false,
      }));
    }

    if (ctx.linkedDeviceRefs && !ctx.linkedDeviceRefs.has(ref)) {
      out.push(finding({
        ruleId: "OT-DEVICE-UNLINKED-ASSET", ruleVersion: V, category: "ASSET_ALIGNMENT",
        severity: "LOW", title: "Device is not linked to an asset-registry entry",
        description: "This engineering device has no counterpart in the asset registry, so maintenance and telemetry context cannot be correlated.",
        artifactType: "DEVICE", artifactRef: ref, evidenceRefs: [d.name],
        recommendation: "Link the device to its asset-registry entry to correlate engineering metadata with maintenance history.",
        humanApprovalRequired: false,
      }));
    }

    if (isSafety(d.safetyClass)) {
      out.push(finding({
        ruleId: "OT-SAFETY-REVIEW-REQUIRED", ruleVersion: V, category: "SAFETY_POSTURE",
        severity: d.safetyClass === "SAFETY_CRITICAL" ? "HIGH" : "MEDIUM",
        title: "Safety-related artifact requires human review",
        description: "This device is declared safety-related. Hermes performs no automated action on safety artifacts; a qualified engineer must review any change.",
        artifactType: "DEVICE", artifactRef: ref, evidenceRefs: [d.safetyClass],
        recommendation: "Route to a qualified functional-safety engineer. Hermes provides analysis only and never modifies safety configuration.",
        humanApprovalRequired: true,
      }));
    }
  }

  /* ── Network ───────────────────────────────────────────────────────────── */

  for (const [addr, group] of duplicates(env.networkNodes, (n) => n.address?.trim() ?? null)) {
    out.push(finding({
      ruleId: "OT-NET-DUPLICATE-ADDRESS", ruleVersion: V, category: "NETWORK_INTEGRITY",
      severity: "CRITICAL", title: "Duplicate network address",
      description: `${group.length} network nodes declare the same address. On a live segment this is an address conflict.`,
      artifactType: "NETWORK_NODE", artifactRef: addr,
      evidenceRefs: group.map((n) => normalizeIdentifier(n.nodeName)),
      recommendation: "Verify the address plan. Hermes performs no network scanning — confirm against the commissioning documentation.",
      humanApprovalRequired: true,
    }));
  }

  const deviceZone = new Map(env.devices.map((d) => [normalizeIdentifier(d.engineeringId), d.networkZone]));
  for (const n of env.networkNodes) {
    const ref = normalizeIdentifier(n.nodeName);
    if (!n.deviceRef) continue;
    const dz = deviceZone.get(normalizeIdentifier(n.deviceRef));
    if (dz && dz !== "UNKNOWN" && n.zone !== "UNKNOWN" && dz !== n.zone) {
      out.push(finding({
        ruleId: "OT-NET-ZONE-CONFLICT", ruleVersion: V, category: "NETWORK_INTEGRITY",
        severity: "HIGH", title: "Network node conflicts with its device zone",
        description: `The node declares zone ${n.zone} while its device declares ${dz}. Zone mismatches undermine segmentation assumptions.`,
        artifactType: "NETWORK_NODE", artifactRef: ref, evidenceRefs: [n.zone, dz],
        recommendation: "Reconcile the zone assignment with the plant segmentation model before relying on it for security analysis.",
        humanApprovalRequired: true,
      }));
    }
  }

  /* ── Project ───────────────────────────────────────────────────────────── */

  const projectRef = normalizeIdentifier(env.project.name);

  if (env.project.revision === undefined) {
    out.push(finding({
      ruleId: "OT-PROJECT-NO-REVISION", ruleVersion: V, category: "PROJECT_STRUCTURE",
      severity: "MEDIUM", title: "Project declares no revision identifier",
      description: "Without a revision, successive exports cannot be ordered and drift cannot be detected.",
      artifactType: "PROJECT", artifactRef: projectRef, evidenceRefs: [env.sourceType],
      recommendation: "Include the engineering revision in every export.",
      humanApprovalRequired: false,
    }));
  } else if (ctx.latestKnownRevision !== undefined && env.project.revision < ctx.latestKnownRevision) {
    out.push(finding({
      ruleId: "OT-PROJECT-STALE-REVISION", ruleVersion: V, category: "PROJECT_STRUCTURE",
      severity: "MEDIUM", title: "Imported revision is older than the stored revision",
      description: `Revision ${env.project.revision} is older than the stored revision ${ctx.latestKnownRevision}; this import may reintroduce superseded metadata.`,
      artifactType: "PROJECT", artifactRef: projectRef,
      evidenceRefs: [String(env.project.revision), String(ctx.latestKnownRevision)],
      recommendation: "Confirm the intended revision before treating this import as current.",
      humanApprovalRequired: true,
    }));
  }

  if (ctx.checksumAlreadySeen) {
    out.push(finding({
      ruleId: "OT-PROJECT-DUPLICATE-CHECKSUM", ruleVersion: V, category: "PROJECT_STRUCTURE",
      severity: "INFO", title: "Identical project content already imported",
      description: "The canonical content of this export matches an existing import, so it introduces no new engineering information.",
      artifactType: "PROJECT", artifactRef: projectRef, evidenceRefs: [],
      recommendation: "No action required. Re-import only if the previous record was rejected.",
      humanApprovalRequired: false,
    }));
  }

  const vendorKey = (env.project.vendor ?? "").trim().toUpperCase();
  const platform = (env.project.platform ?? "").trim().toUpperCase();
  if (vendorKey && platform) {
    const known = VENDOR_PLATFORMS[vendorKey];
    if (!known || !known.some((p) => platform.includes(p))) {
      out.push(finding({
        ruleId: "OT-PROJECT-UNSUPPORTED-PLATFORM", ruleVersion: V, category: "PROJECT_STRUCTURE",
        severity: "LOW", title: "Unrecognised vendor/platform combination",
        description: "Hermes does not recognise this vendor and engineering platform pairing, so platform-specific analysis is not applied.",
        artifactType: "PROJECT", artifactRef: projectRef, evidenceRefs: [vendorKey, platform],
        recommendation: "Confirm the vendor and platform names; unrecognised platforms still import, with generic analysis only.",
        humanApprovalRequired: false,
      }));
    }
  }

  if (env.project.name.length > MAX_SANE_NAME || MALFORMED_NAME.test(env.project.name)) {
    out.push(finding({
      ruleId: "OT-NAME-MALFORMED", ruleVersion: V, category: "NAMING",
      severity: "LOW", title: "Malformed or excessively long project name",
      description: "The project name exceeds the supported length or contains unsupported characters.",
      artifactType: "PROJECT", artifactRef: projectRef,
      evidenceRefs: [String(env.project.name.length)],
      recommendation: "Normalise the project name in the engineering tool.",
      humanApprovalRequired: false,
    }));
  }

  // Stable ordering: identical input always yields an identical sequence.
  out.sort((a, b) =>
    a.ruleId === b.ruleId
      ? a.artifactRef < b.artifactRef ? -1 : a.artifactRef > b.artifactRef ? 1 : 0
      : a.ruleId < b.ruleId ? -1 : 1,
  );

  // Collapse to one finding per (rule, artifact).
  //
  // Two rows can legitimately share an identity — that is precisely what
  // OT-TAG-DUPLICATE-NAME reports — so a per-row rule such as
  // OT-TAG-MISSING-UNIT would otherwise emit the same (ruleId, artifactRef)
  // twice. The store enforces @@unique([projectId, ruleId, artifactRef]), so an
  // un-deduplicated result would fail to persist and make re-analysis
  // non-idempotent. Sorting happens first, so the survivor is deterministic.
  const seen = new Set<string>();
  return out.filter((f) => {
    const key = `${f.ruleId}\u0000${f.artifactRef}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Severity tally for dashboards. */
export function summarizeFindings(findings: Finding[]): Record<FindingSeverity, number> {
  const out: Record<FindingSeverity, number> = { INFO: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const f of findings) out[f.severity] += 1;
  return out;
}

/** Tags whose declared access mode is not read-only. Reporting helper. */
export function writableTags(env: ImportEnvelope): EnvelopeTag[] {
  return env.tags.filter((t) => t.accessMode === "WRITE" || t.accessMode === "READ_WRITE");
}
