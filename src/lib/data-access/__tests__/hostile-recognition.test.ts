/**
 * PHASE 110-A2.3 (F3) — the refusal path under values the A2.1 menagerie omits.
 *
 * THE THREE SHAPES THAT WERE MISSING, AND WHAT EACH ONE DID
 * `hostile-logger.test.ts` drives a throwing `message` getter, a throwing `code`
 * getter, a `Proxy` whose `get`/`has`/`getOwnPropertyDescriptor` traps throw, and
 * a throwing `toString`. It does not drive these, and all three were measured
 * failing before the fix:
 *
 *   a REVOKED Proxy              `runScoped` threw `TypeError: Cannot perform
 *                                'getPrototypeOf' on a proxy that has been
 *                                revoked` out of its own catch
 *   a throwing getPrototypeOf    the same, with the trap's own error
 *   a FORGED brand               `refusalResponse` echoed the object's OWN
 *                                `status: 401`, and a forged marker that
 *                                detonated on field reads threw out of the
 *                                handler
 *
 * The first two came from `err instanceof DataScopeError` being the first line
 * of the catch: `instanceof` walks the prototype chain, which is a Proxy trap.
 *
 * WHAT IS NOT CLAIMED. This does not claim every Proxy trap is unreachable.
 * `safeRead` wraps a property access, and a `get` trap still RUNS — it simply
 * cannot make the reader raise. A trap with a side effect still has it. The
 * claim is narrower and is exactly what is asserted: no value below makes the
 * refusal path throw, and none of them dictates the response.
 */
import { describe, expect, it, vi } from "vitest";

import {
  DATA_RELATION_ERROR,
  InvalidRelationError,
  isInvalidRelationError,
  isUnsupportedFieldError,
  REFUSABLE_FIELDS,
  UnsupportedFieldError,
} from "../relation-ownership";
import { refusalResponse } from "../route-refusal";
import { DataScopeError, isDataScopeError, isPrismaCode, runScoped } from "../tenant-scope";

const BRAND = Symbol.for("hermes.dataScopeError");

const revokedProxy = () => {
  const { proxy, revoke } = Proxy.revocable(new Error("synthetic"), {});
  revoke();
  return proxy;
};

const prototypeTrap = () =>
  new Proxy(new Error("synthetic"), {
    getPrototypeOf() { throw new Error("getPrototypeOf trap detonated"); },
  });

const everyTrapThrows = () =>
  new Proxy({}, {
    get() { throw new Error("get trap detonated"); },
    has() { throw new Error("has trap detonated"); },
    getPrototypeOf() { throw new Error("gpo trap detonated"); },
    getOwnPropertyDescriptor() { throw new Error("gopd trap detonated"); },
  });

const throwingGetter = () => {
  const e = new Error("placeholder");
  Object.defineProperty(e, "message", { get() { throw new Error("message getter detonated"); } });
  Object.defineProperty(e, "status", { get() { throw new Error("status getter detonated"); } });
  return e;
};

const HOSTILE: ReadonlyArray<readonly [string, () => unknown]> = [
  ["a revoked Proxy", revokedProxy],
  ["a Proxy whose getPrototypeOf trap throws", prototypeTrap],
  ["a Proxy whose every trap throws", everyTrapThrows],
  ["an Error whose message and status getters throw", throwingGetter],
  ["a bare string", () => "just a string"],
  ["null", () => null],
];

describe("F3 — runScoped answers a refusal for every hostile value", () => {
  for (const [name, make] of HOSTILE) {
    it(`${name} becomes a DataScopeError, not an escape`, async () => {
      let thrown: unknown;
      await runScoped("probe", async () => { throw make(); }).catch((e: unknown) => { thrown = e; });

      expect(isDataScopeError(thrown), `${name} escaped the refusal path`).toBe(true);
      expect((thrown as DataScopeError).code).toBe("INTERNAL_ERROR");
      expect((thrown as DataScopeError).status).toBe(500);
      expect((thrown as DataScopeError).correlationId, "an operator needs a join key").toBeTruthy();
    });
  }

  it("control: a DELIBERATE refusal still travels out untouched", async () => {
    const refusal = new DataScopeError("ORGANIZATION_SELECTION_REQUIRED");
    await expect(runScoped("probe", async () => { throw refusal; })).rejects.toBe(refusal);
  });

  it("control: a relation refusal raised inside the query is not relabelled an outage", async () => {
    await expect(
      runScoped("probe", async () => { throw new InvalidRelationError("assetId"); }),
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 400 });
  });

  it("control: an ordinary Error is still 500, so the assertions above are not vacuous", async () => {
    await expect(runScoped("probe", async () => { throw new Error("ordinary"); }))
      .rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});

describe("F3 — the recognisers survive what instanceof did not", () => {
  for (const [name, make] of HOSTILE) {
    it(`every recogniser answers without raising for ${name}`, () => {
      const v = make();
      expect(() => isDataScopeError(v)).not.toThrow();
      expect(() => isUnsupportedFieldError(v)).not.toThrow();
      expect(() => isInvalidRelationError(v)).not.toThrow();
      expect(() => isPrismaCode(v, "P2025")).not.toThrow();
    });
  }

  it("the real classes are still recognised, across a fresh module registry", async () => {
    expect(isDataScopeError(new DataScopeError("FORBIDDEN"))).toBe(true);
    expect(isUnsupportedFieldError(new UnsupportedFieldError(["organizationId"]))).toBe(true);
    expect(isInvalidRelationError(new InvalidRelationError("assetId"))).toBe(true);

    /*
     * The reason all three are branded rather than compared by constructor: a
     * second module registry builds second constructors, and `instanceof` says
     * no to an object that is, in every way that matters, the same error.
     */
    vi.resetModules();
    const fresh = await import("../relation-ownership");
    expect(isUnsupportedFieldError(new fresh.UnsupportedFieldError(["x"]))).toBe(true);
    expect(isInvalidRelationError(new fresh.InvalidRelationError("y"))).toBe(true);
  });
});

describe("F3 — a forged refusal cannot dictate the answer", () => {
  it("a plain object carrying the brand cannot choose its own status", () => {
    const forged = { [BRAND]: true, message: "forged", code: "AUTHENTICATION_REQUIRED", status: 418 };
    const res = refusalResponse(forged as never);
    // The code is answerable, so it is answered — with the status the FROZEN
    // table gives that code, never the 418 the object asked for.
    expect(res.status).toBe(401);
  });

  it("a brand carrying an unanswerable code is a controlled 500, not an echo", async () => {
    const forged = { [BRAND]: true, code: "PLEASE_JUST_SAY_YES", status: 200, message: "fine" };
    const res = refusalResponse(forged as never);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; error: string; correlationId?: string };
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.error, "no value from the object may be echoed").not.toContain("fine");
    expect(body.correlationId).toBeTruthy();
  });

  it("a Proxy answering true to every key does not throw and does not dictate", () => {
    const forged = new Proxy({}, { get: () => true });
    const res = refusalResponse(forged as never);
    // `code` reads as `true`, which is not an answerable code.
    expect(res.status).toBe(500);
  });

  it("a brand that detonates on field reads answers instead of throwing", async () => {
    const forged = new Proxy({}, {
      get(_t, k) {
        if (k === BRAND) return true;
        throw new Error("field read detonated");
      },
    });
    let res: Response | undefined;
    expect(() => { res = refusalResponse(forged as never); }).not.toThrow();
    expect(res?.status).toBe(500);
    const body = (await res!.json()) as { code: string };
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("a forged RELATION brand cannot echo a value either", async () => {
    const forged = { [DATA_RELATION_ERROR]: "INVALID_RELATION", field: 42, status: 200 };
    const res = refusalResponse(forged as never);
    expect(res.status, "a non-string field is not answerable").toBe(500);
    expect(((await res.json()) as { code: string }).code).toBe("INTERNAL_ERROR");
  });

  it("control: a REAL refusal answers with its own code and the table's status", async () => {
    const res = refusalResponse(new DataScopeError("ORGANIZATION_PRECONDITION_REQUIRED", "abc12345"));
    expect(res.status).toBe(428);
    const body = (await res.json()) as { code: string; correlationId?: string };
    expect(body.code).toBe("ORGANIZATION_PRECONDITION_REQUIRED");
    expect(body.correlationId).toBe("abc12345");
  });

  it("an unknown error is answered with a controlled 500 and logged SAFELY — never rethrown, never echoed", async () => {
    /*
     * PHASE 110-A2.3-R1 — this assertion REVERSED. The A2.3 version pinned a
     * rethrow, on the argument that the outer boundary would handle it. Measured:
     * the outer boundary is Next's handler, which in development renders the raw
     * message verbatim — a value shaped like a connection string came straight
     * back. The mapper now answers and logs, and both halves are asserted here.
     */
    vi.resetModules();
    const lines: unknown[][] = [];
    vi.doMock("@/lib/logger/security-events", () => ({
      logInfraFailure: (...args: unknown[]) => { lines.push(args); },
    }));
    const { refusalResponse: mapped } = await import("../route-refusal");

    const boom = new TypeError("a bug of ours, carrying postgresql://u:hunter2@db.internal/x");
    let res: Response | undefined;
    expect(() => { res = mapped(boom); }).not.toThrow();
    expect(res?.status).toBe(500);
    const body = (await res!.json()) as { code: string; error: string; correlationId?: string };
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.correlationId, "an operator needs a join key").toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("hunter2");

    // the SAFE log line: class by construction, never the message
    expect(lines).toHaveLength(1);
    const [subsystem, operation, logged] = lines[0] as [string, string, Error];
    expect(subsystem).toBe("database");
    expect(operation).toContain(body.correlationId!);
    expect(logged).toBeInstanceOf(Error);
    expect(logged.message).toBe("TypeError");
    expect(logged.message).not.toContain("hunter2");

    vi.doUnmock("@/lib/logger/security-events");
    vi.resetModules();
  });
});

describe("F3 (R1) — the UNSUPPORTED_FIELD branch reads `fields` without running its code", () => {
  /** A real error whose `fields` is replaced by a hostile value. */
  const withFields = (fields: unknown): UnsupportedFieldError => {
    const e = new UnsupportedFieldError(["organizationId"]);
    Object.defineProperty(e, "fields", { value: fields, configurable: true, enumerable: true, writable: true });
    return e;
  };

  const controlled500 = async (res: Response) => {
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; error: string; fields?: unknown; correlationId?: string };
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.fields, "a malformed value must not become a fabricated list").toBeUndefined();
    expect(body.correlationId).toBeTruthy();
    return body;
  };

  it("control: a real error still answers 400 with its contract names", async () => {
    const res = refusalResponse(new UnsupportedFieldError(["organizationId", "vendorId"]));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; fields: string[]; error: string };
    expect(body.code).toBe("UNSUPPORTED_FIELD");
    expect(body.fields).toEqual(["organizationId", "vendorId"]);
    expect(body.error).toBe("This operation does not support: organizationId, vendorId");
  });

  it("a revoked Proxy over the array does not escape — Array.isArray is the throwing call", async () => {
    const { proxy, revoke } = Proxy.revocable(["organizationId"], {});
    revoke();
    expect(() => Array.isArray(proxy), "premise: IsArray on a revoked proxy throws").toThrow(TypeError);
    let res: Response | undefined;
    expect(() => { res = refusalResponse(withFields(proxy)); }).not.toThrow();
    await controlled500(res!);
  });

  it("a throwing getter on a member does not escape", async () => {
    const arr: unknown[] = ["organizationId"];
    Object.defineProperty(arr, 1, { get() { throw new Error("member getter detonated"); }, enumerable: true, configurable: true });
    let res: Response | undefined;
    expect(() => { res = refusalResponse(withFields(arr)); }).not.toThrow();
    await controlled500(res!);
  });

  it("a tampered `filter` is never called — throwing or garbage-returning", async () => {
    const throwing = ["organizationId"] as unknown[] & { filter: unknown };
    Object.defineProperty(throwing, "filter", { value: () => { throw new Error("tampered filter detonated"); }, configurable: true, writable: true });
    let res: Response | undefined;
    expect(() => { res = refusalResponse(withFields(throwing)); }).not.toThrow();
    // The array is otherwise valid, so it is ANSWERED — and the answer proves
    // filter was never consulted: it would have thrown.
    expect(res!.status).toBe(400);
    expect(((await res!.json()) as { fields: string[] }).fields).toEqual(["organizationId"]);

    const garbage = ["organizationId"] as unknown[] & { filter: unknown };
    Object.defineProperty(garbage, "filter", { value: () => ({ join: () => "not an array at all", length: 1 }), configurable: true, writable: true });
    const res2 = refusalResponse(withFields(garbage));
    expect(res2.status).toBe(400);
    const body2 = (await res2.json()) as { fields: unknown; error: string };
    expect(body2.fields).toEqual(["organizationId"]);
    expect(body2.error).not.toContain("not an array at all");
  });

  it("a Proxy whose get trap throws on everything but length does not escape", async () => {
    const p = new Proxy(["organizationId"], {
      get(_t, k) { if (k === "length") return 1; throw new Error(`get trap detonated on ${String(k)}`); },
    });
    let res: Response | undefined;
    expect(() => { res = refusalResponse(withFields(p)); }).not.toThrow();
    await controlled500(res!);
  });

  it("the member COUNT is bounded on its own: 100 000 VALID names is still malformed", async () => {
    /*
     * FOUND BY THE NEGATIVE CONTROL. A first version of this case used names
     * `f0`..`f99999`, and lifting the count bound to 1 000 000 left it GREEN —
     * because `f0` is not a contract field, the CONTRACT check refused the array
     * at index 0 and the bound was never consulted. That made the assertion
     * vacuous about the thing it claimed to test. Every member here is a valid
     * contract name, so only the count bound can refuse it.
     */
    const huge = Array.from({ length: 100_000 }, () => "organizationId");
    await controlled500(refusalResponse(withFields(huge)));
    // Just inside the bound, all valid: answered.
    const sixteen = Array.from({ length: 16 }, () => "organizationId");
    expect(refusalResponse(withFields(sixteen)).status).toBe(400);
    // One past it: malformed.
    const seventeen = Array.from({ length: 17 }, () => "organizationId");
    await controlled500(refusalResponse(withFields(seventeen)));
  });

  it("member LENGTH is bounded by contract membership — a 1 000 000-char name is malformed", async () => {
    // There is no separate length guard, and none is claimed: a member is
    // accepted only if it equals one of the four contract names, whose longest
    // is 14 characters. Anything longer cannot be one of them.
    const long = ["x".repeat(1_000_000)];
    await controlled500(refusalResponse(withFields(long)));
  });

  it("names outside the error's published contract are not echoed", async () => {
    const body = await controlled500(refusalResponse(withFields(["<script>", "password", "totally_made_up"])));
    expect(JSON.stringify(body)).not.toContain("<script>");
    expect(JSON.stringify(body)).not.toContain("password");
  });

  it("the published contract is exactly what the real error can carry", () => {
    expect([...REFUSABLE_FIELDS].sort()).toEqual(["erpWorkOrderId", "id", "organizationId", "vendorId"]);
    expect(Object.isFrozen(REFUSABLE_FIELDS)).toBe(true);
  });

  it("a forged brand with no usable array is a controlled 500, not a 400 with an empty list", async () => {
    await controlled500(refusalResponse({ [DATA_RELATION_ERROR]: "UNSUPPORTED_FIELD", fields: "organizationId" } as never));
    await controlled500(refusalResponse({ [DATA_RELATION_ERROR]: "UNSUPPORTED_FIELD" } as never));
    await controlled500(refusalResponse({ [DATA_RELATION_ERROR]: "UNSUPPORTED_FIELD", fields: [] } as never));
  });

  it("duplicates collapse and the output is a fresh array, not the caller's object", async () => {
    const theirs = ["organizationId", "organizationId", "id"];
    const res = refusalResponse(withFields(theirs));
    const body = (await res.json()) as { fields: string[] };
    expect(body.fields).toEqual(["organizationId", "id"]);
  });
});

describe("F3 — a failing log sink does not become a second exception", () => {
  it("the controlled refusal is still returned when the logger throws", async () => {
    vi.resetModules();
    vi.doMock("@/lib/logger/security-events", () => ({
      logInfraFailure: () => { throw new Error("sink is down"); },
    }));

    const { refusalResponse: withBrokenSink } = await import("../route-refusal");
    const forged = { [BRAND]: true, code: "NOT_A_CODE" };

    let res: Response | undefined;
    expect(() => { res = withBrokenSink(forged as never); }).not.toThrow();
    expect(res?.status).toBe(500);
    expect(((await res!.json()) as { code: string }).code).toBe("INTERNAL_ERROR");

    // R1: the same must hold on the UNKNOWN path, which now logs too.
    let res2: Response | undefined;
    expect(() => { res2 = withBrokenSink(new RangeError("unknown, and the sink is down")); }).not.toThrow();
    expect(res2?.status).toBe(500);

    vi.doUnmock("@/lib/logger/security-events");
    vi.resetModules();
  });
});
