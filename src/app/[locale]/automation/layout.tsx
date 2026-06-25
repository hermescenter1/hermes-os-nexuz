import { ReactNode }     from "react";
import { AutomationNav } from "@/components/automation/AutomationNav";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Automation");

export default function AutomationLayout({ children }: { children: ReactNode }) {
  return (
    <RequireCapability capability="admin">
      <div className="flex min-h-screen">
        <aside className="w-52 shrink-0 border-r bg-card/50 p-4 hidden md:block">
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Automation</h2>
          </div>
          <AutomationNav />
        </aside>
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </RequireCapability>
  );
}
