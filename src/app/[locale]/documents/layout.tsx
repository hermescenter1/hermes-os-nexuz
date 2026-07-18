// PHASE 87J — EDMS on the canonical authenticated AppShell.
//
// Replaces the legacy 56px boxed sidebar with the shared shell + a localized
// section tab row (the legacy DocumentNav carried hardcoded English labels and
// an `isFa` ternary). The existing RequireCapability("admin") gate is
// preserved EXACTLY — this layout grants nothing; middleware + the /api/edms
// routes stay the boundary. Each page owns its single H1.

import type { ReactNode }    from "react";
import { getTranslations }   from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { AppShell }          from "@/components/app-shell";
import { EdmsSubNav }        from "@/components/engineering-documents";

export default async function DocumentsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("engineeringDocuments");
  return (
    <RequireCapability capability="authoring">
      <AppShell>
        <EdmsSubNav ariaLabel={t("header.eyebrow")} />
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </AppShell>
    </RequireCapability>
  );
}
