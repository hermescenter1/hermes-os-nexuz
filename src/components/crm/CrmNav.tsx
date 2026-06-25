"use client";

import Link       from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/en/crm",                  label: "Dashboard"        },
  { href: "/en/crm/leads",            label: "Leads"            },
  { href: "/en/crm/opportunities",    label: "Pipeline"         },
  { href: "/en/crm/accounts",         label: "Accounts"         },
  { href: "/en/crm/customer-success", label: "Customer Success" },
];

export function CrmNav() {
  const pathname = usePathname();
  const base = pathname.startsWith("/fa") ? "/fa" : "/en";

  return (
    <nav className="space-y-1">
      {NAV.map(({ href, label }) => {
        const localHref = href.replace("/en", base);
        const active    = pathname === localHref || (localHref !== `${base}/crm` && pathname.startsWith(localHref));
        return (
          <Link
            key={href}
            href={localHref}
            className={[
              "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                : "text-muted hover:text-ink hover:bg-surface-2",
            ].join(" ")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
