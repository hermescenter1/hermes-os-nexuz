import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveRequestId, newRequestId, REQUEST_ID_HEADER } from "../correlation";
import { logAuthFailure, logAuthzDenial, logInfraFailure } from "../security-events";

/**
 * PHASE 90 — observability. Log lines are captured off process.stdout, which
 * is where the structured logger actually writes, so these assert the real
 * emitted JSON rather than a mock's arguments.
 */

function captureLogs(fn: () => void): Record<string, unknown>[] {
  const lines: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines
    .join("")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** Strip block and line comments so assertions describe code, not prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
}

const headers = (v: string | null) => ({ headers: { get: () => v } });

describe("90C — correlation IDs", () => {
  it("preserves a well-formed upstream X-Request-ID", () => {
    expect(resolveRequestId(headers("abc123-DEF_456"))).toBe("abc123-DEF_456");
  });

  it("mints a fresh id when the header is absent", () => {
    const id = resolveRequestId(headers(null));
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(id).not.toBe(resolveRequestId(headers(null)));
  });

  it("rejects a hostile header instead of echoing it into every log line", () => {
    for (const bad of [
      "short",
      "a".repeat(200),
      'x" injected:"yes',
      "with spaces",
      "line\nbreak",
      "semi;colon",
    ]) {
      const id = resolveRequestId(headers(bad));
      expect(id, `must not echo ${JSON.stringify(bad)}`).not.toBe(bad);
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("uses the conventional header name", () => {
    expect(REQUEST_ID_HEADER).toBe("x-request-id");
    expect(newRequestId()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("90C — security events are structured and correlated", () => {
  const originalLevel = process.env.LOG_LEVEL;
  beforeEach(() => { (process.env as Record<string, string | undefined>).LOG_LEVEL = "DEBUG"; });
  afterEach(() => { (process.env as Record<string, string | undefined>).LOG_LEVEL = originalLevel; });

  it("auth failure carries service, operation, outcome and correlation id", () => {
    const [entry] = captureLogs(() =>
      logAuthFailure({ reqId: "req-abc12345", operation: "brain.history.read", reason: "no_session" }),
    );
    expect(entry.svc).toBe("hermes-os");
    expect(entry.level).toBe("WARN");
    expect(entry.reqId).toBe("req-abc12345");
    expect(entry.event).toBe("auth_failure");
    expect(entry.operation).toBe("brain.history.read");
    expect(entry.outcome).toBe("failed");
    expect(entry.reason).toBe("no_session");
    expect(entry.ts).toBeTypeOf("string");
  });

  it("authz denial records who/what was refused but no resource content", () => {
    const [entry] = captureLogs(() =>
      logAuthzDenial({
        reqId: "req-def67890", operation: "org.actor", reason: "not_a_member",
        userId: "u-1", orgId: "org-9", role: "VIEWER", resourceId: "case-7", resourceType: "case",
      }),
    );
    expect(entry.event).toBe("authz_denied");
    expect(entry.outcome).toBe("denied");
    expect(entry.userId).toBe("u-1");
    expect(entry.orgId).toBe("org-9");
    expect(entry.role).toBe("VIEWER");
    // opaque identifiers only — never the protected payload
    expect(entry.resourceId).toBe("case-7");
    expect(JSON.stringify(entry)).not.toMatch(/rootCause|problem|evidence|content|body/i);
  });

  it("omits identity fields that were never established", () => {
    const [entry] = captureLogs(() => logAuthzDenial({ operation: "x", reason: "y" }));
    expect("userId" in entry).toBe(false);
    expect("orgId" in entry).toBe(false);
    expect("resourceId" in entry).toBe(false);
  });

  it("infra failure keeps an actionable error class but no stack or payload", () => {
    const [entry] = captureLogs(() =>
      logInfraFailure("database", "health.ready", new TypeError("connect ECONNREFUSED"), "req-xyz98765"),
    );
    expect(entry.level).toBe("ERROR");
    expect(entry.subsystem).toBe("database");
    expect(entry.errorClass).toBe("TypeError");
    expect(entry.errorMessage).toContain("ECONNREFUSED");
    expect(entry.reqId).toBe("req-xyz98765");
    expect(JSON.stringify(entry)).not.toMatch(/at Object|\.ts:\d+|node_modules/);
  });

  it("a credential threaded in by mistake never reaches the log at all", () => {
    // Stronger than redaction: these helpers project an ALLOW-LIST of fields
    // (see `optional`), so an unexpected key is dropped before the logger runs
    // — the value is not merely masked, it is never serialized.
    const [entry] = captureLogs(() =>
      logAuthFailure({
        operation: "auth.login", reason: "bad_password",
        ...({ password: "hunter2", token: "abc.def.ghi", cookie: "hermes_session=x" } as object),
      }),
    );
    const raw = JSON.stringify(entry);
    for (const secret of ["hunter2", "abc.def.ghi", "hermes_session=x"]) {
      expect(raw, `${secret} must not appear`).not.toContain(secret);
    }
    expect("password" in entry, "unknown key dropped entirely").toBe(false);
    expect("token" in entry).toBe(false);
    expect("cookie" in entry).toBe(false);
    // the legitimate fields still made it
    expect(entry.operation).toBe("auth.login");
  });
});

describe("90-93A — a hostile request id cannot forge a log line", () => {
  const originalLevel = process.env.LOG_LEVEL;
  beforeEach(() => { (process.env as Record<string, string | undefined>).LOG_LEVEL = "DEBUG"; });
  afterEach(() => { (process.env as Record<string, string | undefined>).LOG_LEVEL = originalLevel; });

  it("an injected header cannot inject fields or extra lines into the stream", () => {
    // A raw echo would let a caller close the JSON object and append their own
    // entry, or inject a newline and forge a whole second log line.
    const hostile = 'aaaaaaaa","level":"ERROR","forged":"yes';
    const id = resolveRequestId(headers(hostile));
    expect(id).not.toBe(hostile);

    const entries = captureLogs(() =>
      logAuthzDenial({ reqId: id, operation: "org.invitations.list", reason: "insufficient_permission" }),
    );
    expect(entries, "exactly one line, not two").toHaveLength(1);
    expect(entries[0].forged).toBeUndefined();
    expect(entries[0].level).toBe("WARN");
    expect(String(entries[0].reqId)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("a newline-bearing header cannot split the stream", () => {
    // A literal newline in the header would let a caller append a whole
    // second, attacker-authored log entry to the stream.
    const id = resolveRequestId(headers("good\n" + JSON.stringify({ level: "FATAL", msg: "forged" })));
    const entries = captureLogs(() => logAuthFailure({ reqId: id, operation: "auth", reason: "no_session" }));
    expect(entries).toHaveLength(1);
    expect(entries[0].msg).toBe("auth.failure");
  });
});

describe("90-93A — security-critical infrastructure failures are visible", () => {
  it("the database client no longer swallows an init failure silently", () => {
    const code = readFileSync(resolve(process.cwd(), "src/lib/db/prisma.ts"), "utf8");
    // The failure is cached for the life of the process, so a silent catch
    // means a misconfigured deploy degrades every DB feature with no signal.
    expect(code).toMatch(/logInfraFailure\("database"/);
    // A bare `catch {` cannot log anything actionable — the handler must
    // bind the error so its class and message reach the stream.
    expect(code).toMatch(/catch \(err\)/);
  });

  it("no security-critical module falls back to console.*", () => {
    for (const p of [
      "src/lib/auth/api-guards.ts",
      "src/lib/auth/crypto.ts",
      "src/lib/auth/session.ts",
      "src/lib/org/context.ts",
      "src/lib/org/invitations.ts",
      "src/lib/db/prisma.ts",
      "src/lib/email/providers/console.ts",
    ]) {
      // Comments legitimately discuss console logging; assert about CODE.
      const code = stripComments(readFileSync(resolve(process.cwd(), p), "utf8"));
      expect(code, `${p} must use the structured logger`).not.toMatch(/console\.(log|error|warn|info|debug)/);
    }
  });
});

describe("90C — source guarantees", () => {
  const read = (p: string) =>
    readFileSync(resolve(process.cwd(), p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

  it("liveness proves the process only — no dependency call", () => {
    const code = read("src/app/api/health/route.ts");
    expect(code, "liveness must not query the database").not.toMatch(/getPrisma|queryRaw|SELECT/);
    expect(code).toMatch(/status: "ok"/);
  });

  it("readiness reflects the required dependency and stays opaque", () => {
    const code = read("src/app/api/health/ready/route.ts");
    expect(code).toMatch(/getPrisma/);
    expect(code).toMatch(/503/);
    expect(code).toMatch(/logInfraFailure/);
    // never expose connection details in the public body
    expect(code).not.toMatch(/DATABASE_URL|REDIS_URL|connectionString|process\.env\./);
  });

  it("the console email provider never logs a message body or token", () => {
    const code = read("src/lib/email/providers/console.ts");
    expect(code).toMatch(/logger\.info/);
    // Assert on the LOGGER CALL only. `payload.text` still reaches the
    // in-memory mock mailbox (that is the point of the dev buffer); what must
    // never happen is the body becoming a log value.
    const logCall = code.slice(code.indexOf("logger.info("));
    const logArgs = logCall.slice(0, logCall.indexOf("});") + 3);
    expect(logArgs, "raw body must not be a logged value")
      .not.toMatch(/:\s*payload\.(text|html)\s*[,}]/);
    expect(logArgs, "length is fine, content is not").toMatch(/bodyChars/);
    expect(logArgs).not.toMatch(/token|link|href|https?:/i);
  });

  it("denial paths in the shared guards emit a security event", () => {
    expect(read("src/lib/auth/api-guards.ts")).toMatch(/logAuthFailure|logAuthzDenial/);
    expect(read("src/lib/org/context.ts")).toMatch(/logAuthzDenial/);
  });
});
