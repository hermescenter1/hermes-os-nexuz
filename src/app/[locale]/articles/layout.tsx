import type { ReactNode }  from "react";
import { getCurrentUser }  from "@/lib/auth/session";
import { can }             from "@/lib/auth/roles";
import { JournalShell }    from "@/components/articles/journal/JournalShell";

// PHASE 104-F — this layout owns EVERY `/articles/*` route: the public
// reading surfaces AND the authenticated author workspace AND the admin
// editorial tools. The Industrial Journal redesign applies to the public
// reading system only, so the shell is chosen PER ROUTE by `JournalShell`
// (a pure resolver in `journal-shell.ts`, fail-closed to the legacy shell for
// anything private or unknown). The auth/role derivation below is unchanged
// from 72.5 and is still what gates the legacy sidebar's private links.
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
    <JournalShell showAuth={isAuth} showEditorial={isAdmin}>
      {children}
    </JournalShell>
  );
}
