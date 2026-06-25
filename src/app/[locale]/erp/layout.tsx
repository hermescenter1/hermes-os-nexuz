import type { ReactNode }       from "react";
import { RequireCapability }    from "@/components/auth/RequireCapability";
import { ErpNav }               from "@/components/erp/ErpNav";
import { noIndexMetadata }      from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("ERP");

export default function ErpLayout({ children }: { children: ReactNode }) {
  return (
    <RequireCapability capability="admin">
      <div className="flex min-h-screen">
        <aside className="w-52 shrink-0 border-r bg-card px-3 py-6 hidden md:block">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-3 mb-4">
            ERP Operations
          </div>
          <ErpNav />
        </aside>
        <main className="flex-1 px-6 py-8 overflow-x-hidden">{children}</main>
      </div>
    </RequireCapability>
  );
}
