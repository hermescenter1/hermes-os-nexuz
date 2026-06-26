import type { ReactNode }       from "react";
import { RequireCapability }    from "@/components/auth/RequireCapability";
import { CmmsNav }              from "@/components/cmms/CmmsNav";
import { noIndexMetadata }      from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("CMMS");

export default function CmmsLayout({ children }: { children: ReactNode }) {
  return (
    <RequireCapability capability="admin">
      <div className="flex min-h-screen">
        <aside className="w-52 shrink-0 border-r bg-card hidden md:block">
          <div className="sticky top-0 overflow-y-auto max-h-screen">
            <CmmsNav />
          </div>
        </aside>
        <main className="flex-1 px-6 py-8 overflow-x-hidden">{children}</main>
      </div>
    </RequireCapability>
  );
}
