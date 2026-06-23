import Image from "next/image";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");

  const pillars = [
    { title: t("pillar1Title"), desc: t("pillar1Desc"), icon: "01" },
    { title: t("pillar2Title"), desc: t("pillar2Desc"), icon: "02" },
    { title: t("pillar3Title"), desc: t("pillar3Desc"), icon: "03" },
    { title: t("pillar4Title"), desc: t("pillar4Desc"), icon: "04" },
  ];

  return (
    <PageShell>
      <PageIntro
        eyebrow={t("eyebrow")}
        title={t("title")}
        lede={t("lede")}
      />

      {/* Company overview */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-2">
          {/* Company card */}
          <div className="rounded-2xl border border-line bg-surface p-8">
            <p className="font-mono text-xs uppercase tracking-widest text-signal mb-4">
              {t("companyEyebrow")}
            </p>
            <h2 className="font-display text-2xl font-bold text-ink mb-3">
              {t("companyTitle")}
            </h2>
            <p className="font-body text-sm leading-relaxed text-muted mb-6">
              {t("companyDesc")}
            </p>
            <div className="space-y-2 border-t border-line pt-5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-signal/70">WEB</span>
                <span className="font-body text-sm text-muted">{t("website")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-signal/70">🇮🇷</span>
                <span className="font-body text-sm text-muted">{t("locationIran")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-signal/70">🇬🇧</span>
                <span className="font-body text-sm text-muted">{t("locationUK")}</span>
              </div>
            </div>
          </div>

          {/* Mission card */}
          <div className="rounded-2xl border border-signalDim bg-surface p-8"
            style={{ background: "linear-gradient(135deg, rgba(0,229,255,0.04) 0%, transparent 60%)" }}>
            <p className="font-mono text-xs uppercase tracking-widest text-signal mb-4">
              {t("missionEyebrow")}
            </p>
            <h2 className="font-display text-2xl font-bold text-ink mb-3">
              {t("missionTitle")}
            </h2>
            <p className="font-body text-sm leading-relaxed text-muted">
              {t("missionDesc")}
            </p>
          </div>
        </div>
      </section>

      {/* Founder section */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="font-mono text-xs uppercase tracking-widest text-signal mb-10">
            {t("founderEyebrow")}
          </p>
          <div className="grid gap-10 lg:grid-cols-[auto_1fr]">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3 lg:items-start">
              <Image
                src="/brand/founder.jpg"
                alt="Hamid Reza Forozandeh — Founder, CEO & Chief Industrial Systems Architect"
                width={192}
                height={192}
                className="h-24 w-24 rounded-2xl object-cover border border-signalDim"
                style={{ boxShadow: "0 0 20px rgba(0,229,255,0.08)" }}
              />
              <p className="font-display text-base font-bold text-ink">{t("founderName")}</p>
              <p className="font-body text-xs text-signal/80 text-center lg:text-start">{t("founderRole")}</p>
            </div>

            {/* Bio */}
            <div className="space-y-4">
              <p className="font-body text-sm leading-relaxed text-muted">{t("founderBio1")}</p>
              <p className="font-body text-sm leading-relaxed text-muted">{t("founderBio2")}</p>
              <p className="font-body text-sm leading-relaxed text-muted">{t("founderBio3")}</p>
              <div className="mt-5 rounded-xl border border-line bg-bg px-5 py-4">
                <p className="font-mono text-xs text-signal/70 leading-relaxed">
                  {t("founderExpertise")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Technology pillars */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="font-mono text-xs uppercase tracking-widest text-signal mb-3">
            {t("pillarsEyebrow")}
          </p>
          <h2 className="font-display text-3xl font-bold text-ink mb-10">
            {t("pillarsTitle")}
          </h2>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
            {pillars.map((p) => (
              <div key={p.icon} className="bg-surface p-6">
                <div className="mb-3 font-mono text-xs text-signal/50">{p.icon}</div>
                <h3 className="font-display text-base font-semibold text-ink mb-2">{p.title}</h3>
                <p className="font-body text-sm leading-relaxed text-muted">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA row */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-14 flex flex-col items-center gap-5 text-center">
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/contact"
              className="rounded-xl border border-signal bg-signal/10 px-6 py-3 font-mono text-sm text-signal transition-colors hover:bg-signal/15"
            >
              {t("ctaContact")}
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-line bg-surface px-6 py-3 font-mono text-sm text-muted transition-colors hover:text-ink"
            >
              {t("ctaPlatform")}
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
