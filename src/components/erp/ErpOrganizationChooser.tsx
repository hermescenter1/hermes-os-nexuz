"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Chooses the active organization by POSTing to the server activation route.
 * The browser sends no organization in the page URL; the server stores the
 * choice for this session and the page is refreshed under that context.
 */
export function ErpOrganizationChooser({ memberships }: { memberships: Array<{ organizationId: string; name: string }> }) {
  const t = useTranslations("enterpriseOperations");
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function choose(organizationId: string) {
    setPending(organizationId);
    setFailed(false);
    try {
      const res = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/activate`, { method: "POST" });
      if (!res.ok) throw new Error("activation refused");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-2">
      <h2 className="font-semibold text-sm">{t("tenantScope.chooseOrganization")}</h2>
      <ul className="space-y-1">
        {memberships.map(m => (
          <li key={m.organizationId}>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => choose(m.organizationId)}
              className="text-sm underline underline-offset-4 disabled:opacity-50"
            >
              {m.name || t("tenantScope.chooseOrganization")}
            </button>
          </li>
        ))}
      </ul>
      {failed && <p className="text-sm text-red-400">{t("tenantScope.unavailable")}</p>}
    </div>
  );
}
