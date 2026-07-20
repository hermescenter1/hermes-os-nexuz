import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }        from "@/components/PageShell";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { ApiKeysDashboard } from "@/components/api/ApiKeysDashboard";
import { PageHeader }       from "@/components/ui/PageHeader";

/**
 * PHASE 87L.6G — explicit noindex. The route is already unreachable to
 * anonymous crawlers (middleware redirects to login) and robots disallows
 * /{locale}/dashboard/, but the page-level directive is a third,
 * transport-independent declaration so a future routing change cannot make
 * an administration surface indexable by accident.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function ApiPlatformPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("apiPlatform");

  // PHASE 87L.6G — defence in depth alongside the "api_admin" middleware gate.
  // API keys are credentials: never rely on navigation hiding alone.
  return (
    <RequireCapability capability="api_admin">
      <PageShell>
        <div className="mx-auto max-w-7xl px-6 sm:px-8">
          <PageHeader
            eyebrow={t("eyebrow")}
            title={t("title")}
            subtitle={t("subtitle")}
            level="page"
          />
          <ApiKeysDashboard />
        </div>
      </PageShell>
    </RequireCapability>
  );
}
