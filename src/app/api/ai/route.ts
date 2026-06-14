import { NextResponse } from "next/server";
import { completeChat } from "@/lib/llm/gateway";

export const dynamic = "force-dynamic";

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
