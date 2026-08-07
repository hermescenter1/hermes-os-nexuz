# Changelog

All notable changes to Hermes OS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(`vMAJOR.MINOR.PATCH`). The official `v1.0.0` GA tag is reserved for a later phase
and is intentionally NOT declared here.

## [Unreleased]

### Added
- **Phase 98 — Full-Stack Disaster Recovery & Release Engineering.**
  - Encrypted PostgreSQL backups: AES-256-GCM authenticated envelope (`.hbk`,
    format v1) with a versioned, AAD-authenticated header; key supplied via an
    owner-only key **file** (`HERMES_BACKUP_KEY_FILE` + non-secret
    `HERMES_BACKUP_KEY_ID`). Streaming CLI `scripts/dr/hbk.mjs`.
  - Encrypted, multi-root uploads backup covering both durable surfaces
    (`/app/public/uploads` and `/app/.data/documents`) with per-file and manifest
    SHA-256 and strict path-safety.
  - Verification-aware retention that never prunes the last verified recovery point
    and never treats a partial/unverified artifact as a restore target.
  - Configuration inventory (`docs/release/phase98-configuration-inventory.json`,
    secret-free) with an offline validator; recovery set; recovery ownership matrix.
  - Migration release gate (SQL classification + historical-mutation detection +
    pre-migration backup requirement) and migration rollback classification.
  - Release manifest, release-state journal, SemVer + changelog validators, and a
    blue/green (app-only) rollout state machine with deterministic rollback.
  - Offline assurance `npm run eval:phase98` and real PostgreSQL/Docker rehearsals.

### Changed
- `scripts/backup-postgres.sh` / `scripts/restore-postgres.sh` now produce/consume
  the encrypted `.hbk` artifact and fail closed when the verifier or key is
  unavailable. The previous plaintext `.dump` durable artifact is superseded.

### Fixed
- Resolved a Next.js dynamic-route slug conflict that broke the standalone
  production server at runtime (500 on every route, including `/api/health`). The
  authenticated legal-document management routes moved from
  `/api/compliance/legal-documents/[id]` to
  `/api/compliance/legal-documents/entries/[id]` (and `/entries/[id]/accept`), so a
  differently-named dynamic sibling no longer coexists with the public
  `/api/compliance/legal-documents/[type]` endpoint (which is unchanged). Surfaced
  by the Phase 98 full-node recovery rehearsal — the first assurance step to boot
  the standalone image.

### Security
- Backups are encrypted at rest; the backup key is never committed, logged, or
  placed in any manifest. Restore authenticates (GCM) before any database mutation.

### Operational
- Added an additive `documents_data` volume for `/app/.data/documents` so uploaded
  documents and compliance export packages persist across container rebuilds.

### Migration notes
- No database schema migration is introduced by Phase 98.

### Recovery notes
- Redis is recovered by `REBUILD_FROM_AUTHORITATIVE_STATE` and is not part of RPO.
- System RPO and RTO are documented in `docs/release/disaster-recovery-runbook.md`.
