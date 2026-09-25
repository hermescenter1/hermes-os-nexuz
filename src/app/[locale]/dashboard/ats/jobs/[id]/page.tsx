import { PositionDetailClient } from "@/components/ats/management/PositionDetailClient";

/* ATS-M1 — one position: fields, publish readiness, linked records, actions, audit history. */
export default async function AtsPositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PositionDetailClient positionId={id} />;
}
