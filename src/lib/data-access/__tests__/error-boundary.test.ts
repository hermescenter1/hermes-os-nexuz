/**
 * PHASE 110-A2.0 — nothing a driver authored may reach a response or a log.
 *
 * The two data layers now turn every query failure into a `DataScopeError` and
 * hand the original to `logInfraFailure` through `sanitizeDatabaseError`. Two
 * things have to hold for that to be worth anything, and they fail in opposite
 * directions:
 *
 *   1. NOTHING LEAKS. A Prisma error's message routinely carries a host, a port,
 *      a table name or a value — this repository's own logs contain a P1001 with
 *      `10.0.0.5:5432` in it. Neither the thrown refusal nor the emitted log
 *      line may contain any of that.
 *
 *   2. THE SANITISER ITSELF NEVER THROWS. It runs on the failure path. If a
 *      hostile or merely odd error value — a string, a `Proxy`, an object whose
 *      `message` getter throws — makes the sanitiser raise, the refusal path
 *      turns into a second, unhandled exception and the caller gets a 500
 *      instead of the honest refusal. That is a worse outcome than the leak it
 *      was added to prevent.
 *
 * The log is captured through the REAL logger rather than a stub of it, because
 * a stub would prove the sanitiser and not the pipeline: `logInfraFailure`
 * writes `error.message` verbatim, so the assertion that matters is about what
 * that emits AFTER sanitisation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sanitizeDatabaseError } from "@/lib/api/auth";
import { logInfraFailure } from "@/lib/logger/security-events";

/**
 * Strings that must never appear anywhere. Each is the shape of a real leak:
 * a connection string, a host and port, a table name, a statement fragment and
 * a customer value.
 */
const MARKERS = [
  "postgresql://hermes:hunter2@db.internal:5432/hermes_db",
  "10.0.0.5:5432",
  "MaintenanceTask",
  'INSERT INTO "public"."MaintenanceTask"',
  "acme-corporation-secret-asset-name",
] as const;

/** A Prisma-shaped error whose message carries every marker at once. */
class FakePrismaKnownRequestError extends Error {
  readonly code = "P1001";
  readonly clientVersion = "7.8.0";
  readonly meta = { target: MARKERS[2], db: MARKERS[0] };
  constructor() {
    super(
      `Can't reach database server at ${MARKERS[1]} using ${MARKERS[0]} while running ${MARKERS[3]} with ${MARKERS[4]}`,
    );
    this.name = "PrismaClientKnownRequestError";
  }
}

let written: string[] = [];

/*
 * CAPTURE AT THE SINK THE LOGGER ACTUALLY USES.
 *
 * A first version of this file spied on `console.*` and every assertion about
 * the emitted line failed with `expected '' to contain ...` — INCLUDING the
 * negative control, which is what exposed it as a harness fault rather than a
 * product one. `src/lib/logger/index.ts` writes `process.stdout.write(line)`
 * whenever `process.stdout` exists and only falls back to `console` in the Edge
 * runtime. Under vitest on Node it takes the first branch, so the spy watched a
 * sink nothing was written to.
 */
beforeEach(() => {
  written = [];
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    written.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  }) as never);
  for (const level of ["error", "warn", "log"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      written.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

const emitted = () => written.join("\n");

describe("A2.0 — the sanitiser strips every marker before the logger sees it", () => {
  it("a Prisma error carrying five markers logs none of them", () => {
    const raw = new FakePrismaKnownRequestError();

    logInfraFailure("database", "cmms.getTasks", sanitizeDatabaseError(raw));

    expect(emitted(), "the log must have been written at all").toContain("database.failure");
    for (const marker of MARKERS) {
      expect(emitted(), `marker leaked: ${marker}`).not.toContain(marker);
    }
  });

  it("what it emits INSTEAD is the CONSTRUCTOR name and the code — not the writable `name`", () => {
    logInfraFailure("database", "cmms.getTasks", sanitizeDatabaseError(new FakePrismaKnownRequestError()));

    /*
     * A first version of this expected "PrismaClientKnownRequestError(P1001)",
     * which is the value of `err.name`, and it failed. The sanitiser reads
     * `err.constructor.name` instead — and that is the BETTER source: `name` is
     * an ordinary writable property that anything constructing an error can set
     * to whatever it likes, while the constructor's name cannot be forged by
     * assignment. The fixture sets `this.name = "PrismaClientKnownRequestError"`
     * precisely so the two differ, which is what makes this assertion mean
     * something.
     */
    expect(emitted()).toContain("FakePrismaKnownRequestError(P1001)");
    expect(emitted(), "the forgeable `name` must not be what gets logged")
      .not.toContain("PrismaClientKnownRequestError(P1001)");
  });

  /**
   * THE NEGATIVE CONTROL.
   *
   * A test that only asserts the sanitised path stays green if somebody removes
   * the sanitiser, because the assertion would still be about a different call.
   * This proves the detector works: the SAME logger, the SAME error, WITHOUT
   * `sanitizeDatabaseError`, must leak — otherwise the tests above prove nothing.
   */
  it("negative control: logging the raw error DOES leak, so the assertion above bites", () => {
    logInfraFailure("database", "cmms.getTasks", new FakePrismaKnownRequestError());

    const leaked = MARKERS.filter((m) => emitted().includes(m));
    expect(
      leaked.length,
      "if this is 0 the leak detector is broken and every assertion above is vacuous",
    ).toBeGreaterThan(0);
    expect(emitted()).toContain(MARKERS[1]);
  });
});

describe("A2.0 — the sanitiser never turns the refusal path into a new exception", () => {
  /**
   * Each of these is a value that could plausibly arrive in a `catch`, and each
   * has broken a naive sanitiser at some point: a thrown string has no
   * `constructor.name` worth reading, a throwing getter detonates on property
   * access, and a Proxy can throw from its traps.
   */
  const hostile: Array<[string, unknown]> = [
    ["a thrown string", "boom"],
    ["a thrown number", 42],
    ["null", null],
    ["undefined", undefined],
    ["a plain object", { message: "no class here" }],
    [
      "an object whose message getter throws",
      Object.defineProperty({}, "message", {
        get() {
          throw new Error("getter detonated");
        },
      }),
    ],
    [
      "an object whose code getter throws",
      Object.defineProperty(new Error("ok"), "code", {
        get() {
          throw new Error("code getter detonated");
        },
      }),
    ],
    [
      "a Proxy that throws on every get",
      new Proxy(
        {},
        {
          get() {
            throw new Error("proxy trap detonated");
          },
        },
      ),
    ],
  ];

  for (const [label, value] of hostile) {
    it(`${label} is sanitised without raising`, () => {
      expect(() => {
        const safe = sanitizeDatabaseError(value);
        logInfraFailure("database", "cmms.getTasks", safe);
      }, "the failure path must not produce a second exception").not.toThrow();
    });
  }

  it("a hostile value still produces a usable log line rather than silence", () => {
    logInfraFailure("database", "cmms.getTasks", sanitizeDatabaseError("boom"));
    expect(emitted()).toContain("database.failure");
  });

  it("a class name that is not a plain identifier is replaced, not echoed", () => {
    class Weird extends Error {}
    Object.defineProperty(Weird, "name", { value: 'Evil";DROP TABLE x;--' });
    const e = new Weird("m");

    logInfraFailure("database", "cmms.getTasks", sanitizeDatabaseError(e));

    expect(emitted()).not.toContain("DROP TABLE");
  });
});
