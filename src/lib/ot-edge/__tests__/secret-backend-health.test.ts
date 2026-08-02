import { describe, it, expect, afterEach, vi } from "vitest";
import {
  readSecretBackendReadiness,
  classifySecretBackendOutcome,
} from "../secret-backend-health";
import { SECRET_BACKEND_ENV } from "../secret-backend-env";

/**
 * PHASE 95 — the secret-backend readiness/health surface. Proves the disabled
 * path is truthful and network-free, that an enabled-but-incomplete config is
 * `degraded` (never silently healthy), and that the reachable/authenticated
 * states come only from a real-operation classifier.
 */

const ALL_KEYS = [SECRET_BACKEND_ENV.toggle, ...SECRET_BACKEND_ENV.required];
const saved = new Map<string, string | undefined>();

function setEnv(values: Record<string, string | undefined>): void {
  for (const key of ALL_KEYS) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
  }
  for (const [key, value] of Object.entries(values)) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function fullConfig(): Record<string, string> {
  return {
    OT_SECRET_BACKEND: "openbao",
    OPENBAO_ENDPOINT: "https://127.0.0.1:8200",
    OPENBAO_KV_MOUNT: "hermes-kv",
    OPENBAO_KV_PREFIX: "gateways",
    OPENBAO_APPROLE_MOUNT: "approle",
    OPENBAO_APPROLE_ROLE_ID_FILE: "/run/secrets/role_id",
    OPENBAO_APPROLE_SECRET_ID_FILE: "/run/secrets/secret_id",
  };
}

afterEach(() => {
  for (const [key, value] of saved.entries()) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
  vi.restoreAllMocks();
});

describe("95 — readSecretBackendReadiness", () => {
  it("is 'disabled' and performs zero network calls when the toggle is off", () => {
    setEnv({ OT_SECRET_BACKEND: undefined });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const health = readSecretBackendReadiness();
    expect(health).toEqual({ status: "disabled", reason: null, checked: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is 'disabled' for any value other than exactly 'openbao'", () => {
    setEnv({ OT_SECRET_BACKEND: "true" });
    expect(readSecretBackendReadiness().status).toBe("disabled");
  });

  it("is 'configured_not_checked' (never 'healthy') when fully configured", () => {
    setEnv(fullConfig());
    const health = readSecretBackendReadiness();
    expect(health.status).toBe("configured_not_checked");
    expect(health.checked).toBe(false);
  });

  it("is 'degraded/misconfigured' when enabled but a required var is missing", () => {
    setEnv({ ...fullConfig(), OPENBAO_APPROLE_SECRET_ID_FILE: undefined });
    const health = readSecretBackendReadiness();
    expect(health.status).toBe("degraded");
    expect(health.reason).toBe("misconfigured");
    expect(health.checked).toBe(false);
  });
});

describe("95 — classifySecretBackendOutcome", () => {
  it("maps a real success to 'healthy' (checked)", () => {
    expect(classifySecretBackendOutcome({ ok: true })).toEqual({ status: "healthy", reason: null, checked: true });
  });

  it("maps auth/tls/network/provider failures to distinct checked states", () => {
    expect(classifySecretBackendOutcome({ ok: false, kind: "authentication" })).toMatchObject({
      status: "authentication_failed",
      checked: true,
    });
    expect(classifySecretBackendOutcome({ ok: false, kind: "tls" })).toMatchObject({ status: "tls_failed", checked: true });
    expect(classifySecretBackendOutcome({ ok: false, kind: "network" })).toMatchObject({ status: "unreachable", checked: true });
    expect(classifySecretBackendOutcome({ ok: false, kind: "provider" })).toMatchObject({ status: "degraded", checked: true });
  });
});
