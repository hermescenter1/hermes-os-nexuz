# Phase 95 — Human Approval & Industrial Safety Boundary

## Invariant

LLM output can never remove or downgrade a deterministic approval requirement,
safety classification, or evidence state. Enforced by `unsafe-output.ts`,
`output-schema.ts` (forbidden fields + immutable merge) and `router.ts`.

## Output classes (`src/lib/ai-governance/types.ts`)

INFORMATIONAL · DIAGNOSTIC · INSPECTION · MAINTENANCE · CONFIGURATION ·
OPERATIONAL · CONTROL_ACTION · SAFETY_RELATED · SIS_OR_SAFETY_PLC · DESTRUCTIVE ·
IRREVERSIBLE.

## Hard block (output withheld, status `BLOCKED`)

Any generated content instructing or facilitating: interlock/permissive bypass,
trip/alarm/E-stop override or disablement, SIS or Safety-PLC modification/download,
lockout-tagout defeat, energising without procedure, hazardous restart, protection
or VFD-safety changes. Detected multilingually (FA/EN/DE) via unsafe-verb ×
protected-function co-occurrence plus explicit phrases.

## Review required (status `REVIEW_REQUIRED`, `humanApprovalRequired=true`)

OPERATIONAL / CONTROL_ACTION / SAFETY_RELATED / SIS_OR_SAFETY_PLC / DESTRUCTIVE /
IRREVERSIBLE classes, or whenever the deterministic engine already requires
approval. Action-ready imperative text is not displayed; the deterministic
requirement is preserved (never downgraded by the model).

## Insufficient evidence

`evidence-sufficiency.ts` gates action-ready output by risk class. Below the
threshold the system lists missing evidence and safe data-collection steps and
does not express certainty — deterministic confidence is preserved.

## Boundary

`CONTROL_ACTION_POSSIBLE = False`. No AI or deterministic path can perform PLC
writes, control actions, or safety-system bypass (confirmed by the existing
read-only connector contract, envelope payload allow-list, and this phase's
hard-block policy + tests). Reuses the existing finding review workflow pattern
for approvals; a dedicated LLM-output approval binding is the documented follow-up.
