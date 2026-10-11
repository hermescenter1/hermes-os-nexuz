/**
 * Server-rendered refusal for the Executive Management Center.
 *
 * Every refusal states WHICH boundary refused, in the reader's language, and
 * nothing else: no organization name the reader may not see, no hint about
 * whether an organization exists, no internal code beyond the stable one.
 *
 * When several organizations are available the reader chooses one, and the
 * choice is stored on the server against the session — never in the URL, which
 * is the property that keeps an organization id from becoming a selector.
 */

import { getTranslations } from "next-intl/server";
import { ErpOrganizationChooser } from "@/components/erp/ErpOrganizationChooser";
import type { ExecutiveFailureCode } from "@/lib/executive/scope";

export interface ExecutiveScopeNoticeProps {
  code: ExecutiveFailureCode;
  /**
   * READONLY, matching what the scope resolver returns. The chooser below takes
   * a mutable array, so a copy is handed to it rather than widening the resolver
   * result — a scope result nobody can mutate is worth keeping that way.
   */
  memberships?: ReadonlyArray<{ organizationId: string; name: string }>;
}

/**
 * Only codes with their own sentence are mapped. Anything else falls back to
 * SERVICE_UNAVAILABLE, which says "this could not be assembled and nothing is
 * inferred from that" — never "there is no data".
 */
const MESSAGE_KEY: Partial<Record<ExecutiveFailureCode, string>> = {
  AUTHENTICATION_REQUIRED: "errors.AUTHENTICATION_REQUIRED",
  SESSION_REQUIRED: "errors.AUTHENTICATION_REQUIRED",
  FORBIDDEN: "errors.FORBIDDEN",
  NO_ACCESSIBLE_AXIS: "errors.NO_ACCESSIBLE_AXIS",
  NOT_FOUND: "errors.NOT_FOUND",
  ACTIVE_ORGANIZATION_REQUIRED: "errors.ACTIVE_ORGANIZATION_REQUIRED",
  INVALID_REQUEST: "errors.INVALID_REQUEST",
  SERVICE_UNAVAILABLE: "errors.SERVICE_UNAVAILABLE",
};

export async function ExecutiveScopeNotice({ code, memberships = [] }: ExecutiveScopeNoticeProps) {
  const t = await getTranslations("executive");
  const key = MESSAGE_KEY[code] ?? "errors.SERVICE_UNAVAILABLE";

  return (
    <div
      className="max-w-xl space-y-4 rounded-xl border border-line bg-surface p-6 shadow-e2"
      role="alert"
    >
      <p className="text-sm text-fg">{t(key as never)}</p>
      {code === "ACTIVE_ORGANIZATION_REQUIRED" && memberships.length > 0 && (
        <ErpOrganizationChooser memberships={[...memberships]} />
      )}
    </div>
  );
}
