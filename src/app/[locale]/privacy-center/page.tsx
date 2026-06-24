import { setRequestLocale }    from "next-intl/server";
import { PrivacyCenterClient } from "@/components/compliance/PrivacyCenterClient";
import { PageShell }           from "@/components/PageShell";

export const metadata = { title: "Privacy Center · Hermes OS" };

export default async function PrivacyCenterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PageShell ambient={1}>
      <PrivacyCenterClient />
    </PageShell>
  );
}
