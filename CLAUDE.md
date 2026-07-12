# Hermes OS — Claude Code Project Instructions

## Project Identity

Project: Hermes OS / Hermes Novin Mehr IRIC  

Repository: hermes-os-nexuz  

Primary local path: E:\hermes-os-nexuz  

Production domain: https://www.hermesnovin.com

Hermes OS is an enterprise industrial intelligence platform for PLC,

SCADA, HMI, OPC UA, MQTT, industrial knowledge management, engineering

case management, predictive maintenance, digital twins, time-series

analytics, multi-site intelligence and enterprise SaaS management.

## Technology Stack

- Next.js App Router

- React

- TypeScript

- Tailwind CSS

- next-intl

- Prisma

- PostgreSQL

- Redis

- Docker Compose

- Nginx

- Zod

- TanStack Query

- Vitest or Jest where configured

Do not introduce a new framework, database, ORM, authentication system,

state-management library or UI framework unless explicitly requested.

## Communication

- Respond to the project owner in Persian.

- Write source code, identifiers, types, database fields, technical comments

   and commit messages in English.

- Explain important technical decisions clearly.

- Never claim that a command, test or build passed unless it was actually run.

- Clearly report errors, incomplete work and remaining risks.

## Required Working Process

Before modifying files:

1. Inspect the relevant implementation and existing architecture.

2. Run `git status` and inspect the current diff.

3. Identify dependencies, security boundaries and regression risks.

4. Present a concise implementation plan.

5. Keep changes limited to the requested scope.

During implementation:

1. Follow existing repository patterns.

2. Prefer small, reversible and reviewable changes.

3. Preserve backward compatibility unless explicitly approved otherwise.

4. Do not duplicate existing utilities, components or business logic.

5. Do not replace working implementations with placeholders.

6. Do not silently remove existing features.

7. Do not weaken security checks to make tests pass.

8. Avoid TypeScript `any` unless technically necessary and documented.

9. Do not suppress TypeScript or ESLint errors without justification.

10. Do not add fake data to production paths.

After implementation:

1. Review the complete diff.

2. Run relevant validation commands.

3. Report every modified file.

4. Report every validation command actually executed.

5. Report passed and failed tests accurately.

6. Report remaining risks and follow-up work.

7. Do not commit or push unless explicitly instructed.

## Validation

Use only scripts that actually exist in package.json.

Preferred validation sequence:

- `npm run lint`

- `npm run typecheck`

- `npm run test`

- `npm run build`

When Prisma files change, also run:

- `npx prisma format`

- `npx prisma validate`

- `npx prisma generate`

Never perform a destructive database operation without explicit approval.

## TypeScript and Next.js

- Preserve strict TypeScript compatibility.

- Prefer explicit domain types.

- Validate external input with Zod or the existing validation system.

- Avoid unsafe type assertions.

- Handle nullable database values explicitly.

- Follow Next.js App Router conventions.

- Preserve server and client component boundaries.

- Add `"use client"` only when client-side functionality is required.

- Keep secrets and privileged operations on the server.

- Preserve locale-prefixed routes under `/fa` and `/en`.

- Preserve Persian RTL and English LTR behavior.

- Avoid unnecessary client-side JavaScript.

## API Security

Every API route must enforce, where applicable:

- Authentication

- Organization membership

- Role and permission requirements

- Site-level access

- Input validation

- Tenant isolation

- Safe error responses

- Published-only visibility for public content

Never trust `organizationId`, `userId`, `siteId` or role values supplied

by clients.

Do not expose stack traces, database errors, secrets, unpublished records

or another organization's data.

Use 404 where exposing the existence of an inaccessible resource would

create an information leak.

## RBAC and Tenant Isolation

Hermes OS is multi-tenant.

Every data query and mutation must maintain:

- Organization isolation

- Site isolation

- Role-based access control

- Explicit permission checks

- Least-privilege access

- Auditability

Tenant filtering should occur at the database query level whenever possible.

Do not remove or bypass existing authorization helpers such as:

- `requireActor`

- `requirePermission`

- `requireSiteActor`

- `requireSitePermission`

Use the repository's current equivalents if these names have changed.

## Prisma and Database

- Inspect the current Prisma schema before changing models.

- Preserve existing relations and indexes.

- Use transactions for atomic multi-step writes.

- Avoid N+1 queries.

- Avoid unbounded list queries.

- Add pagination to potentially large datasets.

- Never edit an already-applied production migration.

- Create a new migration for schema changes.

- Explain migration and rollback implications.

- Never delete production data without explicit approval.

## Industrial Analysis

Industrial reasoning must remain:

- Deterministic where currently designed as deterministic

- Explainable

- Traceable to evidence

- Bilingual where required

- Safe for industrial use

- Explicit about uncertainty

Clearly distinguish observed data, derived calculations, engineering

assumptions, risks, recommendations and unknowns.

Never fabricate telemetry, measurements, evidence or plant conditions.

Do not silently convert deterministic modules into probabilistic behavior.

## Localization

For every visible UI change:

- Update both Persian and English translations.

- Preserve translation-key consistency.

- Preserve RTL and LTR layouts.

- Avoid hard-coded visible strings when translation infrastructure exists.

- Use Persian `ی` rather than Arabic `ي`.

- Use Persian `ک` rather than Arabic `ك`.

- Preserve correct ZWNJ usage.

## UI Design

Maintain the established Hermes visual language:

- Premium industrial interface

- Dark glassmorphism

- Ice-blue and cyan accents

- Strong readability

- Clear information hierarchy

- Responsive layouts

- Accessible controls

- Professional enterprise appearance

Do not redesign unrelated pages during a scoped task.

## Testing

Add or update tests when modifying:

- Authentication or authorization

- RBAC

- Organization or site isolation

- Public API exposure

- Database writes

- Billing

- Usage metering

- API keys

- Cases

- Knowledge articles

- Industrial calculations

- Critical UI workflows

Tests must verify behavior rather than merely implementation details.

Never weaken, skip or delete tests merely to produce a passing result.

## Git Safety

Treat destructive Git actions as prohibited unless the project owner

explicitly approves the exact action after receiving a clear impact explanation.

Never automatically:

- Discard working-tree changes

- Delete untracked files

- Rewrite branch history

- Force-push

- Delete branches

- Commit changes

- Push changes

Always show `git status` and the relevant diff before proposing a Git write action.

## Environment and Secrets

Never read, print, modify or expose:

- Environment files

- API keys

- OAuth tokens

- Database or Redis passwords

- SSH private keys

- TLS private keys

- Cloud credentials

- Payment credentials

- Session secrets

Use `.env.example` only to document required variable names.

Never insert real credentials into source code, documentation, tests,

logs, prompts or Git history.

## Docker and Production Safety

Treat Docker volume deletion, system pruning and destructive container

shutdown operations as prohibited unless explicitly approved after an

impact assessment.

Before changing Docker or Nginx:

- Inspect current services and ports.

- Preserve PostgreSQL and Redis data.

- Preserve named volumes.

- Preserve health checks.

- Preserve reverse-proxy behavior.

- Document rollback steps.

Do not change ports, firewall rules, SSH settings, TLS, DNS or proxy routing

unless explicitly included in the task.

## Scope Control

Only modify files required for the requested task.

Do not:

- Perform unrelated refactors

- Reformat the whole repository

- Rename public APIs unnecessarily

- Upgrade all dependencies during a feature task

- Change infrastructure while fixing UI

- Change authentication while fixing styling

- Delete apparently unused code without verifying usage

When uncertain, preserve existing behavior and report the uncertainty.

## Definition of Done

A task is complete only when:

- The requested behavior is implemented.

- Security boundaries remain intact.

- Type checking passes.

- Relevant tests pass.

- The production build passes when practical.

- No unrelated files are modified.

- The final diff is reviewed.

- Validation results are reported accurately.
