"use client";
import Link            from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  dashboard:   <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M2 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Zm8 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3Zm0 6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V9ZM2 13a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4Z"/></svg>,
  registry:    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M2 4.75A2.75 2.75 0 0 1 4.75 2h10.5A2.75 2.75 0 0 1 18 4.75v10.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25V4.75ZM4.75 3.5c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V4.75c0-.69-.56-1.25-1.25-1.25H4.75ZM6 7a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H7Zm-1 5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Z" clipRule="evenodd"/></svg>,
  hierarchy:   <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M9 2a1 1 0 0 0-1 1v1H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h4v1H6a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h2v1a1 1 0 1 0 2 0v-1h2a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2V9h4a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-4V3a1 1 0 0 0-1-1Z"/></svg>,
  criticality: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/></svg>,
  health:      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-2.184C4.32 12.478 3 10.44 3 8a5 5 0 0 1 10 0c0 2.44-1.32 4.478-2.885 5.036a22.05 22.05 0 0 1-2.582 2.184 20.76 20.76 0 0 1-1.162.682l-.019.01-.005.003h.001L9.653 16.915ZM7 8a2 2 0 1 0 4 0A2 2 0 0 0 7 8Z"/><path d="M9 6a1 1 0 0 1 2 0v2a1 1 0 0 1-2 0V6Z"/></svg>,
  lifecycle:   <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H5.498a.75.75 0 0 0-.75.75v3.236a.75.75 0 0 0 1.5 0v-2.173l.312.311a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.454-.379l-.006.028ZM5.44 7.312a5.5 5.5 0 0 1 9.201-2.466l.312.311H12.52a.75.75 0 0 0 0 1.5h3.234a.75.75 0 0 0 .75-.75V2.671a.75.75 0 0 0-1.5 0v2.173l-.312-.311A7 7 0 0 0 3.98 7.671a.75.75 0 0 0 1.454.379l.006-.028Z" clipRule="evenodd"/></svg>,
  maintenance: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M14.5 10a4.5 4.5 0 0 0 4.284-5.882c-.105-.324-.51-.391-.752-.15L15.34 6.66a.454.454 0 0 1-.493.11 3.01 3.01 0 0 1-1.618-1.616.455.455 0 0 1 .11-.494l2.694-2.692c.24-.241.174-.647-.15-.752a4.5 4.5 0 0 0-5.873 4.575c.055.873-.128 1.808-.8 2.368l-7.23 6.024a2.724 2.724 0 1 0 3.837 3.837l6.024-7.23c.56-.672 1.495-.855 2.368-.8.096.007.193.01.291.01ZM5 16a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clipRule="evenodd"/></svg>,
  documents:   <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H7Z" clipRule="evenodd"/></svg>,
  analytics:   <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z"/></svg>,
  settings:    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .205 1.251l-1.18 2.044a1 1 0 0 1-1.186.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.205-1.251l1.18-2.044a1 1 0 0 1 1.186-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd"/></svg>,
};

const LINKS = [
  { href: "/assets/dashboard",   key: "dashboard",   label: "Dashboard",       fa: "داشبورد"          },
  { href: "/assets/registry",    key: "registry",    label: "Asset Registry",  fa: "فهرست دارایی‌ها" },
  { href: "/assets/hierarchy",   key: "hierarchy",   label: "Hierarchy",       fa: "سلسله‌مراتب"      },
  { href: "/assets/criticality", key: "criticality", label: "Criticality",     fa: "اهمیت بحرانی"    },
  { href: "/assets/health",      key: "health",      label: "Health",          fa: "سلامت دارایی‌ها" },
  { href: "/assets/lifecycle",   key: "lifecycle",   label: "Lifecycle",       fa: "چرخه عمر"        },
  { href: "/assets/maintenance", key: "maintenance", label: "Maintenance",     fa: "نگهداشت"         },
  { href: "/assets/documents",   key: "documents",   label: "Documents",       fa: "اسناد"           },
  { href: "/assets/analytics",   key: "analytics",   label: "Analytics",       fa: "تحلیل‌ها"        },
  { href: "/assets/settings",    key: "settings",    label: "Settings",        fa: "تنظیمات"         },
];

export function AssetsNav() {
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");
  const locale   = isFa ? "fa" : "en";

  return (
    <nav className="flex flex-col py-5 px-3">
      {/* Module identity */}
      <div className="px-3 mb-5">
        <p className="eyebrow-mono text-ice mb-0.5">ASSETS</p>
        <p className="text-xs text-faint leading-none">{isFa ? "هوشمندی دارایی‌ها" : "Asset Intelligence"}</p>
      </div>

      <div className="flex flex-col gap-0.5">
        {LINKS.map(l => {
          const href   = `/${locale}${l.href}`;
          const active = pathname === href || (l.href !== "/assets" && pathname.startsWith(`/${locale}${l.href}`));
          const label  = isFa ? l.fa : l.label;

          return (
            <Link
              key={l.href}
              href={href}
              className={[
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                active
                  ? "bg-ice/[0.10] text-ice border border-ice/25 font-medium"
                  : "text-muted hover:text-ink hover:bg-surface3 border border-transparent",
              ].join(" ")}
            >
              <span className={active ? "text-ice" : "text-faint"}>
                {ICONS[l.key]}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
