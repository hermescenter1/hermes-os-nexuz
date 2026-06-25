"use client";

import Link             from "next/link";
import { usePathname }  from "next/navigation";

const NAV_ITEMS = [
  { href: "/automation",            label: "Dashboard"   },
  { href: "/automation/workflows",  label: "Workflows"   },
  { href: "/automation/templates",  label: "Templates"   },
  { href: "/automation/executions", label: "Executions"  },
  { href: "/automation/webhooks",   label: "Webhooks"    },
  { href: "/automation/settings",   label: "Settings"    },
];

export function AutomationNav() {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(item => {
        const href   = `/${locale}${item.href}`;
        const active = pathname === href || (item.href !== "/automation" && pathname.startsWith(`/${locale}${item.href}`));
        return (
          <Link
            key={item.href}
            href={href}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
