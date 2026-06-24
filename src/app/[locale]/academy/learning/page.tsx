import { setRequestLocale } from "next-intl/server";
import { MyLearningClient } from "@/components/academy/MyLearningClient";

export const metadata = { title: "My Learning · Hermes Academy" };

export default async function LearningPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MyLearningClient />;
}
