// PHASE 87H — ERP module on the canonical authenticated AppShell.
//
// Replaces the legacy standalone boxed layout (dead shadcn `bg-card`/
// `text-muted-foreground` tokens + own eyebrow) with the shared shell + a
// localized section tab row. The existing RequireCapability("admin") gate is
// preserved EXACTLY — this layout grants nothing; middleware + the /api/erp
// authorization stay the boundary. Each page owns its single H1.

import type { ReactNode }    from "react";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { AppShell }          from "@/components/app-shell";
import { ErpSubNav }         from "@/components/business-operations";
import { noIndexMetadata }   from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("ERP");

export default function ErpLayout({ children }: { children: ReactNode }) {
  return (
    <RequireCapability capability="admin">
      <AppShell>
        <ErpSubNav />
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </AppShell>
    </RequireCapability>
  );
}
