import type { ReactNode }      from "react";
import { notFound }             from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale, getTranslations } from "next-intl/server";
import { headers }              from "next/headers";
import localFont                from "next/font/local";
import { routing, localeDirection, type Locale } from "@/i18n/routing";
import { ACTIVE_LOCALES, DEFAULT_LOCALE as DEFAULT_ACTIVE_LOCALE, LOCALE_LANG_TAG } from "@/i18n/locales";
import { CookieConsentBanner }  from "@/components/compliance/CookieConsentBanner";
import { AnalyticsProvider }    from "@/components/analytics/AnalyticsProvider";
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
// PHASE 87D — Inter (variable, OFL-1.1, vendored from @fontsource-variable/inter;
// license at src/fonts/OFL-Inter.txt). Applied per-locale: English surfaces
// re-point --font-display/--font-body to this variable in globals.css
// (html[lang^="en"]); Persian keeps Estedad/Vazirmatn untouched.
const inter = localFont({
  src: "../../fonts/Inter.woff2",
  variable: "--font-inter",
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

  const canonicalUrl  = `${BASE_URL}/${locale}`;
  // hreflang alternates — one entry per ACTIVE locale plus x-default.
  const languages: Record<string, string> = {};
  for (const loc of ACTIVE_LOCALES) {
    languages[loc] = `${BASE_URL}/${loc}`;
  }
  languages["x-default"] = `${BASE_URL}/${DEFAULT_ACTIVE_LOCALE}`;
  // OG alternate locales — the OG codes of every OTHER active locale.
  const alternateLocale = ACTIVE_LOCALES
    .filter((loc) => loc !== locale)
    .map((loc) => OG_LOCALE[loc as SeoLocale]);

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
      locale:    OG_LOCALE[locale as SeoLocale] ?? OG_LOCALE[DEFAULT_ACTIVE_LOCALE],
      alternateLocale,
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
      // eNAMAD (Iranian e-commerce trust seal) domain-ownership verification.
      // Declared here rather than in a page so it is inherited by every public
      // route: page-level metadata is built by buildMetadata(), which never
      // sets `other`, so this entry is not overridden anywhere.
      enamad: "43315120",
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

  // Capture nonce (reading headers() also forces dynamic rendering — no cache stale mismatch)
  const nonce = (await headers()).get("x-nonce") ?? "";
  // GA_MEASUREMENT_ID (no NEXT_PUBLIC_ prefix) is read from Node.js process.env at request
  // time — webpack's DefinePlugin does NOT inline non-NEXT_PUBLIC_ variables, so this works
  // correctly even when NEXT_PUBLIC_GA_MEASUREMENT_ID was absent at docker build time.
  // NEXT_PUBLIC_GA_MEASUREMENT_ID serves as a local-dev fallback (baked at build time).
  const gaId = process.env.GA_MEASUREMENT_ID ?? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

  return (
    <html lang={LOCALE_LANG_TAG[locale as Locale]} dir={dir} className={`${estedad.variable} ${vazir.variable} ${inter.variable}`}>
      <head>
        {/* Structured data — global on every page */}
        <JsonLd data={[organizationSchema(), webSiteSchema()]} />
        {/* Performance: DNS prefetch for canonical domain */}
        <link rel="dns-prefetch" href="https://hermesnovin.com" />
        {/* Favicon fallback for legacy browsers */}
        <link rel="shortcut icon" href="/favicon.ico" />
        {/* GA4 Consent Mode v2 — script always in HTML so curl/bots see it;
            defaults to denied so NO data is sent until the user grants consent. */}
        {gaId && (
          <>
            <script
              nonce={nonce}
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments)}gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});`,
              }}
            />
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
          </>
        )}
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
          <CookieConsentBanner />
          <AnalyticsProvider gaId={gaId} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
