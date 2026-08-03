import { describe, it, expect, afterEach } from "vitest";
import { POST } from "../route";

/** PHASE 95 — /api/ai is disabled by default (fail-closed public provider path). */

const saved = process.env.HERMES_PUBLIC_AI_ENABLED;
afterEach(() => {
  if (saved === undefined) delete process.env.HERMES_PUBLIC_AI_ENABLED;
  else process.env.HERMES_PUBLIC_AI_ENABLED = saved;
});

describe("95 — /api/ai default-off", () => {
  it("returns 503 (disabled) when the public-AI flag is unset, before any auth/model work", async () => {
    delete process.env.HERMES_PUBLIC_AI_ENABLED;
    const res = await POST(new Request("http://localhost/api/ai", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("disabled");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
