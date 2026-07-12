import Link                 from "next/link";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata }  from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("New Project");

export default async function NewProjectPage() {
  const t = await getTranslations("enterpriseOperations");
  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">{t("projects.newPageTitle")}</h1>
      <p className="text-muted-foreground text-sm">
        {t("projects.newDescIntro")}{" "}
        {t("projects.newDescApi")} <code className="font-mono text-xs bg-muted px-1 rounded">POST /api/erp/projects</code>.
      </p>
      <Link href="../projects" className="text-sm px-3 py-1.5 border rounded-md hover:bg-accent inline-block">
        {t("projects.backToProjects")}
      </Link>
    </div>
  );
}
