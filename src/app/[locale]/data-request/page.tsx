import { setRequestLocale }  from "next-intl/server";
import { DataRequestClient } from "@/components/compliance/DataRequestClient";
import { PageShell }         from "@/components/PageShell";

export const metadata = { title: "Data Request · Hermes OS", robots: { index: false, follow: false } };

export default async function DataRequestPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PageShell ambient={1}>
      <DataRequestClient />
    </PageShell>
  );
}
