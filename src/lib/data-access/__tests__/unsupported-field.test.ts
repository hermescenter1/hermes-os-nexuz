/**
 * PHASE 110-A2.0 — the SECOND boundary: the layer refuses server-owned fields.
 *
 * WHY A TEST AND NOT A SCENARIO. Over HTTP the route schema is `.strict()`, so
 * a body carrying `organizationId` is refused before `createTask` is entered —
 * that is what `http-scenarios-run4.log` records, a 400 VALIDATION_FAILED. The
 * refusal measured there therefore proves the OUTER boundary only.
 *
 * The layer has its own, and it exists because the route schema is not the only
 * caller: a server action, a script or a later route can reach `createTask`
 * directly. This file exercises exactly that path — the real layer function,
 * with only the tenant resolver and the client replaced — and asserts that the
 * refusal happens BEFORE any write.
 *
 * The double is receiver-dependent for the same reason as in
 * `transaction-receiver.test.ts`: a stub that ignores `this` would pass while
 * production fails.
 */

import { describe, expect, it, vi } from "vitest";

import { rejectUnsupportedFields, UnsupportedFieldError } from "../relation-ownership";

const ENGINE = Symbol("engineConfig");

function makeClient(opts: { relationResolves?: boolean } = {}) {
  const created: unknown[] = [];
  const resolves = opts.relationResolves !== false;
  const models = {
    registryAsset: { findFirst: async () => (resolves ? { id: "a_alpha" } : null) },
    maintenanceTask: {
      findFirst: async () => ({ id: "t" }),
      create: async (a: { data: Record<string, unknown> }) => {
        created.push(a.data);
        return { id: "created_1", ...a.data };
      },
      update: async (a: { data: Record<string, unknown> }) => ({ id: "t", ...a.data }),
    },
  };
  const client = {
    [ENGINE]: { real: true },
    async $transaction(fn: (c: unknown) => Promise<unknown>): Promise<unknown> {
      if (!(this as unknown as Record<symbol, unknown>)?.[ENGINE]) {
        throw new TypeError("Cannot read properties of undefined (reading '_engineConfig')");
      }
      return fn(models);
    },
  };
  return { client, created };
}

async function withLayer<T>(client: unknown, fn: (m: typeof import("@/lib/cmms/db")) => Promise<T>): Promise<T> {
  vi.resetModules();
  vi.doMock("@/lib/data-access/tenant-scope", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/data-access/tenant-scope")>();
    return {
      ...actual,
      requireTenantScope: async () => ({ organizationId: "org_alpha", userId: "u1" }),
      requireDatabase: async () => client as Record<string, unknown>,
    };
  });
  try {
    return await fn(await import("@/lib/cmms/db"));
  } finally {
    vi.doUnmock("@/lib/data-access/tenant-scope");
    vi.resetModules();
  }
}

describe("A2.0 — the data layer refuses fields the caller may not set", () => {
  it("names every offending field at once, and does not invent one", () => {
    expect(() => rejectUnsupportedFields({ title: "t", organizationId: "org_beta", vendorId: "v" }))
      .toThrowError(UnsupportedFieldError);

    try {
      rejectUnsupportedFields({ title: "t", organizationId: "org_beta", id: "chosen", erpWorkOrderId: "w" });
      throw new Error("unreachable");
    } catch (e) {
      expect((e as UnsupportedFieldError).fields).toEqual(["erpWorkOrderId", "organizationId", "id"]);
      expect((e as UnsupportedFieldError).status).toBe(400);
    }
  });

  it("an ABSENT key is not an offence, and an explicit undefined is not either", () => {
    expect(rejectUnsupportedFields({ title: "t" })).toEqual({ title: "t" });
    expect(rejectUnsupportedFields({ title: "t", organizationId: undefined })).toEqual({
      title: "t",
      organizationId: undefined,
    });
  });

  it("createTask REFUSES organizationId in the payload, and writes nothing", async () => {
    const { client, created } = makeClient();
    await withLayer(client, async ({ createTask }) => {
      await expect(
        createTask({ title: "chosen tenant", organizationId: "org_beta" } as never),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_FIELD", status: 400 });
    });
    expect(created, "the refusal must happen before the insert").toHaveLength(0);
  });

  it("updateTask REFUSES a reparenting patch, and writes nothing", async () => {
    const { client, created } = makeClient();
    await withLayer(client, async ({ updateTask }) => {
      await expect(
        updateTask("a20_task_alpha", { organizationId: "org_beta" } as never),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_FIELD" });
    });
    expect(created).toHaveLength(0);
  });  it("a cross-tenant relation in a PATCH is 400 INVALID_RELATION, never a 503 outage", async () => {
    /*
     * THE REGRESSION THIS PINS. `updateTask` used to carry its own catch that
     * answered ORGANIZATION_CONTEXT_UNAVAILABLE for everything that was not
     * P2025 — so a patch naming another organization's asset reached the caller
     * as a database outage. Sanitising an error is not the same as calling
     * every error an outage.
     *
     * The refusal is raised by the REAL `assertRelationsOwned`: the ownership
     * lookup finds no such asset in this organization, exactly as it would for
     * a row that belongs to Beta.
     */
    const { client, created } = makeClient({ relationResolves: false });

    await withLayer(client, async ({ updateTask }) => {
      await expect(updateTask("a20_task_alpha", { assetId: "a_beta" } as never)).rejects.toMatchObject({
        code: "INVALID_RELATION",
        status: 400,
        field: "assetId",
      });
    });
    expect(created).toHaveLength(0);
  });

  it("a legitimate payload still passes, so the previous assertions are not vacuous", async () => {
    const { client, created } = makeClient();
    const row = await withLayer(client, ({ createTask }) =>
      createTask({ title: "ordinary", assetId: "a_alpha" } as never),
    );
    expect(row).toBeTruthy();
    expect(created).toHaveLength(1);
    expect((created[0] as { organizationId: string }).organizationId).toBe("org_alpha");
  });
});
