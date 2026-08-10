import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * PHASE 102 — Media & Video Hub: migration and schema safety.
 *
 * Static assertions over the committed SQL, the Prisma schema and the TypeScript
 * vocabulary projection. Nothing here connects to, reads from or mutates a
 * database. Modelled on prisma/__tests__/phase94-migration-safety.test.ts.
 */

const REPO = process.cwd();
const MIGRATION = "20260821000000_phase102_media_video_hub";

const sql = readFileSync(join(REPO, "prisma/migrations", MIGRATION, "migration.sql"), "utf8");
const schema = readFileSync(resolve(REPO, "prisma/schema.prisma"), "utf8");
const types = readFileSync(resolve(REPO, "src/lib/media/types.ts"), "utf8");

/**
 * The SQL with comment lines removed.
 *
 * This matters twice over. First, a foreign key legitimately contains the words
 * "ON DELETE CASCADE" / "ON DELETE SET NULL", so the destructive check below
 * matches statement VERBS at the start of a statement rather than substrings.
 * Second, the file's own header comment NAMES the very statements it promises not
 * to contain ("no DROP TABLE, no TRUNCATE, …"); asserting against the raw text
 * would flag the promise as the violation.
 */
const body = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

const statements = body
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

/** The fourteen tables the ADR's thirteen §10 rows expand to. */
const NEW_TABLES = [
  "MediaAsset",
  "MediaAssetTranslation",
  "MediaChapter",
  "MediaSubtitleTrack",
  "MediaTranscript",
  "MediaAttachment",
  "MediaCategory",
  "MediaTag",
  "MediaTagOnAsset",
  "MediaInstructor",
  "MediaSave",
  "MediaWatchProgress",
  "MediaViewEvent",
  "MediaEditorialEvent",
] as const;

function modelBlock(name: string): string {
  const m = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  expect(m, `model ${name} not found in schema`).toBeTruthy();
  return m![1];
}

/** Pull the quoted members out of `... IN ('A','B','C')` in a named CHECK. */
function checkVocabulary(constraintName: string): string[] {
  const m = new RegExp(`CONSTRAINT "${constraintName}" CHECK \\([^)]*IN \\(([^)]*)\\)`).exec(sql);
  expect(m, `CHECK constraint ${constraintName} not found`).toBeTruthy();
  return [...m![1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

/** Pull the quoted members out of an `export const X = [...] as const` tuple. */
function tsVocabulary(constName: string): string[] {
  const m = new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\] as const`).exec(types);
  expect(m, `${constName} not found in src/lib/media/types.ts`).toBeTruthy();
  return [...m![1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

describe("102 — the migration is additive and non-destructive", () => {
  it("contains no destructive statement", () => {
    for (const stmt of statements) {
      expect(stmt, `must not start with a destructive verb: ${stmt.slice(0, 80)}`).not.toMatch(
        /^(DROP|TRUNCATE|DELETE\s+FROM|UPDATE)\b/i,
      );
      const withoutFkActions = stmt.replace(
        /ON (DELETE|UPDATE) (CASCADE|SET NULL|RESTRICT|NO ACTION)/gi,
        "",
      );
      expect(withoutFkActions, `destructive clause: ${stmt.slice(0, 80)}`).not.toMatch(
        /\b(DROP\s+(TABLE|COLUMN|CONSTRAINT|TYPE|INDEX)|TRUNCATE|ALTER\s+COLUMN|RENAME)\b/i,
      );
    }
  });

  it("never rewrites an enum type — the reason Phase 102 uses String + CHECK at all", () => {
    // `ALTER TYPE … DROP` cannot be expressed in Postgres and `ALTER TYPE … ADD
    // VALUE` is append-only; scripts/dr/migration-sql-classify.mjs classifies both
    // as BREAKING_OR_UNKNOWN, which blocks a deploy outright (ADR §6).
    expect(body).not.toMatch(/ALTER\s+TYPE/i);
    expect(body).not.toMatch(/DROP\s+TYPE/i);
    expect(body).not.toMatch(/CREATE\s+TYPE/i);
  });

  it("performs only CREATE TABLE / CREATE INDEX / ADD CONSTRAINT", () => {
    for (const stmt of statements) {
      expect(stmt, `unexpected operation: ${stmt.slice(0, 80)}`).toMatch(
        /^(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE "\w+" ADD CONSTRAINT)/i,
      );
    }
  });

  it("creates exactly the fourteen Phase 102 tables and no others", () => {
    const created = [...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort();
    expect(created).toEqual([...NEW_TABLES].sort());
  });

  it("adds no column to any pre-existing table", () => {
    expect(body).not.toMatch(/ADD COLUMN/i);
  });

  it("every ALTER TABLE only ADDs a constraint, and only on a NEW table", () => {
    const alters = statements.filter((s) => /^ALTER TABLE/i.test(s));
    expect(alters.length).toBeGreaterThan(0);
    for (const stmt of alters) {
      expect(stmt).toMatch(/ADD CONSTRAINT "[\w]+" FOREIGN KEY/i);
      const table = /^ALTER TABLE "(\w+)"/i.exec(stmt)?.[1];
      expect(NEW_TABLES as readonly string[], `altered a pre-existing table: ${table}`).toContain(
        table,
      );
    }
  });

  it("references existing tables only as FOREIGN KEY targets", () => {
    const targets = new Set(
      [...sql.matchAll(/REFERENCES "(\w+)"/g)]
        .map((m) => m[1])
        .filter((t) => !NEW_TABLES.includes(t as never)),
    );
    expect([...targets].sort()).toEqual(["IndustrialSite", "Organization", "User"].sort());
  });

  it("touches no pre-existing index", () => {
    const indexes = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX "(\w+)" ON "(\w+)"/g)];
    expect(indexes.length).toBeGreaterThan(0);
    for (const [, name, table] of indexes) {
      expect(NEW_TABLES as readonly string[], `indexed a pre-existing table: ${table}`).toContain(
        table,
      );
      expect(name.startsWith(table), `index ${name} is not named for its own table`).toBe(true);
    }
  });
});

describe("102 — tenant ownership is structural, not conventional", () => {
  it.each(NEW_TABLES)("%s carries organizationId with a cascade relation", (model) => {
    const block = modelBlock(model);
    expect(block, `${model} must be tenant-owned`).toMatch(/^\s+organizationId\s+String\s*$/m);
    expect(block).toMatch(/organization\s+Organization\s+@relation\([^)]*onDelete:\s*Cascade/);
  });

  it.each(NEW_TABLES)("%s indexes organizationId so tenant scans stay bounded", (model) => {
    const block = modelBlock(model);
    const indexed = [...block.matchAll(/@@(?:unique|index)\(\[([^\]]+)\]\)/g)].some(
      (m) => m[1].split(",")[0].trim() === "organizationId",
    );
    expect(indexed, `${model} needs an organizationId-leading index`).toBe(true);
  });

  it.each(NEW_TABLES)("%s has a NOT NULL organizationId column in the SQL", (table) => {
    const create = new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\n\\)`).exec(sql);
    expect(create, `CREATE TABLE ${table} not found`).toBeTruthy();
    expect(create![1]).toMatch(/"organizationId" TEXT NOT NULL/);
  });

  it("deleting an organization removes all Phase 102 data", () => {
    const orgFks = statements.filter((s) => /REFERENCES "Organization"/.test(s));
    expect(orgFks.length).toBe(NEW_TABLES.length);
    for (const fk of orgFks) expect(fk).toMatch(/ON DELETE CASCADE/i);
  });

  it("every FK carries an explicit ON DELETE action — nothing is left to orphan", () => {
    const fks = statements.filter((s) => /FOREIGN KEY/i.test(s));
    expect(fks.length).toBeGreaterThan(0);
    for (const stmt of fks) {
      expect(stmt, `FK without an explicit ON DELETE action: ${stmt.slice(0, 90)}`).toMatch(
        /ON DELETE (CASCADE|SET NULL)/i,
      );
    }
  });

  it("optional parents SET NULL — losing a site, category or instructor never deletes media", () => {
    const optional = [
      "MediaAsset_siteId_fkey",
      "MediaAsset_categoryId_fkey",
      "MediaAsset_instructorId_fkey",
      "MediaCategory_parentId_fkey",
      "MediaInstructor_userId_fkey",
      "MediaViewEvent_userId_fkey",
    ];
    for (const name of optional) {
      const stmt = statements.find((s) => s.includes(`ADD CONSTRAINT "${name}"`));
      expect(stmt, `missing FK ${name}`).toBeTruthy();
      expect(stmt!, `${name} must SET NULL`).toMatch(/ON DELETE SET NULL/i);
    }
    // …and each of those columns is nullable in both the SQL and the schema.
    expect(modelBlock("MediaAsset")).toMatch(/^\s+siteId\s+String\?\s*$/m);
    expect(modelBlock("MediaAsset")).toMatch(/^\s+categoryId\s+String\?\s*$/m);
    expect(modelBlock("MediaAsset")).toMatch(/^\s+instructorId\s+String\?\s*$/m);
    expect(modelBlock("MediaCategory")).toMatch(/^\s+parentId\s+String\?\s*$/m);
    expect(modelBlock("MediaInstructor")).toMatch(/^\s+userId\s+String\?\s*$/m);
    expect(modelBlock("MediaViewEvent")).toMatch(/^\s+userId\s+String\?\s*$/m);
  });

  it("subject-attributable history cascades with the account instead of lingering", () => {
    // MediaSave / MediaWatchProgress are private viewing history (ADR §8). The row
    // has no meaning without its subject, so `userId` is REQUIRED and deleting the
    // user must destroy the row — SET NULL here would leave orphaned, unattributable
    // history that no erasure query could find.
    for (const name of ["MediaSave_userId_fkey", "MediaWatchProgress_userId_fkey"]) {
      const stmt = statements.find((s) => s.includes(`ADD CONSTRAINT "${name}"`));
      expect(stmt, `missing FK ${name}`).toBeTruthy();
      expect(stmt!).toMatch(/ON DELETE CASCADE/i);
    }
    expect(modelBlock("MediaSave")).toMatch(/^\s+userId\s+String\s*$/m);
    expect(modelBlock("MediaWatchProgress")).toMatch(/^\s+userId\s+String\s*$/m);
    // Ownership is a database-level uniqueness fact, so a per-user read can be a
    // key lookup rather than a post-filter in application code.
    expect(modelBlock("MediaSave")).toMatch(/@@unique\(\[userId,\s*mediaAssetId\]\)/);
    expect(modelBlock("MediaWatchProgress")).toMatch(/@@unique\(\[userId,\s*mediaAssetId\]\)/);
  });

  it("every child row dies with the media asset it describes", () => {
    const children = NEW_TABLES.filter((t) => t !== "MediaAsset" && t !== "MediaCategory" && t !== "MediaTag" && t !== "MediaInstructor");
    for (const t of children) {
      const stmt = statements.find((s) => s.includes(`ADD CONSTRAINT "${t}_mediaAssetId_fkey"`));
      expect(stmt, `${t} must bind to its MediaAsset`).toBeTruthy();
      expect(stmt!).toMatch(/REFERENCES "MediaAsset" \("id"\) ON DELETE CASCADE/i);
    }
  });

  it("table names are verbatim — this repo has no @@map anywhere in Phase 102", () => {
    for (const model of NEW_TABLES) {
      expect(modelBlock(model), `${model} must not remap its table name`).not.toMatch(/@@map/);
    }
  });
});

describe("102 — identity and uniqueness", () => {
  it("a slug identifies a media asset within a tenant, never globally", () => {
    expect(modelBlock("MediaAsset")).toMatch(/@@unique\(\[organizationId,\s*slug\]\)/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "MediaAsset_organizationId_slug_key" ON "MediaAsset" \("organizationId", "slug"\)/,
    );
  });

  it("one translation, subtitle track and transcript per locale per asset", () => {
    expect(modelBlock("MediaAssetTranslation")).toMatch(/@@unique\(\[mediaAssetId,\s*locale\]\)/);
    expect(modelBlock("MediaSubtitleTrack")).toMatch(/@@unique\(\[mediaAssetId,\s*locale\]\)/);
    expect(modelBlock("MediaTranscript")).toMatch(/@@unique\(\[mediaAssetId,\s*locale\]\)/);
  });

  it("chapter order is unique per locale, so a list cannot render ambiguously", () => {
    expect(modelBlock("MediaChapter")).toMatch(
      /@@unique\(\[mediaAssetId,\s*locale,\s*orderIndex\]\)/,
    );
  });

  it("a tag can be attached to an asset at most once", () => {
    expect(modelBlock("MediaTagOnAsset")).toMatch(/@@unique\(\[mediaAssetId,\s*tagId\]\)/);
  });

  it("category and tag slugs are tenant-scoped", () => {
    expect(modelBlock("MediaCategory")).toMatch(/@@unique\(\[organizationId,\s*slug\]\)/);
    expect(modelBlock("MediaTag")).toMatch(/@@unique\(\[organizationId,\s*slug\]\)/);
  });
});

describe("102 — the vocabularies are enforced by the database, not by convention", () => {
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ["MediaAsset_status_check", "MEDIA_LIFECYCLE_STATUSES"],
    ["MediaAsset_visibility_check", "MEDIA_VISIBILITIES"],
    ["MediaAsset_processing_state_check", "MEDIA_PROCESSING_STATES"],
    ["MediaAsset_primary_locale_check", "MEDIA_LOCALES"],
    ["MediaAsset_skill_level_check", "MEDIA_SKILL_LEVELS"],
    ["MediaViewEvent_event_type_check", "MEDIA_VIEW_EVENT_TYPES"],
    ["MediaEditorialEvent_action_check", "MEDIA_EDITORIAL_ACTIONS"],
    ["MediaEditorialEvent_to_status_check", "MEDIA_LIFECYCLE_STATUSES"],
    ["MediaTranscript_source_check", "MEDIA_TRANSCRIPT_SOURCES"],
    ["MediaSubtitleTrack_format_check", "MEDIA_SUBTITLE_FORMATS"],
    ["MediaAsset_storage_provider_check", "MEDIA_STORAGE_PROVIDERS"],
  ];

  it.each(pairs)("%s matches the TypeScript union %s exactly", (constraint, tsConst) => {
    expect(checkVocabulary(constraint)).toEqual(tsVocabulary(tsConst));
  });

  it("every locale column is constrained to the platform locale set", () => {
    for (const constraint of [
      "MediaAssetTranslation_locale_check",
      "MediaChapter_locale_check",
      "MediaSubtitleTrack_locale_check",
      "MediaTranscript_locale_check",
      "MediaAttachment_locale_check",
      "MediaViewEvent_locale_check",
    ]) {
      expect(checkVocabulary(constraint)).toEqual(["fa", "en", "de"]);
    }
  });

  it("the lifecycle vocabularies are String + comment, never a Prisma enum", () => {
    const asset = modelBlock("MediaAsset");
    expect(asset).toMatch(/status\s+String\s+@default\("DRAFT"\)/);
    expect(asset).toMatch(/visibility\s+String\s+@default\("PRIVATE"\)/);
    expect(asset).toMatch(/processingState\s+String\s+@default\("PENDING_UPLOAD"\)/);
    // No Phase 102 enum was declared anywhere in the schema.
    for (const forbidden of [
      "enum MediaLifecycleStatus",
      "enum MediaVisibility",
      "enum MediaProcessingState",
      "enum MediaLocale",
      "enum MediaSkillLevel",
    ]) {
      expect(schema, `Phase 102 must not declare ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("an asset cannot be PUBLISHED without a stamp, a key and validated bytes", () => {
    const stmt = statements.find((s) => s.includes('CREATE TABLE "MediaAsset"'));
    expect(stmt).toMatch(/CONSTRAINT "MediaAsset_published_stamp_check"/);
    expect(stmt).toMatch(/"publishedAt" IS NOT NULL/);
    expect(stmt).toMatch(/"storageKey" IS NOT NULL/);
    expect(stmt).toMatch(/"processingState" = 'READY'/);
  });
});

describe("102 — analytics are privacy-aware by construction", () => {
  it("MediaViewEvent stores a hash and has no column able to hold a raw IP", () => {
    const block = modelBlock("MediaViewEvent");
    expect(block).toMatch(/^\s+ipHash\s+String\?\s*$/m);
    expect(block).not.toMatch(/ipAddress|clientIp|remoteAddr|\bip\s+String/i);
    // The constraint structurally rejects an IPv4/IPv6 literal being written here.
    expect(sql).toMatch(
      /CONSTRAINT "MediaViewEvent_ip_hash_check" CHECK \("ipHash" IS NULL OR "ipHash" ~ '\^\[a-f0-9\]\{64\}\$'\)/,
    );
  });

  it("an anonymous play is recordable without inventing an identity", () => {
    expect(modelBlock("MediaViewEvent")).toMatch(/^\s+userId\s+String\?\s*$/m);
  });

  it("no Phase 102 model stores a raw IP, a token, a password or a secret", () => {
    const start = schema.indexOf("// PHASE 102 — Hermes Media & Video Hub");
    expect(start).toBeGreaterThan(-1);
    // DECLARATIONS only: the block's safety commentary legitimately names the very
    // things it promises not to model, so comments are stripped before the scan.
    const declarations = schema
      .slice(start)
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("///"))
      .join("\n");
    for (const forbidden of [
      /\bipAddress\b/i,
      /\bpasswordHash\b/i,
      /\bsecret\b/i,
      /\btokenHash\b/i,
      /\bprivateKey\b/i,
    ]) {
      expect(declarations, `Phase 102 schema must not model ${forbidden}`).not.toMatch(forbidden);
    }
  });
});

describe("102 — migration ordering", () => {
  const dirs = () =>
    readdirSync(join(REPO, "prisma/migrations"))
      .filter((d) => /^\d{14}_/.test(d))
      .sort();

  it("the Phase 102 migration exists and is the newest stamp", () => {
    const all = dirs();
    expect(all).toContain(MIGRATION);
    expect(all[all.length - 1]).toBe(MIGRATION);
  });

  it("its stamp is strictly greater than every migration that precedes it", () => {
    const all = dirs();
    const mine = MIGRATION.slice(0, 14);
    for (const d of all.filter((x) => x !== MIGRATION)) {
      expect(
        d.slice(0, 14) < mine,
        `${d} must sort strictly before ${MIGRATION}`,
      ).toBe(true);
    }
  });

  it("no earlier migration was rewritten to reference a Phase 102 table", () => {
    const all = dirs().filter((d) => d !== MIGRATION);
    for (const d of all) {
      const earlier = readFileSync(join(REPO, "prisma/migrations", d, "migration.sql"), "utf8");
      for (const t of NEW_TABLES) {
        expect(earlier, `${d} must not mention ${t}`).not.toContain(`"${t}"`);
      }
    }
  });
});
