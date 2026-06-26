import { RequireCapability } from "@/components/auth/RequireCapability";
import { DocumentNav }       from "@/components/document/DocumentNav";

export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireCapability capability="admin">
      <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-e border-line bg-surface hidden md:flex flex-col">
          <div className="sticky top-0 overflow-y-auto max-h-screen">
            <DocumentNav />
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-x-hidden">
          <div className="px-6 py-8 max-w-[1400px]">
            {children}
          </div>
        </main>
      </div>
    </RequireCapability>
  );
}
