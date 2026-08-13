# Phase 102 — Hermes Media & Video Hub: Architecture Decision Record

Base: `origin/main` @ `cbfa292`. Worktree `E:\hermes-os-phase102`, branch
`agent/phase102-media-video-hub`.

`PHASE102_MERGE_AUTHORIZED=NO` · `PHASE102_DEPLOY_AUTHORIZED=NO`

This ADR is the design authority for Phase 102. It records what LOOP 0 discovery
proved about the existing platform, the decisions taken as a result, and — just as
importantly — **what Phase 102 deliberately does NOT build**, with the reason.

---

## 1. LOOP 0 verdict

**Phase 102 video functionality does not exist.** A declaration-level scan of the
7171-line schema found no Media / Video / Stream / Playlist / Caption / Transcript /
Chapter / Upload model or enum. Every `video`/`media`/`stream`/`duration` keyword hit
was either an unrelated false positive (ATS `VIDEO_CALL`, the `max-video-preview`
robots directive, Node streams, CSS media queries) or one of the two partials below.

The two genuine partials:

| Partial | Evidence | Phase 102 stance |
|---|---|---|
| `AcademyLesson.videoUrl String?` | `prisma/schema.prisma:2616-2638` | **Leave alone.** See §9. |
| `video_hub` entitlement key | `FEATURE("Video Hub", true)` | **Reuse** via `enforceEntitlement`. |

`video_hub` already exists as a commercial entitlement key with a working, audited
enforcement helper (`src/lib/billing-governance/runtime/require-entitlement.ts:33`,
four production call sites). Phase 102 adds the first call site that passes
`entitlementKey: "video_hub"` — it does not pioneer the pattern.

---

## 2. Hard ceilings discovered (these shape everything below)

These are facts about the deployed platform, not opinions. Each one removes an
option that a naive "video hub" design would assume.

1. **nginx caps every upload at 50 MB** — `deploy/nginx/default.conf:43`
   (`client_max_body_size 50M`), with `proxy_read_timeout`/`proxy_send_timeout` at
   300s. A larger file is rejected with a 413 *before Next.js sees the request*, so
   raising the app-layer limit alone is a silent no-op.
2. **There is no background job runner at all** — no queue library, no worker
   container, no cron, no `after()`. The Dockerfile runs one process.
   `WorkflowExecutionStatus { QUEUED … }` is a decoy: nothing dequeues it, and
   `src/lib/automation/engine.ts:138-161` only emits preview strings and fabricates
   `durationMs` with `Math.random()`.
3. **`ObjectStorage` cannot stream** — the interface is whole-buffer
   (`get(key): Promise<Buffer|null>`), and there is zero HTTP Range/206 support
   anywhere in `src/app/api`.
4. **`minio`/`s3` providers are a deliberate trap** — they construct fine but every
   method rejects, no SDK is installed, and falling back to local is explicitly
   forbidden (`object-storage.ts:127-132`).
5. **CSP blocks external video** — `default-src 'self'` with no `media-src`,
   `frame-src` allows only provenexpert, and `worker-src 'none'` breaks hls.js/dash.js
   worker mode (`src/middleware.ts:58-77`).
6. **No transcoder** — no ffmpeg; `sharp` is `overrides`-only, not a direct
   dependency, and importing it drags in the release-engineering CPU gate.
7. **`Document` is not a safe template** — it has no `organizationId` at all, only a
   legacy nullable `tenantId`, and its only indexes are on `status`/`sourceType`.

---

## 3. Decision: tenancy axis

**`MediaAsset` is organization-owned (`organizationId String`, non-null, `onDelete: Cascade`,
organization-leading index) and becomes publicly readable only when
`status = PUBLISHED AND visibility = PUBLIC`.**

Rationale. Three precedents exist and they disagree, so this had to be decided
explicitly rather than copied:

- `Article` is **deliberately global** with no tenant column — sanctioned for the
  public Journal, but it means org-owned media could not be managed or metered.
- `Document` has **no tenant column of the current convention** — copying it would
  fail the repo's own static invariants on day one.
- Phase 94–97 tables use **non-null `organizationId` + Cascade**, with nullable
  `siteId` + `SetNull`. This is the current convention and the one the enforced
  invariants (`prisma/__tests__/phase94-migration-safety.test.ts:106-118`) test for.

Org-ownership is what makes the `video_hub` entitlement meaningful and keeps every
management query tenant-bounded. Public visibility is then an explicit, auditable
publication act rather than an absence of scoping. Per-subject rows (`MediaSave`,
`MediaWatchProgress`, `MediaViewEvent`) also carry `organizationId` so tenant deletion
cascades cleanly and analytics scans stay bounded.

`siteId String?` with `onDelete: SetNull` is carried on `MediaAsset` so media can
optionally be scoped to an industrial site without losing the asset when a site is
removed.

---

## 4. Decision: self-hosted playback, no external embed

**Self-hosted, progressive playback with real HTTP Range/206 support.**

External embed (YouTube/Vimeo/CDN) is **BLOCKED_OWNER**: it requires a `frame-src`
CSP relaxation, which is production infrastructure under CLAUDE.md's Docker/Nginx
impact-assessment rule. Phase 102 does not touch `middleware.ts` CSP.

Adaptive streaming (HLS/DASH) is **BLOCKED_OWNER** twice over: it needs a transcoder
that does not exist, and `worker-src 'none'` breaks the player libraries that consume
it. Phase 102 **designs for** it (`MediaRendition` carries the shape) but does not
claim it.

What Phase 102 *does* build is honest and real: a `MediaRangeReader` extension to the
storage seam that reads a byte slice from disk with a stream instead of materialising
the whole object, plus a byte-serving route that answers `Range:` with `206 Partial
Content` + `Accept-Ranges: bytes` + `Content-Range`. That is what makes seeking work.

---

## 5. Decision: no fake queue

**Processing state advances via compare-and-swap `updateMany` + an operator-run CLI
in `scripts/`.** This is the repo's sanctioned substitute for a scheduler
(`scripts/audit-retention.mjs:9-11` states the phase does not schedule it; the DR
config inventory classifies even certbot's cron as `HOST_MANAGED`).

`MediaAsset.processingState` is `PENDING_UPLOAD | UPLOADED | VALIDATING | READY |
FAILED | QUARANTINED`. Transitions use the proven predicate form from
`src/lib/compliance/export-db.ts:145-148`, treating `affected !== 1` as a 409 — the
only concurrency primitive in this codebase that is multi-replica safe (there is no
leader election, advisory lock or scheduler singleton anywhere).

A Redis-backed queue is explicitly rejected: `scripts/dr/redis-recovery-policy.mjs:66-77`
would flip `REDIS_PERSISTENCE_DECISION` from `REBUILD_FROM_AUTHORITATIVE_STATE` to
`RECOVER_FROM_AOF_BACKUP` and fail the Phase 98 DR gate. A durable job queue is a
DR-policy amendment, not a feature detail.

`QUARANTINED` exists specifically because there is no virus scanner — it is the state
an asset sits in when validation cannot vouch for the bytes, so nothing is ever served
on the optimistic assumption that an unscanned file is safe.

---

## 6. Decision: `String` + CHECK, not new Prisma enums

Phases 96 and 97 stopped declaring Prisma enums for lifecycle vocabularies because
`ALTER TYPE … ADD VALUE` is append-only and `ALTER TYPE … DROP` is classified
`BREAKING_OR_UNKNOWN` by `scripts/dr/migration-sql-classify.mjs`, which blocks a deploy
outright. Phase 102 follows the current convention: `String` + an inline
`// A | B | C` comment in the schema + a hand-written `CHECK (… IN (…))` constraint in
the migration, matching `ComplianceEvidencePack_lifecycle_check` in
`20260820000017`.

Migration stamp: **`20260821000000_phase102_media_video_hub`** — strictly greater than
the current newest (`20260820000017_phase97_compliance_evidence_packs`), which
`prisma/__tests__/phase94-migration-safety.test.ts:238-240` enforces *in the default
`npm run test` suite*, not just in CI.

The migration will classify as `FORWARD_ONLY_REQUIRES_BACKUP` (it contains FKs and
unique indexes). That is expected and acceptable. What must never appear:
`DROP TABLE`/`DROP COLUMN`/`TRUNCATE`/`DELETE FROM`/`RENAME`/`ALTER … TYPE`.

---

## 7. Decision: upload security without new dependencies

The existing validators trust the client-declared MIME and even permit
`application/octet-stream`; there is no magic-byte check and no virus scanner.
Adding video extensions to the document allow-list would widen an already-unverified
surface, so Phase 102 keeps media on a **separate allow-list** and adds **in-repo
magic-byte sniffing** — a signature table for the container formats it accepts,
implemented with `Buffer` reads, no new package.

Bytes are routed through `getDocumentObjectStorage()` so the unexported `sanitizeKey`
path-traversal guard applies; Phase 102 does not hand-roll a second, weaker sanitiser.
Storage keys are **always server-generated** (`randomUUID`), never derived from a
client filename.

Media is written under the existing durable `documents_data` volume
(`/app/.data/documents`), **never** under `public/uploads/` — that path is served
statically and anonymously because the middleware matcher excludes any path containing
a dot, so no auth check and no CSP header applies there.

Every media upload route must satisfy the **comment-stripped regex gate** at
`scripts/security/phase99/static-invariants.mjs:390-394`: a route containing
`.formData(` must literally contain a size token, a type token, a filename token and
an auth token from its fixed vocabulary. A secure handler using differently-named
helpers still fails CI.

Uploads are rate-limited via `resolveClientIp` (X-Real-IP only — deriving a
rate-limit key from `X-Forwarded-For` is forbidden by the Phase 99 eval and is a live
bypass, since nginx overwrites `X-Real-IP` but not `XFF`).

---

## 8. Decision: privacy-aware analytics

`MediaViewEvent` mirrors `ArticleView`: it stores **`ipHash`, never a raw IP**, and
`userId` is nullable so anonymous plays are recorded without inventing an identity.
Aggregate counters (`viewCount`, `saveCount`, `completionCount`) are denormalised onto
`MediaAsset` exactly as `Article` does.

`MediaSave` and `MediaWatchProgress` **are subject-attributable**, so Phase 102 must
register them in the Phase 97 governed-export and erasure registries and bump
`ERASURE_REGISTRY_VERSION`. This is a real, deliberate consequence: the bump
invalidates already-approved erasure plans, which is correct — a plan approved before
these tables existed cannot claim to erase them.

Private viewing history must never leak across users: every read of `MediaSave` /
`MediaWatchProgress` is filtered by the authenticated `userId` at the database query
level, never by post-filtering in application code.

---

## 9. Explicitly NOT built (and why)

| Not built | Reason | Status |
|---|---|---|
| HLS/DASH adaptive streaming | no transcoder; `worker-src 'none'` | `BLOCKED_OWNER` |
| Transcoding / renditions / poster-frame extraction / duration probing | no ffmpeg; `sharp` is overrides-only; 300s proxy timeout | `BLOCKED_OWNER` |
| Uploads > 50 MB | nginx `client_max_body_size 50M` — infrastructure change | `BLOCKED_OWNER` |
| S3/MinIO object storage | adapters reject by design, no SDK, no credentials | `BLOCKED_OWNER` |
| External video embeds | needs `frame-src` CSP relaxation | `BLOCKED_OWNER` |
| Virus/malware scanning | no scanner available → `QUARANTINED` state instead | `BLOCKED_OWNER` |
| Background job runner | would require a new dependency + a container + a Phase 98 DR-policy amendment | `BLOCKED_OWNER` |
| Changing `AcademyLesson.videoUrl` | out of scope; it is currently readable over HTTP, unwritable, unvalidated and rendered into an `iframe src`. Exposing a write path would create a `javascript:`/`data:` injection and an SSRF-adjacent surface the Phase 99 SSRF gate scrutinises. | untouched, documented |
| Fixing the Academy unpublished-course sitemap/page leak | a genuine pre-existing public-exposure defect, but unrelated to Phase 102; CLAUDE.md forbids unrelated changes in a scoped task | spun out separately |

None of these are faked. The player reports what it can actually do, and the storage
layer fails loudly rather than pretending.

---

## 10. Data model

All models are org-owned unless noted. `organizationId String` non-null +
`organization Organization @relation(… onDelete: Cascade)` + an
organizationId-leading index, per §3.

| Model | Purpose |
|---|---|
| `MediaAsset` | core record: slug, lifecycle, visibility, processing state, storage key, byte size, duration, level, counters, SEO |
| `MediaAssetTranslation` | per-locale `fa`/`en`/`de` title, description, SEO fields |
| `MediaChapter` | ordered chapter marks (`startSeconds`, title per locale via translation rows) |
| `MediaSubtitleTrack` | WebVTT track per locale, stored via the object-storage seam |
| `MediaTranscript` | per-locale transcript text |
| `MediaAttachment` | downloadable engineering attachments |
| `MediaCategory` | org-scoped category taxonomy |
| `MediaTag` / `MediaTagOnAsset` | free tags |
| `MediaInstructor` | instructor profile linked to `User` |
| `MediaSave` | favourites — unique `(userId, mediaAssetId)` |
| `MediaWatchProgress` | continue-watching — `progressPct`, `positionSeconds`, `completedAt`, unique `(userId, mediaAssetId)` |
| `MediaViewEvent` | privacy-aware play/completion events, `ipHash` only |
| `MediaEditorialEvent` | append-only record of every lifecycle transition |

**Industrial association** reuses existing taxonomy rather than inventing a parallel
one: `industrialDomain`, `linkedAssetType` (`IndustrialAssetType`), `linkedProtocol`
(`IndustrialProtocol`), plus optional soft links to `IndustrialAsset`,
`EngineeringProject` and `Article`.

**Language** does *not* reuse `ArtLanguage`, which is `EN | FA` only and has no `DE`.
Phase 102 uses the platform locale set (`fa | en | de`) as `String` + CHECK, keeping
`ACTIVE_LOCALES` as the single source of truth.

---

## 11. Editorial workflow

`DRAFT → SUBMITTED → IN_REVIEW → PUBLISHED → ARCHIVED`, with `REJECTED` reachable
from review. Unlike `Article` — whose machine is inlined in two route handlers with no
transition table, and where `IN_REVIEW` and `ARCHIVED` are never actually written —
Phase 102 implements a **pure, closed transition table with a permission per
transition**, so every state is reachable and every move is testable in isolation.

New org permissions, following the Phase 97 precedent of separating accountable acts:

- `view_media` — read the org media library
- `manage_media` — create/edit drafts, submit for review, archive
- `review_media` — `SUBMITTED`/`IN_REVIEW` → `PUBLISHED` or `REJECTED`

Publication is an accountable act: it writes a `MediaEditorialEvent` and an
`AuditLog` entry, and stamps `publishedAt` immutably.

**Published-only visibility is enforced in the repository layer, not the caller.**
This is a deliberate correction of the `Article` shape, where
`getArticleDetailBySlug` has no status filter and each caller re-implements the gate —
one forgotten caller away from leaking draft content. Phase 102's loader filters by
default and requires an explicit, typed opt-out for editorial callers.

---

## 12. Validation gates this phase must satisfy

- i18n: new `mediaHub` namespace (deliberately not a generic name — the raw-key-path
  guards build their forbidden set from `Object.keys(en)`, so a generic name can
  retroactively fail unrelated namespaces). Requires the leaf-count pin bumped in
  **both** places, `TRANSLATED_NS` registration, identical position in all three
  catalogs (key equality is order-sensitive), and CRLF-preserving writes.
- `docs/security/phase99-route-security-inventory.json` regenerated for every new route.
- `npx tsc --noEmit` (there is no `typecheck` script), `npm run lint`, `npm run test`,
  `npx prisma validate`, `next build`.
- A Phase 102 static migration-safety test asserting the tenant invariants above.
