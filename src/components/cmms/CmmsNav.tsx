"use client";
import Link            from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/cmms/dashboard",   label: "Dashboard"    },
  { href: "/cmms/plans",       label: "PM Plans"     },
  { href: "/cmms/schedules",   label: "Schedules"    },
  { href: "/cmms/work-orders", label: "Work Orders"  },
  { href: "/cmms/tasks",       label: "Tasks"        },
  { href: "/cmms/failures",    label: "Failures"     },
  { href: "/cmms/downtime",    label: "Downtime"     },
  { href: "/cmms/checklists",  label: "Checklists"   },
  { href: "/cmms/calendar",    label: "Calendar"     },
  { href: "/cmms/spares",      label: "Spare Parts"  },
  { href: "/cmms/costs",       label: "Costs"        },
  { href: "/cmms/history",     label: "History"      },
  { href: "/cmms/reports",     label: "Reports"      },
  { href: "/cmms/settings",    label: "Settings"     },
];

export function CmmsNav() {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  return (
    <nav className="flex flex-col gap-1 p-4 text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">CMMS</p>
      {LINKS.map(l => {
        const href   = `/${locale}${l.href}`;
        const active = pathname === href || (l.href !== "/cmms" && pathname.startsWith(href));
        return (
          <Link
            key={l.href}
            href={href}
            className={`px-3 py-1.5 rounded transition-colors ${
              active
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
