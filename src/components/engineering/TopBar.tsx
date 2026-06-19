"use client";

import { usePathname } from "@/i18n/navigation";

const TITLES: Record<string, string> = {
  "/engineering":                 "Executive Dashboard",
  "/engineering/intelligence":    "Intelligence Overview",
  "/engineering/projects":        "Projects",
  "/engineering/memory":          "Engineering Memory",
  "/engineering/knowledge-graph": "Knowledge Graph",
  "/engineering/domains":         "Domain Expertise",
};

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? "Engineering Hub";

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
        <h2 className="text-sm font-semibold text-ink tracking-tight">{title}</h2>
      </div>

      {/* Status pill */}
      <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-line"
        style={{ background: "rgba(56, 224, 176, 0.05)" }}>
        <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
        <span className="text-[10px] font-mono text-signal tracking-wider">LIVE</span>
      </div>
    </header>
  );
}
