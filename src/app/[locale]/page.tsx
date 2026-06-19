import { setRequestLocale } from "next-intl/server";
import { SiteHeader }       from "@/components/SiteHeader";
import { SiteFooter }       from "@/components/SiteFooter";
import { LandingPage }      from "@/components/landing/LandingPage";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: "#050816" }}
    >
      <SiteHeader />
      <main className="flex-1">
        <LandingPage />
      </main>
      <SiteFooter />
    </div>
  );
}
