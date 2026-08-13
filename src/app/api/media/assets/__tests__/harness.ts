/**
 * PHASE 102 — shared test harness for the media authoring/editorial routes.
 *
 * NOT a test file (vitest collects only `*.test.ts`), and deliberately not a
 * module under `src/lib`: it exists purely to give the route suites a real
 * enough Prisma double that the REAL `src/lib/media/db.ts`, `lifecycle.ts`,
 * `src/lib/org/rbac.ts` and `src/lib/org/context.ts` all execute unmocked. Only
 * the edges are replaced — token verification, the database, the audit sink, the
 * rate limiter and the entitlement resolver — so what the suites assert is the
 * behaviour of the real authorization chain, not of a mock of it.
 */

import { vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { BASE_URL } from "@/lib/seo/config";

export type Row = Record<string, unknown>;

export interface HarnessState {
  payload: { sub: string; role: string; sid?: string } | null;
  sessionActive: boolean;
  databaseAvailable: boolean;
  rateLimitAllowed: boolean;
  entitlementAllowed: boolean;
  auditEvents: Row[];
  entitlementCalls: Row[];
  tables: Record<string, Row[]>;
  /**
   * One-shot hooks keyed `"<model>.<operation>"`, fired immediately BEFORE the
   * operation evaluates its predicate and then removed. This is how a suite
   * simulates a concurrent writer landing between a read and a compare-and-swap
   * — the only way to prove that `affected !== 1` really is treated as a
   * conflict rather than being papered over.
   */
  raceHooks: Record<string, () => void>;
}

/** Every module the suites replace. Unmocked in `afterEach` — `vi.doMock` leaks
 *  forward across files in the same worker otherwise. */
export const MOCKED_MODULES = [
  "@/lib/auth/jwt",
  "@/lib/auth/session-store",
  "@/lib/db/prisma",
  "@/lib/audit/audit-service",
  "@/lib/logger/security-events",
  "@/lib/auth/rate-limiter",
  "@/lib/billing-governance/runtime/require-entitlement",
];

export function freshState(): HarnessState {
  return {
    payload: { sub: "user-engineer", role: "engineer", sid: "sid-1" },
    sessionActive: true,
    databaseAvailable: true,
    rateLimitAllowed: true,
    entitlementAllowed: true,
    auditEvents: [],
    entitlementCalls: [],
    raceHooks: {},
    tables: {
      organizationMember: [],
      mediaAsset: [],
      mediaAssetTranslation: [],
      mediaEditorialEvent: [],
      mediaCategory: [],
      mediaInstructor: [],
      industrialSite: [],
    },
  };
}

/* ── A small, fail-closed Prisma double ───────────────────────────────────── */

/**
 * Predicate matching.
 *
 * An operator this double does not implement THROWS rather than being ignored:
 * a silently-dropped `where` clause would turn a tenant-scoped query into an
 * unscoped one and make an isolation test pass for the wrong reason.
 */
function matches(row: Row, where: Row): boolean {
  for (const [key, expected] of Object.entries(where ?? {})) {
    if (expected === undefined) continue;
    const actual = row[key];
    if (expected !== null && typeof expected === "object" && !(expected instanceof Date)) {
      const op = expected as Record<string, unknown>;
      if ("in" in op) {
        if (!(op.in as unknown[]).includes(actual)) return false;
        continue;
      }
      if ("gt" in op) {
        if (!(typeof actual === "number" && actual > (op.gt as number))) return false;
        continue;
      }
      if ("not" in op) {
        if (actual === op.not) return false;
        continue;
      }
      throw new Error(`test harness: unsupported where operator on "${key}"`);
    }
    if (actual !== expected) return false;
  }
  return true;
}

function applyData(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value !== null && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) {
      const op = value as Record<string, unknown>;
      if ("increment" in op) {
        row[key] = ((row[key] as number) ?? 0) + (op.increment as number);
        continue;
      }
      if ("decrement" in op) {
        row[key] = ((row[key] as number) ?? 0) - (op.decrement as number);
        continue;
      }
    }
    row[key] = value;
  }
}

function compare(a: unknown, b: unknown): number {
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  if (av === bv) return 0;
  if (av === null || av === undefined) return -1;
  if (bv === null || bv === undefined) return 1;
  return (av as number) < (bv as number) ? -1 : 1;
}

function sortRows(rows: Row[], orderBy: unknown): Row[] {
  if (!orderBy) return rows;
  const clauses = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Row[];
  return [...rows].sort((left, right) => {
    for (const clause of clauses) {
      for (const [key, dir] of Object.entries(clause)) {
        const c = compare(left[key], right[key]);
        if (c !== 0) return dir === "desc" ? -c : c;
      }
    }
    return 0;
  });
}

/** Schema defaults the routes rely on but do not write explicitly. */
const DEFAULTS: Record<string, Row> = {
  mediaAsset: {
    siteId: null,
    categoryId: null,
    instructorId: null,
    skillLevel: null,
    storageKey: null,
    storageProvider: "local",
    contentType: null,
    byteSize: null,
    durationSeconds: null,
    posterStorageKey: null,
    viewCount: 0,
    saveCount: 0,
    completionCount: 0,
    submittedAt: null,
    reviewedAt: null,
    publishedAt: null,
    archivedAt: null,
    rejectionReason: null,
    processingFailureCode: null,
  },
  mediaAssetTranslation: { summary: null, description: null, seoTitle: null, seoDescription: null, keywords: [] },
  mediaEditorialEvent: { reason: null },
};

let sequence = 0;

function buildModel(state: HarnessState, name: string) {
  const rows = () => (state.tables[name] ??= []);
  const race = (operation: string) => {
    const key = `${name}.${operation}`;
    const hook = state.raceHooks[key];
    if (!hook) return;
    delete state.raceHooks[key];
    hook();
  };
  return {
    findFirst: async (args?: Row) => {
      const found = rows().filter((r) => matches(r, (args?.where as Row) ?? {}));
      return sortRows(found, args?.orderBy)[0] ?? null;
    },
    findMany: async (args?: Row) => {
      let out = rows().filter((r) => matches(r, (args?.where as Row) ?? {}));
      out = sortRows(out, args?.orderBy);
      const skip = typeof args?.skip === "number" ? args.skip : 0;
      const take = typeof args?.take === "number" ? args.take : out.length;
      return out.slice(skip, skip + take);
    },
    count: async (args?: Row) => rows().filter((r) => matches(r, (args?.where as Row) ?? {})).length,
    create: async (args?: Row) => {
      sequence += 1;
      const row: Row = {
        id: `${name}-${sequence}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...(DEFAULTS[name] ?? {}),
        ...((args?.data as Row) ?? {}),
      };
      rows().push(row);
      return row;
    },
    updateMany: async (args?: Row) => {
      race("updateMany");
      const hit = rows().filter((r) => matches(r, (args?.where as Row) ?? {}));
      for (const row of hit) applyData(row, (args?.data as Row) ?? {});
      return { count: hit.length };
    },
    deleteMany: async (args?: Row) => {
      const keep: Row[] = [];
      let count = 0;
      for (const row of rows()) {
        if (matches(row, (args?.where as Row) ?? {})) count += 1;
        else keep.push(row);
      }
      state.tables[name] = keep;
      return { count };
    },
  };
}

export function buildPrismaDouble(state: HarnessState) {
  const client: Record<string, unknown> = {};
  for (const name of Object.keys(state.tables)) client[name] = buildModel(state, name);
  client.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(client);
  return client;
}

/* ── Mock installation ────────────────────────────────────────────────────── */

export function installMocks(state: HarnessState): void {
  vi.doMock("@/lib/auth/jwt", () => ({
    verifyAccessToken: async () => state.payload,
    signAccessToken: async () => "unused",
  }));
  vi.doMock("@/lib/auth/session-store", () => ({
    isPayloadSessionActive: async () => state.sessionActive,
  }));
  vi.doMock("@/lib/db/prisma", () => ({
    getPrisma: async () => (state.databaseAvailable ? buildPrismaDouble(state) : null),
  }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (event: Row) => {
      state.auditEvents.push(event);
    },
    INFRA_AUDIT: {},
    KNOWLEDGE_AUDIT: {},
    COMPLIANCE_AUDIT: {},
  }));
  vi.doMock("@/lib/logger/security-events", () => ({
    logAuthFailure: () => {},
    logAuthzDenial: () => {},
    logInfraFailure: () => {},
  }));
  vi.doMock("@/lib/auth/rate-limiter", () => ({
    checkRateLimit: async () => state.rateLimitAllowed,
    retryAfter: () => 42,
    limitWindowSeconds: () => 60,
    remainingAttempts: async () => 1,
    isAuthLimiterDegraded: () => false,
  }));
  vi.doMock("@/lib/billing-governance/runtime/require-entitlement", () => ({
    enforceEntitlement: async (args: Row) => {
      state.entitlementCalls.push(args);
      if (state.entitlementAllowed) return { ok: true, decision: { allowed: true } };
      return {
        ok: false,
        decision: { allowed: false, reason: "FEATURE_NOT_ENTITLED" },
        response: NextResponse.json(
          { error: "Not entitled", code: "FEATURE_NOT_ENTITLED" },
          { status: 402 },
        ),
      };
    },
  }));
}

export function uninstallMocks(): void {
  for (const mod of MOCKED_MODULES) vi.doUnmock(mod);
}

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

export interface SeedMemberInput {
  userId: string;
  organizationId: string;
  role: string;
  status?: string;
}

export function seedMember(state: HarnessState, input: SeedMemberInput): void {
  state.tables.organizationMember.push({
    id: `member-${state.tables.organizationMember.length + 1}`,
    userId: input.userId,
    organizationId: input.organizationId,
    role: input.role,
    status: input.status ?? "ACTIVE",
    createdAt: new Date(2026, 0, 1 + state.tables.organizationMember.length),
  });
}

export interface SeedAssetInput {
  id: string;
  organizationId: string;
  slug?: string;
  status?: string;
  visibility?: string;
  processingState?: string;
  publishedAt?: Date | null;
  categoryId?: string | null;
  skillLevel?: string | null;
}

export function seedAsset(state: HarnessState, input: SeedAssetInput): Row {
  const row: Row = {
    ...DEFAULTS.mediaAsset,
    id: input.id,
    organizationId: input.organizationId,
    slug: input.slug ?? input.id,
    primaryLocale: "en",
    status: input.status ?? "DRAFT",
    visibility: input.visibility ?? "ORGANIZATION",
    processingState: input.processingState ?? "PENDING_UPLOAD",
    skillLevel: input.skillLevel ?? null,
    categoryId: input.categoryId ?? null,
    publishedAt: input.publishedAt ?? null,
    createdBy: "seed",
    updatedBy: null,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
  };
  state.tables.mediaAsset.push(row);
  return row;
}

export function seedTranslation(
  state: HarnessState,
  input: { mediaAssetId: string; organizationId: string; locale: string; title: string },
): void {
  state.tables.mediaAssetTranslation.push({
    ...DEFAULTS.mediaAssetTranslation,
    id: `tr-${state.tables.mediaAssetTranslation.length + 1}`,
    ...input,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
  });
}

/* ── Request builders ─────────────────────────────────────────────────────── */

const BASE = "http://localhost/api/media/assets";

/**
 * The origin a real same-origin browser write carries. DERIVED from the same
 * `BASE_URL` that `isAllowedOrigin` reads, so this harness cannot drift away
 * from the policy it exercises.
 */
export const ALLOWED_ORIGIN = new URL(BASE_URL).origin;

/** A cross-site origin. Every cookie-authenticated write must refuse it. */
export const FOREIGN_ORIGIN = "https://attacker.example";

/**
 * A suffix-spoof of the canonical host — the classic bypass of a
 * `startsWith`/`endsWith` origin check. Must be refused.
 */
export const LOOKALIKE_ORIGIN = `${ALLOWED_ORIGIN}.attacker.example`;

export function getRequest(query = ""): NextRequest {
  // Reads carry no CSRF risk and deliberately send no Origin, which also proves
  // the gate was not accidentally applied to GET.
  return new NextRequest(`${BASE}${query}`, {
    method: "GET",
    headers: { cookie: `${ACCESS_TOKEN_COOKIE}=fake-token` },
  });
}

/**
 * @param origin `undefined` sends the allowed same-origin value — what a browser
 *   does on a legitimate write. `null` sends NO `Origin` header, which is what a
 *   cross-site form post and a non-browser client both look like.
 */
export function jsonRequest(
  method: "POST" | "PATCH",
  body: unknown,
  path = "",
  contentType = "application/json",
  origin: string | null = ALLOWED_ORIGIN,
): NextRequest {
  const headers: Record<string, string> = {
    cookie: `${ACCESS_TOKEN_COOKIE}=fake-token`,
    "content-type": contentType,
  };
  if (origin !== null) headers.origin = origin;
  return new NextRequest(`${BASE}${path}`, {
    method,
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
