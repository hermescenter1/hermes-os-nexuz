import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapPrismaError, orgScope, siteScope, safeOrderBy, SORT_FIELDS } from "../core";
import { buildOtServiceContext } from "../../service-context";

/**
 * PHASE 94B3.2 — static regressions and error-mapper leakage.
 *
 * These supplement — never replace — the executable database tests. A source
 * scan catches the class of mistake that a passing test cannot: a NEW method
 * added later that forgets the tenant predicate, or a `findUnique` by client id
 * that happens to be exercised only in a path nobody wrote a test for.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

const ADAPTERS = "src/lib/ot-edge/persistence/prisma-adapters.ts";
const CORE = "src/lib/ot-edge/persistence/core.ts";

describe("94B3.2 — adapters cannot drift into an unscoped query", () => {
  const code = strip(read(ADAPTERS));

  it("never looks a record up by client id alone", () => {
    // `findUnique({ where: { id } })` fetches a foreign row and relies on a
    // later check. Every lookup here must be findFirst WITH the tenant filter.
    expect(code, "findUnique must not appear at all").not.toMatch(/findUnique\s*\(/);
  });

  it("every findFirst/findMany/count/updateMany carries an organization predicate", () => {
    // A call is scoped when it composes a scope helper inline, or when it
    // passes a `where` variable — every one of which is proven scope-derived by
    // the next test, so the two together close the loop.
    const calls = [...code.matchAll(/\.(findFirst|findMany|count|updateMany|deleteMany)\(\{[\s\S]{0,400}?\}\)/g)];
    expect(calls.length).toBeGreaterThan(10);
    for (const c of calls) {
      const text = c[0];
      const scoped =
        text.includes("orgScope(ctx)") ||
        text.includes("scope(ctx)") ||
        text.includes("artifactScope(ctx") ||
        /\bwhere\b/.test(text);
      expect(scoped, `unscoped query:\n${text.slice(0, 200)}`).toBe(true);
    }
  });

  it("every `where` variable is itself built from a scope helper", () => {
    // This is what makes accepting the `{ where }` shorthand safe: a future
    // `const where = { id }` with no tenant predicate fails here.
    // PHASE 94B.1 — tolerate a type annotation. `const where: Row = ...` did
    // not match the original pattern, so two of the six queries silently left
    // this guard while the suite stayed green (the `> 3` floor was still met).
    const assignments = [...code.matchAll(/const where\s*(?::[^=;]+)?=\s*([^;]+);/g)];
    // An exact count, not a floor: a floor lets a query drop out of the guard
    // without failing anything, which is precisely how the annotation escaped.
    expect(assignments.length, "a `where` variable left this guard").toBe(6);
    for (const a of assignments) {
      const rhs = a[1];
      expect(
        /scope\(ctx\)|artifactScope\(ctx/.test(rhs),
        `a where variable was not scope-derived: ${rhs.slice(0, 120)}`,
      ).toBe(true);
    }
  });

  it("constructs no Prisma client of its own — the client is injected", () => {
    expect(code).not.toMatch(/new PrismaClient/);
    expect(code).not.toMatch(/getPrisma\s*\(/);
    expect(code).not.toMatch(/from ["']@prisma\/client["']/);
  });

  it("returns no raw driver metadata to callers", () => {
    for (const forbidden of [/err\.message/, /String\(err\)/, /JSON\.stringify\(err/, /err\.meta/]) {
      expect(code, `${forbidden} would leak driver detail`).not.toMatch(forbidden);
    }
  });

  it("never emits a device write or control instruction", () => {
    for (const forbidden of [/writeTag/i, /actuate/i, /setpoint/i, /acknowledgeAlarm/i, /plcWrite/i]) {
      expect(code).not.toMatch(forbidden);
    }
  });
});

describe("94B3.2 — the empty site scope is never widened", () => {
  const code = strip(read(CORE));

  it("siteScope returns a matching-nothing predicate for a zero-site actor", () => {
    const ctx = buildOtServiceContext({
      userId: "u", organizationId: "o", role: "ENGINEER", allowedSiteIds: [],
    });
    const f = siteScope(ctx);
    expect(f).toEqual({ in: [] });
    expect(f, "undefined here would grant the whole organization").not.toBeUndefined();
  });

  it("only an explicit null means org-wide", () => {
    const all = buildOtServiceContext({ userId: "u", organizationId: "o", role: "ADMIN", allowedSiteIds: null });
    expect(siteScope(all)).toBeUndefined();
    expect(orgScope(all)).toEqual({ organizationId: "o" });
  });

  it("the implementation branches on null, not on emptiness", () => {
    // `allowedSiteIds?.length ? {...} : undefined` would be the dangerous form.
    expect(code).toMatch(/allowedSiteIds === null/);
    expect(code).not.toMatch(/allowedSiteIds\?\.length\s*\?/);
  });
});

describe("94B3.2 — sort fields are an allow-list", () => {
  it("an arbitrary field cannot reach orderBy", () => {
    for (const evil of ["signingKeyRef", "idempotencyKey", "id; DROP TABLE", "__proto__"]) {
      const order = safeOrderBy("gateway", evil, "asc");
      expect(Object.keys(order)).toEqual([SORT_FIELDS.gateway[0]]);
    }
  });

  it("an allowed field is honoured, and direction is constrained", () => {
    expect(safeOrderBy("project", "name", "asc")).toEqual({ name: "asc" });
    expect(safeOrderBy("project", "name", "sideways")).toEqual({ name: "desc" });
  });
});

describe("94B3.2 — the error mapper discloses nothing", () => {
  /** Synthetic driver errors carrying values that must never escape. */
  const SECRET = "postgresql://admin:SUPERSECRET@prod-db:5432/hermes_live";
  const cases = [
    ["P2002", "CONFLICT"],
    ["23505", "CONFLICT"],
    ["P2003", "VALIDATION_FAILED"],
    ["23503", "VALIDATION_FAILED"],
    ["P2025", "NOT_FOUND"],
    ["P2034", "TRANSIENT_FAILURE"],
    ["40001", "TRANSIENT_FAILURE"],
    ["P9999", "INTERNAL_FAILURE"],
  ] as const;

  it.each(cases)("maps %s to %s", (code, expected) => {
    const err = Object.assign(new Error(`connect ${SECRET}`), {
      code,
      meta: { target: ["EngineeringImport_organizationId_checksum_key"], table: "EngineeringImport" },
      stack: `at Object.<anonymous> (/srv/app/secret.ts:1:1)\n${SECRET}`,
    });
    const mapped = mapPrismaError(err);
    expect(mapped.code).toBe(expected);
  });

  it("the mapped error contains no constraint, table, column, SQL or url", () => {
    const err = Object.assign(new Error(`duplicate key value violates unique constraint "EngineeringImport_organizationId_idempotencyKey_key" ${SECRET}`), {
      code: "P2002",
      meta: { target: ["organizationId", "idempotencyKey"], modelName: "EngineeringImport" },
    });
    const serialized = JSON.stringify(mapPrismaError(err));
    for (const leak of [
      "SUPERSECRET", "prod-db", "hermes_live", "postgresql://",
      "EngineeringImport", "idempotencyKey", "unique constraint", "P2002",
    ]) {
      expect(serialized, `${leak} leaked through the mapper`).not.toContain(leak);
    }
  });

  it("a non-object throw still maps safely", () => {
    for (const weird of [null, undefined, "boom", 42, Symbol("x")]) {
      const mapped = mapPrismaError(weird);
      expect(mapped.code).toBe("INTERNAL_FAILURE");
      expect(JSON.stringify(mapped)).not.toContain("boom");
    }
  });
});

describe("94B3.2 — the transaction boundary is structural", () => {
  const code = strip(read(ADAPTERS));

  it("repositories are built over an injected client, so a tx client can be passed", () => {
    expect(code).toMatch(/export function createOtRepositories\(db: OtPrismaClient\)/);
    expect(code).toMatch(/\$transaction\(\(tx\) => fn\(createOtRepositories\(tx\)\)\)/);
  });

  it("the callback receives repositories, never a raw client", () => {
    // Handing the callback a client would let it issue unscoped queries.
    expect(code).toMatch(/runInTransaction<T>\(fn: \(repos: OtRepositories\) => Promise<T>\)/);
  });
});
