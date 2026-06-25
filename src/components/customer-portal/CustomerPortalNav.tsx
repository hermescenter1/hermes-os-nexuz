"use client";

import { usePathname } from "next/navigation";
import { Link }        from "@/i18n/navigation";

const NAV_ITEMS = [
  { href: "/customer",             label: "Overview",     icon: "⬡" },
  { href: "/customer/account",     label: "Account",      icon: "◈" },
  { href: "/customer/projects",    label: "Projects",     icon: "◉" },
  { href: "/customer/support",     label: "Support",      icon: "◎" },
  { href: "/customer/documents",   label: "Documents",    icon: "▦" },
  { href: "/customer/subscription",label: "Subscription", icon: "◈" },
  { href: "/customer/training",    label: "Training",     icon: "◆" },
  { href: "/customer/activity",    label: "Activity",     icon: "▤" },
  { href: "/customer/settings",    label: "Settings",     icon: "◬" },
] as const;

export function CustomerPortalNav() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    const stripped = pathname.replace(/^\/(fa|en)/, "") || "/";
    if (href === "/customer") return stripped === "/customer";
    return stripped.startsWith(href);
  }

  return (
    <nav className="flex flex-col gap-1">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-faint px-3">
        Customer Portal
      </p>
      {NAV_ITEMS.map(({ href, label, icon }) => (
        <Link
          key={href}
          href={href as "/customer"}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive(href)
              ? "bg-signal/10 text-signal font-medium"
              : "text-muted hover:bg-surface-2 hover:text-ink"
          }`}
        >
          <span className="shrink-0 font-mono text-xs">{icon}</span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
