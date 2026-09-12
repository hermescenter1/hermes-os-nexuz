/**
 * PHASE 110-A2.0 — the write path must call `$transaction` as a METHOD.
 *
 * WHAT THIS EXISTS TO CATCH. The first version of the CMMS layer did
 *
 *     const tx = db.$transaction;
 *     await tx(callback, { isolationLevel: "Serializable" });
 *
 * which detaches the function from the client. Prisma's `$transaction` reads
 * private state off its receiver, so it raised
 * `TypeError: Cannot read properties of undefined (reading '_engineConfig')`
 * before a single statement ran. Every write in the layer answered 503 and the
 * sanitised log said only `TypeError` — see `probe-transaction.log`, where the
 * detached form throws and both the method call and `.bind(db)` succeed.
 *
 * WHY A NAIVE DOUBLE WOULD NOT CATCH IT. A stub like
 * `{ $transaction: (fn) => fn(models) }` does not use `this`, so the detached
 * call works against it and the test passes while production breaks. The double
 * here therefore DEPENDS on its receiver exactly the way Prisma does: it reads a
 * private field off `this` and throws when that field is missing.
 *
 * The rollback case is asserted through the same double: when the relation
 * check refuses, the callback must not have created anything.
 */

import { describe, expect, it, vi } from "vitest";

/**
 * PHASE 110-A2.3 — the five write functions now take the scope their ROUTE
 * verified, instead of resolving a tenant of their own.
 *
 * These direct-call tests therefore supply one. It is the same shape
 * `requireWriteScope` returns and nothing here weakens what is asserted: the
 * subject of every case below is still the payload refusal or the rollback, and
 * the scope only names the organization the write runs in — which these cases
 * already assumed was Alpha.
 */
const VERIFIED = {
  organizationId: "org_alpha",
  userId: "u1",
  organizationRole: "ADMIN",
  verifiedFor: "manage_industrial",
} as never;
/** A private field only reachable through a correct receiver. */
const ENGINE = Symbol("engineConfig");

interface Recorded {
  created: unknown[];
  committed: boolean;
  rolledBack: boolean;
  isolationLevel?: string;
}

/**
 * A client whose `$transaction` behaves like Prisma's in the one way that
 * matters: it is USELESS when detached from its receiver.
 */
function makeClient(opts: { taskOwnedBy?: string; assetOwnedBy?: string } = {}) {
  const recorded: Recorded = { created: [], committed: false, rolledBack: false };

  const models = {
    registryAsset: {
      findFirst: async (a: { where: { id: string; organizationId?: string } }) =>
        opts.assetOwnedBy && a.where.organizationId === opts.assetOwnedBy ? { id: a.where.id } : null,
    },
    maintenanceTask: {
      findFirst: async (a: { where: { id: string; organizationId?: string } }) =>
        opts.taskOwnedBy && a.where.organizationId === opts.taskOwnedBy ? { id: a.where.id } : null,
      create: async (a: { data: Record<string, unknown> }) => {
        recorded.created.push(a.data);
        return { id: "created_1", ...a.data };
      },
    },
  };

  const client = {
    [ENGINE]: { real: true },
    async $transaction(
      fn: (c: unknown) => Promise<unknown>,
      o?: { isolationLevel?: string },
    ): Promise<unknown> {
      // THE POINT OF THIS DOUBLE: reading private state off `this`.
      const engine = (this as unknown as Record<symbol, unknown>)?.[ENGINE];
      if (!engine) {
        throw new TypeError("Cannot read properties of undefined (reading '_engineConfig')");
      }
      recorded.isolationLevel = o?.isolationLevel;
      try {
        const out = await fn(models);
        recorded.committed = true;
        return out;
      } catch (e) {
        recorded.rolledBack = true;
        recorded.created.length = 0; // a rollback undoes the insert
        throw e;
      }
    },
  };

  return { client, recorded };
}

describe("A2.0 — $transaction is called as a method, not a detached reference", () => {
  it("the double detects a DETACHED call — otherwise this suite proves nothing", async () => {
    const { client } = makeClient();
    const detached = client.$transaction;

    await expect(
      (detached as (fn: (c: unknown) => Promise<unknown>) => Promise<unknown>)(async () => 1),
    ).rejects.toThrow(/_engineConfig/);
  });

  it("a method call succeeds against the same double", async () => {
    const { client, recorded } = makeClient();
    await expect(client.$transaction(async () => 1, { isolationLevel: "Serializable" })).resolves.toBe(1);
    expect(recorded.committed).toBe(true);
    expect(recorded.isolationLevel).toBe("Serializable");
  });

  it("THE REGRESSION: the real layer creates through a bound receiver", async () => {
    const { client, recorded } = makeClient({ assetOwnedBy: "org_alpha" });

    vi.resetModules();
    vi.doMock("@/lib/data-access/tenant-scope", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/data-access/tenant-scope")>();
      return {
        ...actual,
        requireTenantScope: async () => ({ organizationId: "org_alpha", userId: "u1", organizationRole: "ADMIN" }),
        requireDatabase: async () => client as unknown as Record<string, unknown>,
      };
    });

    const { createTask } = await import("@/lib/cmms/db");
    const row = await createTask(VERIFIED, { title: "t", assetId: "a_alpha" } as never);

    expect(row, "a detached $transaction would have thrown before reaching here").toBeTruthy();
    expect(recorded.committed).toBe(true);
    expect(recorded.created).toHaveLength(1);
    expect((recorded.created[0] as { organizationId: string }).organizationId).toBe("org_alpha");

    vi.doUnmock("@/lib/data-access/tenant-scope");
    vi.resetModules();
  });

  it("a refused relation ROLLS BACK: nothing was created", async () => {
    // The asset belongs to Beta, so the ownership check inside the transaction
    // refuses and the insert must not survive.
    const { client, recorded } = makeClient({ assetOwnedBy: "org_beta" });

    vi.resetModules();
    vi.doMock("@/lib/data-access/tenant-scope", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/data-access/tenant-scope")>();
      return {
        ...actual,
        requireTenantScope: async () => ({ organizationId: "org_alpha", userId: "u1", organizationRole: "ADMIN" }),
        requireDatabase: async () => client as unknown as Record<string, unknown>,
      };
    });

    const { createTask } = await import("@/lib/cmms/db");

    await expect(createTask(VERIFIED, { title: "t", assetId: "a_beta" } as never)).rejects.toMatchObject({
      code: "INVALID_RELATION",
      field: "assetId",
    });
    expect(recorded.rolledBack).toBe(true);
    expect(recorded.created, "the insert must not survive the refusal").toHaveLength(0);

    vi.doUnmock("@/lib/data-access/tenant-scope");
    vi.resetModules();
  });
});
