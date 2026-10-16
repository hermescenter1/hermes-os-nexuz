// @vitest-environment node
/**
 * Application-side HTTP telemetry — proves the diagnostics_channel hook captures
 * the FINAL status class and the full response lifecycle on a REAL http server,
 * and that nothing request-derived beyond {method, status_class} can enter the
 * metric output.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  installHttpTelemetry,
  uninstallHttpTelemetry,
  normalizeMethod,
  statusClassOf,
  isExcludedPath,
  recordHttpRequest,
} from "../http-telemetry";
import { renderProm, resetMetrics, snapshotMetrics } from "../metrics";
import { resetErrors, getErrorFingerprints } from "../errors";
import { recordUnhandledRequestError } from "../request-error";

let server: http.Server;
let port = 0;

/** A stand-in for the framework: routes by path, and turns a thrown error into a 500 like Next does. */
function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  try {
    const path = (req.url ?? "").split("?")[0];
    if (path === "/slow") {
      res.write("a");
      setTimeout(() => {
        res.statusCode = 200;
        res.end("b");
      }, 70);
    } else if (path === "/redirect") {
      res.statusCode = 308;
      res.setHeader("location", "/ok");
      res.end();
    } else if (path === "/missing") {
      res.statusCode = 404;
      res.end("nf");
    } else if (path === "/fail") {
      res.statusCode = 503;
      res.end("unavailable");
    } else if (path === "/throw") {
      throw new Error("boom with secret token=abc");
    } else {
      res.statusCode = 200;
      res.end("ok");
    }
  } catch {
    res.statusCode = 500;
    res.end("internal");
  }
}

function request(method: string, path: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method, path, headers }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? 0));
    });
    r.on("error", reject);
    r.end();
  });
}

/** The finish event is delivered around the time the client has the response; let it settle. */
const settle = () => new Promise((r) => setTimeout(r, 60));

type Series = Array<{ labels: Record<string, string>; value: number }>;
function counterSeries(): Series {
  const snap = snapshotMetrics() as Record<string, Series>;
  return snap.http_requests_total ?? [];
}
function count(method: string, statusClass: string): number {
  return counterSeries().find((s) => s.labels.method === method && s.labels.status_class === statusClass)?.value ?? 0;
}

beforeAll(async () => {
  uninstallHttpTelemetry();
  expect(installHttpTelemetry()).toBe(true);
  server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  uninstallHttpTelemetry();
  await new Promise((r) => server.close(r));
});
afterEach(() => resetMetrics());

describe("final status class capture on a real HTTP server", () => {
  it("records 2xx, 3xx, 4xx, 5xx and a handled thrown error as 5xx", async () => {
    expect(await request("GET", "/ok")).toBe(200);
    expect(await request("GET", "/redirect")).toBe(308);
    expect(await request("GET", "/missing")).toBe(404);
    expect(await request("GET", "/fail")).toBe(503);
    expect(await request("GET", "/throw")).toBe(500);
    await settle();
    expect(count("GET", "2xx")).toBe(1);
    expect(count("GET", "3xx")).toBe(1);
    expect(count("GET", "4xx")).toBe(1);
    expect(count("GET", "5xx")).toBe(2);
  });

  it("records HEAD, and folds an unsupported method into OTHER", async () => {
    await request("HEAD", "/ok");
    await request("PROPFIND", "/ok"); // valid HTTP token the parser accepts, not in the allowlist
    await settle();
    expect(count("HEAD", "2xx")).toBe(1);
    expect(count("OTHER", "2xx")).toBe(1);
    expect(counterSeries().some((s) => s.labels.method === "PROPFIND")).toBe(false);
  });
});

describe("duration covers the whole response lifecycle", () => {
  it("measures until the response finishes, not until the handler returns", async () => {
    await request("GET", "/slow"); // handler returns immediately; response ends after ~70 ms
    await settle();
    const hist = (
      snapshotMetrics() as Record<string, Array<{ labels: Record<string, string>; count: number; sum: number }>>
    ).http_request_duration_ms;
    expect(hist).toHaveLength(1);
    expect(hist[0].labels).toEqual({ method: "GET" });
    expect(hist[0].count).toBe(1);
    expect(hist[0].sum).toBeGreaterThanOrEqual(60);
  });

  it("never records a negative or non-finite duration", () => {
    recordHttpRequest({ method: "GET", statusCode: 200, durationMs: -5 });
    recordHttpRequest({ method: "GET", statusCode: 200, durationMs: Number.NaN });
    const snap = snapshotMetrics() as Record<string, unknown>;
    expect(snap.http_request_duration_ms).toBeUndefined();
    expect(count("GET", "2xx")).toBe(2); // the request itself is still counted
  });
});

describe("exclusions", () => {
  it("does not record /api/metrics or health probes (including sub-paths and queries)", async () => {
    await request("GET", "/api/metrics");
    await request("GET", "/api/metrics?x=1");
    await request("GET", "/api/health");
    await request("GET", "/api/health/ready");
    await settle();
    expect(counterSeries()).toHaveLength(0);
    await request("GET", "/api/metricsfoo"); // a different route is NOT excluded
    await settle();
    expect(count("GET", "2xx")).toBe(1);
  });

  it("isExcludedPath is exact on the prefix boundary", () => {
    expect(isExcludedPath("/api/metrics")).toBe(true);
    expect(isExcludedPath("/api/metrics/")).toBe(true);
    expect(isExcludedPath("/api/health/ready?a=b")).toBe(true);
    expect(isExcludedPath("/api/healthy")).toBe(false);
    expect(isExcludedPath("/fa/api/metrics")).toBe(false);
    expect(isExcludedPath(undefined)).toBe(false);
  });
});

describe("privacy and cardinality", () => {
  it("no URL, query, token, identity, Authorization or cookie value reaches any metric output", async () => {
    const secrets = ["SECRETTOKEN123", "user-42", "org-77", "alice@example.com", "Bearer ZZTOP", "sess=COOKIEVAL"];
    await request("GET", "/fa/articles/alice@example.com?token=SECRETTOKEN123&userId=user-42&orgId=org-77", {
      authorization: "Bearer ZZTOP",
      cookie: "sess=COOKIEVAL",
      "user-agent": "evil-agent/9",
      "x-forwarded-for": "203.0.113.9",
    });
    await settle();
    const output = renderProm() + JSON.stringify(snapshotMetrics());
    for (const s of [...secrets, "evil-agent", "203.0.113.9", "/fa/articles", "127.0.0.1"]) {
      expect(output).not.toContain(s);
    }
    expect(output).toContain("http_requests_total");
  });

  it("only the declared label keys and a closed value set are ever emitted", async () => {
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "PROPFIND", "LOCK"]) {
      await request(m, "/ok");
    }
    await request("GET", "/missing");
    await request("GET", "/fail");
    await settle();
    const methods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "OTHER"]);
    const classes = new Set(["1xx", "2xx", "3xx", "4xx", "5xx"]);
    expect(counterSeries().length).toBeGreaterThan(0);
    for (const s of counterSeries()) {
      expect(Object.keys(s.labels).sort()).toEqual(["method", "status_class"]);
      expect(methods.has(s.labels.method)).toBe(true);
      expect(classes.has(s.labels.status_class)).toBe(true);
    }
  });

  it("normalizers are closed", () => {
    expect(normalizeMethod("get")).toBe("OTHER");
    expect(normalizeMethod("GET")).toBe("GET");
    expect(normalizeMethod(undefined)).toBe("OTHER");
    expect(normalizeMethod("GET\r\nx: y")).toBe("OTHER");
    expect(statusClassOf(204)).toBe("2xx");
    expect(statusClassOf(101)).toBe("1xx");
    expect(statusClassOf(599)).toBe("5xx");
    expect(statusClassOf(600)).toBeNull();
    expect(statusClassOf(99)).toBeNull();
    expect(statusClassOf("200")).toBeNull();
  });
});

describe("safety", () => {
  it("install is idempotent: one subscription, one count per request", async () => {
    expect(installHttpTelemetry()).toBe(true);
    expect(installHttpTelemetry()).toBe(true);
    await request("GET", "/ok");
    await settle();
    expect(count("GET", "2xx")).toBe(1);
  });

  it("the response is unchanged by telemetry (status, body, headers)", async () => {
    const out = await new Promise<{ status: number; text: string; loc?: string }>((resolve) => {
      http.get({ port, path: "/redirect" }, (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text, loc: res.headers.location }));
      });
    });
    expect(out).toEqual({ status: 308, text: "", loc: "/ok" });
  });
});

describe("unhandled request error evidence", () => {
  afterEach(() => resetErrors());

  it("records a class-only fingerprint correlated by a validated request id", () => {
    const err = new TypeError("db password=hunter2 at /fa/articles/alice@example.com?token=abc");
    const fp = recordUnhandledRequestError(
      err,
      {
        headers: { "x-request-id": "0123456789abcdef0123456789abcdef", cookie: "sess=COOKIEVAL", authorization: "Bearer Z" },
      },
      { routeType: "render", routePath: "/[locale]/articles/[slug]" },
    );
    expect(fp).not.toBe("unknown");
    const all = getErrorFingerprints();
    expect(all).toHaveLength(1);
    expect(all[0].errorClass).toBe("TypeError");
    expect(all[0].operation).toBe("http.render /[locale]/articles/[slug]");
    expect(all[0].correlationIds).toEqual(["0123456789abcdef0123456789abcdef"]);
    const dump = JSON.stringify(all);
    for (const s of ["hunter2", "alice@example.com", "token=abc", "COOKIEVAL", "Bearer"]) expect(dump).not.toContain(s);
  });

  it("rejects hostile request ids, class names and route templates", () => {
    recordUnhandledRequestError(
      Object.assign(new Error("x"), { name: "Evil\nClass" }),
      { headers: { "x-request-id": "bad id\nwith spaces" } },
      { routeType: "<script>", routePath: "/fa/articles/alice@example.com?x=1" },
    );
    const [e] = getErrorFingerprints();
    expect(e.errorClass).toBe("Error");
    expect(e.operation).toBe("http.unknown");
    expect(e.correlationIds).toEqual([]);
  });
});
