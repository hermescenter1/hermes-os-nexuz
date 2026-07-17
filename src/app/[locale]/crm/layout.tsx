// PHASE 87G — CRM module on the canonical authenticated AppShell.
//
// Replaces the legacy standalone boxed layout (own h1 + hardcoded-English
// CrmNav sidebar) with the shared shell + a localized section tab row. The
// existing RequireCapability("admin") gate is preserved EXACTLY — this layout
// grants nothing; middleware + the /api/crm authorization stay the boundary.
// Each page now owns its single H1 (the layout renders none).

import type { Metadata }     from "next";
import { noIndexMetadata }   from "@/lib/seo/metadata";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { AppShell }          from "@/components/app-shell";
import { CrmSubNav }         from "@/components/crm-experience";

export const metadata: Metadata = noIndexMetadata("CRM — Hermes OS");

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireCapability capability="admin">
      <AppShell>
        <CrmSubNav />
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </AppShell>
    </RequireCapability>
  );
}
