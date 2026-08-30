import { setRequestLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { OperationsSubNav } from "@/components/operations/OperationsSubNav";

export const metadata = {
  title: "Global Operations Command Center — Hermes Intelligence Network",
  robots: { index: false, follow: false },
};

/**
 * PHASE 104-I.D2 — Operations family shell.
 *
 * TWO CORRECTIONS, both forced by Gate A's contract rather than by taste:
 *
 * 1. The header text was hard-coded English. Every string on it rendered in
 *    English under /de and /fa, inside an RTL document.
 *
 * 2. This layout used to own the only `<h1>` on the page, so all five
 *    operations routes announced themselves as "Operations Command Center".
 *    A layout cannot know which child it is wrapping, so the heading has moved
 *    to the pages, which do. This band is now the FAMILY locator (eyebrow +
 *    context) and each page supplies the one heading that names it.
 */
export default async function OperationsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard.operations");

  return (
    <AppShell>
      <div className="mx-auto max-w-screen-2xl px-4 pb-20 sm:px-8">
        {/*
          Family locator band — deliberately no <h1>; the page owns that.

          Composed from utilities rather than `.page-header-premium`, which
          spends a fixed 2rem/1.75rem padding plus a 2rem margin — about 92px of
          chrome before any content. At 320x568 that pushed the alarm posture and
          the severity filters below the fold, so the first thing an engineer saw
          on a phone was a paragraph of context rather than the state of the
          estate. The band shrinks on small viewports and keeps its full presence
          from `sm` up.

          Gate A.1 3B: the two-line clamp that once compacted this copy is GONE.
          Operational context is not decoration — an engineer reading "site
          posture, alarm investigation, engineering..." learns less than one who
          reads the sentence. It wraps in full at every width.
        */}
        <div className="mb-4 border-b border-line pb-4 pt-5 sm:mb-8 sm:pb-7 sm:pt-8">
          <p className="eyebrow-label mb-1.5 sm:mb-2">{t("family.eyebrow")}</p>
          <p className="max-w-3xl text-xs leading-relaxed text-muted sm:text-sm">
            {t("family.description")}
          </p>
        </div>

        <OperationsSubNav />

        {children}
      </div>
    </AppShell>
  );
}
