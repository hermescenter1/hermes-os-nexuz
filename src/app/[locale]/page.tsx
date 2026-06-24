import { setRequestLocale, getTranslations } from "next-intl/server";
import { SiteHeader }       from "@/components/SiteHeader";
import { SiteFooter }       from "@/components/SiteFooter";
import { LandingPage }      from "@/components/landing/LandingPage";
import { JsonLd }           from "@/components/seo/JsonLd";
import { softwareApplicationSchema, organizationSchema } from "@/lib/seo/schemas";
import { buildMetadata }    from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return buildMetadata({
    locale,
    path:        "",
    title:       t("title"),
    description: t("description"),
    keywords:    t.raw("keywords") as string | undefined,
  });
}

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
      <JsonLd data={[softwareApplicationSchema(), organizationSchema()]} />
      <SiteHeader />
      <main className="flex-1">
        <LandingPage />
      </main>
      <SiteFooter />
    </div>
  );
}
