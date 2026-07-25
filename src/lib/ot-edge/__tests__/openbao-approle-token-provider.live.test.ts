import { describe, it, expect } from "vitest";
import { createOpenBaoAppRoleTokenProvider } from "../openbao-approle-token-provider";

/**
 * PHASE 94D0D — LIVE OpenBao AppRole login, opt-in.
 *
 * Skipped unless `OPENBAO_APPROLE_LIVE=1` and `BAO_ADDR` + `BAO_ROLE_ID` +
 * `BAO_SECRET_ID` are present, so an ordinary `npm test` never touches a
 * network. When enabled it drives a real AppRole login through the ACTUAL
 * provider and asserts the caching contract by counting login round-trips.
 *
 * It prints nothing sensitive: assertions never interpolate the token, role id
 * or secret id — only a boolean/length and the login count.
 */

const LIVE =
  process.env.OPENBAO_APPROLE_LIVE === "1" &&
  !!process.env.BAO_ADDR &&
  !!process.env.BAO_ROLE_ID &&
  !!process.env.BAO_SECRET_ID;

const AUTH_MOUNT = process.env.BAO_AUTH_MOUNT ?? "approle";

/** True only for https, or http on an explicit loopback host. */
function endpointIsSafe(addr: string): { safe: boolean; loopback: boolean } {
  try {
    const url = new URL(addr);
    const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
    if (url.protocol === "https:") return { safe: true, loopback: false };
    if (url.protocol === "http:" && loopback) return { safe: true, loopback: true };
    return { safe: false, loopback };
  } catch {
    return { safe: false, loopback: false };
  }
}

describe.skipIf(!LIVE)("94D0D — live OpenBao AppRole login", () => {
  it("logs in once, serves from cache, and re-authenticates after clear()", async () => {
    const { safe, loopback } = endpointIsSafe(process.env.BAO_ADDR as string);
    // Refuse non-loopback HTTP — never send a secret id in the clear off-box.
    if (!safe) throw new Error("unsafe endpoint");

    let logins = 0;
    const countingFetch: typeof fetch = async (input, init) => {
      logins += 1;
      return fetch(input, init);
    };

    const provider = createOpenBaoAppRoleTokenProvider({
      endpoint: process.env.BAO_ADDR as string,
      authMount: AUTH_MOUNT,
      roleIdProvider: async () => process.env.BAO_ROLE_ID as string,
      secretIdProvider: async () => process.env.BAO_SECRET_ID as string,
      fetchImpl: countingFetch,
      clock: () => Date.now(),
      expirySkewSeconds: 10,
      allowInsecureLoopback: loopback,
    });

    const first = await provider.getToken();
    expect(typeof first).toBe("string");
    expect(first.length).toBeGreaterThan(0);

    // A second call within the lease must be served from cache — no new login.
    const second = await provider.getToken();
    expect(second).toBe(first);
    expect(logins).toBe(1);

    // After clear(), the next call re-authenticates.
    provider.clear();
    const third = await provider.getToken();
    expect(third.length).toBeGreaterThan(0);
    expect(logins).toBe(2);
  });
});
