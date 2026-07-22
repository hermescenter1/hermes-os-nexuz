import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * PHASE 94 — migration and schema safety.
 *
 * Static assertions over the committed SQL and schema. Nothing here connects
 * to, reads from or mutates a database.
 */

const REPO = process.cwd();
const MIGRATION = "20260813000000_phase94_ot_edge_foundation";
/** PHASE 94B4.1 — the machine-authentication handle, added on top. */
const MIGRATION_941 = "20260814000000_phase94b41_gateway_ingestion_id";
const sql = readFileSync(join(REPO, "prisma/migrations", MIGRATION, "migration.sql"), "utf8");
const schema = readFileSync(resolve(REPO, "prisma/schema.prisma"), "utf8");

/**
 * Statements with comments stripped.
 *
 * NOTE the subtlety: a foreign key legitimately contains the words
 * "ON DELETE CASCADE" / "ON DELETE SET NULL". A naive substring scan for
 * "DELETE" would flag every FK in the file, so the destructive check below
 * matches statement VERBS at the start of a statement, not substrings.
 */
const statements = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

const NEW_TABLES = [
  "EdgeGatewayProfile",
  "GatewayEnvelopeNonce",
  "OtDeviceProfile",
  "EngineeringImport",
  "EngineeringProject",
  "AutomationTag",
  "AlarmDefinition",
  "IndustrialNetworkNode",
  "EngineeringFinding",
] as const;

describe("94 — the migration is additive and non-destructive", () => {
  it("contains no destructive statement", () => {
    for (const stmt of statements) {
      expect(stmt, `must not start with a destructive verb: ${stmt.slice(0, 80)}`).not.toMatch(
        /^(DROP|TRUNCATE|DELETE\s+FROM|UPDATE)\b/i,
      );
      // a destructive clause anywhere in the statement, FK actions excepted
      const withoutFkActions = stmt.replace(/ON (DELETE|UPDATE) (CASCADE|SET NULL|RESTRICT|NO ACTION)/gi, "");
      expect(withoutFkActions, `destructive clause: ${stmt.slice(0, 80)}`).not.toMatch(
        /\b(DROP\s+(TABLE|COLUMN|CONSTRAINT|TYPE|INDEX)|TRUNCATE|ALTER\s+COLUMN|RENAME)\b/i,
      );
    }
  });

  it("performs only CREATE TYPE / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT", () => {
    for (const stmt of statements) {
      expect(stmt, `unexpected operation: ${stmt.slice(0, 80)}`).toMatch(
        /^(CREATE TYPE|CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE "\w+" ADD CONSTRAINT)/i,
      );
    }
  });

  it("every ALTER TABLE only ADDs a foreign key, and only on a NEW table", () => {
    const alters = statements.filter((s) => /^ALTER TABLE/i.test(s));
    expect(alters.length).toBeGreaterThan(0);
    for (const stmt of alters) {
      expect(stmt).toMatch(/ADD CONSTRAINT "\w+" FOREIGN KEY/i);
      const table = /^ALTER TABLE "(\w+)"/i.exec(stmt)?.[1];
      expect(NEW_TABLES as readonly string[], `altered a pre-existing table: ${table}`).toContain(table);
    }
  });

  it("creates exactly the nine Phase 94 tables and no others", () => {
    const created = [...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort();
    expect(created).toEqual([...NEW_TABLES].sort());
  });

  it("adds no column to any pre-existing table", () => {
    expect(sql).not.toMatch(/ADD COLUMN/i);
  });

  it("references existing tables only as FOREIGN KEY targets", () => {
    const targets = new Set(
      [...sql.matchAll(/REFERENCES "(\w+)"/g)].map((m) => m[1]).filter((t) => !NEW_TABLES.includes(t as never)),
    );
    // Reusing the existing tenancy/site/gateway/asset foundations is the point.
    expect([...targets].sort()).toEqual(
      ["IndustrialAsset", "IndustrialGateway", "IndustrialSite", "Organization", "User"].sort(),
    );
  });
});

describe("94 — tenant ownership is structural, not conventional", () => {
  function modelBlock(name: string): string {
    const m = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
    expect(m, `model ${name} not found in schema`).toBeTruthy();
    return m![1];
  }

  it.each(NEW_TABLES)("%s carries organizationId with a cascade relation", (model) => {
    const block = modelBlock(model);
    expect(block, `${model} must be tenant-owned`).toMatch(/^\s+organizationId\s+String\s*$/m);
    expect(block).toMatch(/organization\s+Organization\s+@relation\([^)]*onDelete:\s*Cascade/);
  });

  it.each(NEW_TABLES)("%s indexes organizationId so tenant scans stay bounded", (model) => {
    const block = modelBlock(model);
    const indexed = [...block.matchAll(/@@(?:unique|index)\(\[([^\]]+)\]\)/g)]
      .some((m) => m[1].split(",")[0].trim() === "organizationId");
    const uniqueOnOrg = /@@unique\(\[organizationId/.test(block);
    expect(indexed || uniqueOnOrg, `${model} needs an organizationId-leading index`).toBe(true);
  });

  it("every FK to a tenant-owned parent cascades or nulls — never orphans", () => {
    for (const stmt of statements.filter((s) => /FOREIGN KEY/i.test(s))) {
      expect(stmt, `FK without an explicit ON DELETE action: ${stmt.slice(0, 90)}`)
        .toMatch(/ON DELETE (CASCADE|SET NULL)/i);
    }
  });

  it("deleting an organization removes all Phase 94 data", () => {
    const orgFks = statements.filter((s) => /REFERENCES "Organization"/.test(s));
    expect(orgFks.length).toBe(NEW_TABLES.length);
    for (const fk of orgFks) expect(fk).toMatch(/ON DELETE CASCADE/i);
  });

  it("optional links to a site, gateway, asset or user null out instead of cascading", () => {
    // Losing a site must not silently delete the engineering evidence imported
    // under it — that would destroy the audit trail.
    for (const stmt of statements.filter((s) =>
      /REFERENCES "(IndustrialSite|User)"/.test(s),
    )) {
      expect(stmt, `optional parent must SET NULL: ${stmt.slice(0, 90)}`).toMatch(/ON DELETE SET NULL/i);
    }
  });
});

describe("94 — uniqueness and evidence integrity", () => {
  function modelBlock(name: string): string {
    return new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema)![1];
  }

  it("an identical payload cannot be imported twice into one tenant", () => {
    expect(modelBlock("EngineeringImport")).toMatch(/@@unique\(\[organizationId,\s*checksum\]\)/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]*"EngineeringImport"\("organizationId", "checksum"\)/);
  });

  it("an idempotency key is unique per tenant", () => {
    expect(modelBlock("EngineeringImport")).toMatch(/@@unique\(\[organizationId,\s*idempotencyKey\]\)/);
  });

  it("re-analysis is idempotent: one finding per rule per artifact per project", () => {
    expect(modelBlock("EngineeringFinding")).toMatch(/@@unique\(\[projectId,\s*ruleId,\s*artifactRef\]\)/);
  });

  it("project identity is scoped to tenant + revision, not global", () => {
    expect(modelBlock("EngineeringProject")).toMatch(/@@unique\(\[organizationId,\s*normalizedName,\s*revision\]\)/);
  });

  it("tag, alarm and node identities are scoped to their project", () => {
    expect(modelBlock("AutomationTag")).toMatch(/@@unique\(\[projectId,\s*normalizedName\]\)/);
    expect(modelBlock("AlarmDefinition")).toMatch(/@@unique\(\[projectId,\s*normalizedCode\]\)/);
    expect(modelBlock("IndustrialNetworkNode")).toMatch(/@@unique\(\[projectId,\s*normalizedName\]\)/);
  });

  it("a gateway nonce can be spent at most once — the replay guard is a constraint", () => {
    expect(modelBlock("GatewayEnvelopeNonce")).toMatch(/@@unique\(\[gatewayId,\s*nonce\]\)/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]*"GatewayEnvelopeNonce"\("gatewayId", "nonce"\)/);
  });

  it("the profile tables are strictly 1:1 with the records they extend", () => {
    expect(modelBlock("EdgeGatewayProfile")).toMatch(/gatewayId\s+String\s+@unique/);
    expect(modelBlock("OtDeviceProfile")).toMatch(/assetId\s+String\s+@unique/);
  });
});

describe("94 — the schema cannot express a control action", () => {
  it("no Phase 94 model carries a value, setpoint or command field", () => {
    // Assert about DECLARATIONS, not prose: the block's safety comment
    // legitimately names the very fields it promises not to model, so comments
    // are stripped before the scan.
    const phase94 = schema
      .slice(schema.indexOf("// Phase 94 — OT Edge"))
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("///"))
      .join("\n");
    for (const forbidden of [
      /\n\s+value\s+/i, /setpoint/i, /\bcommand\b/i, /writeRequest/i, /actuate/i,
    ]) {
      expect(phase94, `Phase 94 schema must not model ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("the gateway profile stores a secret REFERENCE, never secret material", () => {
    const block = new RegExp(`model EdgeGatewayProfile \\{([\\s\\S]*?)\\n\\}`).exec(schema)![1];
    expect(block).toMatch(/signingKeyRef\s+String\?/);
    expect(block).not.toMatch(/signingKey\s+String|secret\s+String|privateKey/i);
  });

  it("readOnlyMode defaults to true", () => {
    const block = new RegExp(`model EdgeGatewayProfile \\{([\\s\\S]*?)\\n\\}`).exec(schema)![1];
    expect(block).toMatch(/readOnlyMode\s+Boolean\s+@default\(true\)/);
  });

  it("findings default to requiring human approval", () => {
    const block = new RegExp(`model EngineeringFinding \\{([\\s\\S]*?)\\n\\}`).exec(schema)![1];
    expect(block).toMatch(/humanApprovalRequired\s+Boolean\s+@default\(true\)/);
  });
});

describe("94 — migration ordering", () => {
  const dirs = () => readdirSync(join(REPO, "prisma/migrations")).filter((d) => /^\d{14}_/.test(d)).sort();

  it("the Phase 94 foundation precedes everything added after it", () => {
    const all = dirs();
    // The foundation creates the tables 94B4.1 alters, so ordering is a
    // correctness requirement, not a convention.
    expect(all.indexOf(MIGRATION)).toBeGreaterThan(-1);
    expect(all.indexOf(MIGRATION)).toBeLessThan(all.indexOf(MIGRATION_941));
  });

  it("the machine-authentication migration is the newest, so it applies last", () => {
    expect(dirs().at(-1)).toBe(MIGRATION_941);
  });
});

describe("94B4.1 — the ingestion handle migration is additive only", () => {
  const sql941 = readFileSync(join(REPO, "prisma/migrations", MIGRATION_941, "migration.sql"), "utf8");
  const stmts941 = sql941
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);

  it("adds one nullable column and its unique index, and nothing else", () => {
    expect(stmts941).toHaveLength(2);
    expect(stmts941[0]).toMatch(/^ALTER TABLE "EdgeGatewayProfile" ADD COLUMN "ingestionId" VARCHAR\(64\)$/);
    // Nullable on purpose: an existing profile keeps working and simply cannot
    // ingest until an operator provisions a handle — deny by default.
    expect(stmts941[0]).not.toMatch(/NOT NULL/);
    expect(stmts941[1]).toMatch(/^CREATE UNIQUE INDEX "EdgeGatewayProfile_ingestionId_key"/);
  });

  it("destroys nothing", () => {
    for (const st of stmts941) {
      expect(st, `destructive statement: ${st}`).not.toMatch(/^(DROP|TRUNCATE|DELETE|ALTER TABLE .* DROP)/i);
    }
  });

  it("the handle is a globally unique identifier, never secret material", () => {
    const block = new RegExp(`model EdgeGatewayProfile \\{([\\s\\S]*?)\\n\\}`).exec(schema)![1];
    expect(block).toMatch(/ingestionId\s+String\?\s+@unique/);
    // The credential is the HMAC; this column must never hold one.
    expect(block).not.toMatch(/ingestionSecret|ingestionKey|sharedSecret/i);
  });
});
