/**
 * PHASE 110-A2.0 — 503 for an outage, 500 for our own bug, proved with a REAL
 * driver error.
 *
 * WHY NOT A DOUBLE. The classification reads `err.code` and the constructor
 * name off whatever the driver raises. A hand-made `{ code: "P1001" }` proves
 * only that the branch exists; it cannot show that the driver still produces
 * that shape. So this test opens a real Prisma client against a port where
 * nothing listens and uses the error PostgreSQL's client actually returns.
 *
 * IT NEEDS NO NETWORK AND NO CONTAINER. The connection is refused locally, on a
 * port that is closed by definition, so the suite stays hermetic.
 *
 * WHY THIS MATTERS HERE. A real outage was also rehearsed against the disposable
 * container — see `outage.log`. That rehearsal produced an unexpected and
 * separately reported result: with the database down the SESSION lookup fails
 * first and every authenticated route answers 401, because
 * `isSessionActive` fails closed by Phase 91 design. Fail-closed is correct and
 * the availability contract is nevertheless invisible through an authenticated
 * route. This test exercises the contract directly, where it can be observed.
 */

import { describe, expect, it, vi } from "vitest";

import { DataScopeError, runScoped } from "../tenant-scope";

/** A DSN whose port is closed by definition. Nothing is sent anywhere. */
const DEAD = "postgresql://nobody:nothing@127.0.0.1:1/nowhere?schema=public";

async function realDriverError(): Promise<unknown> {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: DEAD }) });
  try {
    await (client as unknown as { registryAsset: { count: () => Promise<number> } }).registryAsset.count();
    throw new Error("the dead port answered — this test is no longer measuring anything");
  } catch (err) {
    return err;
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

describe("A2.0 — availability is 503, an internal fault is 500", () => {
  it("a REAL unreachable database becomes ORGANIZATION_CONTEXT_UNAVAILABLE / 503", async () => {
    const err = await realDriverError();

    // State what the driver actually gave us, so a future change is visible.
    const code = (err as { code?: unknown }).code;
    expect(
      code === "P1001" || (err as Error)?.constructor?.name === "PrismaClientInitializationError",
      `the driver raised ${(err as Error)?.constructor?.name} code=${String(code)}`,
    ).toBe(true);

    await expect(runScoped("test.availability", async () => { throw err; })).rejects.toMatchObject({
      code: "ORGANIZATION_CONTEXT_UNAVAILABLE",
      status: 503,
    });
  /*
   * PHASE 110-A2.1 — the budget is 90s, not 30s, and that is not a workaround.
   * This case opens a REAL Prisma client and waits for the operating system to
   * refuse a connection. On a loaded machine that refusal took 34.6s and the
   * 30s budget failed the test for a reason that had nothing to do with the
   * classifier — measured in `gate9-full-suite.log`. The assertion is unchanged;
   * only the patience is.
   */
  }, 90_000);

  it("our own TypeError becomes INTERNAL_ERROR / 500, never an outage", async () => {
    const thrown = await runScoped("test.internal", async () => {
      throw new TypeError("Cannot read properties of undefined (reading '_engineConfig')");
    }).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(DataScopeError);
    expect((thrown as DataScopeError).code).toBe("INTERNAL_ERROR");
    expect((thrown as DataScopeError).status).toBe(500);
    expect((thrown as DataScopeError).correlationId, "a 500 must be traceable to one log line").toMatch(/^[0-9a-z]+$/i);
  });

  it("neither the DSN nor the driver text reaches the log", async () => {
    const written: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });

    const err = await realDriverError();
    await runScoped("test.leak", async () => { throw err; }).catch(() => undefined);

    spy.mockRestore();
    const all = written.join("\n");

    expect(all, "the log must not carry the connection string").not.toContain("127.0.0.1:1");
    expect(all).not.toContain("nothing");        // the password in the DSN
    expect(all).not.toContain("nowhere");        // the database name
    expect(all.toLowerCase()).not.toContain("select ");
    expect(all, "but it must still say something happened").toContain("test.leak");
  }, 90_000);
});
