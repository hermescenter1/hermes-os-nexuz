import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { routing, localeDirection, type Locale } from "@/i18n/routing";
import "../globals.css";

// Self-hosted fonts (variable). Air-gapped / on-prem safe — no external
// font dependency at build or runtime. Both OFL-licensed (see src/fonts/).
// Estedad: display face for headings & large metrics (geometric, technical).
// Vazirmatn: body face (best Persian body readability).
const estedad = localFont({
  src: "../../fonts/Estedad.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "100 900",
});
const vazir = localFont({
  src: "../../fonts/Vazirmatn.woff2",
  variable: "--font-body",
  display: "swap",
  weight: "100 900",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = localeDirection[locale as Locale];

  // Reading headers() activates request context so Next.js can inject the
  // per-request CSP nonce into RSC streaming inline scripts (Phase 45)
  void (await headers()).get("x-nonce");

  return (
    <html lang={locale} dir={dir} className={`${estedad.variable} ${vazir.variable}`}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
