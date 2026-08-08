/**
 * Hermes OS — Phase 98 recovery ownership matrix.
 *
 * Roles only — never personal names or contact secrets. Every recovery-critical
 * component has a primary owner role, a backup owner role, the authority required
 * to act, a recovery procedure reference and an escalation reference. No item may
 * be OWNER=UNKNOWN (validated).
 */

export const RECOVERY_ROLES = [
  "Incident Commander",
  "Operations",
  "Platform/SRE",
  "Database recovery owner",
  "Application/release owner",
  "Upload recovery owner",
  "Configuration recovery owner",
  "OpenBao recovery owner",
  "DNS/TLS recovery owner",
  "Monitoring owner",
  "Final recovery verification owner",
];

/** @param {string} component @param {object} o */
function row(component, o) {
  return {
    component,
    primaryOwnerRole: o.primary,
    backupOwnerRole: o.backup,
    authorityRequired: o.authority,
    recoveryProcedure: o.procedure,
    escalationReference: o.escalation,
  };
}

export const OWNERSHIP_MATRIX = [
  row("PostgreSQL data", { primary: "Database recovery owner", backup: "Platform/SRE", authority: "Explicit operator confirmation (RESTORE_CONFIRM)", procedure: "docs/release/disaster-recovery-runbook.md#postgres", escalation: "Incident Commander" }),
  row("Uploads (public-uploads + data-documents)", { primary: "Upload recovery owner", backup: "Platform/SRE", authority: "Operator confirmation", procedure: "docs/release/disaster-recovery-runbook.md#uploads", escalation: "Incident Commander" }),
  row("Configuration / secrets", { primary: "Configuration recovery owner", backup: "Platform/SRE", authority: "Secret store access", procedure: "docs/release/phase98-configuration-inventory.json", escalation: "Incident Commander" }),
  row("Redis", { primary: "Platform/SRE", backup: "Application/release owner", authority: "None (rebuild from authoritative state)", procedure: "REBUILD_FROM_AUTHORITATIVE_STATE", escalation: "Incident Commander" }),
  row("Application / release", { primary: "Application/release owner", backup: "Platform/SRE", authority: "Manual production deploy (workflow_dispatch + protected env)", procedure: "docs/release/phase98-release-engineering-runbook.md", escalation: "Incident Commander" }),
  row("Backup encryption key", { primary: "Database recovery owner", backup: "Platform/SRE", authority: "Secret store access", procedure: "docs/release/disaster-recovery-runbook.md#key", escalation: "Incident Commander" }),
  row("OpenBao credential plane", { primary: "OpenBao recovery owner", backup: "Platform/SRE", authority: "OpenBao operator + unseal", procedure: "ops/openbao/RUNBOOK.md", escalation: "Incident Commander" }),
  row("DNS / TLS", { primary: "DNS/TLS recovery owner", backup: "Platform/SRE", authority: "DNS registrar + Certbot", procedure: "deploy/ssl/README.md", escalation: "Incident Commander" }),
  row("Monitoring", { primary: "Monitoring owner", backup: "Platform/SRE", authority: "Monitoring host access", procedure: "deploy/monitoring/README.md", escalation: "Incident Commander" }),
  row("Full-system recovery verification", { primary: "Final recovery verification owner", backup: "Incident Commander", authority: "Sign-off", procedure: "docs/release/phase98-release-checklist.md", escalation: "Incident Commander" }),
];

/** @returns {{ ok: boolean, errors: string[] }} */
export function validateOwnership(matrix = OWNERSHIP_MATRIX) {
  const errors = [];
  const known = new Set(RECOVERY_ROLES);
  for (const r of matrix) {
    for (const [field, val] of [
      ["primaryOwnerRole", r.primaryOwnerRole],
      ["backupOwnerRole", r.backupOwnerRole],
    ]) {
      if (!val || val === "UNKNOWN") errors.push(`RECOVERY_OWNER_UNASSIGNED: ${r.component}.${field}`);
      else if (!known.has(val)) errors.push(`unknown role '${val}' for ${r.component}.${field}`);
    }
    if (!r.authorityRequired) errors.push(`${r.component}: missing authorityRequired`);
    if (!r.recoveryProcedure) errors.push(`${r.component}: missing recoveryProcedure`);
    if (!r.escalationReference) errors.push(`${r.component}: missing escalationReference`);
  }
  return { ok: errors.length === 0, errors };
}
