/**
 * PHASE 110-A1.0b — the shell's organization context, in the node environment.
 *
 * WHY THESE MOVED HERE
 * They lived in `src/components/__tests__/phase104-r1-visual-remediation.test.tsx`,
 * which opts into the jsdom environment. `getShellOrgContext` now delegates to
 * the Phase 110-A1.0 resolver, and that module calls `assertServerOnly(...)`,
 * which throws in a browser realm. Importing it from a jsdom file fails —
 * correctly, because the shell context became genuinely server-only the moment
 * it stopped doing its own lookup. A jsdom test that still passed would be
 * evidence the boundary had broken.
 *
 * The V-M7 promise is unchanged and asserted more strictly than before: only an
 * ACTIVE membership resolves, an INVITED or SUSPENDED one does not, an empty
 * account is `none`, an outage is never reported as an empty account — and, new
 * here because the old shape could not express it, several memberships produce a
 * choice rather than one of them being picked silently.
 *
 * DO NOT WRITE THE JSDOM PRAGMA IN PROSE IN THIS FILE. Vitest finds the
 * environment pragma by scanning the source text, not by parsing it, so merely
 * NAMING it inside a comment — as the paragraph above originally did, to explain
 * where these cases came from — switches this file to jsdom. That made
 * `assertServerOnly` throw and all six cases fail with an error about a browser
 * bundle, in a file that never went near a browser.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  organizationId: string;
  role: string;
  status: string;
}

const EMPTY_JAR = { get: () => undefined };

/**
 * The organization port answers for the id it was ASKED for.
 *
 * A fixture that returns the same row for every id is not a simplification: the
 * resolver cross-checks `organization.id === membership.organizationId` and
 * refuses a mismatch as ORGANIZATION_NOT_RESOLVABLE. A fixed row therefore
 * turns the multi-membership case into an outage, which is what happened here
 * on the first run.
 */
const ORGS: Record<string, { id: string; slug: string }> = {
  org_1: { id: "org_1", slug: "hermes-novin" },
  org_2: { id: "org_2", slug: "hermes-second" },
};

function membershipDb(rows: Row[] | (() => never)) {
  return {
    organizationMember: {
      findMany: async () => (typeof rows === "function" ? rows() : rows),
    },
    organization: {
      findUnique: async (args: { where: { id: string } }) => ORGS[args.where.id] ?? null,
    },
  };
}

beforeEach(() => {
  vi.resetModules();
});

async function withPrisma(
  db: unknown,
  mode: "database" | "session" = "database",
  user: unknown = { id: "user_1" },
) {
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));
  vi.doMock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => mode }));
  vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: async () => user }));
  return (await import("@/lib/organizations/shell-context")).getShellOrgContext;
}

describe("V-M7 — the shell names the organization the API will actually use", () => {
  it("resolves the caller's one ACTIVE organization", async () => {
    const get = await withPrisma(
      membershipDb([{ organizationId: "org_1", role: "OWNER", status: "ACTIVE" }]),
    );
    await expect(get(EMPTY_JAR)).resolves.toEqual({
      state: "resolved",
      organizationId: "org_1",
      organizationName: "hermes-novin",
      selectable: false,
    });
  });

  it("grants nothing for a membership that is not ACTIVE", async () => {
    for (const status of ["INVITED", "SUSPENDED"]) {
      vi.resetModules();
      const get = await withPrisma(
        membershipDb([{ organizationId: "org_1", role: "OWNER", status }]),
      );
      await expect(get(EMPTY_JAR), `${status} must not resolve a context`).resolves.toEqual({
        state: "none",
      });
    }
  });

  it("asks for a choice instead of picking one of several", async () => {
    const get = await withPrisma(
      membershipDb([
        { organizationId: "org_1", role: "OWNER", status: "ACTIVE" },
        { organizationId: "org_2", role: "MEMBER", status: "ACTIVE" },
      ]),
    );
    // The old implementation returned `resolved` here, naming whichever row
    // sorted first. That is the defect this phase exists to remove.
    await expect(get(EMPTY_JAR)).resolves.toEqual({ state: "selection" });
  });

  it("reports an empty account as none", async () => {
    const get = await withPrisma(membershipDb([]));
    await expect(get(EMPTY_JAR)).resolves.toEqual({ state: "none" });
  });

  it("never reports an outage as an empty account", async () => {
    const thrower = await withPrisma(
      membershipDb(() => {
        throw new Error("db down");
      }),
    );
    await expect(thrower(EMPTY_JAR)).resolves.toEqual({ state: "unavailable" });

    vi.resetModules();
    const noStore = await withPrisma(null, "database");
    await expect(noStore(EMPTY_JAR)).resolves.toEqual({ state: "unavailable" });
  });

  it("takes no user id from its caller", async () => {
    // The old signature was `getShellOrgContext(userId)`. Accepting an identity
    // from a caller is the pattern this phase removes: the resolver establishes
    // it from a session it verifies, including the revocation check the old
    // shell path skipped entirely.
    const get = await withPrisma(
      membershipDb([{ organizationId: "org_1", role: "OWNER", status: "ACTIVE" }]),
      "database",
      null,
    );
    await expect(get(EMPTY_JAR), "no session means nothing to resolve").resolves.toEqual({
      state: "none",
    });
  });
});
