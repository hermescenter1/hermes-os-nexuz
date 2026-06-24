import type { ReactNode }      from "react";
import { notFound }             from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale, getTranslations } from "next-intl/server";
import { headers }              from "next/headers";
import localFont                from "next/font/local";
import { routing, localeDirection, type Locale } from "@/i18n/routing";
import { CookieConsentBanner }  from "@/components/compliance/CookieConsentBanner";
import { JsonLd }               from "@/components/seo/JsonLd";
import { organizationSchema, webSiteSchema } from "@/lib/seo/schemas";
import { BASE_URL, SITE_NAME, OG_IMAGE_URL, TWITTER_HANDLE, OG_LOCALE, type SeoLocale } from "@/lib/seo/config";
import "../globals.css";

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
  const t  = await getTranslations({ locale, namespace: "meta" });
  const title       = t("title");
  const description = t("description");
  const keywords    = t.raw("keywords") as string | undefined;

  const altLocale     = locale === "fa" ? "en_US" : "fa_IR";
  const canonicalUrl  = `${BASE_URL}/${locale}`;
  const languages: Record<string, string> = {
    fa:          `${BASE_URL}/fa`,
    en:          `${BASE_URL}/en`,
    "x-default": `${BASE_URL}/fa`,
  };

  return {
    metadataBase: new URL(BASE_URL),
    title: {
      default:  title,
      template: `%s | ${SITE_NAME}`,
    },
    description,
    ...(keywords ? { keywords } : {}),
    authors:   [{ name: "Hermes Novin", url: BASE_URL }],
    creator:   "Hermes Novin",
    publisher: SITE_NAME,
    category:  "Industrial AI Platform",
    alternates: {
      canonical: canonicalUrl,
      languages,
    },
    robots: {
      index:  true,
      follow: true,
      googleBot: {
        index:              true,
        follow:             true,
        "max-image-preview": "large",
        "max-snippet":       -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      title,
      description,
      url:       canonicalUrl,
      siteName:  SITE_NAME,
      locale:    OG_LOCALE[locale as SeoLocale] ?? "en_US",
      alternateLocale: [altLocale],
      type:      "website",
      images: [
        {
          url:    OG_IMAGE_URL,
          width:  1200,
          height: 630,
          alt:    title,
        },
      ],
    },
    twitter: {
      card:    "summary_large_image",
      title,
      description,
      site:    TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
      images:  [OG_IMAGE_URL],
    },
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
        { url: "/favicon.ico", sizes: "48x48" },
      ],
      apple:   { url: "/favicon.svg", type: "image/svg+xml" },
      shortcut: "/favicon.ico",
    },
    manifest: "/manifest.webmanifest",
    other: {
      "mobile-web-app-capable":        "yes",
      "apple-mobile-web-app-capable":  "yes",
      "apple-mobile-web-app-status-bar-style": "black-translucent",
      "theme-color": "#050816",
      "msapplication-TileColor": "#050816",
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params:   Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();
  const dir      = localeDirection[locale as Locale];

  void (await headers()).get("x-nonce");

  return (
    <html lang={locale} dir={dir} className={`${estedad.variable} ${vazir.variable}`}>
      <head>
        {/* Structured data — global on every page */}
        <JsonLd data={[organizationSchema(), webSiteSchema()]} />
        {/* Performance: DNS prefetch for canonical domain */}
        <link rel="dns-prefetch" href="https://hermesnovin.com" />
        {/* Favicon fallback for legacy browsers */}
        <link rel="shortcut icon" href="/favicon.ico" />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
          <CookieConsentBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
