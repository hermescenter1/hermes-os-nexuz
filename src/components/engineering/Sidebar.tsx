"use client";

import { usePathname } from "@/i18n/navigation";
import { Link }        from "@/i18n/navigation";

const NAV = [
  { href: "/engineering",                 label: "Dashboard",       icon: IconDashboard,    exact: true  },
  { href: "/engineering/intelligence",    label: "Intelligence",    icon: IconIntelligence, exact: false },
  { href: "/engineering/projects",        label: "Projects",        icon: IconProjects,     exact: false },
  { href: "/engineering/memory",          label: "Memory",          icon: IconMemory,       exact: false },
  { href: "/engineering/knowledge-graph", label: "Knowledge Graph", icon: IconGraph,        exact: false },
  { href: "/engineering/domains",         label: "Domains",         icon: IconDomains,      exact: false },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="sidebar-bg h-full w-60 flex flex-col flex-none">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-line flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span
              className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(30,200,164,0.10)", border: "1px solid rgba(30,200,164,0.18)" }}
            >
              <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
                <path d="M8 2L14 5v6L8 14 2 11V5L8 2z" stroke="var(--signal)" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className="font-display text-sm font-bold tracking-tight text-ink">Hermes OS</span>
          </div>
          <p className="text-[0.65rem] font-body font-medium text-faint tracking-[0.05em] uppercase ps-[34px]">
            Engineering Hub
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden text-faint hover:text-muted transition-colors p-1.5 rounded"
            aria-label="Close menu"
          >
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        <p className="px-2 pb-2 text-[0.65rem] font-body font-semibold tracking-[0.08em] uppercase text-faint">
          Modules
        </p>
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href as Parameters<typeof Link>[0]["href"]}
              className={[
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 border-s-2",
                active
                  ? "border-s-signal bg-white/[0.05] text-ink font-medium"
                  : "border-s-transparent text-muted hover:text-ink hover:bg-white/[0.03] font-normal",
              ].join(" ")}
            >
              <Icon active={active} />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-line">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-faint hover:text-muted transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 flex-none">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Back to main site</span>
        </Link>
      </div>
    </aside>
  );
}

/* ── Inline icons ─────────────────────────────────────────────────────── */

function IconDashboard({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 flex-none">
      <rect x="2" y="2" width="5" height="5" rx="1"   stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5"/>
      <rect x="9" y="2" width="5" height="3" rx="1"   stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5"/>
      <rect x="9" y="7" width="5" height="7" rx="1"   stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5"/>
      <rect x="2" y="9" width="5" height="5" rx="1"   stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5"/>
    </svg>
  );
}
function IconIntelligence({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 flex-none">
      <circle cx="8" cy="8" r="5" stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5"/>
      <path d="M8 5v3l2 2" stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconProjects({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 flex-none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5"/>
      <rect x="9" y="2" width="5" height="5" rx="1" stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5"/>
      <rect x="2" y="9" width="5" height="5" rx="1" stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5"/>
      <rect x="9" y="9" width="5" height="5" rx="1" stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5"/>
    </svg>
  );
}
function IconMemory({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 flex-none">
      <rect x="2" y="4" width="12" height="8" rx="1.5" stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5"/>
      <path d="M5 4V3M8 4V3M11 4V3M5 12v1M8 12v1M11 12v1" stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconGraph({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 flex-none">
      <circle cx="8" cy="8" r="2" stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5"/>
      <circle cx="3" cy="4" r="1.5" stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.3"/>
      <circle cx="13" cy="4" r="1.5" stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.3"/>
      <circle cx="3" cy="12" r="1.5" stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.3"/>
      <circle cx="13" cy="12" r="1.5" stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.3"/>
      <path d="M4.2 4.8L6.5 6.5M9.5 6.5L11.8 4.8M4.2 11.2L6.5 9.5M9.5 9.5L11.8 11.2"
        stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1" opacity="0.7"/>
    </svg>
  );
}
function IconDomains({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 flex-none">
      <path d="M8 2l6 3.5v5L8 14 2 10.5v-5L8 2z"
        stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M8 2v12M2 5.5l6 4 6-4"
        stroke={active ? "var(--signal)" : "currentColor"} strokeWidth="1" opacity="0.5"/>
    </svg>
  );
}
