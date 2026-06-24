import { NextResponse }  from "next/server";
import { SUCCESS_PLANS } from "@/lib/customers/mock-data";
import type { PlanStatus } from "@/lib/customers/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as PlanStatus | null;
  const owner  = searchParams.get("owner");

  let plans = [...SUCCESS_PLANS];
  if (status) plans = plans.filter(p => p.status === status);
  if (owner)  plans = plans.filter(p => p.owner === owner);

  const statusCount: Record<PlanStatus, number> = {
    "on-track": 0, "at-risk": 0, delayed: 0, completed: 0,
  };
  SUCCESS_PLANS.forEach(p => { statusCount[p.status]++; });

  const completedMilestones  = SUCCESS_PLANS.flatMap(p => p.milestones).filter(m => m.completed).length;
  const totalMilestones      = SUCCESS_PLANS.flatMap(p => p.milestones).length;

  return NextResponse.json({
    plans,
    total: plans.length,
    statusCount,
    completedMilestones,
    totalMilestones,
  });
}
