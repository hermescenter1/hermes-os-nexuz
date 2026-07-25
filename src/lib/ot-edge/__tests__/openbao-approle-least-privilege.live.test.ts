import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createOpenBaoAppRoleTokenProvider, type OpenBaoAppRoleTokenProvider } from "../openbao-approle-token-provider";
import { createOpenBaoSecretManager } from "../openbao-secret-manager";
import type { WritableSecretManager } from "../secret-manager";

/**
 * PHASE 94D0F — LIVE least-privilege proof, opt-in.
 *
 * Skipped unless `OPENBAO_LEASTPRIV_LIVE=1` plus `BAO_ADDR` +
 * `OPENBAO_LEASTPRIV_ADMIN_TOKEN` (the privileged provisioning token the
 * launcher maps from BAO_TOKEN) + `BAO_MOUNT` + `BAO_AUTH_MOUNT` are present, so
 * an ordinary `npm test` never touches a network. When enabled it provisions a UNIQUE
 * ephemeral policy + AppRole + prefix per run (against an existing KV v2 mount
 * and AppRole auth mount), proves the policy is exactly least-privilege, and
 * tears the ephemeral resources down in an `afterAll` that always runs.
 *
 * It prints nothing sensitive: assertions compare status codes, byte buffers and
 * fixed error codes — never a Role ID, Secret ID, accessor or token.
 */

const LIVE =
  process.env.OPENBAO_LEASTPRIV_LIVE === "1" &&
  !!process.env.BAO_ADDR &&
  !!process.env.OPENBAO_LEASTPRIV_ADMIN_TOKEN &&
  !!process.env.BAO_MOUNT &&
  !!process.env.BAO_AUTH_MOUNT;

const ADDR = process.env.BAO_ADDR ?? "";
// The privileged provisioning token comes ONLY from the explicit child variable
// the launcher maps from BAO_TOKEN — never a fallback token variable.
const ADMIN = process.env.OPENBAO_LEASTPRIV_ADMIN_TOKEN ?? "";
const MOUNT = process.env.BAO_MOUNT ?? "hermes-lab";
const AUTH = process.env.BAO_AUTH_MOUNT ?? "approle";

// Unique per-run names so parallel/rerun collisions and stale state cannot leak
// between runs. `randomBytes` (not Math.random/Date) gives the suffix.
const RUN = randomBytes(5).toString("hex");
const BASE_PREFIX = process.env.BAO_PREFIX ?? "gw";
const PREFIX = `${BASE_PREFIX}-lp-${RUN}`;
const OTHER_PREFIX = `${BASE_PREFIX}-other-${RUN}`;
const ROLE = `${process.env.BAO_ROLE ?? "hermes-gateway"}-lp-${RUN}`;
const POLICY = `${process.env.BAO_POLICY ?? "hermes-gateway-kv"}-lp-${RUN}`;

interface VaultResult {
  status: number;
  json: Record<string, unknown> | null;
}

async function vault(method: string, apiPath: string, token: string, body?: unknown): Promise<VaultResult> {
  const res = await fetch(`${ADDR}/v1/${apiPath}`, {
    method,
    headers: { "X-Vault-Token": token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/** Extract a nested string field or throw a value-free error. */
function field(result: VaultResult, ...keys: string[]): string {
  let cur: unknown = result.json;
  for (const key of keys) {
    if (cur === null || typeof cur !== "object") throw new Error("provision_field_missing");
    cur = (cur as Record<string, unknown>)[key];
  }
  if (typeof cur !== "string") throw new Error("provision_field_missing");
  return cur;
}

const policyHcl = (mount: string, prefix: string): string =>
  `path "${mount}/data/${prefix}/*" { capabilities = ["create", "read", "patch", "delete"] }\n` +
  `path "${mount}/metadata/${prefix}/*" { capabilities = ["read", "delete"] }\n`;

// Canonical AppRole role body. token_policies is an ARRAY (OpenBao's list
// contract) — the previous bare-string form was the role-provisioning defect.
// Exactly these nine fields; no policies/period/token_period/local_secret_ids/
// CIDR/strict-bind aliases, no undefined or null fields.
const roleBody = (policy: string): Record<string, unknown> => ({
  bind_secret_id: true,
  secret_id_num_uses: 5,
  secret_id_ttl: "1h",
  token_ttl: "20m",
  token_max_ttl: "1h",
  token_policies: [policy],
  token_no_default_policy: true,
  token_num_uses: 0,
  token_type: "service",
});

describe.skipIf(!LIVE)("94D0F — live least-privilege AppRole", () => {
  let allowInsecureLoopback = false;
  let roleId = "";
  let mainProvider!: OpenBaoAppRoleTokenProvider;
  let manager!: WritableSecretManager;
  // Tracks whether THIS run created each unique mount, so cleanup deletes only them.
  let createdKvMount = false;
  let createdAuthMount = false;

  function providerWith(secretId: string): OpenBaoAppRoleTokenProvider {
    return createOpenBaoAppRoleTokenProvider({
      endpoint: ADDR,
      authMount: AUTH,
      roleIdProvider: async () => roleId,
      secretIdProvider: async () => secretId,
      fetchImpl: fetch,
      clock: () => Date.now(),
      expirySkewSeconds: 5,
      allowInsecureLoopback,
    });
  }

  beforeAll(async () => {
    const url = new URL(ADDR);
    const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
    const safe = url.protocol === "https:" || (url.protocol === "http:" && loopback);
    if (!safe) throw new Error("unsafe endpoint");
    allowInsecureLoopback = url.protocol === "http:" && loopback;

    // Admin preflight — prove the provisioning token is a valid ROOT-policy token
    // with a read-only self-lookup BEFORE any mutation, so an invalid or
    // under-privileged admin token surfaces here (not as an opaque 403 on the
    // policy write). No body, token, accessor or entity is ever printed.
    const preflight = await vault("GET", "auth/token/lookup-self", ADMIN);
    if (preflight.status !== 200) throw new Error(`admin_token_preflight_status_${preflight.status}`);
    const preflightData =
      preflight.json && typeof preflight.json === "object" ? (preflight.json as Record<string, unknown>).data : undefined;
    const policies =
      preflightData && typeof preflightData === "object" ? (preflightData as Record<string, unknown>).policies : undefined;
    if (!Array.isArray(policies)) throw new Error("admin_token_preflight_invalid_response");
    if (!policies.includes("root")) throw new Error("admin_token_preflight_not_root");

    // Enable the UNIQUE KV v2 mount for this run — neither the ephemeral OpenBao
    // nor the runner provisions it. Response stored once; only a 2xx accepted; no
    // mount name or body printed. Tracked so cleanup deletes exactly this mount.
    const enableKvResponse = await vault("POST", `sys/mounts/${MOUNT}`, ADMIN, { type: "kv", options: { version: "2" } });
    if (!(enableKvResponse.status >= 200 && enableKvResponse.status < 300)) {
      throw new Error(`enable_kv_mount_status_${enableKvResponse.status}`);
    }
    createdKvMount = true;

    // KV-mount preflight — verify presence as KV version 2, reading ONLY the JSON
    // payload vault() returns (its contract is { status, json }; the mount map is
    // at json.data). No wrapper fallback; no mount metadata printed.
    const mountListResponse = await vault("GET", "sys/mounts", ADMIN);
    if (mountListResponse.status !== 200) throw new Error(`kv_mount_preflight_status_${mountListResponse.status}`);
    const mountJson = mountListResponse.json;
    if (mountJson === null || typeof mountJson !== "object") throw new Error("kv_mount_preflight_invalid_response");
    const mountData = mountJson.data;
    if (mountData === null || typeof mountData !== "object") throw new Error("kv_mount_preflight_invalid_response");
    const mountEntry = (mountData as Record<string, unknown>)[`${MOUNT}/`];
    if (mountEntry === undefined) throw new Error("kv_mount_preflight_missing");
    if (mountEntry === null || typeof mountEntry !== "object") throw new Error("kv_mount_preflight_invalid_response");
    const mountType = (mountEntry as Record<string, unknown>).type;
    if (mountType !== "kv") {
      throw new Error(typeof mountType === "string" ? "kv_mount_preflight_wrong_type" : "kv_mount_preflight_invalid_response");
    }
    const mountOptions = (mountEntry as Record<string, unknown>).options;
    if (mountOptions === null || typeof mountOptions !== "object") throw new Error("kv_mount_preflight_invalid_response");
    const mountVersion = (mountOptions as Record<string, unknown>).version;
    if (mountVersion !== "2") {
      throw new Error(typeof mountVersion === "string" ? "kv_mount_preflight_wrong_version" : "kv_mount_preflight_invalid_response");
    }

    // Enable the AppRole auth mount — the ephemeral OpenBao does not carry it,
    // and the preflight only verifies (never provisions). Response stored once;
    // only a 2xx is accepted; no mount name or body is printed.
    const enableAuthResponse = await vault("POST", `sys/auth/${AUTH}`, ADMIN, { type: "approle" });
    if (!(enableAuthResponse.status >= 200 && enableAuthResponse.status < 300)) {
      throw new Error(`enable_auth_mount_status_${enableAuthResponse.status}`);
    }
    createdAuthMount = true;

    // Auth-mount preflight — verify the mount is present and of type "approle",
    // reading ONLY the JSON payload vault() returns (its response contract is
    // { status, json }); the mount map is at json.data. No fallback to the
    // wrapper, and no mount metadata is printed — only a fixed diagnostic code.
    const authListResponse = await vault("GET", "sys/auth", ADMIN);
    if (authListResponse.status !== 200) throw new Error(`auth_mount_preflight_status_${authListResponse.status}`);
    const authJson = authListResponse.json;
    if (authJson === null || typeof authJson !== "object") throw new Error("auth_mount_preflight_invalid_response");
    const authData = authJson.data;
    if (authData === null || typeof authData !== "object") throw new Error("auth_mount_preflight_invalid_response");
    const authEntry = (authData as Record<string, unknown>)[`${AUTH}/`];
    if (authEntry === undefined) throw new Error("auth_mount_preflight_missing");
    if (authEntry === null || typeof authEntry !== "object") throw new Error("auth_mount_preflight_invalid_response");
    const authType = (authEntry as Record<string, unknown>).type;
    if (typeof authType !== "string") throw new Error("auth_mount_preflight_invalid_response");
    if (authType !== "approle") throw new Error("auth_mount_preflight_wrong_type");

    // Non-secret guard: the generated policy must carry the two concrete paths
    // and no unresolved template placeholder, asserted BEFORE the request.
    const hcl = policyHcl(MOUNT, PREFIX);
    expect(hcl).toContain(`path "${MOUNT}/data/${PREFIX}/*"`);
    expect(hcl).toContain(`path "${MOUNT}/metadata/${PREFIX}/*"`);
    expect(hcl).not.toMatch(/\{\{MOUNT\}\}|\{\{PREFIX\}\}|\{mount\}|\{prefix\}/);

    // OpenBao's documented ACL-policy write contract is POST (not PUT). The
    // response is stored once, and only its HTTP status is surfaced on failure —
    // never a body, header, token, id or accessor.
    const policyResponse = await vault("POST", `sys/policies/acl/${POLICY}`, ADMIN, { policy: hcl });
    if (policyResponse.status >= 400) {
      throw new Error(`provision_policy_status_${policyResponse.status}`);
    }
    // Canonical role body + local assertions BEFORE the request.
    const roleRequestBody = roleBody(POLICY);
    expect(Object.keys(roleRequestBody).sort()).toEqual(
      [
        "bind_secret_id",
        "secret_id_num_uses",
        "secret_id_ttl",
        "token_max_ttl",
        "token_no_default_policy",
        "token_num_uses",
        "token_policies",
        "token_ttl",
        "token_type",
      ].sort(),
    );
    expect(roleRequestBody.bind_secret_id).toBe(true);
    expect(typeof roleRequestBody.secret_id_num_uses).toBe("number");
    expect(typeof roleRequestBody.token_num_uses).toBe("number");
    for (const ttl of ["secret_id_ttl", "token_ttl", "token_max_ttl"]) {
      expect(typeof roleRequestBody[ttl]).toBe("string");
      expect((roleRequestBody[ttl] as string).length).toBeGreaterThan(0);
    }
    expect(roleRequestBody.token_policies).toEqual([POLICY]);
    expect(roleRequestBody.token_type).toBe("service");
    expect(roleRequestBody.token_no_default_policy).toBe(true);

    // Store the role response exactly once; surface only its HTTP status.
    const roleResponse = await vault("POST", `auth/${AUTH}/role/${ROLE}`, ADMIN, roleRequestBody);
    if (roleResponse.status >= 400) throw new Error(`provision_role_status_${roleResponse.status}`);

    // Post-create verification — read the role back and check the effective
    // config (OpenBao normalises TTLs to seconds). Only booleans, numbers and the
    // policy name are compared; nothing is printed.
    const roleRead = await vault("GET", `auth/${AUTH}/role/${ROLE}`, ADMIN);
    if (roleRead.status !== 200) throw new Error(`role_verify_status_${roleRead.status}`);
    const rd = roleRead.json && typeof roleRead.json === "object" ? (roleRead.json as Record<string, unknown>).data : undefined;
    if (!rd || typeof rd !== "object") throw new Error("role_verify_invalid_response");
    const cfg = rd as Record<string, unknown>;
    if (cfg.bind_secret_id !== true) throw new Error("role_verify_bind_secret_id");
    if (cfg.secret_id_num_uses !== 5) throw new Error("role_verify_secret_id_num_uses");
    if (cfg.secret_id_ttl !== 3600) throw new Error("role_verify_secret_id_ttl");
    if (cfg.token_ttl !== 1200) throw new Error("role_verify_token_ttl");
    if (cfg.token_max_ttl !== 3600) throw new Error("role_verify_token_max_ttl");
    const rp = cfg.token_policies;
    if (!Array.isArray(rp) || rp.length !== 1 || rp[0] !== POLICY) throw new Error("role_verify_token_policies");
    if (cfg.token_no_default_policy !== undefined && cfg.token_no_default_policy !== true) {
      throw new Error("role_verify_token_no_default_policy");
    }
    if (cfg.token_num_uses !== undefined && cfg.token_num_uses !== 0) throw new Error("role_verify_token_num_uses");
    const tt = cfg.token_type;
    if (tt !== undefined && tt !== "service" && tt !== "default-service") throw new Error("role_verify_token_type");
    roleId = field(await vault("GET", `auth/${AUTH}/role/${ROLE}/role-id`, ADMIN), "data", "role_id");
    const mainSecretId = field(await vault("POST", `auth/${AUTH}/role/${ROLE}/secret-id`, ADMIN, {}), "data", "secret_id");

    mainProvider = providerWith(mainSecretId);
    manager = createOpenBaoSecretManager({
      endpoint: ADDR,
      mountPath: MOUNT,
      pathPrefix: PREFIX,
      tokenProvider: mainProvider.getToken,
      fetchImpl: fetch,
      randomBytes: (n: number) => new Uint8Array(randomBytes(n)),
      allowInsecureLoopback,
    });
  });

  afterAll(async () => {
    // Guaranteed cleanup of ONLY this run's ephemeral resources, using the admin
    // token. The role delete removes its Secret IDs; the KV-mount delete removes
    // this run's secrets and metadata. Mounts are deleted ONLY if THIS run created
    // them — never the default secret/ or any unrelated mount. No response body is
    // printed. A residual check never hides a primary test failure (Vitest reports
    // hook errors separately).
    await vault("DELETE", `auth/${AUTH}/role/${ROLE}`, ADMIN).catch(() => undefined);
    await vault("DELETE", `sys/policies/acl/${POLICY}`, ADMIN).catch(() => undefined);
    if (createdAuthMount) await vault("DELETE", `sys/auth/${AUTH}`, ADMIN).catch(() => undefined);
    if (createdKvMount) {
      await vault("DELETE", `sys/mounts/${MOUNT}`, ADMIN).catch(() => undefined);
      // Best-effort residual check for the exact unique mount (prints no body).
      const after = await vault("GET", "sys/mounts", ADMIN).catch(() => ({ status: 0, json: null }) as VaultResult);
      const afterData =
        after.json && typeof after.json === "object" ? (after.json as Record<string, unknown>).data : undefined;
      const residual =
        !!afterData && typeof afterData === "object" && (afterData as Record<string, unknown>)[`${MOUNT}/`] !== undefined;
      if (residual) throw new Error("kv_mount_residual");
    }
  });

  it("(1,2) authorised data + metadata operations all succeed", async () => {
    const secret = new Uint8Array(randomBytes(32));
    const rotated = new Uint8Array(randomBytes(32));

    const created = await manager.create(secret); // create
    expect(created.version).toBe(1);
    expect(Buffer.from(await manager.resolve(created.reference)).equals(Buffer.from(secret))).toBe(true); // read

    const rot = await manager.rotate(created.reference, created.version, rotated); // patch
    expect(rot.version).toBe(2);
    expect(Buffer.from(await manager.resolve(created.reference)).equals(Buffer.from(rotated))).toBe(true);

    await manager.revoke(created.reference); // delete (soft) on data + metadata read
    await expect(manager.resolve(created.reference)).rejects.toMatchObject({ code: "SECRET_REVOKED" });

    await manager.delete(created.reference); // delete on metadata (permanent)
    await expect(manager.resolve(created.reference)).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
  });

  it("(3) denies an unrelated KV data path", async () => {
    const token = await mainProvider.getToken();
    expect((await vault("GET", `${MOUNT}/data/${OTHER_PREFIX}/probe`, token)).status).toBe(403);
  });

  it("(4) denies sys/mounts", async () => {
    const token = await mainProvider.getToken();
    expect((await vault("GET", "sys/mounts", token)).status).toBe(403);
  });

  it("(5) denies auth/token/lookup-self, proving no default policy", async () => {
    const token = await mainProvider.getToken();
    expect((await vault("GET", "auth/token/lookup-self", token)).status).toBe(403);
  });

  it("(6) a SecretID destroyed by accessor cannot log in", async () => {
    const gen = await vault("POST", `auth/${AUTH}/role/${ROLE}/secret-id`, ADMIN, {});
    const secretId = field(gen, "data", "secret_id");
    const accessor = field(gen, "data", "secret_id_accessor");
    expect(
      (await vault("POST", `auth/${AUTH}/role/${ROLE}/secret-id-accessor/destroy`, ADMIN, { secret_id_accessor: accessor })).status,
    ).toBeLessThan(300);
    await expect(providerWith(secretId).getToken()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("(7) a num_uses=1 SecretID logs in once then fails", async () => {
    const gen = await vault("POST", `auth/${AUTH}/role/${ROLE}/secret-id`, ADMIN, { num_uses: 1 });
    const secretId = field(gen, "data", "secret_id");
    expect((await providerWith(secretId).getToken()).length).toBeGreaterThan(0);
    await expect(providerWith(secretId).getToken()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("(8) deleting the AppRole prevents any further login", async () => {
    const secretId = field(await vault("POST", `auth/${AUTH}/role/${ROLE}/secret-id`, ADMIN, {}), "data", "secret_id");
    expect((await vault("DELETE", `auth/${AUTH}/role/${ROLE}`, ADMIN)).status).toBeLessThan(300);
    await expect(providerWith(secretId).getToken()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});
