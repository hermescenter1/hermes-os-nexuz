"use client";
import Link            from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  feed:           <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M2 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Zm8 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3Zm0 6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V9ZM2 13a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4Z"/></svg>,
  trending:       <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M12.577 4.878a.75.75 0 0 1 .919-.53l4.78 1.281a.75.75 0 0 1 .531.919l-1.281 4.78a.75.75 0 0 1-1.449-.387l.81-3.022a19.407 19.407 0 0 0-5.594 5.203.75.75 0 0 1-1.139.093L7 10.06l-4.72 4.72a.75.75 0 0 1-1.06-1.061l5.25-5.25a.75.75 0 0 1 1.06 0l3.074 3.073a20.923 20.923 0 0 1 5.545-5.062l-3.041-.815a.75.75 0 0 1-.53-.919Z" clipRule="evenodd"/></svg>,
  latest:         <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd"/></svg>,
  picks:          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd"/></svg>,
  casestudies:    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 16.82A7.462 7.462 0 0 1 10 17c-.34 0-.674-.028-1-.083v-2.31l1-1 1 1v2.21ZM10 3a7 7 0 1 0 0 14A7 7 0 0 0 10 3Z"/><path fillRule="evenodd" d="M.25 10a9.75 9.75 0 1 1 19.5 0 9.75 9.75 0 0 1-19.5 0Zm10-7.25a7.25 7.25 0 1 0 0 14.5 7.25 7.25 0 0 0 0-14.5Z" clipRule="evenodd"/></svg>,
  categories:     <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4 2a2 2 0 0 0-2 2v11a3 3 0 1 0 6 0V4a2 2 0 0 0-2-2H4Zm1 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm5-1.757 4.9-4.9a2 2 0 0 0 0-2.828L13.485 5.1a2 2 0 0 0-2.828 0L10 5.757v8.486ZM16 17H9.071l6-6H16a1 1 0 1 1 0 2h-2.757l2.63-2.63a.75.75 0 1 0-1.06-1.06L18 11.622V17a1 1 0 0 1-1 1Z" clipRule="evenodd"/></svg>,
  tags:           <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M5.5 3A2.5 2.5 0 0 0 3 5.5v2.879a2.5 2.5 0 0 0 .732 1.767l6.5 6.5a2.5 2.5 0 0 0 3.536 0l2.878-2.878a2.5 2.5 0 0 0 0-3.536l-6.5-6.5A2.5 2.5 0 0 0 8.38 3H5.5ZM6 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/></svg>,
  authors:        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z"/></svg>,
  write:          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z"/></svg>,
  myarticles:     <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H7Z" clipRule="evenodd"/></svg>,
  drafts:         <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3L10.58 12.42a4 4 0 0 1-1.343.885l-3.155 1.262a.5.5 0 0 1-.65-.65Z"/><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z"/></svg>,
  saved:          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 2a.75.75 0 0 1 .75.75v.258a33.186 33.186 0 0 1 6.668.83.75.75 0 0 1-.336 1.461 31.28 31.28 0 0 0-1.103-.232l1.702 7.545a.75.75 0 0 1-.387.832A4.981 4.981 0 0 1 15 14c-.825 0-1.606-.2-2.294-.556v.58a2.75 2.75 0 0 1-5.5 0v-.58A4.981 4.981 0 0 1 5 14a4.98 4.98 0 0 1-2.294-.556.75.75 0 0 1-.387-.832l1.702-7.545c-.37.07-.738.145-1.103.232a.75.75 0 0 1-.336-1.461 33.186 33.186 0 0 1 6.668-.83V2.75A.75.75 0 0 1 10 2Z" clipRule="evenodd"/></svg>,
  following:      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2.046 15.253c-.058.468.172.92.57 1.174A9.953 9.953 0 0 0 8 18c1.536 0 2.989-.348 4.284-.963.115-.06.237-.12.37-.19a.75.75 0 0 0 .336-.963l-3.13-6.977a.75.75 0 0 0-1.38 0L6.49 13.07a.75.75 0 0 0 .336.963c.133.07.255.13.37.19.595.258 1.21.457 1.83.601l-.06.044-1.38.882a.75.75 0 0 0 .416 1.383ZM16 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm2 1a3.5 3.5 0 0 1 1.5 2.91V16h-7v-4.09A3.5 3.5 0 0 1 14 9h4Z"/></svg>,
  settings:       <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .205 1.251l-1.18 2.044a1 1 0 0 1-1.186.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.205-1.251l1.18-2.044a1 1 0 0 1 1.186-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd"/></svg>,
  moderation:     <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd"/></svg>,
  reviewqueue:    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M6 4.75A.75.75 0 0 1 6.75 4h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 4.75ZM6 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 10Zm0 5.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75a.75.75 0 0 1-.75-.75ZM1.99 4.75a1 1 0 0 1 1-1H3a1 1 0 0 1 1 1v.01a1 1 0 0 1-1 1h-.01a1 1 0 0 1-1-1v-.01ZM1.99 15.25a1 1 0 0 1 1-1H3a1 1 0 0 1 1 1v.01a1 1 0 0 1-1 1h-.01a1 1 0 0 1-1-1v-.01ZM1.99 10a1 1 0 0 1 1-1H3a1 1 0 0 1 1 1v.01a1 1 0 0 1-1 1h-.01a1 1 0 0 1-1-1V10Z" clipRule="evenodd"/></svg>,
  reports:        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd"/></svg>,
  editorial:      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z"/></svg>,
};

const PUBLIC_LINKS = [
  { href: "/articles",               key: "feed",        label: "Feed",             fa: "فید مقالات"       },
  { href: "/articles/trending",      key: "trending",    label: "Trending",         fa: "پرطرفدار"         },
  { href: "/articles/latest",        key: "latest",      label: "Latest",           fa: "جدیدترین‌ها"      },
  { href: "/articles/editors-picks", key: "picks",       label: "Editor's Picks",   fa: "انتخاب سردبیر"    },
  { href: "/articles/case-studies",  key: "casestudies", label: "Case Studies",     fa: "مطالعات موردی"    },
  { href: "/articles/categories",    key: "categories",  label: "Categories",       fa: "دسته‌بندی‌ها"     },
  { href: "/articles/tags",          key: "tags",        label: "Tags",             fa: "برچسب‌ها"         },
  { href: "/articles/authors",       key: "authors",     label: "Authors",          fa: "نویسندگان"        },
];

const AUTH_LINKS = [
  { href: "/articles/write",         key: "write",       label: "Write Article",    fa: "نوشتن مقاله"      },
  { href: "/articles/my-articles",   key: "myarticles",  label: "My Articles",      fa: "مقالات من"        },
  { href: "/articles/drafts",        key: "drafts",      label: "Drafts",           fa: "پیش‌نویس‌ها"      },
  { href: "/articles/saved",         key: "saved",       label: "Saved",            fa: "ذخیره‌شده‌ها"     },
  { href: "/articles/following",     key: "following",   label: "Following",        fa: "دنبال‌شده‌ها"     },
  { href: "/articles/settings",      key: "settings",    label: "Settings",         fa: "تنظیمات"          },
];

const EDITORIAL_LINKS = [
  { href: "/articles/editor",        key: "editorial",   label: "Editorial Board",  fa: "هیئت تحریریه"     },
  { href: "/articles/submissions",   key: "reviewqueue", label: "Submissions",      fa: "ارسال‌شده‌ها"     },
  { href: "/articles/moderation",    key: "moderation",  label: "Moderation",       fa: "اعتدال محتوا"     },
  { href: "/articles/review-queue",  key: "reviewqueue", label: "Review Queue",     fa: "صف بررسی"         },
  { href: "/articles/reports",       key: "reports",     label: "Reports",          fa: "گزارش‌ها"         },
];

interface Props {
  showAuth?:      boolean;
  showEditorial?: boolean;
}

export function ArticlesNav({ showAuth = false, showEditorial = false }: Props) {
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");
  const locale   = isFa ? "fa" : "en";

  function NavLink({ l }: { l: typeof PUBLIC_LINKS[0] }) {
    const href   = `/${locale}${l.href}`;
    const exact  = l.href === "/articles";
    const active = exact ? pathname === href : pathname.startsWith(href);
    const label  = isFa ? l.fa : l.label;
    return (
      <Link
        href={href}
        className={[
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
          active
            ? "bg-signal/[0.10] text-signal border border-signal/25 font-medium"
            : "text-muted hover:text-ink hover:bg-surface3 border border-transparent",
        ].join(" ")}
      >
        <span className={active ? "text-signal" : "text-faint"}>{ICONS[l.key]}</span>
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <nav className="flex flex-col py-5 px-3">
      <div className="px-3 mb-5">
        <p className="eyebrow-mono text-signal mb-0.5">JOURNAL</p>
        <p className="text-xs text-faint leading-none">{isFa ? "ژورنال صنعتی هرمس" : "Hermes Industrial Journal"}</p>
      </div>

      <div className="flex flex-col gap-0.5">
        {PUBLIC_LINKS.map(l => <NavLink key={l.href} l={l} />)}
      </div>

      {showAuth && (
        <>
          <div className="my-3 border-t border-line/40" />
          <p className="px-3 mb-2 text-[10px] font-medium text-faint uppercase tracking-widest">
            {isFa ? "حساب کاربری" : "My Account"}
          </p>
          <div className="flex flex-col gap-0.5">
            {AUTH_LINKS.map(l => <NavLink key={l.href} l={l} />)}
          </div>
        </>
      )}

      {showEditorial && (
        <>
          <div className="my-3 border-t border-line/40" />
          <p className="px-3 mb-2 text-[10px] font-medium text-faint uppercase tracking-widest">
            {isFa ? "هیئت تحریریه" : "Editorial"}
          </p>
          <div className="flex flex-col gap-0.5">
            {EDITORIAL_LINKS.map(l => <NavLink key={l.href} l={l} />)}
          </div>
        </>
      )}
    </nav>
  );
}
