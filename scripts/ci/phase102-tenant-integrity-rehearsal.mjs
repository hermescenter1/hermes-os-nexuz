#!/usr/bin/env node
/**
 * PHASE 102 / RELEASE BLOCKER 6 — PostgreSQL rehearsal for the composite tenant
 * foreign keys.
 *
 * WHAT IT PROVES, AGAINST A REAL DATABASE
 * ---------------------------------------
 *   A. STRUCTURE — every parent carries UNIQUE ("organizationId","id"), and
 *      every Phase 102 child FK is COMPOSITE and carries the tenant. Read from
 *      `pg_constraint`, not from the migration text, so a constraint the
 *      migration claims to add but did not is caught.
 *
 *   B. ENFORCEMENT — for EVERY child relation, a row whose `organizationId`
 *      disagrees with its parent's is REJECTED by the database, and the
 *      same-tenant equivalent is accepted. The second half matters as much as
 *      the first: a constraint that rejected everything would pass A and the
 *      first half of B while breaking the product.
 *
 *   C. THE PREFLIGHT FAILS CLOSED — with an inconsistent seed present, the
 *      migration's OWN preflight (extracted from the migration file, never
 *      re-typed here) raises `PHASE102_CROSS_TENANT_ROWS_PRESENT` naming the
 *      offending relation, and the transaction rolls back leaving the row
 *      untouched and no constraint added.
 *
 * WHY C RUNS INSIDE A TRANSACTION
 * -------------------------------
 * To rehearse the preflight, the database must first be back in a state where a
 * cross-tenant row is writable — which means dropping the very constraint under
 * test. Doing that inside a transaction that always rolls back keeps the
 * rehearsal faithful and self-contained: the real preflight SQL runs against
 * real inconsistent data, and the database is byte-for-byte unchanged after.
 *
 * SAFETY
 * ------
 * Refuses any database that is not a loopback disposable rehearsal one, reusing
 * the same `assertDisposableDatabase` guard as the applied-migration gate —
 * libpq `?host=`/`hostaddr=` overrides included. It never prints a connection
 * string. It contacts no production system.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

import { assertDisposableDatabase } from "./phase102-applied-migration-check.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION_DIR = "20260822000000_phase102_tenant_composite_foreign_keys";
const MIGRATION_SQL = path.join(REPO_ROOT, "prisma/migrations", MIGRATION_DIR, "migration.sql");

let failed = false;
const results = [];

function check(label, ok, detail = "") {
  results.push({ label, ok, detail });
  if (!ok) failed = true;
  console.log(`RESULT ${label}=${ok ? "PASS" : "FAIL"}`);
  if (!ok && detail) console.log(`  - ${detail}`);
}

/* ── The contract, stated once ──────────────────────────────────────────────*/

/** Parents that must carry a composite tenant key. */
const PARENTS = ["MediaAsset", "MediaCategory", "MediaInstructor", "MediaTag"];

/**
 * Every child relation the migration converts, with the ON DELETE action it
 * must preserve. `c` = CASCADE, `n` = SET NULL (as `pg_constraint.confdeltype`).
 */
const RELATIONS = [
  { child: "MediaAssetTranslation", column: "mediaAssetId", parent: "MediaAsset", onDelete: "c" },
  { child: "MediaChapter", column: "mediaAssetId", parent: "MediaAsset", onDelete: "c" },
  { child: "MediaSubtitleTrack", column: "mediaAssetId", parent: "MediaAsset", onDelete: "c" },
  { child: "MediaTranscript", column: "mediaAssetId", parent: "MediaAsset", onDelete: "c" },
  { child: "MediaAttachment", column: "mediaAssetId", parent: "MediaAsset", onDelete: "c" },
  { child: "MediaTagOnAsset", column: "mediaAssetId", parent: "MediaAsset", onDelete: "c" },
  { child: "MediaSave", column: "mediaAssetId", parent: "MediaAsset", onDelete: "c" },
  { child: "MediaWatchProgress", column: "mediaAssetId", parent: "MediaAsset", onDelete: "c" },
  { child: "MediaViewEvent", column: "mediaAssetId", parent: "MediaAsset", onDelete: "c" },
  { child: "MediaEditorialEvent", column: "mediaAssetId", parent: "MediaAsset", onDelete: "c" },
  { child: "MediaTagOnAsset", column: "tagId", parent: "MediaTag", onDelete: "c" },
  { child: "MediaAsset", column: "categoryId", parent: "MediaCategory", onDelete: "n" },
  { child: "MediaAsset", column: "instructorId", parent: "MediaInstructor", onDelete: "n" },
  { child: "MediaCategory", column: "parentId", parent: "MediaCategory", onDelete: "n" },
];

const TAG = "p102fkreh";

/* ── Fixtures written through raw SQL ───────────────────────────────────────*/

const ORG_A = `${TAG}-orgA`;
const ORG_B = `${TAG}-orgB`;
const USER = `${TAG}-user`;
const ASSET_A = `${TAG}-assetA`;
const TAG_A = `${TAG}-tagA`;
const TAG_B = `${TAG}-tagB`;
const CATEGORY_A = `${TAG}-catA`;
const INSTRUCTOR_A = `${TAG}-insA`;

async function seed(client) {
  await client.query(
    `INSERT INTO "Organization" (id,name,slug,"updatedAt") VALUES ($1,$1,$1,now()),($2,$2,$2,now())
     ON CONFLICT (id) DO NOTHING`,
    [ORG_A, ORG_B],
  );
  await client.query(
    `INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt")
     VALUES ($1,$1,$2,'x','USER',now()) ON CONFLICT (id) DO NOTHING`,
    [USER, `${TAG}@example.test`],
  );
  await client.query(
    `INSERT INTO "MediaAsset"
       (id,"organizationId",slug,"primaryLocale",status,visibility,"processingState",
        "storageProvider","viewCount","saveCount","completionCount","noIndex","createdBy","updatedAt")
     VALUES ($1,$2,$3,'en','DRAFT','PRIVATE','PENDING_UPLOAD','local',0,0,0,false,$4,now())
     ON CONFLICT (id) DO NOTHING`,
    [ASSET_A, ORG_A, `${TAG}-slug`, USER],
  );
  // Two tags, one per organization. The tag link is the only relation whose
  // child also carries a SECOND composite key (to MediaAsset), so it cannot be
  // probed by moving the child: doing that would trip the asset key instead and
  // "prove" the tag key while never testing it. The asset side is held
  // same-tenant and the TAG is what moves.
  await client.query(
    `INSERT INTO "MediaTag" (id,"organizationId",slug,label,"normalizedLabel","usageCount","updatedAt")
     VALUES ($1,$2,$3,'Tag','tag',0,now()),($4,$5,$6,'Tag','tag',0,now())
     ON CONFLICT (id) DO NOTHING`,
    [TAG_A, ORG_A, `${TAG}-tag`, TAG_B, ORG_B, `${TAG}-tag-b`],
  );
  await client.query(
    `INSERT INTO "MediaCategory" (id,"organizationId",slug,"nameFa","nameEn","nameDe","orderIndex","isActive","updatedAt")
     VALUES ($1,$2,$3,'ف','E','D',0,true,now()) ON CONFLICT (id) DO NOTHING`,
    [CATEGORY_A, ORG_A, `${TAG}-cat`],
  );
  await client.query(
    `INSERT INTO "MediaInstructor" (id,"organizationId",slug,"displayName","isActive","updatedAt")
     VALUES ($1,$2,$3,'Instructor',true,now()) ON CONFLICT (id) DO NOTHING`,
    [INSTRUCTOR_A, ORG_A, `${TAG}-ins`],
  );
}

async function cleanup(client) {
  for (const table of [
    "MediaAssetTranslation", "MediaChapter", "MediaSubtitleTrack", "MediaTranscript",
    "MediaAttachment", "MediaTagOnAsset", "MediaSave", "MediaWatchProgress",
    "MediaViewEvent", "MediaEditorialEvent",
  ]) {
    await client.query(`DELETE FROM "${table}" WHERE "organizationId" LIKE '${TAG}%'`);
  }
  await client.query(`UPDATE "MediaAsset" SET "categoryId"=NULL,"instructorId"=NULL WHERE "organizationId" LIKE '${TAG}%'`);
  await client.query(`UPDATE "MediaCategory" SET "parentId"=NULL WHERE "organizationId" LIKE '${TAG}%'`);
  for (const table of ["MediaAsset", "MediaTag", "MediaCategory", "MediaInstructor"]) {
    await client.query(`DELETE FROM "${table}" WHERE "organizationId" LIKE '${TAG}%'`);
  }
  await client.query(`DELETE FROM "User" WHERE id LIKE '${TAG}%'`);
  await client.query(`DELETE FROM "Organization" WHERE id LIKE '${TAG}%'`);
}

/**
 * An INSERT that attaches a child of `relation` to the org-A parent, declaring
 * `org` as the child's own tenant. With `org = ORG_B` it is a cross-tenant link.
 *
 * `MediaAsset.categoryId` / `.instructorId` and `MediaCategory.parentId` are
 * columns on rows that already exist, so those three are UPDATEs of a new row
 * rather than inserts of a child.
 */
function attachStatement(relation, org) {
  const id = `${TAG}-probe`;
  switch (`${relation.child}.${relation.column}`) {
    case "MediaAssetTranslation.mediaAssetId":
      return { sql: `INSERT INTO "MediaAssetTranslation" (id,"organizationId","mediaAssetId",locale,title,keywords,"updatedAt") VALUES ($1,$2,$3,'en','t','{}',now())`, params: [id, org, ASSET_A] };
    case "MediaChapter.mediaAssetId":
      return { sql: `INSERT INTO "MediaChapter" (id,"organizationId","mediaAssetId",locale,"orderIndex","startSeconds",title,"updatedAt") VALUES ($1,$2,$3,'en',0,0,'c',now())`, params: [id, org, ASSET_A] };
    case "MediaSubtitleTrack.mediaAssetId":
      return { sql: `INSERT INTO "MediaSubtitleTrack" (id,"organizationId","mediaAssetId",locale,"storageKey",format,"isDefault","updatedAt") VALUES ($1,$2,$3,'en',$4,'vtt',false,now())`, params: [id, org, ASSET_A, `media/${org}/${ASSET_A}/11111111-2222-4333-8444-555555555555.vtt`] };
    case "MediaTranscript.mediaAssetId":
      return { sql: `INSERT INTO "MediaTranscript" (id,"organizationId","mediaAssetId",locale,body,source,"updatedAt") VALUES ($1,$2,$3,'en','b','MANUAL',now())`, params: [id, org, ASSET_A] };
    case "MediaAttachment.mediaAssetId":
      return { sql: `INSERT INTO "MediaAttachment" (id,"organizationId","mediaAssetId",title,"storageKey","contentType","byteSize","downloadCount","updatedAt") VALUES ($1,$2,$3,'a',$4,'application/pdf',1,0,now())`, params: [id, org, ASSET_A, `media/${org}/${ASSET_A}/11111111-2222-4333-8444-555555555555.pdf`] };
    case "MediaTagOnAsset.mediaAssetId":
      return { sql: `INSERT INTO "MediaTagOnAsset" (id,"organizationId","mediaAssetId","tagId","createdAt") VALUES ($1,$2,$3,$4,now())`, params: [id, org, ASSET_A, TAG_A] };
    case "MediaSave.mediaAssetId":
      return { sql: `INSERT INTO "MediaSave" (id,"organizationId","mediaAssetId","userId","createdAt") VALUES ($1,$2,$3,$4,now())`, params: [id, org, ASSET_A, USER] };
    case "MediaWatchProgress.mediaAssetId":
      return { sql: `INSERT INTO "MediaWatchProgress" (id,"organizationId","mediaAssetId","userId","positionSeconds","progressPct","lastWatchedAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,0,0,now(),now(),now())`, params: [id, org, ASSET_A, USER] };
    case "MediaViewEvent.mediaAssetId":
      return { sql: `INSERT INTO "MediaViewEvent" (id,"organizationId","mediaAssetId","eventType","createdAt") VALUES ($1,$2,$3,'PLAY',now())`, params: [id, org, ASSET_A] };
    case "MediaEditorialEvent.mediaAssetId":
      return { sql: `INSERT INTO "MediaEditorialEvent" (id,"organizationId","mediaAssetId","toStatus",action,"actorUserId","createdAt") VALUES ($1,$2,$3,'SUBMITTED','SUBMIT',$4,now())`, params: [id, org, ASSET_A, USER] };
    case "MediaTagOnAsset.tagId":
      // The child and the ASSET stay in org A; the TAG is what crosses. See the
      // note in `seed` — moving the child would trip the asset key instead.
      return {
        sql: `INSERT INTO "MediaTagOnAsset" (id,"organizationId","mediaAssetId","tagId","createdAt") VALUES ($1,$2,$3,$4,now())`,
        params: [id, ORG_A, ASSET_A, org === ORG_B ? TAG_B : TAG_A],
      };
    case "MediaAsset.categoryId":
      return { sql: `INSERT INTO "MediaAsset" (id,"organizationId",slug,"primaryLocale",status,visibility,"processingState","storageProvider","categoryId","viewCount","saveCount","completionCount","noIndex","createdBy","updatedAt") VALUES ($1,$2,$3,'en','DRAFT','PRIVATE','PENDING_UPLOAD','local',$4,0,0,0,false,$5,now())`, params: [id, org, `${TAG}-probe-slug`, CATEGORY_A, USER] };
    case "MediaAsset.instructorId":
      return { sql: `INSERT INTO "MediaAsset" (id,"organizationId",slug,"primaryLocale",status,visibility,"processingState","storageProvider","instructorId","viewCount","saveCount","completionCount","noIndex","createdBy","updatedAt") VALUES ($1,$2,$3,'en','DRAFT','PRIVATE','PENDING_UPLOAD','local',$4,0,0,0,false,$5,now())`, params: [id, org, `${TAG}-probe-slug2`, INSTRUCTOR_A, USER] };
    case "MediaCategory.parentId":
      return { sql: `INSERT INTO "MediaCategory" (id,"organizationId",slug,"nameFa","nameEn","nameDe","parentId","orderIndex","isActive","updatedAt") VALUES ($1,$2,$3,'ف','E','D',$4,0,true,now())`, params: [id, org, `${TAG}-probe-cat`, CATEGORY_A] };
    default:
      throw new Error(`no probe defined for ${relation.child}.${relation.column}`);
  }
}

/* ── A. Structure ───────────────────────────────────────────────────────────*/

async function verifyStructure(client) {
  const uniques = await client.query(
    `SELECT rel.relname AS t, c.conname AS n
       FROM pg_constraint c JOIN pg_class rel ON rel.oid=c.conrelid
      WHERE c.contype='u' AND rel.relname::text = ANY($1)
        AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
               FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid=rel.oid AND a.attnum=k)
            = ARRAY['id','organizationId']::text[]`,
    [PARENTS],
  );
  const covered = new Set(uniques.rows.map((r) => r.t));
  check(
    "PHASE102_PARENT_TENANT_KEYS_PRESENT",
    PARENTS.every((p) => covered.has(p)),
    `missing UNIQUE(organizationId,id) on: ${PARENTS.filter((p) => !covered.has(p)).join(", ")}`,
  );

  const fks = await client.query(
    `SELECT rel.relname AS child, frel.relname AS parent, c.confdeltype::text AS del,
            (SELECT array_agg(a.attname::text ORDER BY x.ord)
               FROM unnest(c.conkey) WITH ORDINALITY x(k,ord)
               JOIN pg_attribute a ON a.attrelid=rel.oid AND a.attnum=x.k) AS cols
       FROM pg_constraint c
       JOIN pg_class rel ON rel.oid=c.conrelid
       JOIN pg_class frel ON frel.oid=c.confrelid
      WHERE c.contype='f' AND rel.relname LIKE 'Media%' AND frel.relname LIKE 'Media%'`,
  );

  const missing = [];
  const wrongAction = [];
  for (const rel of RELATIONS) {
    const match = fks.rows.find(
      (r) =>
        r.child === rel.child &&
        r.parent === rel.parent &&
        Array.isArray(r.cols) &&
        r.cols.length === 2 &&
        r.cols.includes("organizationId") &&
        r.cols.includes(rel.column),
    );
    if (!match) missing.push(`${rel.child}.${rel.column} -> ${rel.parent}`);
    else if (match.del !== rel.onDelete) {
      wrongAction.push(`${rel.child}.${rel.column}: expected confdeltype ${rel.onDelete}, found ${match.del}`);
    }
  }
  check("PHASE102_CHILD_FKS_ARE_COMPOSITE", missing.length === 0, `not composite: ${missing.join(", ")}`);
  check("PHASE102_ON_DELETE_PRESERVED", wrongAction.length === 0, wrongAction.join("; "));

  // A single-column FK left behind would silently keep the weaker path open.
  const singles = fks.rows.filter(
    (r) => Array.isArray(r.cols) && r.cols.length === 1 && r.cols[0] !== "organizationId",
  );
  check(
    "PHASE102_NO_SINGLE_COLUMN_PARENT_FK_REMAINS",
    singles.length === 0,
    singles.map((r) => `${r.child}(${r.cols.join(",")}) -> ${r.parent}`).join(", "),
  );
}

/* ── B. Enforcement ─────────────────────────────────────────────────────────*/

async function verifyEnforcement(client) {
  const rejected = [];
  const accepted = [];

  for (const rel of RELATIONS) {
    const label = `${rel.child}.${rel.column}`;

    // Cross-tenant: the child declares ORG_B, the parent lives in ORG_A.
    await client.query("SAVEPOINT probe");
    let crossRejected = false;
    try {
      const stmt = attachStatement(rel, ORG_B);
      const res = await client.query(stmt.sql, stmt.params);
      // The row was ACCEPTED. A statement that matched nothing is not a
      // rejection either — both mean this relation was not proven.
      void res;
      crossRejected = false;
    } catch (error) {
      crossRejected = String(error?.code) === "23503";
    }
    await client.query("ROLLBACK TO SAVEPOINT probe");
    if (!crossRejected) rejected.push(label);

    // Same-tenant: must be accepted, or the constraint is simply breaking the product.
    await client.query("SAVEPOINT probe2");
    let sameAccepted = false;
    try {
      const stmt = attachStatement(rel, ORG_A);
      const res = await client.query(stmt.sql, stmt.params);
      sameAccepted = res.rowCount === 1;
    } catch {
      sameAccepted = false;
    }
    await client.query("ROLLBACK TO SAVEPOINT probe2");
    if (!sameAccepted) accepted.push(label);
  }

  check(
    "PHASE102_CROSS_TENANT_LINK_REJECTED",
    rejected.length === 0,
    `these relations still accept a cross-tenant parent: ${rejected.join(", ")}`,
  );
  check(
    "PHASE102_SAME_TENANT_LINK_ACCEPTED",
    accepted.length === 0,
    `these relations refuse a LEGITIMATE same-tenant parent: ${accepted.join(", ")}`,
  );
}

/* ── C. The preflight, against an inconsistent seed ─────────────────────────*/

/** The migration's OWN preflight, extracted rather than re-typed. */
function extractPreflight() {
  const sql = readFileSync(MIGRATION_SQL, "utf8");
  const start = sql.indexOf("DO $phase102_tenant_preflight$");
  const endMarker = "$phase102_tenant_preflight$;";
  const end = sql.indexOf(endMarker, start);
  if (start === -1 || end === -1) throw new Error("preflight block not found in the migration");
  return sql.slice(start, end + endMarker.length);
}

async function verifyPreflightFailsClosed(client) {
  const preflight = extractPreflight();
  check("PHASE102_PREFLIGHT_EXTRACTED_FROM_MIGRATION", preflight.includes("PHASE102_CROSS_TENANT_ROWS_PRESENT"));

  // Everything below rolls back. The constraint is dropped only so an
  // inconsistent row becomes writable — which is exactly the pre-migration
  // state the preflight exists to refuse.
  await client.query("SAVEPOINT preflight_rehearsal");
  let raised = null;
  let poisonedRowExisted = false;
  try {
    await client.query(`ALTER TABLE "MediaSubtitleTrack" DROP CONSTRAINT "MediaSubtitleTrack_org_mediaAsset_fkey"`);
    const stmt = attachStatement(RELATIONS.find((r) => r.child === "MediaSubtitleTrack"), ORG_B);
    const inserted = await client.query(stmt.sql, stmt.params);
    poisonedRowExisted = inserted.rowCount === 1;
    await client.query(preflight);
  } catch (error) {
    raised = error;
  }

  check(
    "PHASE102_PREFLIGHT_SEED_IS_INCONSISTENT",
    poisonedRowExisted,
    "the rehearsal could not create a cross-tenant row, so it proved nothing",
  );
  check(
    "PHASE102_PREFLIGHT_RAISES_ON_CROSS_TENANT_ROWS",
    raised !== null && String(raised?.message ?? "").includes("PHASE102_CROSS_TENANT_ROWS_PRESENT"),
    raised === null ? "the preflight ACCEPTED an inconsistent database" : String(raised?.message ?? ""),
  );
  check(
    "PHASE102_PREFLIGHT_NAMES_THE_OFFENDING_RELATION",
    String(raised?.message ?? "").includes("MediaSubtitleTrack.mediaAssetId"),
    "the refusal did not name the relation an operator has to reconcile",
  );

  await client.query("ROLLBACK TO SAVEPOINT preflight_rehearsal");

  // And the rehearsal left nothing behind.
  const after = await client.query(
    `SELECT count(*)::int AS n FROM pg_constraint WHERE conname='MediaSubtitleTrack_org_mediaAsset_fkey'`,
  );
  check(
    "PHASE102_PREFLIGHT_REHEARSAL_LEFT_NO_TRACE",
    after.rows[0].n === 1,
    "the composite foreign key did not come back after rollback",
  );
}

/* ── Entry point ────────────────────────────────────────────────────────────*/

async function main() {
  const guard = assertDisposableDatabase(process.env.DATABASE_URL);
  if (!guard.ok) {
    console.log(`RESULT PHASE102_TENANT_INTEGRITY_REHEARSAL=FAIL`);
    console.log(`  - ${guard.reason}`);
    console.log("RESULT phase102_tenant_integrity_rehearsal=FAIL");
    process.exit(1);
  }
  console.log(`[phase102-tenant-integrity] host=${guard.host} database=${guard.database}`);

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await cleanup(client);
    await seed(client);

    await verifyStructure(client);
    await verifyEnforcement(client);
    await verifyPreflightFailsClosed(client);
  } finally {
    // Everything this rehearsal wrote is discarded. It is a rehearsal, not a
    // migration: it must leave the database exactly as it found it.
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }

  console.log(`RESULT PHASE102_TENANT_RELATIONS_CHECKED=${RELATIONS.length}`);
  console.log(`RESULT phase102_tenant_integrity_rehearsal=${failed ? "FAIL" : "PASS"}`);
  console.log("RESULT phase102_tenant_integrity_rehearsal_production_contacted=False");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  // The message may carry a query; the connection string never reaches it.
  console.log("RESULT phase102_tenant_integrity_rehearsal=FAIL");
  console.log(`  - ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
