import { setRequestLocale }       from "next-intl/server";
import { RequireCapability }      from "@/components/auth/RequireCapability";
import { ArticleWriterClient }    from "@/components/articles/ArticleWriterClient";
import { noIndexMetadata }        from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Write Article — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

export default async function WritePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <RequireCapability capability="dashboard">
      <ArticleWriterClient />
    </RequireCapability>
  );
}
