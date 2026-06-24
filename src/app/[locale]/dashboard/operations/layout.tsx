import { setRequestLocale } from "next-intl/server";
import type { ReactNode }   from "react";
import { PageShell }        from "@/components/PageShell";
import { OperationsSubNav } from "@/components/operations/OperationsSubNav";

export const metadata = {
  title: "Global Operations Command Center — Hermes Intelligence Network",
  robots: { index: false, follow: false },
};

export default async function OperationsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params:   Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PageShell ambient={2}>
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 pb-20">

        {/* Command header */}
        <div className="page-header-premium">
          <p className="eyebrow-label mb-2">
            HERMES INTELLIGENCE NETWORK · GLOBAL OPERATIONS CENTER
          </p>
          <h1 className="type-page-title">Operations Command Center</h1>
          <p className="mt-2 type-secondary max-w-3xl">
            Enterprise-wide industrial intelligence · Real-time vendor zone monitoring ·
            Alert command · Engineering knowledge · Executive war room
          </p>
        </div>

        {/* Sub-navigation */}
        <OperationsSubNav />

        {/* Page content injected here */}
        {children}
      </div>
    </PageShell>
  );
}
