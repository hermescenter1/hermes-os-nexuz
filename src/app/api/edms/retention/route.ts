import { NextResponse }           from "next/server";
import { getCurrentUser }         from "@/lib/auth/session";
import { can }                    from "@/lib/auth/roles";
import { getRetentionPolicies }   from "@/lib/document/service";
import { getDocuments }           from "@/lib/document/service";
import { applyRetentionPolicies } from "@/lib/document/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [policies, documents] = await Promise.all([
    getRetentionPolicies(),
    getDocuments({}),
  ]);

  const checks = applyRetentionPolicies(documents, policies);
  return NextResponse.json({ policies, checks });
}
