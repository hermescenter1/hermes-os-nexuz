import { CandidateDetailClient } from "@/components/ats/CandidateDetailClient";

/* ATS go-live — one candidate: profile, linked activity, audit trail, and the
   ATS_ADMIN erase & anonymise action. */
export default async function AtsCandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CandidateDetailClient candidateId={id} />;
}
