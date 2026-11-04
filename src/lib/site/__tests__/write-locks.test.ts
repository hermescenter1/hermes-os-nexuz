/**
 * Slice E1 / independent review S2-01 — the shape of the write locks.
 *
 * The LOCKING BEHAVIOUR itself (a concurrent writer actually waiting) can only be proven against a real
 * server; that is `src/lib/knowledge-graph/__tests__/pg/e1-case-authorization-race.pg.test.ts`. What this
 * file pins is everything a unit test genuinely can: that each statement carries its organisation
 * predicate, locks the rows it decides on (`FOR SHARE`), asks in a deterministic order (deadlock
 * avoidance), binds every value as a parameter, and reads nothing at all for an empty input.
 */
import { describe, expect, it } from "vitest";
import { allSitesActiveForWrite, lockActiveSitesForWrite, lockAssetsForWrite, type LockingTx } from "../write-locks";

const ORG = "org-1";

/** Records every statement and answers from fixed rows. */
function fakeTx(rows: Record<string, unknown>[] = []) {
  const seen: { sql: string; flat: string; values: unknown[] }[] = [];
  const tx: LockingTx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      seen.push({ sql, flat: sql.replace(/\s+/g, " ").trim(), values });
      return rows;
    },
  };
  return { tx, seen };
}

describe("lockAssetsForWrite", () => {
  it("locks the named assets of THIS organisation and returns each one's current site", async () => {
    const { tx, seen } = fakeTx([{ id: "a1", siteId: "s1" }, { id: "a2", siteId: "s2" }]);
    const map = await lockAssetsForWrite(tx, ORG, ["a2", "a1"]);
    expect([...map.entries()]).toEqual([["a1", "s1"], ["a2", "s2"]]);
    expect(seen).toHaveLength(1);
    const { flat, values } = seen[0];
    expect(flat).toContain(`FROM "IndustrialAsset" a`);
    expect(flat).toContain(`a."organizationId" = ?`);
    expect(flat).toContain(`a."id" = ANY(?::text[])`);
    expect(flat).toContain(`ORDER BY a."id" FOR SHARE`);          // locked, in a deterministic order
    expect(values[0]).toBe(ORG);
    expect(values[1]).toEqual(["a1", "a2"]);                       // sorted + de-duplicated by the helper
    for (const v of [ORG, "a1", "a2"]) expect(flat).not.toContain(v);   // nothing concatenated into the text
  });

  it("de-duplicates, drops malformed ids, and reads NOTHING when the result would be empty", async () => {
    const { tx, seen } = fakeTx([{ id: "a1", siteId: "s1" }]);
    await lockAssetsForWrite(tx, ORG, ["a1", "a1", "", "a1"]);
    expect(seen[0].values[1]).toEqual(["a1"]);

    const empty = fakeTx();
    expect((await lockAssetsForWrite(empty.tx, ORG, [])).size).toBe(0);
    expect((await lockAssetsForWrite(empty.tx, ORG, ["", ""])).size).toBe(0);
    expect(empty.seen).toHaveLength(0);
  });

  it("an asset absent from the result is simply not in the map (missing and foreign are one answer)", async () => {
    const { tx } = fakeTx([{ id: "a1", siteId: "s1" }]);
    const map = await lockAssetsForWrite(tx, ORG, ["a1", "a-foreign"]);
    expect(map.has("a-foreign")).toBe(false);
    expect(map.get("a1")).toBe("s1");
  });
});

describe("lockActiveSitesForWrite", () => {
  it("locks the named sites of THIS organisation and returns only the ACTIVE ones", async () => {
    const { tx, seen } = fakeTx([{ id: "s1" }]);
    const active = await lockActiveSitesForWrite(tx, ORG, ["s2", "s1"]);
    expect([...active]).toEqual(["s1"]);
    const { flat, values } = seen[0];
    expect(flat).toContain(`FROM "IndustrialSite" s`);
    expect(flat).toContain(`s."organizationId" = ?`);
    expect(flat).toContain(`s."status" = 'ACTIVE'`);               // the predicate is IN the statement
    expect(flat).toContain(`ORDER BY s."id" FOR SHARE`);
    expect(values).toEqual([ORG, ["s1", "s2"]]);
  });

  it("reads nothing for an empty or malformed-only input", async () => {
    const { tx, seen } = fakeTx();
    expect((await lockActiveSitesForWrite(tx, ORG, [])).size).toBe(0);
    expect((await lockActiveSitesForWrite(tx, ORG, ["", ""])).size).toBe(0);
    expect(seen).toHaveLength(0);
  });
});

describe("allSitesActiveForWrite", () => {
  it("is true only when EVERY requested site came back ACTIVE", async () => {
    const both = fakeTx([{ id: "s1" }, { id: "s2" }]);
    expect(await allSitesActiveForWrite(both.tx, ORG, ["s1", "s2"])).toBe(true);
    const one = fakeTx([{ id: "s1" }]);
    expect(await allSitesActiveForWrite(one.tx, ORG, ["s1", "s2"])).toBe(false);
  });

  it("an empty request is false (fail closed) and performs no read", async () => {
    const { tx, seen } = fakeTx();
    expect(await allSitesActiveForWrite(tx, ORG, [])).toBe(false);
    expect(seen).toHaveLength(0);
  });
});
