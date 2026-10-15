import Link                 from "next/link";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata }  from "@/lib/seo/metadata";
import { resolveErpPageScope } from "@/lib/erp/page-scope";
import { ErpScopeNotice }   from "@/components/erp/ErpScopeNotice";

export const metadata = noIndexMetadata("New Project");
export const dynamic  = "force-dynamic";

// The create form is not part of HRIS-0.5B. The create action is shown only to
// callers holding manage_erp, and it is disabled until the form ships. No raw
// API route is shown to the user.
export default async function NewProjectPage() {
  const t      = await getTranslations("enterpriseOperations");
  const access = await resolveErpPageScope("view_erp");
  const canManage = access.ok ? (await resolveErpPageScope("manage_erp")).ok : false;
  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">{t("projects.newPageTitle")}</h1>
      {!access.ok && <ErpScopeNotice code={access.code} memberships={access.memberships} />}
      {access.ok && canManage && (
        <button type="button" disabled aria-disabled="true" className="text-sm px-3 py-1.5 border rounded-md opacity-60 cursor-not-allowed">
          {t("projects.newProject")}
        </button>
      )}
      <Link href="../projects" className="text-sm px-3 py-1.5 border rounded-md hover:bg-accent inline-block">
        {t("projects.backToProjects")}
      </Link>
    </div>
  );
}
