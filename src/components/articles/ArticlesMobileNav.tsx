"use client";

/**
 * PHASE 107 — Journal navigation below the `lg` breakpoint.
 *
 * The Journal's only navigation lived in an `<aside className="hidden lg:flex">`
 * and nothing else in the segment rendered a menu, so all 26 Journal routes had
 * NO navigation whatsoever on phones and small tablets: a reader who landed on
 * an article from search could reach the feed, the categories, the authors —
 * nothing. Only the browser's back button worked.
 *
 * Deliberately built on the same primitives as the workspace's AppMobileNav
 * (ds `Drawer` + `IconButton`) so the two mobile menus behave identically:
 * focus trap, restore, Escape, backdrop dismiss and body-scroll lock come from
 * Drawer, and the sheet is anchored to the INLINE start edge so it opens from
 * the right under Persian RTL without a direction-specific branch.
 *
 * The drawer's contents are the existing `ArticlesNav` component rather than a
 * second copy of the link list — a duplicated list is a list that drifts, and
 * the desktop rail is the authority on what the Journal contains.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Drawer, IconButton } from "@/components/ds";
import { ArticlesNav } from "./ArticlesNav";

export interface ArticlesMobileNavProps {
  showAuth: boolean;
  showEditorial: boolean;
}

export function ArticlesMobileNav({ showAuth, showEditorial }: ArticlesMobileNavProps) {
  const t = useTranslations("journal.nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close after a link is tapped — the drawer would otherwise stay open over
  // the page the user just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <IconButton
        aria-label={t("openMenu")}
        aria-expanded={open}
        variant="tertiary"
        size="lg"
        onClick={() => setOpen(true)}
        icon={<span aria-hidden="true">☰</span>}
      />
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="start"
        width={300}
        title={t("menuTitle")}
      >
        <ArticlesNav showAuth={showAuth} showEditorial={showEditorial} />
      </Drawer>
    </>
  );
}
