import { NextResponse } from "next/server";
import { completeChat } from "@/lib/llm/gateway";
import { requireAuthoring } from "@/lib/auth/api-guards";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { resolveClientIp, securityError } from "@/lib/security/request-guards";

export const dynamic = "force-dynamic";

const AI_ACTION = "ai-complete";

const ERROR_STATUS: Record<string, number> = {
  no_provider: 503,
  validation: 400,
  timeout: 504,
  upstream_error: 502,
  bad_response: 502,
};

/** Generic AI Gateway BFF route — thin shell over the hardened gateway.
 *  Normalized errors and usage metadata pass through to the caller. */
export async function POST(req: Request) {
  // Phase 86C4B2B1D-SECURITY-8: this route calls the PAID LLM gateway. It was
  // anonymous, allowing unauthenticated cost/DoS. Require the authoring
  // capability AND an IP-keyed rate limit BEFORE any body parse or model call.
  const gate = await requireAuthoring();
  if (!gate.ok) {
    gate.response.headers.set("Cache-Control", "no-store");
    return gate.response;
  }
  const ip = resolveClientIp(req);
  if (!(await checkRateLimit(AI_ACTION, ip))) {
    return securityError({ error: { code: "rate_limited", message: "rate limited" } }, 429, {
      "Retry-After": String(retryAfter(AI_ACTION, ip)),
    });
  }

  let body: { messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "validation", message: "invalid JSON" } },
      { status: 400 }
    );
  }
  const result = await completeChat(body.messages ?? []);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: ERROR_STATUS[result.error.code] ?? 500 }
    );
  }
  return NextResponse.json({ text: result.text, usage: result.usage });
}
