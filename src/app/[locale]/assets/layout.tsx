// PHASE 87I — Asset Registry on the canonical authenticated AppShell.
//
// Replaces the legacy 56px boxed sidebar with the shared shell + a localized
// section tab row. The existing RequireCapability("admin") gate is preserved
// EXACTLY — this layout grants nothing; middleware + the per-page checks stay
// the boundary. Each page owns its single H1. Asset Registry remains a
// SEPARATE canonical product from CMMS; they cross-link, never merge.

import type { ReactNode }    from "react";
import { getTranslations }   from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { AppShell }          from "@/components/app-shell";
import { AssetsSubNav }      from "@/components/asset-maintenance";
import { noIndexMetadata }   from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Asset Registry");

export default async function AssetsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("assetMaintenance");
  return (
    <RequireCapability capability="admin">
      <AppShell>
        <AssetsSubNav ariaLabel={t("assets.eyebrow")} />
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </AppShell>
    </RequireCapability>
  );
}
