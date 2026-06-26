import { notFound }    from "next/navigation";
import { getTaskById } from "@/lib/cmms/db";
import { redirect }    from "next/navigation";

export const dynamic = "force-dynamic";

// Work orders and tasks share the same data model; delegate to the task detail page
export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task   = await getTaskById(id);
  if (!task) return notFound();
  redirect(`../../tasks/${id}`);
}
