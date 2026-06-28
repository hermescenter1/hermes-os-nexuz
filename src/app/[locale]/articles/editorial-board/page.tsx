import { setRequestLocale }  from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";
import Link                   from "next/link";

export const metadata = noIndexMetadata("Editorial Board — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

function EditorialBoardContent({ isFa, locale }: { isFa: boolean; locale: string }) {
  const links = isFa ? [
    { href: `/${locale}/articles/submissions`,  label: "ارسال‌شده‌ها", desc: "مقالات ارسال‌شده برای بررسی" },
    { href: `/${locale}/articles/review-queue`, label: "صف بررسی",     desc: "مقالات در حال بررسی" },
    { href: `/${locale}/articles/moderation`,   label: "اعتدال محتوا", desc: "مدیریت همه محتوا" },
    { href: `/${locale}/articles/reports`,      label: "گزارش‌ها",     desc: "گزارش‌های کاربران" },
  ] : [
    { href: `/${locale}/articles/submissions`,  label: "Submissions",    desc: "Articles submitted for review" },
    { href: `/${locale}/articles/review-queue`, label: "Review Queue",   desc: "Articles under editorial review" },
    { href: `/${locale}/articles/moderation`,   label: "Moderation",     desc: "Manage all content" },
    { href: `/${locale}/articles/reports`,      label: "Reports",        desc: "User-submitted content reports" },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <p className="eyebrow-mono text-signal text-[10px] mb-1">
          {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
        </p>
        <h1 className="text-2xl font-bold text-ink">
          {isFa ? "هیئت تحریریه" : "Editorial Board"}
        </h1>
        <p className="text-muted text-sm mt-1">
          {isFa
            ? "مرکز مدیریت محتوا و بررسی مقالات ژورنال صنعتی هرمس"
            : "Content management center for the Hermes Industrial Journal editorial team"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {links.map(l => (
          <Link key={l.href} href={l.href}
            className="group flex flex-col gap-2 p-5 rounded-xl border border-line/60 hover:border-signal/30 bg-surface hover:bg-surface2/40 transition-all">
            <p className="text-sm font-semibold text-ink group-hover:text-signal transition-colors">{l.label}</p>
            <p className="text-xs text-muted">{l.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function EditorialBoardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";

  return (
    <RequireCapability capability="admin">
      <EditorialBoardContent isFa={isFa} locale={locale} />
    </RequireCapability>
  );
}
