// PHASE 94C1 — the OT Edge module shell.
//
// The existing `RequireCapability` guard is used unchanged and grants nothing:
// middleware protects `/dashboard/**` already, and the real authorization for
// every record on these pages is the org permission `withOtRoute` enforces on
// `/api/ot/*`. This layout only decides who is shown the shell — a user who
// passes it and lacks `view_ot_gateway` still receives an authorization failure
// from the API, which the pages render as an explicit "not authorized" state.
//
// `authoring` matches the engineering modules (assets, cmms, automation,
// documents): OT Edge is an engineering surface, not a commercial one.

import type { ReactNode } from "react";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { AppShell } from "@/components/app-shell";
import { OtSubNav } from "@/components/ot-edge-operations";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("OT Edge");

export default function OtEdgeLayout({ children }: { children: ReactNode }) {
  return (
    <RequireCapability capability="authoring">
      <AppShell>
        <OtSubNav />
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </AppShell>
    </RequireCapability>
  );
}
