/**
 * SECURITY (compliance hotfix) — legal-document exposure.
 *
 * Invariants:
 *   UNAUTHENTICATED_LEGAL_DRAFT_EXPOSURE=0
 *   CROSS_TENANT_LEGAL_DOCUMENT_READ=0
 *
 * The admin collection endpoint must authenticate, scope to the caller's single
 * authoritative organization (or platform-global templates for a superadmin),
 * and minimise its DTO. The public `[type]` endpoint must serve only published,
 * effective documents through a DTO free of internal fields.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";

type Member = { userId: string; organizationId: string; role: string; status: string };
type LegalRow = {
  id: string; documentType: string; version: string; title: string; content: string;
  locale: string; isPublished: boolean; publishedAt: Date | null; effectiveDate: Date | null;
  organizationId: string | null; createdBy: string | null; createdAt: Date; updatedAt: Date;
};

let payload: { sub: string; role: string; sid?: string } | null = null;
let sessionActive = true;
let members: Member[] = [];
let legalDocs: LegalRow[] = [];

function makeDb() {
  return {
    organizationMember: {
      findMany: async ({ where }: { where: { userId: string; status: string } }) =>
        members
          .filter((m) => m.userId === where.userId && m.status === where.status)
          .map((m) => ({ organizationId: m.organizationId, role: m.role })),
    },
    legalDocument: {
      findMany: async ({ where, take }: { where?: Record<string, unknown>; take?: number }) => {
        let rows = legalDocs.slice();
        if (where) {
          for (const [k, v] of Object.entries(where)) {
            rows = rows.filter((r) => (r as Record<string, unknown>)[k] === v);
          }
        }
        return typeof take === "number" ? rows.slice(0, take) : rows;
      },
    },
  };
}

const MOCKED = ["@/lib/auth/jwt", "@/lib/auth/session-store", "@/lib/db/prisma", "@/lib/logger/security-events", "@/lib/storage/storage-mode"];

beforeEach(() => {
  vi.resetModules();
  payload = null;
  sessionActive = true;
  members = [];
  legalDocs = [];
  vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => payload }));
  vi.doMock("@/lib/auth/session-store", () => ({ isPayloadSessionActive: async () => sessionActive }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => makeDb() }));
  vi.doMock("@/lib/logger/security-events", () => ({
    logAuthFailure: () => {}, logAuthzDenial: () => {}, logInfraFailure: () => {},
  }));
});

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

function row(overrides: Partial<LegalRow>): LegalRow {
  return {
    id: "d1", documentType: "PRIVACY_POLICY", version: "1.0", title: "T", content: "body",
    locale: "en", isPublished: true, publishedAt: new Date("2026-01-01"), effectiveDate: new Date("2026-01-01"),
    organizationId: null, createdBy: "creator-user", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

async function getCollection(withToken = true) {
  const { GET } = await import("../route");
  const req = new NextRequest("http://localhost/api/compliance/legal-documents", {
    headers: withToken ? { cookie: `${ACCESS_TOKEN_COOKIE}=fake-token` } : {},
  });
  const res = await GET(req);
  return { res, json: await res.json() };
}

async function getPublic(type: string, locale = "en") {
  const { GET } = await import("../[type]/route");
  const req = new Request(`http://localhost/api/compliance/legal-documents/${type}?locale=${locale}`);
  const res = await GET(req, { params: Promise.resolve({ type }) });
  return { res, json: await res.json() };
}

describe("admin collection GET — auth & tenant scope", () => {
  it("denies unauthenticated access (401)", async () => {
    const { res } = await getCollection(false);
    expect(res.status).toBe(401);
  });

  it("denies an ordinary member (403)", async () => {
    payload = { sub: "u-viewer", role: "customer", sid: "s" };
    members = [{ userId: "u-viewer", organizationId: "org-A", role: "VIEWER", status: "ACTIVE" }];
    const { res } = await getCollection();
    expect(res.status).toBe(403);
  });

  it("a tenant admin sees ONLY their organization's documents, never another tenant's drafts", async () => {
    payload = { sub: "admin-A", role: "admin", sid: "s" };
    members = [{ userId: "admin-A", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" }];
    legalDocs = [
      row({ id: "a-pub", organizationId: "org-A", isPublished: true }),
      row({ id: "a-draft", organizationId: "org-A", isPublished: false }),
      row({ id: "b-draft", organizationId: "org-B", isPublished: false }),
    ];
    const { res, json } = await getCollection();
    expect(res.status).toBe(200);
    expect(json.scope).toBe("ORGANIZATION");
    const ids = json.documents.map((d: { id: string }) => d.id).sort();
    expect(ids).toEqual(["a-draft", "a-pub"]); // includes own drafts, excludes org-B
    expect(JSON.stringify(json)).not.toContain("b-draft");
  });

  it("does not expose createdBy in the admin DTO", async () => {
    payload = { sub: "admin-A", role: "admin", sid: "s" };
    members = [{ userId: "admin-A", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" }];
    legalDocs = [row({ id: "a1", organizationId: "org-A", createdBy: "creator-user" })];
    const { json } = await getCollection();
    expect(json.documents[0]).not.toHaveProperty("createdBy");
    expect(JSON.stringify(json)).not.toContain("creator-user");
  });

  it("an ordinary admin does NOT receive platform-global templates", async () => {
    payload = { sub: "admin-A", role: "admin", sid: "s" };
    members = [{ userId: "admin-A", organizationId: "org-A", role: "ADMIN", status: "ACTIVE" }];
    legalDocs = [
      row({ id: "global", organizationId: null }),
      row({ id: "a1", organizationId: "org-A" }),
    ];
    const { json } = await getCollection();
    const ids = json.documents.map((d: { id: string }) => d.id);
    expect(ids).toEqual(["a1"]);
    expect(ids).not.toContain("global");
  });

  it("a platform superadmin receives ONLY organization-less global templates", async () => {
    payload = { sub: "root", role: "superadmin", sid: "s" };
    legalDocs = [
      row({ id: "global", organizationId: null }),
      row({ id: "a1", organizationId: "org-A" }),
    ];
    const { res, json } = await getCollection();
    expect(res.status).toBe(200);
    expect(json.scope).toBe("GLOBAL");
    const ids = json.documents.map((d: { id: string }) => d.id);
    expect(ids).toEqual(["global"]);
  });
});

describe("public [type] GET — published/effective only + minimal DTO", () => {
  it("returns a published, effective document through a public DTO without internal fields", async () => {
    legalDocs = [row({ documentType: "PRIVACY_POLICY", isPublished: true, effectiveDate: new Date("2026-01-01"), organizationId: "org-A", createdBy: "creator-user" })];
    const { res, json } = await getPublic("privacy_policy");
    expect(res.status).toBe(200);
    expect(json.document).toMatchObject({ documentType: "PRIVACY_POLICY", version: "1.0", title: "T", content: "body" });
    expect(json.document).not.toHaveProperty("createdBy");
    expect(json.document).not.toHaveProperty("organizationId");
    expect(json.document).not.toHaveProperty("isPublished");
    expect(json.document).not.toHaveProperty("id");
  });

  it("does not serve an unpublished document (404)", async () => {
    legalDocs = [row({ documentType: "PRIVACY_POLICY", isPublished: false })];
    const { res } = await getPublic("privacy_policy");
    expect(res.status).toBe(404);
  });

  it("does not serve a not-yet-effective (future-dated) document (404)", async () => {
    legalDocs = [row({ documentType: "TERMS_OF_SERVICE", isPublished: true, effectiveDate: new Date(Date.now() + 1_000_000_000) })];
    const { res } = await getPublic("terms_of_service");
    expect(res.status).toBe(404);
  });

  it("filters by locale", async () => {
    legalDocs = [
      row({ id: "en", documentType: "COOKIE_POLICY", locale: "en", isPublished: true }),
      row({ id: "de", documentType: "COOKIE_POLICY", locale: "de", isPublished: true, title: "DE-Titel" }),
    ];
    const { json } = await getPublic("cookie_policy", "de");
    expect(json.document.title).toBe("DE-Titel");
  });

  it("returns 404 for an unknown document type without an existence oracle", async () => {
    const { res } = await getPublic("not_a_real_type");
    expect(res.status).toBe(404);
  });
});
