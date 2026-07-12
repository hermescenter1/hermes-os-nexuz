"use client";
import Link            from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

const ICONS: Record<string, React.ReactNode> = {
  dashboard:   <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M2 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Zm8 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3Zm0 6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V9ZM2 13a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4Z"/></svg>,
  plans:       <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75ZM10 10a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 10 10Zm3.5.75a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 0 1.5 0v-2.5Zm-7 0a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 0 1.5 0v-2.5Z" clipRule="evenodd"/></svg>,
  schedules:   <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z"/></svg>,
  workorders:  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 2.5c-1.31 0-2.526.386-3.546 1.051a.75.75 0 0 1-.82-1.256A8 8 0 0 1 18 10a8 8 0 0 1-8 8 .75.75 0 0 1 0-1.5A6.5 6.5 0 0 0 10 4V2.5ZM9.25 5.5a.75.75 0 0 1 .75.75v4c0 .199.079.39.22.53l2.5 2.5a.75.75 0 1 1-1.06 1.06l-2.72-2.72A1.75 1.75 0 0 1 8.5 10.25v-4a.75.75 0 0 1 .75-.75ZM1 4.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V6.56l-1.22 1.22a.75.75 0 0 1-1.06-1.06L4.44 5.5H1.75A.75.75 0 0 1 1 4.75V4.5Z" clipRule="evenodd"/></svg>,
  tasks:       <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h11A2.5 2.5 0 0 1 18 4.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 2 15.5v-11ZM7.5 9.5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Zm0-3a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Zm0 6a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z"/></svg>,
  failures:    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/></svg>,
  downtime:    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd"/></svg>,
  checklists:  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M3 4a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm0 4a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm0 4a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm10 .854a.75.75 0 0 0-1.06-1.06L11 13.732l-.47-.47a.75.75 0 0 0-1.06 1.06L11 15.854l2.5-2.5Z" clipRule="evenodd"/></svg>,
  calendar:    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 7.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm4.25 1.25a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Zm5.5 0a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Z" clipRule="evenodd"/></svg>,
  spares:      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M2 3A1 1 0 0 1 3 2h2.153a1 1 0 0 1 .986.836l.74 4.435a1 1 0 0 1-.54 1.06l-1.548.773a11.037 11.037 0 0 0 6.105 6.105l.774-1.548a1 1 0 0 1 1.059-.54l4.435.74a1 1 0 0 1 .836.986V17A1 1 0 0 1 17 18h-2C7.82 18 2 12.18 2 5V3Z"/></svg>,
  costs:       <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 10.818v2.614A3.13 3.13 0 0 0 11.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 0 0-1.138-.432ZM8.33 8.62c.053.055.115.11.184.164.208.16.46.284.736.363V6.603a2.45 2.45 0 0 0-.35.13c-.14.065-.27.143-.386.233-.377.292-.514.627-.514.909 0 .184.058.39.33.596ZM9.25 3.75v.345a6.166 6.166 0 0 0-.087-.021A.5.5 0 0 0 9 4.75V8.5l-.21-.07a2.3 2.3 0 0 1-1.31-1.065c-.14-.24-.22-.5-.22-.79C7.26 5.62 8.024 4.804 9.25 4.5V3.75a.75.75 0 0 1 1.5 0V4.5c1.226.304 1.99 1.12 1.99 2.075 0 .29-.08.55-.22.79a2.3 2.3 0 0 1-1.31 1.064L11 8.5V4.75c0-.08-.01-.16-.037-.236.224.04.444.106.65.194V7c.23-.07.42-.157.57-.255.455-.29.507-.627.507-.745 0-.165-.065-.39-.3-.6A2.55 2.55 0 0 0 11 5.01V3.75a.75.75 0 0 0-.75-.75A.75.75 0 0 0 9.25 3.75Z"/></svg>,
  history:     <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M2 10C2 5.58 5.58 2 10 2s8 3.58 8 8-3.58 8-8 8-8-3.58-8-8Zm8.75-1.25a.75.75 0 0 0-1.5 0v2.5c0 .414.336.75.75.75h2.5a.75.75 0 0 0 0-1.5h-1.75v-1.75Z" clipRule="evenodd"/></svg>,
  reports:     <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z"/></svg>,
  settings:    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .205 1.251l-1.18 2.044a1 1 0 0 1-1.186.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.205-1.251l1.18-2.044a1 1 0 0 1 1.186-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd"/></svg>,
};

const LINKS = [
  { href: "/cmms/dashboard",   key: "dashboard"  },
  { href: "/cmms/plans",       key: "plans"      },
  { href: "/cmms/schedules",   key: "schedules"  },
  { href: "/cmms/work-orders", key: "workorders" },
  { href: "/cmms/tasks",       key: "tasks"      },
  { href: "/cmms/failures",    key: "failures"   },
  { href: "/cmms/downtime",    key: "downtime"   },
  { href: "/cmms/checklists",  key: "checklists" },
  { href: "/cmms/calendar",    key: "calendar"   },
  { href: "/cmms/spares",      key: "spares"     },
  { href: "/cmms/costs",       key: "costs"      },
  { href: "/cmms/history",     key: "history"    },
  { href: "/cmms/reports",     key: "reports"    },
  { href: "/cmms/settings",    key: "settings"   },
];

export function CmmsNav() {
  const pathname = usePathname();
  const locale   = useLocale();
  const t        = useTranslations("maintenanceOperations");

  return (
    <nav className="flex flex-col py-5 px-3">
      {/* Module identity */}
      <div className="px-3 mb-5">
        <p className="eyebrow-mono text-warn mb-0.5">{t("nav.eyebrow")}</p>
        <p className="text-xs text-faint leading-none">{t("nav.tagline")}</p>
      </div>

      <div className="flex flex-col gap-0.5">
        {LINKS.map(l => {
          const href   = `/${locale}${l.href}`;
          const active = pathname === href || (l.href !== "/cmms" && pathname.startsWith(`/${locale}${l.href}`));

          return (
            <Link
              key={l.href}
              href={href}
              className={[
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                active
                  ? "bg-warn/[0.10] text-warn border border-warn/25 font-medium"
                  : "text-muted hover:text-ink hover:bg-surface3 border border-transparent",
              ].join(" ")}
            >
              <span className={active ? "text-warn" : "text-faint"}>
                {ICONS[l.key]}
              </span>
              <span>{t(`nav.items.${l.key}`)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
