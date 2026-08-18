"use client";
// PHASE 104-F — the route-gated Journal shell switch.
//
// `articles/layout.tsx` is a Server Component that owns EVERY `/articles/*`
// route, public and private alike, and a server layout cannot see the
// pathname. This tiny client boundary reads it, asks the PURE resolver in
// `journal-shell.ts` which shell the route gets, and renders exactly one:
//
//   journal → the public Industrial Journal reading shell (PublicHeader in
//             `visualMode="journal"`, the pressroom page ground, PublicFooter)
//   legacy  → the untouched 72.5 sidebar shell (`ArticlesNav` + main landmark) that
//             the author workspace and editorial tools still use
//
// It renders NO content of its own and holds NO state; both shells' children
// are the same server-rendered subtree passed through. That is what keeps the
// editorial treatment from leaking into /write, /drafts, /reports and friends
// (fail-closed in the resolver) while the public reading surfaces get it.

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { journalShellMode } from "../journal-shell";
import { ArticlesNav } from "../ArticlesNav";
import { PublicHeader, PublicFooter } from "@/components/public-site";

export function JournalShell({
  children,
  showAuth,
  showEditorial,
}: {
  children: ReactNode;
  showAuth: boolean;
  showEditorial: boolean;
}) {
  const pathname = usePathname() ?? "";
  const mode = journalShellMode(pathname);

  if (mode === "journal") {
    return (
      <div className="flex min-h-screen flex-col bg-background-base" data-journal-shell="journal">
        <PublicHeader visualMode="journal" />
        <main id="public-content" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <PublicFooter visualMode="journal" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }} data-journal-shell="legacy">
      <aside className="w-64 shrink-0 border-e border-line bg-surface hidden lg:flex flex-col">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <ArticlesNav showAuth={showAuth} showEditorial={showEditorial} />
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden min-w-0">
        {children}
      </main>
    </div>
  );
}
