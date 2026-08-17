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
    // returnTo keeps the author's intent across the sign-in hop: a visitor who
    // clicked "Write article" lands back on the writer, not on the dashboard.
    <RequireCapability capability="dashboard" returnTo={`/${locale}/articles/write`}>
      <ArticleWriterClient />
    </RequireCapability>
  );
}
