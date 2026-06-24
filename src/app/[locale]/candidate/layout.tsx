import { setRequestLocale } from "next-intl/server";
import type { ReactNode }   from "react";
import { PageShell }        from "@/components/PageShell";

export const metadata = {
  title: "Candidate Portal · Hermes OS",
  robots: { index: false, follow: false },
};

export default async function CandidateLayout({
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
      <div className="mx-auto max-w-screen-xl px-6 sm:px-8 pb-20">
        {children}
      </div>
    </PageShell>
  );
}
