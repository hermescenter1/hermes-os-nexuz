export const metadata = { title: "Engineering Hub · Hermes OS", robots: { index: false, follow: false } };

import type { ReactNode }   from "react";
import { setRequestLocale } from "next-intl/server";
import { QueryProvider }    from "@/components/providers/QueryProvider";
import { Shell }            from "@/components/engineering/Shell";
import { SectionMessages } from "@/i18n/SectionMessages";

export default async function EngineeringLayout({
  children,
  params,
}: {
  children: ReactNode;
  params:   Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <SectionMessages section="engineering">
      <QueryProvider>
        <Shell>{children}</Shell>
      </QueryProvider>
    </SectionMessages>
  );
}
