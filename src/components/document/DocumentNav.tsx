"use client";
import Link            from "next/link";
import { usePathname } from "next/navigation";

// ── inline SVG icon set for EDMS navigation ─────────────────────────────────
const ICONS: Record<string, React.ReactNode> = {
  dashboard:   <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M2 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Zm8 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3Zm0 6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V9ZM2 13a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4Z"/></svg>,
  explorer:    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M2 6a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z"/></svg>,
  search:      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/></svg>,
  approvals:   <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/></svg>,
  revisions:   <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd"/></svg>,
  comments:    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M3.43 2.524A41.29 41.29 0 0 1 10 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.202 41.202 0 0 1-5.183.501.78.78 0 0 0-.528.224l-3.579 3.58A.75.75 0 0 1 6 17v-2.25a41.786 41.786 0 0 1-2.57-.324C1.993 14.174 1 12.916 1 11.503V5.426c0-1.413.993-2.67 2.43-2.902Z" clipRule="evenodd"/></svg>,
  audit:       <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M9 1a.75.75 0 0 1 .75.75V3h.5a5 5 0 0 1 0 10h-.5v1.25a.75.75 0 0 1-1.5 0V13h-.5a5 5 0 0 1 0-10h.5V1.75A.75.75 0 0 1 9 1Zm0 3.5H8.5a3.5 3.5 0 1 0 0 7H9V4.5Zm1.5 7H10V4.5h.5a3.5 3.5 0 1 1 0 7Z" clipRule="evenodd"/></svg>,
  folders:     <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v3.26a3.235 3.235 0 0 1 1.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0 0 16.25 5h-4.836a.25.25 0 0 1-.177-.073L9.823 3.513A1.75 1.75 0 0 0 8.586 3H3.75ZM3.75 9A1.75 1.75 0 0 0 2 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-4.5A1.75 1.75 0 0 0 16.25 9H3.75Z"/></svg>,
  categories:  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v3.879a2.5 2.5 0 0 0 .732 1.767l7.5 7.5a2.5 2.5 0 0 0 3.536 0l3.878-3.878a2.5 2.5 0 0 0 0-3.536l-7.5-7.5A2.5 2.5 0 0 0 8.38 2H4.5ZM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/></svg>,
  templates:   <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15h-3.105a3.501 3.501 0 0 0 1.1 1.677A.75.75 0 0 1 13.26 18H6.74a.75.75 0 0 1-.484-1.323A3.501 3.501 0 0 0 7.355 15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Zm1.5 0a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75v-7.5Z" clipRule="evenodd"/></svg>,
  retention:   <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M2 3a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H2ZM1 9a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V9Zm1 3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H2Z"/></svg>,
  settings:    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .205 1.251l-1.18 2.044a1 1 0 0 1-1.186.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.205-1.251l1.18-2.044a1 1 0 0 1 1.186-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd"/></svg>,
};

const LINKS = [
  { href: "/documents",            key: "dashboard",   label: "Dashboard"    },
  { href: "/documents/explorer",   key: "explorer",    label: "Explorer"     },
  { href: "/documents/search",     key: "search",      label: "Search"       },
  { href: "/documents/approvals",  key: "approvals",   label: "Approvals"    },
  { href: "/documents/revisions",  key: "revisions",   label: "Revisions"    },
  { href: "/documents/comments",   key: "comments",    label: "Comments"     },
  { href: "/documents/audit",      key: "audit",       label: "Audit"        },
  { href: "/documents/folders",    key: "folders",     label: "Folders"      },
  { href: "/documents/categories", key: "categories",  label: "Categories"   },
  { href: "/documents/templates",  key: "templates",   label: "Templates"    },
  { href: "/documents/retention",  key: "retention",   label: "Retention"    },
  { href: "/documents/settings",   key: "settings",    label: "Settings"     },
];

const FA_LABELS: Record<string, string> = {
  Dashboard:   "داشبورد",
  Explorer:    "مرورگر",
  Search:      "جستجو",
  Approvals:   "تأییدیه‌ها",
  Revisions:   "بازبینی‌ها",
  Comments:    "نظرات",
  Audit:       "حسابرسی",
  Folders:     "پوشه‌ها",
  Categories:  "دسته‌بندی‌ها",
  Templates:   "قالب‌ها",
  Retention:   "نگهداری",
  Settings:    "تنظیمات",
};

export function DocumentNav() {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";
  const isFa     = locale === "fa";

  return (
    <nav className="flex flex-col py-5 px-3">
      {/* Module identity */}
      <div className="px-3 mb-5">
        <p className="eyebrow-mono text-signal mb-0.5">EDMS</p>
        <p className="text-xs text-faint leading-none">{isFa ? "مدیریت اسناد" : "Document Management"}</p>
      </div>

      <div className="flex flex-col gap-0.5">
        {LINKS.map(l => {
          const href   = `/${locale}${l.href}`;
          const active = pathname === href || (l.href !== "/documents" && pathname.startsWith(`/${locale}${l.href}`));
          const label  = isFa ? (FA_LABELS[l.label] ?? l.label) : l.label;

          return (
            <Link
              key={l.href}
              href={href}
              className={[
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                active
                  ? "bg-signal/[0.10] text-signal border border-signal/20 font-medium"
                  : "text-muted hover:text-ink hover:bg-surface3 border border-transparent",
              ].join(" ")}
            >
              <span className={active ? "text-signal" : "text-faint"}>
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
