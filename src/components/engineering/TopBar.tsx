"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";

/**
 * PHASE 107 — route → message key. The titles were English string literals
 * here, which made them the one part of the Engineering Hub that never
 * translated: /de and /fa rendered "Domain Expertise" and "Engineering Memory"
 * verbatim on every route. The map now holds KEYS under `engineeringHub`, so
 * the catalogs own the words.
 */
const TITLE_KEYS: Record<string, string> = {
  "/engineering":                 "executiveDashboard",
  "/engineering/intelligence":    "intelligenceOverview",
  "/engineering/projects":        "projects",
  "/engineering/memory":          "engineeringMemory",
  "/engineering/knowledge-graph": "knowledgeGraph",
  "/engineering/domains":         "domainExpertise",
};

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const t = useTranslations("engineeringHub");
  const pathname = usePathname();
  const title = t(TITLE_KEYS[pathname] ?? "hub");

  return (
    <header className="topbar-bg flex-none h-14 flex items-center gap-4 px-4 border-b border-line">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="lg:hidden text-muted hover:text-ink transition-colors p-1 rounded"
        aria-label="Toggle menu"
      >
        <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Page title */}
      <div className="flex items-center gap-3 flex-1">
        <span className="h-3 w-px bg-line hidden lg:block" />
        {/*
          PHASE 107 — this is the page's <h1>. Five of the six Engineering
          routes previously had NO h1 in any state: the views start at <h3>,
          and the two that did declare one only rendered it after data loaded,
          so an empty or failed load produced a heading-less document. The
          topbar title is the one element guaranteed present on every route in
          every state, which makes it the only correct owner of the h1.
        */}
        <h1 className="text-sm font-semibold text-ink tracking-tight">{title}</h1>
      </div>

      {/* System status — neutral, static */}
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded border border-line">
        <span className="w-1.5 h-1.5 rounded-full bg-signal/70" />
        <span className="text-[0.65rem] font-body font-medium text-metadata tracking-[0.04em]">Online</span>
      </div>
    </header>
  );
}
