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
import { ArticlesMobileNav } from "../ArticlesMobileNav";
import { PublicHeader, PublicFooter } from "@/components/public-site";

export function JournalShell({
  children,
  showAuth,
  showEditorial,
  brandTitle,
}: {
  children: ReactNode;
  showAuth: boolean;
  showEditorial: boolean;
  brandTitle: string;
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
      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          PHASE 107 — below `lg` the rail above is display:none, which left the
          Journal with no navigation at all. This bar is the mobile counterpart
          and is hidden the moment the rail appears, so the two are never both
          on screen. Carried into the 104-F shell switch unchanged: it belongs
          to the LEGACY branch only, because the journal branch's PublicHeader
          already navigates at every breakpoint.
        */}
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur lg:hidden">
          <ArticlesMobileNav showAuth={showAuth} showEditorial={showEditorial} />
          <p className="min-w-0 truncate font-display text-sm font-semibold text-ink">
            {brandTitle}
          </p>
        </div>

        <main className="flex-1 overflow-x-hidden min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
