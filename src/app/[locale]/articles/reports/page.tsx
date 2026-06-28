import { setRequestLocale }  from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Content Reports — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

function ReportsContent({ isFa }: { isFa: boolean }) {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="eyebrow-mono text-signal text-[10px] mb-1">
          {isFa ? "ژورنال صنعتی هرمس — هیئت تحریریه" : "HERMES INDUSTRIAL JOURNAL — EDITORIAL"}
        </p>
        <h1 className="text-2xl font-bold text-ink">
          {isFa ? "گزارش‌های محتوا" : "Content Reports"}
        </h1>
        <p className="text-muted text-sm mt-1">
          {isFa ? "گزارش‌های محتوای نامناسب توسط کاربران" : "User-submitted content reports for review"}
        </p>
      </div>
      <div className="text-center py-20 border border-line/40 rounded-xl">
        <p className="text-muted text-sm">
          {isFa ? "گزارش فعالی برای بررسی وجود ندارد" : "No active reports to review"}
        </p>
      </div>
    </div>
  );
}

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";

  return (
    <RequireCapability capability="admin">
      <ReportsContent isFa={isFa} />
    </RequireCapability>
  );
}
