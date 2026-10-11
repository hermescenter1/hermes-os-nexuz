/**
 * Digital Twin Slice 1 — error contract.
 *
 * The property under test: whatever the database or driver throws, the response
 * body is built from a closed set of strings. Constraint names, table names,
 * foreign identifiers and stack traces never reach a caller.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const logSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger/security-events", () => ({ logInfraFailure: logSpy }));

import {
  TwinDomainError,
  dbErrorCode,
  describeTwinError,
  isForeignKeyViolation,
  isUniqueViolation,
  twinErrorResponse,
  twinNotFound,
} from "../errors";

beforeEach(() => logSpy.mockClear());

describe("domain errors", () => {
  it("map to their own status and code", () => {
    const { status, body } = describeTwinError(
      new TwinDomainError("DUPLICATE_RELATION", 409, "This relation already exists"),
      "x",
    );
    expect(status).toBe(409);
    expect(body).toEqual({ error: "This relation already exists", code: "DUPLICATE_RELATION" });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("the not-found refusals use one fixed wording each", () => {
    expect(twinNotFound.site().message).toBe("Site not found");
    expect(twinNotFound.asset().message).toBe("Asset not found");
    expect(twinNotFound.node().message).toBe("Node not found");
    for (const f of [twinNotFound.site, twinNotFound.asset, twinNotFound.node, twinNotFound.parent]) {
      expect(f().status).toBe(404);
    }
  });
});

describe("database errors", () => {
  const p2002 = Object.assign(new Error("Unique constraint failed on the fields: (`sourceNodeId`,`targetNodeId`)"), {
    code: "P2002",
    meta: { modelName: "DigitalTwinRelation", target: ["DigitalTwinRelation_sourceNodeId_targetNodeId_relationType_key"] },
  });
  const p2003 = Object.assign(new Error("Foreign key constraint violated: `DigitalTwinNode_siteId_fkey (index)`"), {
    code: "P2003",
    meta: { field_name: "DigitalTwinNode_siteId_fkey (index)" },
  });

  it("P2002 → 409 CONFLICT without the constraint, table or column", () => {
    const { status, body } = describeTwinError(p2002, "relations.create");
    expect(status).toBe(409);
    expect(body.code).toBe("CONFLICT");
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/DigitalTwin|sourceNodeId|constraint|_key|meta/i);
    expect(logSpy).not.toHaveBeenCalled(); // an expected conflict is not an infrastructure failure
  });

  it("P2003 → 409 REFERENCE_CONFLICT without the constraint name", () => {
    const { status, body } = describeTwinError(p2003, "nodes.create");
    expect(status).toBe(409);
    expect(body.code).toBe("REFERENCE_CONFLICT");
    expect(JSON.stringify(body)).not.toMatch(/fkey|siteId|DigitalTwinNode/i);
  });

  it("recognises the raw SQLSTATE the driver adapter can surface on `cause`", () => {
    const viaCause = Object.assign(new Error("driver"), { cause: { code: "23505" } });
    expect(dbErrorCode(viaCause)).toBe("23505");
    expect(isUniqueViolation(viaCause)).toBe(true);
    expect(isForeignKeyViolation(Object.assign(new Error("x"), { cause: { code: "23503" } }))).toBe(true);
    expect(isUniqueViolation(new Error("plain"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("P2002")).toBe(false);
  });
});

describe("unexpected errors", () => {
  it("→ 500 with a fixed body; the message, stack and identifiers stay server-side", async () => {
    const boom = new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2 tenant=org-victim");
    const res = twinErrorResponse(boom, "nodes.list");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal server error", code: "INTERNAL_ERROR" });
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/10\.0\.0\.5|hunter2|org-victim|ECONNREFUSED|at .*\.ts/);
    // …but it IS recorded for the operator.
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe("database");
    expect(logSpy.mock.calls[0][1]).toBe("digital-twin.nodes.list");
  });

  it("copes with non-Error throwables", async () => {
    for (const thrown of ["a string", 42, undefined, null, { weird: true }]) {
      const res = twinErrorResponse(thrown, "op");
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Internal server error", code: "INTERNAL_ERROR" });
    }
  });
});
