import type { ReactNode }  from "react";
import { getTranslations } from "next-intl/server";
import { ArticlesNav }     from "@/components/articles/ArticlesNav";
import { ArticlesMobileNav } from "@/components/articles/ArticlesMobileNav";
import { getCurrentUser }  from "@/lib/auth/session";
import { can }             from "@/lib/auth/roles";

export default async function ArticlesLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("journal.nav");
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
      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          PHASE 107 — below `lg` the rail above is display:none, which left the
          Journal with no navigation at all. This bar is the mobile counterpart
          and is hidden the moment the rail appears, so the two are never both
          on screen.
        */}
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur lg:hidden">
          <ArticlesMobileNav showAuth={isAuth} showEditorial={isAdmin} />
          <p className="min-w-0 truncate font-display text-sm font-semibold text-ink">
            {t("brandTitle")}
          </p>
        </div>

        <main className="flex-1 overflow-x-hidden min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
