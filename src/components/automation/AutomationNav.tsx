"use client";

import Link             from "next/link";
import { usePathname }  from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

const NAV_ITEMS = [
  { href: "/automation",            key: "dashboard"   },
  { href: "/automation/workflows",  key: "workflows"   },
  { href: "/automation/templates",  key: "templates"   },
  { href: "/automation/executions", key: "executions"  },
  { href: "/automation/webhooks",   key: "webhooks"    },
  { href: "/automation/settings",   key: "settings"    },
];

export function AutomationNav() {
  const pathname = usePathname();       // active-link detection only
  const locale   = useLocale();
  const t        = useTranslations("automationOperations");

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
            {t(`nav.items.${item.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
