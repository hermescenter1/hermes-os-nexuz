import { setRequestLocale, getTranslations } from "next-intl/server";
import { PublicPageShell } from "@/components/public-site";
import { PageIntro }    from "@/components/PageIntro";
import { ContactForm }  from "./ContactForm";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({
    locale,
    path: "/contact",
    title:       p.contact.title,
    description: p.contact.description,
    keywords:    p.contact.keywords,
  });
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contact");

  const contactCards = [
    {
      title: t("salesTitle"),
      desc: t("salesDesc"),
      email: t("salesEmail"),
      icon: "💼",
    },
    {
      title: t("supportTitle"),
      desc: t("supportDesc"),
      email: t("supportEmail"),
      icon: "⚙️",
    },
    {
      title: t("generalTitle"),
      desc: t("generalDesc"),
      email: t("generalEmail"),
      icon: "✉️",
    },
  ];

  return (
    <PublicPageShell>
      <PageIntro
        eyebrow={t("eyebrow")}
        title={t("title")}
        lede={t("lede")}
      />

      {/* Contact cards */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-5 sm:grid-cols-3">
          {contactCards.map((card) => (
            <div
              key={card.title}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6"
            >
              <span className="text-2xl">{card.icon}</span>
              <h3 className="font-display text-base font-semibold text-ink">{card.title}</h3>
              <p className="font-body text-sm leading-relaxed text-muted">{card.desc}</p>
              <a
                href={`mailto:${card.email}`}
                className="mt-auto break-all font-mono text-xs text-signal hover:underline"
              >
                {card.email}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Locations, social + form */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl grid gap-12 px-6 py-14 lg:grid-cols-[1fr_1.6fr]">
          {/* Left: phones, locations, social */}
          <div className="flex flex-col gap-8">
            <div>
              <p className="mb-4 font-mono text-xs uppercase tracking-widest text-signal">
                {t("phoneTitle")}
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <span className="text-sm">🇮🇷</span>
                  <a
                    href="tel:+989134116492"
                    className="font-mono text-sm text-muted transition-colors hover:text-signal"
                  >
                    {t("phoneIran")}
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-sm">🇬🇧</span>
                  <a
                    href="tel:+447960545833"
                    className="font-mono text-sm text-muted transition-colors hover:text-signal"
                  >
                    {t("phoneUK")}
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-4 font-mono text-xs uppercase tracking-widest text-signal">
                {t("locationTitle")}
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <span className="text-sm">🇮🇷</span>
                  <span className="font-body text-sm text-muted">{t("locationIran")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-sm">🇬🇧</span>
                  <span className="font-body text-sm text-muted">{t("locationUK")}</span>
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-4 font-mono text-xs uppercase tracking-widest text-signal">
                {t("socialTitle")}
              </p>
              <ul className="space-y-2">
                <li>
                  <a
                    href={t("linkedinUrl")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-sm text-muted transition-colors hover:text-signal"
                  >
                    {t("linkedinLabel")} →
                  </a>
                </li>
                <li>
                  <a
                    href={t("githubUrl")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-sm text-muted transition-colors hover:text-signal"
                  >
                    {t("githubLabel")} →
                  </a>
                </li>
                <li>
                  <a
                    href={t("websiteUrl")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-sm text-muted transition-colors hover:text-signal"
                  >
                    {t("websiteLabel")} →
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Right: contact form (client component) */}
          <ContactForm />
        </div>
      </section>
    </PublicPageShell>
  );
}
