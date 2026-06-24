import { NextResponse }  from "next/server";
import { CUSTOMERS }    from "@/lib/customers/mock-data";
import type { CustomerStatus, CustomerPlan } from "@/lib/customers/types";
import { PLAN_SORT }    from "@/lib/customers/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as CustomerStatus | null;
  const plan   = searchParams.get("plan")   as CustomerPlan   | null;
  const csm    = searchParams.get("csm");
  const sort   = searchParams.get("sort") ?? "health";

  let accounts = [...CUSTOMERS];
  if (status) accounts = accounts.filter(c => c.status === status);
  if (plan)   accounts = accounts.filter(c => c.plan   === plan);
  if (csm)    accounts = accounts.filter(c => c.csm    === csm);

  switch (sort) {
    case "health":  accounts.sort((a, b) => b.healthScore.total - a.healthScore.total); break;
    case "arr":     accounts.sort((a, b) => b.arr - a.arr);           break;
    case "plan":    accounts.sort((a, b) => PLAN_SORT[a.plan] - PLAN_SORT[b.plan]); break;
    case "name":    accounts.sort((a, b) => a.companyName.localeCompare(b.companyName)); break;
    case "active":  accounts.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt)); break;
    default: break;
  }

  return NextResponse.json({ accounts, total: accounts.length });
}
