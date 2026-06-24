import { setRequestLocale }      from "next-intl/server";
import { CandidateRegisterClient } from "@/components/candidate/CandidateRegisterClient";

export const metadata = { title: "Candidate Registration · Hermes OS" };

export default async function CandidateRegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CandidateRegisterClient />;
}
