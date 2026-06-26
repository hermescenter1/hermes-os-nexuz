import { redirect } from "next/navigation";

export default async function AssetsRoot({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/assets/dashboard`);
}
