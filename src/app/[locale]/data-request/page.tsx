import { setRequestLocale }  from "next-intl/server";
import { DataRequestClient } from "@/components/compliance/DataRequestClient";
import { PublicPageShell } from "@/components/public-site";

export const metadata = { title: "Data Request · Hermes OS", robots: { index: false, follow: false } };

export default async function DataRequestPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PublicPageShell ambient={1}>
      <DataRequestClient />
    </PublicPageShell>
  );
}
