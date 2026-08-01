import { describe, it, expect } from "vitest";
import { signAccessToken, verifyAccessToken } from "@/lib/auth/jwt";

/**
 * PHASE 91 — the access token carries an optional opaque session id (`sid`).
 * Round-trip it through the real signer/verifier (no mocks) and prove a token
 * signed without a sid verifies with sid === undefined (legacy compatibility).
 */
describe("Phase 91 — access token sid claim", () => {
  it("signs and verifies a sid round-trip", async () => {
    const token = await signAccessToken({ sub: "u1", email: "u1@x", role: "customer", name: "U1", sid: "sess-123" });
    const payload = await verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("u1");
    expect(payload!.sid).toBe("sess-123");
  });

  it("a token signed without a sid verifies with sid undefined (legacy)", async () => {
    const token = await signAccessToken({ sub: "u1", email: "u1@x", role: "customer", name: "U1" });
    const payload = await verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sid).toBeUndefined();
  });
});
