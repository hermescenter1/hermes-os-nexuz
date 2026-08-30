import { setRequestLocale, getTranslations } from "next-intl/server";
import type { ReactNode }   from "react";
import { AppShell }         from "@/components/app-shell";
import { CustomerSubNav }   from "@/components/customers/CustomerSubNav";

/*
 * GATE B.1 F03 (R3) — this layout renders the header on the authorized
 * /dashboard/customers/success-plans route, so its eyebrow, title and subtitle
 * are UI copy and must be localized.
 *
 * It is shared with five other customer routes that B.1 does NOT own. Wiring it
 * necessarily improves them; this change does not claim those routes as fixed,
 * because their page bodies are still untranslated.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "customerSuccess" });
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function CustomersLayout({
  children,
  params,
}: {
  children: ReactNode;
  params:   Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("customerSuccess");

  return (
    <AppShell>
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 pb-20">
        <div className="page-header-premium">
          <p className="eyebrow-label mb-2">{t("pageEyebrow")}</p>
          <h1 className="type-page-title">{t("pageTitle")}</h1>
          <p className="mt-2 type-secondary max-w-3xl">{t("pageSubtitle")}</p>
        </div>
        <CustomerSubNav />
        {children}
      </div>
    </AppShell>
  );
}
