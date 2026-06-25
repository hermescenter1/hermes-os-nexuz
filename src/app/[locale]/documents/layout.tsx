import { RequireCapability } from "@/components/auth/RequireCapability";
import { DocumentNav }       from "@/components/document/DocumentNav";

export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireCapability capability="admin">
      <div className="flex min-h-screen bg-background">
        <aside className="w-56 shrink-0 border-r border-surface-2 bg-surface-0">
          <div className="sticky top-0 overflow-y-auto max-h-screen">
            <DocumentNav />
          </div>
        </aside>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </RequireCapability>
  );
}
