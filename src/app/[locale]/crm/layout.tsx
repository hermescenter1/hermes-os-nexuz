import type { Metadata }   from "next";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { CrmNav }          from "@/components/crm/CrmNav";

export const metadata: Metadata = noIndexMetadata("CRM — Hermes OS");

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireCapability capability="admin">
      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="font-mono text-xs uppercase tracking-widest text-faint">Hermes OS · CRM</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">Customer Relationship Management</h1>
          </div>
          <div className="flex gap-8">
            <aside className="hidden lg:block w-52 shrink-0">
              <div className="sticky top-8 rounded-xl border border-line bg-surface p-4">
                <CrmNav />
              </div>
            </aside>
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </RequireCapability>
  );
}
