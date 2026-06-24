import { setRequestLocale, getTranslations } from "next-intl/server";
import type { ReactNode }   from "react";
import { PageShell }        from "@/components/PageShell";
import { buildMetadata }    from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({
    locale,
    path: "/careers",
    title:       p.careers.title,
    description: p.careers.description,
    keywords:    p.careers.keywords,
  });
}

export default async function CareersLayout({
  children,
  params,
}: {
  children: ReactNode;
  params:   Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PageShell ambient={1}>
      <div className="mx-auto max-w-screen-xl px-6 sm:px-8 pb-20">
        {children}
      </div>
    </PageShell>
  );
}
