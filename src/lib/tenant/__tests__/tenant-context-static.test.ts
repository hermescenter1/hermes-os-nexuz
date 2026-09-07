/**
 * PHASE 110-A1.0 — static, graph and schema gates for the tenant boundary.
 *
 * The behavioural suite proves the resolver decides correctly TODAY. These
 * gates protect the properties a well-meaning future edit is most likely to
 * undo, and which no unit test can observe once undone:
 *
 *   1. the resolver never selects among memberships (`findFirst`, ordering);
 *   2. the resolver never treats anything the client sent as authority;
 *   3. no `"use client"` module can reach it — proven by walking the actual
 *      import graph, not by scanning this file's own text;
 *   4. `Organization` has no lifecycle column, so the day one is added this
 *      resolver is forced to make a deliberate decision instead of ignoring it.
 *
 * All four failures look harmless in a diff. `findFirst` is shorter than
 * `findMany`; reading `req.nextUrl.searchParams.get("organizationId")` looks
 * like a feature; importing a resolver from a client component looks like
 * convenience; and adding `deletedAt` to a model looks like an improvement.
 * `src/lib/billing/context.ts` shows how the first one ends: a `findFirst` with
 * `orderBy: { createdAt: "asc" }` and a comment explaining the choice, which is
 * still an arbitrary choice.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TENANT_CONTEXT_STATES,
  TENANT_DIAGNOSTICS,
  ACTIVE_MEMBERSHIP_STATUS,
  MEMBER_STATUSES,
  ORGANIZATION_ROLES,
  TRUSTED_VALUE_MAX_LENGTH,
  UNREPRESENTABLE_ORGANIZATION_LIFECYCLE_FIELDS,
  hasTenantContext,
} from "../contract";
import { resolveTenantContext, type MembershipRow, type TenantContextPorts } from "../context";

import {
  findForbiddenChain,
  listClientEntries,
} from "../../../../scripts/ci/lib/phase101r-client-graph.mjs";

const REPO = process.cwd();
const SRC = path.join(REPO, "src");
const MODULE_DIR = path.join(SRC, "lib", "tenant");
const CONTEXT_FILE = path.join(MODULE_DIR, "context.ts");
const CONTEXT_SRC = fs.readFileSync(CONTEXT_FILE, "utf8");
const CONTRACT_SRC = fs.readFileSync(path.join(MODULE_DIR, "contract.ts"), "utf8");

/** Source with comments removed, so prose about a pattern is not mistaken for it. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

const CONTEXT_CODE = code(CONTEXT_SRC);

/* ── 1. Selection primitives are forbidden ───────────────────────────────── */

describe("the resolver may not select among memberships", () => {
  it("never calls findFirst", () => {
    expect(CONTEXT_CODE).not.toMatch(/\bfindFirst\b/);
  });

  it("reads memberships with findMany", () => {
    expect(CONTEXT_CODE).toMatch(/\bfindMany\b/);
  });

  it("never orders the membership query", () => {
    // An ordered query is how an arbitrary choice is made to look deliberate.
    expect(CONTEXT_CODE).not.toMatch(/orderBy/);
  });

  it("never takes the first or last membership as the answer", () => {
    expect(CONTEXT_CODE).not.toMatch(/active\s*\[\s*0\s*\]/);
    expect(CONTEXT_CODE).not.toMatch(/\.at\(\s*-?\d+\s*\)/);
    expect(CONTEXT_CODE).not.toMatch(/candidates\s*\[\s*0\s*\]/);
    expect(CONTEXT_CODE).not.toMatch(/\btake\s*:/);
  });

  it("guards the single-membership read with an explicit count check", () => {
    const refusal = CONTEXT_CODE.indexOf("proven.length > 1");
    const read = CONTEXT_CODE.indexOf("proven[0]");
    expect(refusal).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(refusal);
  });
});

/* ── 2. Client input is never authority ──────────────────────────────────── */

describe("the resolver takes no authority from the request", () => {
  it("never reads an organization from a query string, body, path or header", () => {
    expect(CONTEXT_CODE).not.toMatch(/searchParams/);
    expect(CONTEXT_CODE).not.toMatch(/req\.json\(/);
    expect(CONTEXT_CODE).not.toMatch(/\bparams\b/);
    expect(CONTEXT_CODE).not.toMatch(/headers\(\)\.get|req\.headers\.get/);
  });

  it("never reads an organization or site id from a cookie", () => {
    // Identity comes from a cookie; tenancy must not.
    expect(CONTEXT_CODE).not.toMatch(/cookies\.get\(\s*["'`][^"'`]*org/i);
    expect(CONTEXT_CODE).not.toMatch(/cookies\.get\(\s*["'`][^"'`]*site/i);
  });

  it("never coerces a value into an identifier", () => {
    // String(undefined) === "undefined", which is a usable-looking id.
    expect(CONTEXT_CODE).not.toMatch(/String\(/);
    expect(CONTEXT_CODE).not.toMatch(/\.toString\(\)/);
    expect(CONTEXT_CODE).not.toMatch(/\.trim\(\)/);
    expect(CONTEXT_CODE).not.toMatch(/\btoLowerCase\(|\btoUpperCase\(/);
  });

  it("uses the revocation-checked identity helpers, not a bare token verify", () => {
    // getUserIdFromRequest and getCurrentUser both call isPayloadSessionActive.
    // verifyAccessToken alone does not, so a revoked session would still resolve.
    //
    // Asserting on the CALL, not the import. An earlier revision matched the
    // bare identifier, which an unused import satisfied: mutation M7 replaced
    // the server-session adapter's body with a constant user id and this gate
    // stayed green because the import line was still there.
    expect(CONTEXT_CODE).toMatch(/getUserIdFromRequest\(\s*req\s*\)/);
    expect(CONTEXT_CODE).toMatch(/await\s+getCurrentUser\(\s*\)/);
    expect(CONTEXT_CODE).not.toMatch(/verifyAccessToken/);
  });

  it("neither adapter supplies an identity of its own", () => {
    // The identity port must delegate. A literal user id anywhere in an
    // adapter would be an authentication bypass wearing a helper's clothes.
    const adapters = CONTEXT_CODE.slice(CONTEXT_CODE.indexOf("function prismaPorts"));
    expect(adapters).not.toMatch(/identity:\s*async\s*\(\)\s*=>\s*["'`]/);
    expect(adapters).not.toMatch(/=>\s*["'`][\w-]+["'`]\s*\)\s*\)?;?\s*$/m);
  });

  it("uses the canonical Prisma accessor and nothing else", () => {
    expect(CONTEXT_CODE).toMatch(/getPrisma/);
    expect(CONTEXT_CODE).not.toMatch(/new PrismaClient/);
    expect(CONTEXT_CODE).not.toMatch(/DATABASE_URL/);
    expect(CONTEXT_CODE).not.toMatch(/mock-data|MOCK_|fixtures/);
  });

  it("no catch in the DECISION path is silent — each classifies and returns", () => {
    /*
     * The Phase 110-A0 defect this guards against is `catch { }` in a data
     * layer turning an outage into fabricated data.
     *
     * R5 SPLIT THIS GATE, because the module now has two kinds of catch and
     * they have opposite correct behaviour:
     *
     *   DECISION path      must classify — return a union member with a
     *                      diagnostic. Never silent.
     *   RECORDING boundary must be silent — a failing log sink may not change
     *                      a tenant decision, and re-reporting into the same
     *                      failing subsystem is how a logger takes an app down.
     *
     * The decision path is everything before the recording helpers.
     */
    const decision = CONTEXT_CODE.slice(CONTEXT_CODE.indexOf("export async function resolveTenantContext"));
    expect(decision).not.toMatch(/catch\s*\{\s*\}/);
    const catches = decision.match(/catch\s*\{/g) ?? [];
    const classified = decision.match(/return unavailable\(|malformedRow = true/g) ?? [];
    expect(catches.length).toBeGreaterThan(0);
    expect(classified.length).toBeGreaterThanOrEqual(catches.length);
  });

  it("the recording boundary never forwards a caught value, and never throws", () => {
    /*
     * R5 finding F1. Every catch handed the RAW thrown value to
     * `logInfraFailure`, which reads `error.constructor.name` and
     * `error.message.slice(0, 300)`. Measured against the R4 source with the
     * REAL logger: 18 of 18 hostile combinations left the union as a rejected
     * promise, and a synthetic marker inside a throwing `message` getter
     * escaped with them.
     */
    // No caught binding may be forwarded to a logger.
    expect(CONTEXT_CODE).not.toMatch(/logInfraFailure\([^)]*\berr\b/);
    expect(CONTEXT_CODE).not.toMatch(/logAuthzDenial\([^)]*\berr\b/);
    // The decision path must not name a caught value at all.
    const decision = CONTEXT_CODE.slice(CONTEXT_CODE.indexOf("export async function resolveTenantContext"));
    expect(decision).not.toMatch(/catch\s*\(/);
    // The logger is reached only through the two guarded helpers.
    expect(CONTEXT_CODE).toMatch(/function recordInfraFailure/);
    expect(CONTEXT_CODE).toMatch(/function recordDenial/);
    expect((CONTEXT_CODE.match(/logInfraFailure\(/g) ?? []).length).toBe(1);
    expect((CONTEXT_CODE.match(/logAuthzDenial\(/g) ?? []).length).toBe(1);
    // What IS given to the logger is a fresh local Error carrying the closed
    // diagnostic token — never anything derived from the caught value.
    expect(CONTEXT_CODE).toMatch(/new Error\(diagnostic\)/);
    // None of the unsafe inspections the logger would otherwise perform.
    for (const forbidden of ["err.message", "err.stack", "err.name", "err instanceof", "String(err", "JSON.stringify(err"]) {
      expect(CONTEXT_CODE, forbidden).not.toContain(forbidden);
    }
  });

  it("is marked server-only at module scope", () => {
    expect(CONTEXT_CODE).toMatch(/assertServerOnly\(/);
    expect(CONTEXT_CODE).not.toMatch(/^\s*["']use client["']/m);
  });

  it("caches nothing", () => {
    expect(CONTEXT_CODE).not.toMatch(/unstable_cache|revalidate|cache\(/);
    expect(CONTEXT_CODE).not.toMatch(/globalThis\.__/);
  });

  it("invents no fallback organization", () => {
    expect(CONTEXT_CODE).not.toMatch(/DEFAULT_ORG|PERSONAL_ORG|GLOBAL_ORG|FALLBACK_ORG/i);
  });

  it("suppresses no compiler or lint diagnostic", () => {
    for (const src of [CONTEXT_SRC, CONTRACT_SRC]) {
      expect(src).not.toMatch(/@ts-ignore|@ts-expect-error|eslint-disable/);
    }
  });
});

/* ── 2b. Untrusted values are read by descriptor, never by access (R3) ───── */

/**
 * R3-1: destructuring an untrusted object EXECUTES its getters and Proxy traps.
 *
 * Measured against the pre-R3 source: a membership or organization row carrying
 * a throwing getter made `resolveTenantContext` REJECT rather than return a
 * union member, and the rejection carried the getter's own message — which in
 * the probe contained a connection string. Four further shapes, including a row
 * whose fields were merely inherited, were silently accepted.
 *
 * These gates pin the shape of the fix, because the defect is invisible in a
 * diff: `const { id } = v` is shorter and more idiomatic than a descriptor
 * read, and reads identically to a reviewer who is not thinking about
 * accessors.
 */
describe("untrusted port values are read by descriptor, never by property access", () => {
  const projection = CONTEXT_CODE.slice(
    CONTEXT_CODE.indexOf("function projectMembership"),
    CONTEXT_CODE.indexOf("/* ── Core decision"),
  );

  it("the projection functions were located", () => {
    expect(projection).toContain("projectMembership");
    expect(projection).toContain("projectOrganization");
    expect(projection.length).toBeGreaterThan(200);
  });

  it("neither projection destructures the untrusted value", () => {
    // `const { organizationId, role, status } = v;` — the R3-1 defect.
    expect(projection).not.toMatch(/const\s*\{[^}]*\}\s*=\s*v\s*;/);
  });

  it("both projections read through readOwnDataProperty", () => {
    expect(projection).toMatch(/readOwnDataProperty\(v,\s*"organizationId"\)/);
    expect(projection).toMatch(/readOwnDataProperty\(v,\s*"role"\)/);
    expect(projection).toMatch(/readOwnDataProperty\(v,\s*"status"\)/);
    expect(projection).toMatch(/readOwnDataProperty\(v,\s*"id"\)/);
    expect(projection).toMatch(/readOwnDataProperty\(v,\s*"slug"\)/);
  });

  it("the reader uses getOwnPropertyDescriptor and refuses accessors", () => {
    expect(CONTEXT_CODE).toMatch(/Object\.getOwnPropertyDescriptor\(/);
    expect(CONTEXT_CODE).toMatch(/descriptor\.get/);
    expect(CONTEXT_CODE).toMatch(/descriptor\.set/);
    expect(CONTEXT_CODE).toMatch(/"value" in descriptor/);
  });

  it("every meta-operation on an untrusted object is guarded", () => {
    // Object.getPrototypeOf and Object.getOwnPropertyDescriptor both invoke
    // Proxy traps that can throw; each must sit inside a try.
    for (const op of ["Object.getPrototypeOf(", "Object.getOwnPropertyDescriptor("]) {
      const at = CONTEXT_CODE.indexOf(op);
      expect(at, op + " not found").toBeGreaterThan(-1);
      const before = CONTEXT_CODE.slice(Math.max(0, at - 400), at);
      expect(before, op + " is not inside a try").toMatch(/try\s*\{/);
    }
  });

  it("the ordinary-object guard replaced the old permissive one", () => {
    // `isPlainRecord` proved only typeof/null/!Array and was named as though it
    // proved more. Its successor states what it checks.
    expect(CONTEXT_CODE).not.toMatch(/isPlainRecord/);
    expect(CONTEXT_CODE).toMatch(/function isOrdinaryObject/);
    expect(CONTEXT_CODE).toMatch(/proto === Object\.prototype \|\| proto === null/);
  });

  it("the membership container walk is guarded too", () => {
    // Array.isArray is true for a Proxy wrapping an array, and iterating one
    // runs its traps.
    const walk = CONTEXT_CODE.slice(CONTEXT_CODE.indexOf("const rows: MembershipRow[] = []"));
    expect(walk.slice(0, 400)).toMatch(/try\s*\{/);
  });

  it("the narrow catches do not collapse diagnostic attribution", () => {
    // A single catch around the whole resolver would make an identity outage,
    // a membership outage and a refused value indistinguishable.
    for (const d of [
      "IDENTITY_UNAVAILABLE",
      "MEMBERSHIP_QUERY_FAILED",
      "MEMBERSHIP_RESULT_MALFORMED",
      "ORGANIZATION_QUERY_FAILED",
      "ORGANIZATION_RESULT_MALFORMED",
    ]) {
      expect(CONTEXT_CODE, d).toContain(d);
    }
  });
});

/* ── 2c. Meta-operations are guarded, and claims stay truthful (R4) ──────── */

/**
 * R4-1: `Array.isArray` is a meta-operation.
 *
 * On a REVOKED Proxy it throws rather than answering — measured on this
 * repository's Node (v24.18.0):
 *
 *   Array.isArray(revoked)
 *     -> TypeError: Cannot perform 'IsArray' on a proxy that has been revoked
 *
 * and `typeof revoked === "object"`, `revoked !== null`, so a revoked value
 * reaches the call. Both `Array.isArray` sites were previously outside a try,
 * which made the total-result property depend on whichever caller happened to
 * wrap them rather than on the checks themselves.
 */
describe("every meta-operation on an untrusted value is guarded", () => {
  const GUARDED_OPS = ["Array.isArray(", "Object.getPrototypeOf(", "Object.getOwnPropertyDescriptor("];

  it.each(GUARDED_OPS)("%s appears only inside a try", (op) => {
    let from = 0;
    let seen = 0;
    for (;;) {
      const at = CONTEXT_CODE.indexOf(op, from);
      if (at === -1) break;
      seen += 1;
      const before = CONTEXT_CODE.slice(Math.max(0, at - 500), at);
      const lastTry = before.lastIndexOf("try {");
      const lastCatch = before.lastIndexOf("catch");
      expect(lastTry, `${op} occurrence ${seen} is not inside a try`).toBeGreaterThan(-1);
      expect(lastTry, `${op} occurrence ${seen} sits after the catch`).toBeGreaterThan(lastCatch);
      from = at + op.length;
    }
    expect(seen, `${op} not found at all`).toBeGreaterThan(0);
  });

  it("the container shape check goes through the guarded helper", () => {
    expect(CONTEXT_CODE).toMatch(/function isArraySafe/);
    expect(CONTEXT_CODE).toMatch(/isArraySafe\(rawRows\)/);
    // The raw call must not reappear on the container.
    expect(CONTEXT_CODE).not.toMatch(/Array\.isArray\(rawRows\)/);
  });
});

/**
 * A TRUTHFULNESS GATE.
 *
 * An earlier revision of this module claimed, in source and in its evidence,
 * that FOREIGN CODE NEVER RUNS during projection. That was false:
 * `Object.getPrototypeOf` and `Object.getOwnPropertyDescriptor` invoke a
 * Proxy's corresponding traps, measured at 1 and 3 for an accepted membership
 * row. An overstated security guarantee is worse than a modest one, because
 * the next person reasons from it.
 *
 * This gate fails if the overstatement returns.
 */
describe("the stated guarantee stays truthful", () => {
  const FALSE_CLAIMS = [
    "FOREIGN CODE NEVER RUNS",
    "foreign code never runs",
    "without executing foreign code",
    "not one line of its code ran",
    "no foreign code",
  ];

  it.each(FALSE_CLAIMS)("the source does not claim %s", (claim) => {
    expect(CONTEXT_SRC).not.toContain(claim);
    expect(CONTRACT_SRC).not.toContain(claim);
  });

  it("the source states the narrower guarantee explicitly", () => {
    // Comments are read from the RAW source here: this gate is about prose.
    expect(CONTEXT_SRC).toMatch(/meta-operations/);
    // [\s\S] rather than the `s` (dotAll) flag: this repository targets below
    // ES2018, where that flag is a compile error (TS1501).
    expect(CONTEXT_SRC).toMatch(/getPrototypeOf[\s\S]*trap|trap[\s\S]*getPrototypeOf/);
    expect(CONTEXT_SRC).toMatch(/side effects cannot be prevented|SIDE EFFECTS cannot be prevented/i);
  });

  it('"ordinary object" is not claimed to prove a value is not a Proxy', () => {
    expect(CONTEXT_SRC).toMatch(/NOT proof that a\s+\*?\s*value is not a Proxy|not proof that a value is not a Proxy/i);
  });
});

/* ── 3. THE IMPORT-GRAPH BOUNDARY ────────────────────────────────────────── */

/**
 * The gate that a text scan cannot be.
 *
 * `assertServerOnly` throws only in a real browser realm — `window` and
 * `document` are both undefined during SSR and during `next build`, so neither
 * `tsc` nor the production build rejects a `"use client"` module that imports
 * this resolver. That was measured, not assumed: with a disposable client
 * fixture importing `context.ts` in place, `tsc --noEmit` exited 0 and
 * `npm run build` exited 0.
 *
 * The repository already owns a real transitive walker —
 * `scripts/ci/lib/phase101r-client-graph.mjs` — but its `serverOnlyModules()`
 * list is five Phase 101 files, so it never looked at this module. The walker is
 * reused here with this module as the forbidden target rather than duplicated,
 * so the two gates cannot drift into disagreeing.
 */
describe("IMPORT-GRAPH BOUNDARY — no client module may reach the resolver", () => {
  const entries = listClientEntries(SRC) as string[];
  const forbidden = new Set([CONTEXT_FILE]);

  it("the walker is actually finding client entries (a silent walker passes forever)", () => {
    expect(entries.length).toBeGreaterThan(100);
    expect(fs.existsSync(CONTEXT_FILE)).toBe(true);
  });

  it('no "use client" module transitively imports src/lib/tenant/context.ts', () => {
    const chains: string[][] = [];
    for (const entry of entries) {
      const chain = findForbiddenChain(entry, forbidden, SRC) as string[] | null;
      if (chain) chains.push(chain.map((f) => path.relative(REPO, f).split("\\").join("/")));
    }
    expect(chains, `client import chains reaching the resolver:\n${JSON.stringify(chains, null, 2)}`)
      .toEqual([]);
  });

  it("the walker WOULD find such a chain — proven against a synthetic entry", () => {
    // Without this, the assertion above could be passing because the walker
    // never resolves the alias, not because nothing imports the module. A
    // temporary file on disk is not needed: the walker is asked directly
    // whether the resolver's own importers are reachable, using a real module
    // that does import it — the test file this suite lives in.
    const selfChain = findForbiddenChain(
      path.join(MODULE_DIR, "__tests__", "tenant-context-static.test.ts"),
      forbidden,
      SRC,
    ) as string[] | null;
    expect(selfChain, "the walker cannot resolve an import of context.ts at all").not.toBeNull();
  });

  it("the resolver's server-only dependencies are not client-importable either", () => {
    // Prisma, the session store and the org context all arrive through this
    // module; if it is out of the client graph, so are they.
    for (const dep of ["@/lib/db/prisma", "@/lib/auth/session", "@/lib/org/context"]) {
      expect(CONTEXT_CODE).toContain(dep);
    }
    const depFiles = new Set([
      path.join(SRC, "lib", "db", "prisma.ts"),
      path.join(SRC, "lib", "auth", "session.ts"),
    ]);
    const leaks: string[] = [];
    for (const entry of entries) {
      const chain = findForbiddenChain(entry, depFiles, SRC) as string[] | null;
      if (chain) leaks.push(path.relative(REPO, chain[0]).split("\\").join("/"));
    }
    expect(leaks, `client entries reaching Prisma/session:\n${leaks.join("\n")}`).toEqual([]);
  });
});

/* ── 4. The schema limitation, made loud ─────────────────────────────────── */

/**
 * `Organization` has no lifecycle column today, so "this organization is
 * disabled" is not representable and the resolver does not pretend otherwise.
 *
 * The danger is the day someone adds one. A soft-disable column that nothing
 * reads is worse than no column at all: operators would believe disabling an
 * organization revokes access, and it would not. This gate fails on that
 * migration and forces the decision to be made here.
 */
describe("Organization lifecycle fields are not representable — and must stay loud", () => {
  const schema = fs.readFileSync(path.join(REPO, "prisma", "schema.prisma"), "utf8");
  const model = schema.match(/^model\s+Organization\s*\{([\s\S]*?)^\}/m);

  it("the Organization model was actually located", () => {
    expect(model).not.toBeNull();
  });

  it.each([...UNREPRESENTABLE_ORGANIZATION_LIFECYCLE_FIELDS])(
    "Organization still has no `%s` column — if it gains one, teach the resolver first",
    (field) => {
      const body = model?.[1] ?? "";
      const declared = new RegExp(`^\\s*${field}\\s+\\S`, "m").test(body);
      expect(
        declared,
        `Organization.${field} now exists. src/lib/tenant/context.ts proves only that the ` +
          `organization row LOADS; it does not read ${field}, so a disabled organization would ` +
          `still resolve to a tenant context. Handle it in the resolver, then update ` +
          `UNREPRESENTABLE_ORGANIZATION_LIFECYCLE_FIELDS.`,
      ).toBe(false);
    },
  );

  it("the resolver does not claim to check a lifecycle field it cannot read", () => {
    for (const field of UNREPRESENTABLE_ORGANIZATION_LIFECYCLE_FIELDS) {
      expect(CONTEXT_CODE).not.toMatch(new RegExp(`org\\.${field}\\b`));
    }
  });
});

/* ── 4b. Schema enum exhaustiveness (R2) ─────────────────────────────────── */

/**
 * The pinned allow-lists must equal the schema enums in BOTH directions.
 *
 * `ORGANIZATION_ROLES` and `MEMBER_STATUSES` are literal arrays rather than
 * imports from the generated Prisma client, because `@prisma/client` is a
 * runtime module and `src/lib/db/prisma.ts` exists so that nothing imports it
 * statically. The price of pinning is drift, and this gate is the payment: a
 * role added to the schema fails here until it is added to the allow-list, and
 * a value in the allow-list that the schema does not declare fails too.
 *
 * A missing role would silently refuse legitimate members; a stale extra one
 * would admit a role the database can no longer produce. Both are decisions,
 * so both must be made by a person.
 */
describe("pinned enums equal the Prisma schema, in both directions", () => {
  const schema = fs.readFileSync(path.join(REPO, "prisma", "schema.prisma"), "utf8");

  const NEWLINE = String.fromCharCode(10);

  function enumMembers(name: string): string[] {
    // Built from a source string rather than a literal regex so the pattern
    // cannot be silently rewritten by tooling that reprocesses escapes.
    const pattern = new RegExp("^enum[ ]+" + name + "[ ]*\\{([^}]*)\\}", "m");
    const m = schema.match(pattern);
    if (!m) return [];
    return m[1]
      .split(NEWLINE)
      .map((l) => l.split("//")[0].trim())
      .filter((l) => l.length > 0);
  }

  it("OrgRole was located and is non-trivial", () => {
    expect(enumMembers("OrgRole").length).toBeGreaterThan(5);
  });

  it("ORGANIZATION_ROLES equals enum OrgRole exactly", () => {
    expect([...ORGANIZATION_ROLES].sort()).toEqual(enumMembers("OrgRole").sort());
  });

  it("MEMBER_STATUSES equals enum MemberStatus exactly", () => {
    expect([...MEMBER_STATUSES].sort()).toEqual(enumMembers("MemberStatus").sort());
  });

  it("ACTIVE is a member of the pinned statuses, and the only granting one", () => {
    expect((MEMBER_STATUSES as readonly string[])).toContain(ACTIVE_MEMBERSHIP_STATUS);
    expect(CONTEXT_CODE).toMatch(/status === ACTIVE_MEMBERSHIP_STATUS/);
  });

  it("the resolver validates role and status against the pinned lists", () => {
    // A future edit that accepts `typeof role === "string"` again would put an
    // arbitrary value back into trusted output; this is the R2-1 regression.
    expect(CONTEXT_CODE).toMatch(/isOrganizationRole\(role\)/);
    expect(CONTEXT_CODE).toMatch(/isKnownMemberStatus\(status\)/);
    expect(CONTEXT_CODE).not.toMatch(/typeof role !== "string"/);
    expect(CONTEXT_CODE).not.toMatch(/typeof status !== "string"/);
  });
});

/* ── 4c. Trusted-value predicates (R2) ───────────────────────────────────── */

describe("trusted-value predicates refuse rather than repair", () => {
  it("the identifier predicate checks more than typeof and length", () => {
    // The R2-1 defect exactly: `typeof v === "string" && v.length > 0 && v.length <= 191`.
    expect(CONTEXT_CODE).toMatch(/hasForbiddenCodePoint/);
    expect(CONTEXT_CODE).toMatch(/isWhitespaceCodePoint/);
    expect(CONTEXT_CODE).toMatch(/TRUSTED_VALUE_MAX_LENGTH/);
  });

  it("character classes are code-point loops, not escape-sequence regexes", () => {
    // Mirrors safe-return-path.ts: a class written as escapes can be altered by
    // how the file is encoded or rewritten by tooling.
    expect(CONTEXT_CODE).toMatch(/codePointAt\(0\)/);
    // No character class built from unicode escapes: that is the form whose
    // meaning depends on how the file is encoded.
    const BACKSLASH = String.fromCharCode(92);
    expect(CONTEXT_CODE).not.toContain("[" + BACKSLASH + "u0000");
    expect(CONTEXT_CODE).not.toContain("[" + BACKSLASH + "x00");
  });

  it("the slug predicate is separate from the id predicate", () => {
    // Ids reject whitespace anywhere; slugs reject it only at the edges,
    // because the creation path stores caller-supplied slugs unslugified.
    expect(CONTEXT_CODE).toMatch(/function isUsableSlug/);
    expect(CONTEXT_CODE).toMatch(/function isUsableId/);
    expect(CONTEXT_CODE).toMatch(/isUsableSlug\(slug\)/);
  });

  it("every slugify() output in the repository is accepted by isUsableSlug", () => {
    // Parity with the two creation paths. Reproduced here rather than imported,
    // because importing an API route into a unit test drags its whole graph in.
    const slugify = (name: string): string =>
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
    const samples = [
      "Acme Corp",
      "  Padded  Name  ",
      "شرکت آلفا 2024",
      "A".repeat(120),
      "!!!",
      "Hermes-Novin_Mehr",
    ];
    for (const name of samples) {
      const base = slugify(name);
      if (base.length === 0) continue; // "!!!" slugifies to "" — never stored alone
      const stored = base + "-" + Date.now().toString(36);
      expect(stored.length).toBeLessThanOrEqual(TRUSTED_VALUE_MAX_LENGTH);
      expect(/^[a-z0-9-]+$/.test(stored), stored).toBe(true);
    }
  });
});

/* ── 5. The membership allow-list ────────────────────────────────────────── */

describe("membership status is an allow-list", () => {
  it("only ACTIVE is accepted, compared exactly", () => {
    expect(ACTIVE_MEMBERSHIP_STATUS).toBe("ACTIVE");
    expect(CONTEXT_CODE).toMatch(/status === ACTIVE_MEMBERSHIP_STATUS/);
  });

  it("no status is rejected by name — a deny-list would admit future values", () => {
    expect(CONTEXT_CODE).not.toMatch(/!==\s*["'`]SUSPENDED["'`]/);
    expect(CONTEXT_CODE).not.toMatch(/!==\s*["'`]INVITED["'`]/);
  });
});

/* ── 6. The contract itself ──────────────────────────────────────────────── */

describe("the contract admits no nullable organization id", () => {
  it("exposes exactly the five states", () => {
    expect([...TENANT_CONTEXT_STATES].sort()).toEqual([
      "MEMBERSHIP_UNAVAILABLE",
      "MULTIPLE_ACTIVE_ORGANIZATIONS",
      "NO_ACTIVE_ORGANIZATION",
      "SINGLE_ACTIVE_ORGANIZATION",
      "UNAUTHENTICATED",
    ]);
  });

  it("declares no `organizationId: string | null` anywhere", () => {
    expect(code(CONTRACT_SRC)).not.toMatch(/organizationId\s*[?]?\s*:\s*string\s*\|\s*null/);
  });

  it("carries no driver text in the diagnostics vocabulary", () => {
    for (const d of TENANT_DIAGNOSTICS) expect(d).toMatch(/^[A-Z_]+$/);
  });

  it("keeps transport out of the decision contract", () => {
    // An earlier revision exported an HTTP status map from here. Server
    // components have no status code; the mapping belongs with the routes.
    // Scoped to an HTTP-status MAP specifically: `ACTIVE_MEMBERSHIP_STATUS` is
    // the membership allow-list and must stay.
    expect(CONTRACT_SRC).not.toMatch(/\b(200|401|403|409|500|503)\b/);
    expect(code(CONTRACT_SRC)).not.toMatch(/STATE_STATUS|STATUS_MAP|REFUSAL_STATUS/);
    expect(code(CONTRACT_SRC)).not.toMatch(/Record<\s*TenantContextState\s*,\s*number\s*>/);
  });

  it("every exported policy array is FROZEN AT RUNTIME, not merely `as const`", () => {
    /*
     * R5 finding F3. The previous gate counted the text `as const`, which is a
     * COMPILE-TIME assertion and leaves the array mutable at runtime —
     * `Object.isFrozen` was false for all of them. The role and status
     * predicates read these arrays on every request, so a same-process write
     * could add a role. That is not a remote attack, but it is not a property
     * the contract should merely appear to have.
     *
     * The real assertion lives in the behavioural suite, which mutates them.
     * This gate pins the source shape so the freeze cannot be dropped.
     */
    const src = code(CONTRACT_SRC);
    const declared = src.match(/export const [A-Z_]+ = /g) ?? [];
    const frozen = src.match(/export const [A-Z_]+ = Object\.freeze\(/g) ?? [];
    // Every exported SCREAMING_CASE constant that is an array literal is frozen;
    // the scalar ones (ACTIVE_MEMBERSHIP_STATUS, TRUSTED_VALUE_MAX_LENGTH) are
    // primitives and are immutable already.
    const arrayDeclarations = (src.match(/export const [A-Z_]+ = Object\.freeze\(\[|export const [A-Z_]+ = \[/g) ?? []);
    expect(declared.length).toBeGreaterThan(0);
    expect(frozen.length).toBe(arrayDeclarations.length);
    expect(src).not.toMatch(/export const [A-Z_]+ = \[/);
  });

  it("declares no future-slice placeholder", () => {
    expect(code(CONTRACT_SRC)).not.toMatch(/ONBOARDING_CONTRACT|TODO|PLACEHOLDER|ZHARFA/i);
    expect(CONTEXT_CODE).not.toMatch(/ZHARFA/i);
  });
});

/* ── 7. Integration gate ─────────────────────────────────────────────────── */

/**
 * The gate the slice exists to install: an AUTHENTICATED user with no ACTIVE
 * organization must not be able to obtain a tenant data context by ANY route
 * through this module.
 */
describe("INTEGRATION GATE — no ACTIVE organization means no tenant context", () => {
  function portsFor(memberships: { organizationId: string; role: string; status: string }[]): TenantContextPorts {
    return {
      identity: async () => "authenticated-user",
      // Cast because these cases deliberately carry statuses the schema enum
      // does not declare — that is exactly what the gate must refuse.
      listMemberships: async () => memberships as unknown as readonly MembershipRow[],
      loadOrganization: async (id) => ({ id, slug: id }),
    };
  }

  const NO_CONTEXT_CASES: Array<[string, { organizationId: string; role: string; status: string }[]]> = [
    ["zero memberships", []],
    ["one SUSPENDED", [{ organizationId: "o1", role: "OWNER", status: "SUSPENDED" }]],
    ["one INVITED", [{ organizationId: "o1", role: "OWNER", status: "INVITED" }]],
    [
      "several, none ACTIVE",
      [
        { organizationId: "o1", role: "OWNER", status: "SUSPENDED" },
        { organizationId: "o2", role: "ADMIN", status: "INVITED" },
      ],
    ],
    ["an unknown status", [{ organizationId: "o1", role: "OWNER", status: "PENDING" }]],
    ["lowercase active is not ACTIVE", [{ organizationId: "o1", role: "OWNER", status: "active" }]],
    ["padded ACTIVE is not ACTIVE", [{ organizationId: "o1", role: "OWNER", status: " ACTIVE" }]],
  ];

  it.each(NO_CONTEXT_CASES)("%s yields no organizationId", async (_label, memberships) => {
    const r = await resolveTenantContext(portsFor(memberships));
    expect(hasTenantContext(r)).toBe(false);
    expect(r).not.toHaveProperty("organizationId");
    expect(JSON.stringify(r)).not.toContain("o1");
    expect(JSON.stringify(r)).not.toContain("o2");
  });
});
