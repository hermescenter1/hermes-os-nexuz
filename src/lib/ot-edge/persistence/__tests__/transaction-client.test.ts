import { describe, it, expect } from "vitest";
import { createTransactionManager, type OtPrismaClient, type OtTransactionalPrismaClient } from "../prisma-adapters";
import { buildOtServiceContext } from "../../service-context";

/**
 * PHASE 94B3.2 — proof that a transactional write cannot escape its transaction.
 *
 * The database tests prove that a rollback removes the rows. This proves the
 * mechanism: repositories handed to the callback are bound to the TRANSACTION
 * client, so a write inside the callback never reaches the global client. Both
 * clients are instrumented, so "which one was called" is observed rather than
 * assumed.
 */

type Call = { client: "GLOBAL" | "TX"; model: string; op: string };

function instrumentedClient(tag: "GLOBAL" | "TX", log: Call[]): OtPrismaClient {
  const models = [
    "edgeGatewayProfile", "otDeviceProfile", "engineeringImport", "engineeringProject",
    "automationTag", "alarmDefinition", "industrialNetworkNode", "engineeringFinding",
    "gatewayEnvelopeNonce", "industrialGateway", "industrialAsset", "industrialSite",
  ] as const;

  const delegate = (model: string) => ({
    findFirst: async (a: unknown) => { log.push({ client: tag, model, op: "findFirst" }); return stub(model, a); },
    findMany: async () => { log.push({ client: tag, model, op: "findMany" }); return []; },
    count: async () => { log.push({ client: tag, model, op: "count" }); return 0; },
    create: async () => { log.push({ client: tag, model, op: "create" }); return { id: `${model}-1` }; },
    update: async () => { log.push({ client: tag, model, op: "update" }); return { id: `${model}-1` }; },
    updateMany: async () => { log.push({ client: tag, model, op: "updateMany" }); return { count: 1 }; },
    deleteMany: async () => { log.push({ client: tag, model, op: "deleteMany" }); return { count: 0 }; },
    upsert: async () => { log.push({ client: tag, model, op: "upsert" }); return { id: `${model}-1` }; },
  });

  // The parent lookups a create performs must succeed for the write to proceed.
  const stub = (model: string, _a: unknown): Record<string, unknown> | null =>
    model === "industrialGateway" || model === "industrialAsset" || model === "engineeringImport"
      ? { id: "parent-1", siteId: null }
      : null;

  const client = {} as Record<string, unknown>;
  for (const m of models) client[m] = delegate(m);
  return client as unknown as OtPrismaClient;
}

const ctx = () =>
  buildOtServiceContext({ userId: "u", organizationId: "org-1", role: "ADMIN", allowedSiteIds: null });

describe("94B3.2 — repositories inside a transaction use the transaction client", () => {
  function makeManager() {
    const log: Call[] = [];
    const global = instrumentedClient("GLOBAL", log);
    const tx = instrumentedClient("TX", log);
    const client = {
      ...(global as unknown as Record<string, unknown>),
      $transaction: async <T>(fn: (c: OtPrismaClient) => Promise<T>) => fn(tx),
    } as unknown as OtTransactionalPrismaClient;
    return { manager: createTransactionManager(client), log };
  }

  it("routes every write to the TX client and never to the global one", async () => {
    const { manager, log } = makeManager();

    const res = await manager.runInTransaction(async (repos) => {
      await repos.projects.createProjectWithArtifacts(ctx(), {
        importId: "imp-1",
        name: "P",
        normalizedName: "p",
        sourceType: "GENERIC",
        schemaVersion: "1.0",
        checksum: "c",
        tags: [{ name: "T", normalizedName: "t", dataType: "BOOL", address: null, symbolicPath: null, unit: null, description: null, accessMode: "READ", safetyClass: "UNKNOWN", validationState: "VALID" }],
      });
      return "done";
    });

    expect(res.ok).toBe(true);
    expect(log.length, "the callback did perform work").toBeGreaterThan(0);
    expect(
      log.filter((c) => c.client === "GLOBAL"),
      "no call may reach the global client inside a transaction",
    ).toEqual([]);
    expect(log.every((c) => c.client === "TX")).toBe(true);
    // …and the artifact write really happened on the tx client.
    expect(log.some((c) => c.model === "automationTag" && c.op === "create")).toBe(true);
  });

  it("a throw inside the callback surfaces as a safe repository error", async () => {
    const { manager, log } = makeManager();
    const res = await manager.runInTransaction(async () => {
      throw Object.assign(new Error("connect postgresql://admin:SECRET@prod/db"), { code: "P9999" });
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("INTERNAL_FAILURE");
    // The driver text must not survive into the result.
    expect(JSON.stringify(res)).not.toContain("SECRET");
    expect(log.filter((c) => c.client === "GLOBAL")).toEqual([]);
  });

  it("outside a transaction, repositories use the client they were given", async () => {
    const log: Call[] = [];
    const global = instrumentedClient("GLOBAL", log);
    const { createOtRepositories } = await import("../prisma-adapters");
    const repos = createOtRepositories(global);
    await repos.gateways.listVisible(ctx());
    expect(log.every((c) => c.client === "GLOBAL")).toBe(true);
  });
});
