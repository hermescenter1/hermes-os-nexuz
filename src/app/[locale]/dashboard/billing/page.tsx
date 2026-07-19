import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }        from "@/components/PageShell";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { BillingDashboard } from "@/components/billing/BillingDashboard";
import { PageHeader }       from "@/components/ui/PageHeader";

/**
 * PHASE 87L.6G — explicit noindex. The route is already unreachable to
 * anonymous crawlers (middleware redirects to login) and robots disallows
 * /{locale}/dashboard/, but the page-level directive is a third,
 * transport-independent declaration so a future routing change cannot make
 * an administration surface indexable by accident.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("billing");

  // PHASE 87L.6G — defence in depth. Middleware already denies this route to
  // engineers via the "billing_admin" capability; this page guard keeps the
  // denial in place if the route ever moves out of the matched prefix.
  return (
    <RequireCapability capability="billing_admin">
      <PageShell>
        <div className="mx-auto max-w-7xl px-6 sm:px-8">
          <PageHeader
            eyebrow={t("eyebrow")}
            title={t("title")}
            level="page"
          />
          <BillingDashboard />
        </div>
      </PageShell>
    </RequireCapability>
  );
}
