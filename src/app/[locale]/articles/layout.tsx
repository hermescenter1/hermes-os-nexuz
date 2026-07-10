import type { ReactNode }  from "react";
import { ArticlesNav }     from "@/components/articles/ArticlesNav";
import { getCurrentUser }  from "@/lib/auth/session";
import { can }             from "@/lib/auth/roles";

export default async function ArticlesLayout({ children }: { children: ReactNode }) {
  let isAuth  = false;
  let isAdmin = false;
  try {
    const user = await getCurrentUser();
    isAuth  = !!user;
    // Editorial nav is gated by the "admin" capability (matches the editorial
    // route guards + middleware) rather than a duplicated role-name list.
    isAdmin = can(user?.role, "admin");
  } catch { /* unauthenticated or auth not configured */ }

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Sidebar nav — hidden on mobile, visible lg+ */}
      <aside className="w-64 shrink-0 border-e border-line bg-surface hidden lg:flex flex-col">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <ArticlesNav showAuth={isAuth} showEditorial={isAdmin} />
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 overflow-x-hidden min-w-0">
        {children}
      </main>
    </div>
  );
}
