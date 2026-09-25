import { PositionEditorClient } from "@/components/ats/management/PositionEditorClient";

/* ATS-M1 — edit a position. The lifecycle state is unchanged by an edit. */
export default async function AtsEditPositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PositionEditorClient mode="edit" positionId={id} />;
}
