import { setRequestLocale, getTranslations } from "next-intl/server";
import type { ReactNode }   from "react";
import { PublicPageShell } from "@/components/public-site";
import { AcademySubNav }    from "@/components/academy/AcademySubNav";
import { getCurrentUser }   from "@/lib/auth/session";
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
    path: "/academy",
    title:       p.academy.title,
    description: p.academy.description,
    keywords:    p.academy.keywords,
  });
}

export default async function AcademyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params:   Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // SPRINT 1C-A - the Academy header block was three hard-coded English
  // literals rendered into every locale. Measured on production 2026-09-28,
  // /fa/academy served `<h1>Hermes Training Academy</h1>` - the only h1 on a
  // Persian public page - above an English lede, under an eyebrow that leaked
  // the internal milestone "PHASE 60" to the public web. The copy now comes
  // from the `academy` catalog namespace, genuinely written in fa/en/de, and
  // the phase number is gone from public output. Direction is unchanged:
  // `<html dir>` is set per locale by the root locale layout, so fa stays RTL
  // and en/de stay LTR without this block asserting anything of its own.
  const t = await getTranslations({ locale, namespace: "academy" });

  const user    = await getCurrentUser();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  return (
    <PublicPageShell ambient={2}>
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 pb-20">
        <div className="page-header-premium">
          <p className="eyebrow-label mb-2">{t("header.eyebrow")}</p>
          <h1 className="type-page-title">{t("header.title")}</h1>
          <p className="mt-2 type-secondary max-w-3xl">{t("header.lede")}</p>
        </div>
        <AcademySubNav isAdmin={isAdmin} />
        {children}
      </div>
    </PublicPageShell>
  );
}
