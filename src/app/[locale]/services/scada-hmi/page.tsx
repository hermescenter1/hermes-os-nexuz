import { getTranslations } from "next-intl/server";
import { ServiceDetail }   from "@/components/ServiceDetail";
import { buildMetadata }   from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/services/scada-hmi", title: p.serviceScadaHmi.title, description: p.serviceScadaHmi.description, keywords: p.serviceScadaHmi.keywords });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <ServiceDetail locale={locale} serviceKey="scadaHmi" />;
}
