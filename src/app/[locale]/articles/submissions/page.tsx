import { setRequestLocale }    from "next-intl/server";
import { RequireCapability }   from "@/components/auth/RequireCapability";
import { getSubmissionQueue }  from "@/lib/articles/db";
import { ModerationDashboardClient } from "@/components/articles/ModerationDashboardClient";
import { noIndexMetadata }     from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Submissions — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

export default async function SubmissionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const articles = await getSubmissionQueue();

  return (
    <RequireCapability capability="admin">
      <div className="p-6 max-w-7xl mx-auto">
        <ModerationDashboardClient articles={articles} mode="submissions" />
      </div>
    </RequireCapability>
  );
}
