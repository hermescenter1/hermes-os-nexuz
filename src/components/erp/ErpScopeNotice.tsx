import { getTranslations } from "next-intl/server";
import type { ErpFailureCode } from "@/lib/erp/tenant";
import { ErpOrganizationChooser } from "./ErpOrganizationChooser";

export interface ErpScopeNoticeProps {
  code: ErpFailureCode;
  memberships?: Array<{ organizationId: string; name: string }>;
}

const MESSAGE_KEY: Partial<Record<ErpFailureCode, string>> = {
  AUTHENTICATION_REQUIRED: "tenantScope.signIn",
  ACTIVE_ORGANIZATION_REQUIRED: "tenantScope.organizationRequired",
  FORBIDDEN: "tenantScope.forbidden",
  NOT_FOUND: "tenantScope.notFound",
  SERVICE_UNAVAILABLE: "tenantScope.unavailable",
};

/**
 * Server-rendered refusal for a tenant-scoped ERP page. When several
 * organizations are available the caller chooses one; the choice is stored on
 * the server, never in the URL.
 */
export async function ErpScopeNotice({ code, memberships = [] }: ErpScopeNoticeProps) {
  const t = await getTranslations("enterpriseOperations");
  const key = MESSAGE_KEY[code] ?? "tenantScope.unavailable";
  return (
    <div className="rounded-xl border bg-card p-6 space-y-4 max-w-xl">
      <p className="text-sm">{t(key)}</p>
      {code === "ACTIVE_ORGANIZATION_REQUIRED" && memberships.length > 0 && (
        <ErpOrganizationChooser memberships={memberships} />
      )}
    </div>
  );
}
