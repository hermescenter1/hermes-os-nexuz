/**
 * PHASE 110-A2.1 — hostile values, on both logging paths, and a failing sink.
 *
 * Three separate things are asserted, because they fail for different reasons:
 *
 *   1. THE SESSION PATH stays fail-closed. `isSessionActive` must answer `false`
 *      when the store raises, whatever it raises. Before this round it called
 *      `String(err)`, so a value whose `toString` throws turned the denial into
 *      an unhandled exception.
 *   2. THE DATA PATH still classifies. `runScoped` must produce a refusal for a
 *      hostile value, not a second exception, and must not print anything the
 *      value carried.
 *   3. A FAILING SINK is not the caller's problem. If writing the log line
 *      itself throws — a closed pipe, a full disk — the answer the caller was
 *      about to receive must not turn into a crash.
 *
 * The hostile values are the three shapes that actually occur: a getter that
 * throws, a `Proxy` whose traps throw, and an object whose `toString` throws.
 */

import { describe, expect, it, vi, afterEach } from "vitest";

import { describeErrorSafely } from "@/lib/logger/safe-error";
import { DataScopeError, runScoped } from "../tenant-scope";

/* ── the hostile menagerie ─────────────────────────────────────────────────── */

const throwingMessage = () => {
  const e = new Error("placeholder");
  Object.defineProperty(e, "message", { get() { throw new Error("message getter detonated"); } });
  return e;
};

const throwingCode = () => {
  const e = new Error("placeholder");
  Object.defineProperty(e, "code", { get() { throw new Error("code getter detonated"); } });
  return e;
};

const hostileProxy = () =>
  new Proxy({}, {
    get() { throw new Error("proxy trap detonated"); },
    has() { throw new Error("proxy has trap detonated"); },
    getOwnPropertyDescriptor() { throw new Error("proxy gopd trap detonated"); },
  });

const throwingToString = () => ({
  toString() { throw new Error("toString detonated"); },
  code: "P1001",
});

const HOSTILE: ReadonlyArray<readonly [string, () => unknown]> = [
  ["a throwing message getter", throwingMessage],
  ["a throwing code getter", throwingCode],
  ["a Proxy whose traps throw", hostileProxy],
  ["an object whose toString throws", throwingToString],
  ["a bare string", () => "just a string"],
  ["a number", () => 42],
  ["null", () => null],
  ["undefined", () => undefined],
];

function capture(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  });
  return { lines, restore: () => spy.mockRestore() };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("A2.1 — describeErrorSafely never throws and never quotes the value", () => {
  for (const [name, make] of HOSTILE) {
    it(`survives ${name}`, () => {
      let out = "";
      expect(() => { out = describeErrorSafely(make()); }, "the describer itself must not raise").not.toThrow();
      expect(out.length).toBeGreaterThan(0);
      expect(out, "no free text from the value may appear").not.toMatch(/detonated|just a string/);
    });
  }

  it("keeps the stable driver code, which is the part an operator needs", () => {
    expect(describeErrorSafely(Object.assign(new Error("x"), { code: "P1001" }))).toBe("Error(P1001)");
  });

  it("refuses a code that is not code-shaped", () => {
    const e = Object.assign(new Error("x"), { code: "Can't reach database server at 127.0.0.1:5432" });
    expect(describeErrorSafely(e)).toBe("Error");
  });
});

describe("A2.1 — the SESSION path stays fail-closed under hostile values", () => {
  for (const [name, make] of HOSTILE) {
    it(`isSessionActive answers false for ${name}`, async () => {
      vi.resetModules();
      vi.doMock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => "database" }));
      vi.doMock("@/lib/db/prisma", () => ({
        getPrisma: async () => ({
          refreshToken: { findUnique: async () => { throw make(); } },
        }),
      }));

      const { isSessionActive } = await import("@/lib/auth/session-store");
      const cap = capture();
      let answer: boolean | "threw" = "threw";
      try {
        answer = await isSessionActive("sid_1");
      } catch {
        answer = "threw";
      }
      cap.restore();

      expect(answer, "a session that cannot be confirmed must be denied, never crash").toBe(false);
      const log = cap.lines.join("\n");
      expect(log).not.toMatch(/detonated/);
      expect(log).not.toMatch(/prisma\.[a-z]|postgres(ql)?:\/\/|127\.0\.0\.1/i);

      vi.doUnmock("@/lib/db/prisma");
      vi.doUnmock("@/lib/storage/storage-mode");
    });
  }
});

describe("A2.1 — the DATA path classifies hostile values instead of raising", () => {
  for (const [name, make] of HOSTILE) {
    it(`runScoped answers a refusal for ${name}`, async () => {
      const cap = capture();
      const thrown = await runScoped("test.hostile", async () => { throw make(); }).catch((e: unknown) => e);
      cap.restore();

      expect(thrown, "the refusal contract, not a second exception").toBeInstanceOf(DataScopeError);
      const err = thrown as DataScopeError;
      expect(["INTERNAL_ERROR", "ORGANIZATION_CONTEXT_UNAVAILABLE"]).toContain(err.code);
      expect(cap.lines.join("\n")).not.toMatch(/detonated|just a string/);
    });
  }
});

describe("A2.1 — a failing log sink does not become the caller's exception", () => {
  it("runScoped still returns its refusal when the sink throws", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => {
      throw new Error("EPIPE: the sink is gone");
    });

    const thrown = await runScoped("test.sink", async () => { throw new Error("underlying"); })
      .catch((e: unknown) => e);

    spy.mockRestore();

    expect(thrown, "the sink failing must not replace the refusal").toBeInstanceOf(DataScopeError);
    expect((thrown as DataScopeError).code).toBe("INTERNAL_ERROR");
  });

  it("isSessionActive still denies when the sink throws", async () => {
    vi.resetModules();
    vi.doMock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => "database" }));
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({ refreshToken: { findUnique: async () => { throw new Error("store down"); } } }),
    }));

    const { isSessionActive } = await import("@/lib/auth/session-store");
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => {
      throw new Error("EPIPE: the sink is gone");
    });

    let answer: boolean | "threw" = "threw";
    try {
      answer = await isSessionActive("sid_1");
    } catch {
      answer = "threw";
    }
    spy.mockRestore();

    expect(answer).toBe(false);

    vi.doUnmock("@/lib/db/prisma");
    vi.doUnmock("@/lib/storage/storage-mode");
  });
});
