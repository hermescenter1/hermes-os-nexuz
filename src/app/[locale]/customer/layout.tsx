import type { Metadata }            from "next";
import { noIndexMetadata }          from "@/lib/seo/metadata";
import { RequireCapability }        from "@/components/auth/RequireCapability";
import { CustomerPortalNav }        from "@/components/customer-portal/CustomerPortalNav";

export const metadata: Metadata = noIndexMetadata("Customer Portal — Hermes OS");

export default function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireCapability capability="dashboard">
      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-8">
            <p className="font-mono text-xs uppercase tracking-widest text-faint">Hermes OS · Customer Portal</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">Account Workspace</h1>
          </div>

          <div className="flex gap-8">
            {/* Sidebar navigation */}
            <aside className="hidden lg:block w-52 shrink-0">
              <div className="sticky top-8 rounded-xl border border-line bg-surface p-4">
                <CustomerPortalNav />
              </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 min-w-0">
              {children}
            </main>
          </div>
        </div>
      </div>
    </RequireCapability>
  );
}
