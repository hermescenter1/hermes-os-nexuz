import { setRequestLocale }     from "next-intl/server";
import { CertificateViewClient } from "@/components/academy/CertificateViewClient";

export const metadata = { title: "Certificate Verification · Hermes Academy" };

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <CertificateViewClient token={id} />;
}
