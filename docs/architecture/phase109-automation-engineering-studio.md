# Hermes Automation Engineering Studio — Product Contract (Phase 109-C)

> **Hermes Automation Engineering Studio complements vendor engineering tools.
> It does not claim to compile, download, certify, or replace TIA Portal.**

This document is the canonical contract for the Studio. Where a UI, a test or a
report disagrees with it, this document is wrong or they are — and one of the
two must change deliberately. It is not a marketing page and not a future-target
architecture sketch: every boundary below is enforced somewhere in code or in a
test, or is explicitly marked as not implemented.

---

## 1. Vision

Automation engineers spend a large share of a project not writing logic but
answering questions about logic that already exists: where is this tag written,
which HMI screen binds it, does this alarm have a priority, which block changed
since commissioning, what did the last reviewer object to. Vendor tools own the
compile-and-download path and will continue to. They are far weaker at the
cross-cutting, searchable, reviewable, multi-discipline view of a plant project.

The Studio is that view. It is a fast engineering environment for PLC, SCL,
SCADA and HMI projects that makes a project **legible**: symbols and their real
references, diagnostics with stable codes, versions with explicit approval
state, and provenance on every artifact. It sits beside TIA Portal, not on top
of it and not in front of it.

## 2. User roles

| Role | Capability in the Studio |
|---|---|
| Automation engineer | full authoring inside a `draft` version; owns approval |
| Reviewer | reads any version, records findings, cannot author |
| Commissioning engineer | reads `approved` and `commissioned` versions |
| Operations viewer | read-only project overview and diagnostics |

Role resolution reuses the platform's existing RBAC
(`isAuthorizedForPath` → `canAccessEngineering`). The Studio introduces no role,
no guard and no session concept of its own.

## 3. Core workflows

1. **Orient** — open a project, read its overview, see mode and provenance.
2. **Navigate** — move through the project tree to a block, screen or tag.
3. **Read logic** — view a program block with line numbers and diagnostics.
4. **Trace a symbol** — find its declaration, every read, every write, and every
   HMI/SCADA/alarm binding.
5. **Validate** — run deterministic checks and work the findings list.
6. **Review** — read advisory findings, accept or reject them as the engineer.
7. **Version** — compare against the baseline and see what changed.

## 4. Product boundaries

### 4.1 TIA Portal boundary

| Capability | Status |
|---|---|
| TIA compile | **NOT IMPLEMENTED** |
| PLC download | **NOT IMPLEMENTED** |
| Online write | **NOT IMPLEMENTED** |
| Live device connection | **NOT IMPLEMENTED** |
| TIA Openness | **FUTURE ADAPTER** |
| LAD/FBD graphical editing | **FUTURE PHASE** |

No surface in the Studio may present a control that implies any of the first
four exist. A disabled button labelled "Download to PLC" is worse than no
button: it implies the capability is one permission away. Round 1 therefore does
not render these commands at all.

### 4.2 Siemens interoperability boundary

The Studio names controller families and file formats factually, as any
interoperability documentation must. It does **not** use Siemens marks, logos or
product artwork, and it does not describe itself as endorsed by, certified by,
affiliated with or a component of any vendor product. Where a vendor name is
unavoidable it appears as a plain-text technical descriptor.

### 4.3 AI Advisory — Engineer Authority

AI output in the Studio is **advisory and draft-only**. It is never applied,
never auto-committed, and never presented as a verified result. Every AI surface
carries, in text and in the accessibility tree:

- `AI-generated advisory`
- `Engineer approval required`
- `No change has been applied`

**Engineering authority remains with the authorized engineer.** In Round 1 the
AI Review panel renders deterministic, local, demo findings and performs **no
provider call of any kind**.

### 4.4 Simulated / live boundary

Round 1 is a simulation workspace. The UI states, in every locale:

- Simulation workspace
- No live controller is connected
- Changes are not downloaded to any device

### 4.5 Read / write command boundary

The Studio may read project artifacts and write only to its own in-memory
working version. It may not write to a device, a historian, a controller, or any
industrial endpoint. `/api/industrial/telemetry` is not called. `/api/telemetry`
does not exist and is not reintroduced.

## 5. Security model

- The route is authenticated and fail-closed via existing middleware.
- No secret reaches the client bundle.
- No external request, no telemetry beacon, no analytics call.
- Artifact paths are normalised and validated; traversal segments are rejected.
- All project text renders as plain text. No `dangerouslySetInnerHTML`, no
  `eval`, no `new Function`.
- Project size, tree depth and node count are bounded.
- Search input is length-bounded and matched literally, never compiled into a
  regular expression.
- Imported artifacts are inert data in Round 1: nothing imported is executed.

## 6. Provenance model

Every artifact carries a `ProvenanceRecord`: its `DataOrigin`, who last modified
it, when, and a content checksum. An artifact without provenance is a validation
finding (`AES-C1-009`), not a silently accepted object.

## 7. Artifact model

An `EngineeringArtifact` has a stable identifier, a normalised path, a kind, a
version, a checksum, modification metadata and provenance. Identifiers are
stable across sessions because they are derived from the project definition, not
from array position or render order.

Domain values carry raw instants (`epochMs`) and locale-independent data.
Formatting is a presentation concern and never enters the domain.

## 8. Performance budgets (Round 1)

| Budget | Target |
|---|---|
| Synchronous work in render | none beyond memoised selection |
| Symbol search, 50 000 synthetic symbols | p95 < 200 ms in the test environment |
| Validation over 10 000 references | documented budget, measured |
| Large lists | virtualizable architecture (flat, indexable model) |
| Full-project rescan per keystroke | forbidden |
| Horizontal page overflow | zero at 320, 390, 1024, 1440 |

Timings are hardware-dependent; measured numbers are reported with their
environment and never as absolute guarantees.

## 9. Accessibility requirements

One `h1`; correct landmarks; a real ARIA `tree`/`treeitem` pattern with roving
focus; correct `tablist`/`tab`/`tabpanel`; visible focus; skip link; every icon
button named; diagnostics distinguishable without colour; status conveyed in
text; the editor surface labelled; live regions only where content genuinely
changes; `prefers-reduced-motion` honoured; no nested interactive elements; no
unnamed control.

## 10. Internationalisation requirements

EN, DE and FA are first-class. `lang` and `dir` are correct per locale. Persian
renders RTL. **SCL source, line numbers and symbol identifiers always render
LTR**, inside an RTL page, without bidirectional reordering. No visible string
is hard-coded outside the catalogue.

## 11. Phase roadmap

| Stage | Objective |
|---|---|
| **C1** | Foundation: contract, domain model, deterministic demo adapter, symbol index, validation engine, workspace shell, EN/DE/FA. Simulation only. |
| C2 | Editor decision (dependency + CSP), real syntax service, diff view. |
| C3 | Import adapters: read-only project ingest, format fidelity, large-project performance. |
| C4 | Review workflow: findings lifecycle, reviewer roles, approval transitions, audit trail. |
| C5 | Persistence: schema, migrations, tenant isolation, versioning at rest. |
| C6 | Interoperability adapter surface (TIA Openness class), still read-oriented. |

## 12. Non-goals

Replacing TIA Portal. Compiling. Downloading. Going online. Forcing variables.
Certifying safety functions. Being a general-purpose IDE. Autonomous AI changes.

## 13. Acceptance criteria (Round 1)

1. Route authenticated and fail-closed; anonymous access redirects.
2. Simulated disclosure present in the DOM and the accessibility tree in all
   three locales.
3. No live origin selectable; live origins fail closed.
4. Symbol index resolves every sentinel symbol with exact references.
5. Validation produces stable `AES-C1-0xx` codes and is pure.
6. Zero network requests from the Studio.
7. Zero unnamed controls; one `h1`; correct tree and tab semantics.
8. Zero horizontal overflow at 320/390/1024/1440 in EN/DE/FA.
9. No claim of compile, download or live connection anywhere.

## 14. Threat model summary

| Threat | Mitigation |
|---|---|
| Malicious artifact name | plain-text render; no HTML interpretation |
| Script injection via comments | plain-text render; no `dangerouslySetInnerHTML` |
| Path traversal in artifact path | normalisation + rejection of `..` and absolute paths |
| Oversized project | bounded node count, depth and source length |
| Catastrophic search input | bounded input length; literal matching, no regex compilation |
| Unauthorized route access | existing fail-closed middleware |
| Origin confusion (simulated vs live) | closed union; live origins rejected in Round 1 |
| Stale approval | approval state is explicit; non-draft versions are read-only |
| Hidden write capability | no write path exists; no industrial endpoint is called |
| Command spoofing | commands are a closed, typed registry; unavailable ones are absent |

## 15. Glossary

**SCL** Structured Control Language, a textual PLC language.
**OB / FB / FC / DB** organisation block, function block, function, data block.
**UDT** user-defined type.
**HMI** human-machine interface.
**SCADA** supervisory control and data acquisition.
**Faceplate** reusable HMI control element bound to a device type.
**Interlock** condition preventing an action for safety or process reasons.
**Permissive** condition that must be true before an action may start.
**Provenance** the recorded origin and authorship of an artifact.
**Simulated** generated locally for demonstration; never from a device.
