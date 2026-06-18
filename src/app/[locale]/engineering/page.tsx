import { redirect } from "next/navigation";

export default async function EngineeringRoot({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/engineering/intelligence`);
}
