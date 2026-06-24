import { setRequestLocale }    from "next-intl/server";
import { MyCertificatesClient } from "@/components/academy/MyCertificatesClient";

export const metadata = { title: "My Certificates · Hermes Academy" };

export default async function CertsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MyCertificatesClient />;
}
