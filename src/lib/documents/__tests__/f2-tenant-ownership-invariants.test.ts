import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { can, type OrgPermission } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";
import { documentRepositoryForOrganization } from "@/lib/documents/document-repository";

/**
 * F-2 — static and unit invariants for document tenant ownership.
 *
 * The route tests prove behaviour through the handlers; this file pins the
 * properties a later edit could silently undo without any route test noticing:
 * the permission matrix, that no route handler reaches the UNSCOPED document
 * repository, that no route reads an ownership field from the request, and
 * that the migration stays additive.
 */

const ROOT = process.cwd();
const MIGRATION = "20260925120000_f2_document_tenant_fk";
const ALL_ROLES: OrgRole[] = ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN", "MEMBER"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (name === "__tests__" || name === "node_modules") return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** The platform retry trigger for storage cleanup — not a tenant route (FU-F2-R2-3). */
const CLEANUP_WORKER_ROUTE = "src/app/api/documents/storage-cleanup/route.ts";

const DOCUMENT_ROUTES = walk(path.join(ROOT, "src/app/api/documents")).filter(
  (f) =>
    f.endsWith("route.ts") &&
    !rel(f).startsWith("src/app/api/documents/dashboard/") &&
    rel(f) !== CLEANUP_WORKER_ROUTE
);

const holders = (permission: OrgPermission) => ALL_ROLES.filter((role) => can(role, permission)).sort();

describe("F-2 — permission matrix", () => {
  it("view_documents: every role that can read org media, never MEMBER", () => {
    expect(holders("view_documents")).toEqual(["ADMIN", "BILLING_ADMIN", "ENGINEER", "MANAGER", "OWNER", "VIEWER"]);
    expect(holders("view_documents")).toEqual(holders("view_media"));
  });

  it("manage_documents: authoring roles only — never VIEWER, BILLING_ADMIN or MEMBER", () => {
    expect(holders("manage_documents")).toEqual(["ADMIN", "ENGINEER", "MANAGER", "OWNER"]);
  });

  it("manage_documents implies view_documents for every role", () => {
    for (const role of ALL_ROLES) {
      if (can(role, "manage_documents")) expect(can(role, "view_documents")).toBe(true);
    }
  });
});

describe("F-2 — the scoped repository has no 'all organizations' view", () => {
  it.each(["", "   ", undefined as unknown as string, null as unknown as string])(
    "throws on a missing or blank organization id (%p)",
    (orgId) => {
      expect(() => documentRepositoryForOrganization(orgId)).toThrow(TypeError);
    }
  );
});

describe("F-2 — document route handlers", () => {
  it("DELETE removes through the transactional outbox path, never a row-only delete or a direct storage call", () => {
    const src = stripComments(readFileSync(path.join(ROOT, "src/app/api/documents/[id]/route.ts"), "utf8"));
    expect(src).toContain("repo.deleteWithStorageCleanup(id)");
    expect(src).toContain("runDocumentStorageCleanup(deletion.cleanupId)");
    expect(src).not.toMatch(/\brepo\.delete\(/);
    expect(src).not.toMatch(/getDocumentObjectStorage\(\)\.(delete|remove)\(/);
    expect(src).not.toMatch(/documentTextChunkRepository\(\)\.deleteByDocumentId/);
  });

  it("the storage-cleanup worker route is platform-guarded by its OWN worker guard and reads no document", () => {
    const src = stripComments(readFileSync(path.join(ROOT, CLEANUP_WORKER_ROUTE), "utf8"));
    expect(src).toContain("authorizeDocumentCleanupWorker(req)");
    expect(src).not.toContain("authorizeWorkerRequest"); // the metering guard (METERING/METRICS token) is not used
    expect(src).toContain("runDocumentStorageCleanupPass({ limit })");
    expect(src).not.toMatch(/documentRepository|documentRepositoryForOrganization|searchParams\.get\(\s*["'](organizationId|tenantId|documentId)/);
  });

  it("covers the four tenant-owned route files", () => {
    expect(DOCUMENT_ROUTES.map(rel).sort()).toEqual([
      "src/app/api/documents/[id]/process/route.ts",
      "src/app/api/documents/[id]/route.ts",
      "src/app/api/documents/route.ts",
      "src/app/api/documents/search/route.ts",
    ]);
  });

  it("no src/app file uses the UNSCOPED documentRepository()", () => {
    const offenders = walk(path.join(ROOT, "src/app"))
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /\bdocumentRepository\s*\(/.test(stripComments(readFileSync(f, "utf8"))))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it.each(DOCUMENT_ROUTES.map((f) => [rel(f), f]))(
    "%s runs the inline org guard chain and never reads an ownership field from the request",
    (_name, file) => {
      const src = stripComments(readFileSync(file, "utf8"));
      expect(src).toContain("requirePlatformAuth(req)");
      expect(src).toContain("requireOrgActor(req, auth.ctx.orgId)");
      expect(src).toMatch(/requirePermission\(member\.ctx\.role, "(view|manage)_documents"\)/);
      expect(src).not.toMatch(/getCurrentUser|can\(\s*\w+\.role,\s*"admin"\)/);
      for (const field of ["tenantId", "organizationId", "orgId", "uploadedBy"]) {
        expect(src).not.toMatch(new RegExp(`form\\.get\\(\\s*["']${field}["']`));
        expect(src).not.toMatch(new RegExp(`body\\s*\\??\\.\\s*${field}\\b`));
        expect(src).not.toMatch(new RegExp(`searchParams\\.get\\(\\s*["']${field}["']`));
      }
    }
  );

  it("every state-changing document handler checks the trusted origin", () => {
    for (const file of DOCUMENT_ROUTES) {
      const src = stripComments(readFileSync(file, "utf8"));
      const mutates = /export async function (DELETE|PATCH|PUT)\b/.test(src) || /manage_documents/.test(src);
      if (mutates) expect(src, rel(file)).toContain("requireTrustedOrigin(req, auth.ctx.authMethod)");
    }
  });
});

describe("F-2 — the migration is additive and changes no data", () => {
  const sql = readFileSync(path.join(ROOT, "prisma/migrations", MIGRATION, "migration.sql"), "utf8");
  const statements = sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  it("contains exactly the Document index + FK, and the new empty cleanup outbox (enum, table, indexes, FK)", () => {
    expect(statements.map((st) => st.replace(/\s+/g, " "))).toEqual([
      `CREATE INDEX "Document_tenantId_createdAt_idx" ON "Document"("tenantId", "createdAt")`,
      `ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
      `CREATE TYPE "DocumentStorageCleanupStatus" AS ENUM ('PENDING', 'DONE')`,
      `CREATE TABLE "DocumentStorageCleanup" ( "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "objectKeys" TEXT[], "status" "DocumentStorageCleanupStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0, "lastErrorCode" VARCHAR(64), "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "claimedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DocumentStorageCleanup_pkey" PRIMARY KEY ("id") )`,
      `CREATE UNIQUE INDEX "DocumentStorageCleanup_documentId_key" ON "DocumentStorageCleanup"("documentId")`,
      `CREATE INDEX "DocumentStorageCleanup_status_nextAttemptAt_idx" ON "DocumentStorageCleanup"("status", "nextAttemptAt")`,
      `CREATE INDEX "DocumentStorageCleanup_organizationId_status_nextAttemptAt_idx" ON "DocumentStorageCleanup"("organizationId", "status", "nextAttemptAt")`,
      `ALTER TABLE "DocumentStorageCleanup" ADD CONSTRAINT "DocumentStorageCleanup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    ]);
  });

  it("never drops, rewrites or deletes, and adds no chunk tenant column", () => {
    for (const s of statements) {
      // "ON DELETE RESTRICT" / "ON UPDATE CASCADE" are referential actions, not statements.
      expect(s.replace(/\bON (DELETE|UPDATE) (RESTRICT|CASCADE)\b/g, "")).not.toMatch(
        /\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT|ALTER\s+COLUMN|ADD\s+COLUMN)\b/i
      );
      expect(s).not.toContain("DocumentTextChunk");
    }
  });

  it("the schema declares the same relation", () => {
    const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
    const model = schema.match(/model Document \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(model).toMatch(
      /tenant\s+Organization\?\s+@relation\(fields: \[tenantId\], references: \[id\], onDelete: Restrict, onUpdate: Cascade\)/
    );
    expect(model).toContain("@@index([tenantId, createdAt])");
    const chunk = schema.match(/model DocumentTextChunk \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(chunk).not.toMatch(/\b(tenantId|organizationId)\b/);
  });
});
