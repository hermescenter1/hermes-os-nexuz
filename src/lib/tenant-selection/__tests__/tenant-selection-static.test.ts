/**
 * PHASE 110-A1.0b — the static gates for the selection layer.
 *
 * These assert properties of the SOURCE that a behavioural test cannot reach:
 * that the server half never enters a browser bundle, that the client half
 * imports nothing that would drag Prisma or the session store with it, and that
 * the arbitrary lookups this phase removed have not come back anywhere.
 *
 * WHY THE IMPORT-GRAPH GATE IS HERE AND NOT LEFT TO THE BUILD
 * Phase 110-A1.0 measured this: a `"use client"` fixture importing the resolver
 * compiled and built cleanly. Neither `tsc --noEmit` nor `next build` rejects
 * it, because nothing in this repository declares the module server-only —
 * `server-only` is not a dependency and adding one is outside this slice. The
 * repository's own transitive walker is reused instead, with these modules as
 * the forbidden target, so the two gates cannot drift into disagreeing.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  findForbiddenChain,
  listClientEntries,
} from "../../../../scripts/ci/lib/phase101r-client-graph.mjs";

const REPO = process.cwd();
const SRC = path.join(REPO, "src");
const DIR = path.join(SRC, "lib", "tenant-selection");

const SELECTION_FILE = path.join(DIR, "selection.ts");
const COOKIE_FILE = path.join(DIR, "cookie.ts");
const CONTRACT_FILE = path.join(DIR, "contract.ts");

const read = (p: string) => fs.readFileSync(p, "utf8");

/** Source with comments removed, so prose about a pattern is not mistaken for it. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

const SELECTION = code(read(SELECTION_FILE));
const COOKIE = code(read(COOKIE_FILE));
const CONTRACT = code(read(CONTRACT_FILE));

/* ── 1. The adapter decides nothing the core already decides ─────────────── */

describe("the selection layer adds transport, not a second resolver", () => {
  it("performs no membership query of its own", () => {
    for (const [name, src] of [["selection", SELECTION], ["cookie", COOKIE]] as const) {
      expect(src, `${name} must not query`).not.toMatch(/\bfindFirst\b|\bfindMany\b|\bfindUnique\b/);
      expect(src, `${name} must not reach Prisma`).not.toMatch(/getPrisma|@\/lib\/db\/prisma/);
    }
  });

  it("takes identity from the resolver, never from a token or a cookie it reads itself", () => {
    // A bare `verifyAccessToken` skips the session-revocation check. It is the
    // exact call this phase removed from `resolveOrgContext`, and it must not
    // reappear one layer up.
    expect(SELECTION).not.toMatch(/verifyAccessToken|ACCESS_TOKEN_COOKIE|getAuthRole/);
    expect(COOKIE).not.toMatch(/verifyAccessToken|ACCESS_TOKEN_COOKIE/);
  });

  it("never coerces a candidate", () => {
    // `String(undefined)` is "undefined" — a perfectly good-looking id that
    // belongs to nobody. There is no repair path for an unusable candidate.
    expect(SELECTION).not.toMatch(/String\(|\.trim\(\)|toLowerCase\(\)|toUpperCase\(\)|Number\(/);
  });

  it("compares candidates by identity, and only against proven memberships", () => {
    expect(SELECTION).toMatch(/base\.candidates\.find\(\(c\) => c\.organizationId === candidateId\)/);
  });
});

/* ── 2. The cookie is a hint, and says so ────────────────────────────────── */

describe("the stored selection carries no authority", () => {
  it("stores no token, role or permission", () => {
    // The envelope is `{ v, u, o }` and nothing else. A role in a cookie is a
    // role a client can edit.
    expect(COOKIE).not.toMatch(/\brole\b|\btoken\b|permission|capability/i);
  });

  it("is HttpOnly, path-scoped and Secure outside development", () => {
    expect(COOKIE).toMatch(/httpOnly:\s*true/);
    expect(COOKIE).toMatch(/path:\s*"\/"/);
    expect(COOKIE).toMatch(/secure:\s*process\.env\.NODE_ENV === "production"/);
    expect(COOKIE).toMatch(/sameSite:\s*"lax"/);
  });

  it("binds the stored value to the user it was written for", () => {
    // R2 moved the comparison into `interpret`, which is where both readers now
    // funnel. The assertion follows the code rather than pinning a line number.
    expect(COOKIE).toMatch(/envelope\.u !== userId/);
  });

  it("derives its length bound rather than guessing one", () => {
    /*
     * R1 hard-coded 512 on the reader and nothing on the writer, so the writer
     * could produce a 538-character value its own reader discarded.
     *
     * PHASE 110-A1.0b R4 — the prose that used to sit here said the bound was
     * derived from "the contract's 191-CODE-POINT limit". That was the R2
     * derivation and it was wrong twice: the contract bounds `v.length`, which
     * counts UTF-16 code UNITS, and unpaired surrogates JSON-escape to six
     * bytes each, so the real worst case is 3084 base64url characters, not the
     * 2068 that argument produced.
     *
     * A first attempt at R4 asserted here that the source still CONTAINS the
     * string "3084" — and failed, because `COOKIE` is deliberately built with
     * comments stripped so that prose about a pattern is never mistaken for the
     * pattern. That failure was correct twice over: the constant is doing its
     * job, and pinning a number inside a comment would test the comment rather
     * than the code. The worst case is asserted where it belongs — as behaviour,
     * against a real envelope, in `r4-regressions.test.ts`.
     */
    expect(COOKIE).toMatch(/MAX_ENCODED_LENGTH/);
    expect(COOKIE).not.toMatch(/>\s*512/);
  });
});

/* ── 3. The client-safe half stays client-safe ───────────────────────────── */

describe("the contract module is importable from a browser bundle", () => {
  it("imports nothing but a type from the tenant contract", () => {
    const imports = [...CONTRACT.matchAll(/^\s*import\s+([\s\S]*?)\s+from\s+"([^"]+)"/gm)].map(
      (m) => ({ clause: m[1], from: m[2] }),
    );
    expect(imports.length, "an unexpected import would widen the client bundle").toBe(1);
    expect(imports[0].from).toBe("@/lib/tenant/contract");
    expect(imports[0].clause.startsWith("type "), "must be a type-only import").toBe(true);
  });

  it("freezes the refusal list at runtime, not only in the type system", () => {
    // `as const` is a compile-time fact. Phase 110-A1.0 learned that the
    // expensive way: `Object.isFrozen` was false on every policy array.
    expect(CONTRACT).toMatch(/Object\.freeze\(\[/);
    expect(CONTRACT).toMatch(/TENANT_REFUSAL_STATUS[\s\S]{0,80}Object\.freeze\(/);
  });
});

/* ── 4. The import-graph boundary ────────────────────────────────────────── */

describe("IMPORT-GRAPH BOUNDARY — no client module may reach the server half", () => {
  const entries = listClientEntries(SRC) as string[];

  it("the walker is actually finding client entries (a silent walker passes forever)", () => {
    expect(entries.length).toBeGreaterThan(100);
    expect(fs.existsSync(SELECTION_FILE)).toBe(true);
    expect(fs.existsSync(COOKIE_FILE)).toBe(true);
  });

  it('no "use client" module transitively imports the selection adapter or the cookie', () => {
    const forbidden = new Set([SELECTION_FILE, COOKIE_FILE]);
    const chains: string[][] = [];
    for (const entry of entries) {
      const chain = findForbiddenChain(entry, forbidden, SRC) as string[] | null;
      if (chain) chains.push(chain.map((f) => path.relative(REPO, f).split("\\").join("/")));
    }
    expect(chains, `client import chains reaching the server half:\n${JSON.stringify(chains, null, 2)}`).toEqual([]);
  });

  it("the browser request wrapper reaches the contract and stops there", () => {
    /*
     * PHASE 110-A1.0b R4 — a NEW client edge, added by R3 and asserted here.
     * `resource-request.ts` is a "use client" module and now imports the
     * precondition header name and the DOM attribute from the contract. That is
     * exactly the kind of convenience import that would drag the server half
     * into a browser bundle if the contract ever stopped being client-safe.
     */
    const wrapper = path.join(SRC, "lib", "client", "resource-request.ts");
    expect(fs.existsSync(wrapper)).toBe(true);
    const src = read(wrapper);
    expect(src.startsWith('"use client"')).toBe(true);
    expect(src).toMatch(/from "@\/lib\/tenant-selection\/contract"/);
    expect(src, "the server half must never be reachable from the browser").not.toMatch(
      /tenant-selection\/(selection|cookie)/,
    );
    expect(src).not.toMatch(/@\/lib\/tenant\/context/);
    expect(src).not.toMatch(/@\/lib\/db\/prisma/);
  });

  it("the switcher — a real client component — reaches the contract and stops there", () => {
    const switcher = path.join(SRC, "components", "app-shell", "OrganizationSwitcher.tsx");
    expect(fs.existsSync(switcher)).toBe(true);
    const src = read(switcher);
    expect(src.startsWith('"use client"'), "the switcher must be a client component").toBe(true);
    expect(src).toMatch(/from "@\/lib\/tenant-selection\/contract"/);
    // It must never import the server half, directly or by convenience.
    expect(src).not.toMatch(/tenant-selection\/(selection|cookie)/);
    expect(src).not.toMatch(/@\/lib\/tenant\/context/);
  });
});

/* ── 5. The arbitrary lookups are gone, and stay gone ────────────────────── */

describe("no surface re-derives the organization for itself", () => {
  const ADOPTED = [
    "src/lib/billing/context.ts",
    "src/lib/organizations/shell-context.ts",
    "src/app/[locale]/dashboard/organization/page.tsx",
    "src/app/[locale]/dashboard/organization/members/page.tsx",
    "src/app/[locale]/dashboard/organization/invitations/page.tsx",
    "src/app/[locale]/dashboard/organization/departments/page.tsx",
    "src/app/[locale]/dashboard/organization/settings/page.tsx",
  ];

  it.each(ADOPTED)("%s performs no membership lookup of its own", (rel) => {
    const src = code(read(path.join(REPO, rel)));
    expect(src, "an arbitrary earliest-membership pick").not.toMatch(/organizationMember/);
    expect(src).not.toMatch(/\bfindFirst\b/);
    expect(src, "orderBy createdAt asc was the arbitrary pick").not.toMatch(/orderBy/);
  });

  it.each(ADOPTED)("%s establishes identity through the resolver only", (rel) => {
    const src = code(read(path.join(REPO, rel)));
    expect(src, "a bare token verification skips session revocation").not.toMatch(/verifyAccessToken/);
  });
});
