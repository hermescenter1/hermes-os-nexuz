import { ServiceDetail } from "@/components/ServiceDetail";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <ServiceDetail locale={locale} serviceKey="knowledgeCloud" />;
}
