// PHASE 87I — CMMS on the canonical authenticated AppShell.
//
// Replaces the legacy 56px boxed sidebar with the shared shell + a localized
// section tab row. The existing RequireCapability("admin") gate is preserved
// EXACTLY — this layout grants nothing; middleware + the APIs stay the
// boundary. Each page owns its single H1. CMMS remains a SEPARATE canonical
// product from Asset Registry, and its MaintenanceTask records stay distinct
// from ERP work orders (linked only through the existing erpWorkOrderId).

import type { ReactNode }       from "react";
import { getTranslations }      from "next-intl/server";
import { RequireCapability }    from "@/components/auth/RequireCapability";
import { AppShell }             from "@/components/app-shell";
import { CmmsSubNav }           from "@/components/asset-maintenance";
import { noIndexMetadata }      from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("CMMS");

export default async function CmmsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("assetMaintenance");
  return (
    <RequireCapability capability="authoring">
      <AppShell>
        <CmmsSubNav ariaLabel={t("cmms.eyebrow")} />
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </AppShell>
    </RequireCapability>
  );
}
