"use client";

import Link             from "next/link";
import { usePathname }  from "next/navigation";

const NAV_ITEMS = [
  { href: "/erp",              label: "Dashboard"    },
  { href: "/erp/projects",     label: "Projects"     },
  { href: "/erp/tasks",        label: "Tasks"        },
  { href: "/erp/teams",        label: "Teams"        },
  { href: "/erp/resources",    label: "Resources"    },
  { href: "/erp/inventory",    label: "Inventory"    },
  { href: "/erp/work-orders",  label: "Work Orders"  },
  { href: "/erp/approvals",    label: "Approvals"    },
  { href: "/erp/kpis",         label: "KPIs"         },
  { href: "/erp/settings",     label: "Settings"     },
];

export function ErpNav() {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(item => {
        const href   = `/${locale}${item.href}`;
        const active = pathname === href || (item.href !== "/erp" && pathname.startsWith(`/${locale}${item.href}`));
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
