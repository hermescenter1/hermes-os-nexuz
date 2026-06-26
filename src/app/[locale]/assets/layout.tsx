import type { ReactNode }    from "react";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { AssetsNav }         from "@/components/assets/AssetsNav";
import { noIndexMetadata }   from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Asset Registry");

export default function AssetsLayout({ children }: { children: ReactNode }) {
  return (
    <RequireCapability capability="admin">
      <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
        <aside className="w-56 shrink-0 border-e border-line bg-surface hidden md:flex flex-col">
          <div className="sticky top-0 overflow-y-auto max-h-screen">
            <AssetsNav />
          </div>
        </aside>
        <main className="flex-1 overflow-x-hidden">
          <div className="px-6 py-8 max-w-[1400px]">
            {children}
          </div>
        </main>
      </div>
    </RequireCapability>
  );
}
