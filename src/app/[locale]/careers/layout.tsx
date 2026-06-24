import { setRequestLocale } from "next-intl/server";
import type { ReactNode }   from "react";
import { PageShell }        from "@/components/PageShell";

export const metadata = {
  title: "Careers — Open Positions · Hermes OS",
  description: "Join the Hermes OS team. Browse open positions in industrial automation, engineering, and software.",
};

export default async function CareersLayout({
  children,
  params,
}: {
  children: ReactNode;
  params:   Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PageShell ambient={1}>
      <div className="mx-auto max-w-screen-xl px-6 sm:px-8 pb-20">
        {children}
      </div>
    </PageShell>
  );
}
