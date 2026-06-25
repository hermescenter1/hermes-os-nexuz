"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/documents",           label: "Dashboard"   },
  { href: "/documents/explorer",  label: "Explorer"    },
  { href: "/documents/search",    label: "Search"      },
  { href: "/documents/approvals", label: "Approvals"   },
  { href: "/documents/revisions", label: "Revisions"   },
  { href: "/documents/comments",  label: "Comments"    },
  { href: "/documents/audit",     label: "Audit"       },
  { href: "/documents/folders",   label: "Folders"     },
  { href: "/documents/categories",label: "Categories"  },
  { href: "/documents/templates", label: "Templates"   },
  { href: "/documents/retention", label: "Retention"   },
  { href: "/documents/settings",  label: "Settings"    },
];

export function DocumentNav() {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  return (
    <nav className="flex flex-col gap-1 p-4 text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">EDMS</p>
      {LINKS.map(l => {
        const href   = `/${locale}${l.href}`;
        const active = pathname === href || (l.href !== "/documents" && pathname.startsWith(href));
        return (
          <Link
            key={l.href}
            href={href}
            className={`px-3 py-1.5 rounded transition-colors ${
              active
                ? "bg-brand text-white font-medium"
                : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
