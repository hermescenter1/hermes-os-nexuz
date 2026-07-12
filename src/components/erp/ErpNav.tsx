"use client";

import Link             from "next/link";
import { usePathname }  from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

const NAV_ITEMS = [
  { href: "/erp",              key: "dashboard"    },
  { href: "/erp/projects",     key: "projects"     },
  { href: "/erp/tasks",        key: "tasks"        },
  { href: "/erp/teams",        key: "teams"        },
  { href: "/erp/resources",    key: "resources"    },
  { href: "/erp/inventory",    key: "inventory"    },
  { href: "/erp/work-orders",  key: "workOrders"   },
  { href: "/erp/approvals",    key: "approvals"    },
  { href: "/erp/kpis",         key: "kpis"         },
  { href: "/erp/settings",     key: "settings"     },
];

export function ErpNav() {
  const pathname = usePathname();       // active-link detection only
  const locale   = useLocale();
  const t        = useTranslations("enterpriseOperations");

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
            {t(`nav.items.${item.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
