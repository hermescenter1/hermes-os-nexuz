import { notFound }              from "next/navigation";
import { ExecutionDetailClient } from "@/components/automation/ExecutionDetailClient";
import { getExecutionById }      from "@/lib/automation/db";

export const dynamic = "force-dynamic";

export default async function ExecutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id }   = await params;
  const execution = await getExecutionById(id);
  if (!execution) notFound();
  return <ExecutionDetailClient execution={execution} />;
}
