import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }      from "@/components/PageShell";
import { SectionHeader }  from "@/components/ui/SectionHeader";

const SECTION_ICONS: Record<string, string> = {
  sites:      "◈",
  gateways:   "⬡",
  assets:     "◉",
  telemetry:  "∿",
  connectors: "⊕",
};

export default async function IndustrialOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("industrial");
  const tFn = t as unknown as (k: string) => string;

  const sections = [
    { key: "sites",      href: "industrial/sites"      },
    { key: "gateways",   href: "industrial/gateways"   },
    { key: "assets",     href: "industrial/assets"     },
    { key: "telemetry",  href: "industrial/telemetry"  },
    { key: "connectors", href: "industrial/connectors" },
  ];

  return (
    <PageShell ambient={2}>
      <div className="mx-auto max-w-7xl px-6 pt-10">

        <SectionHeader
          eyebrow={tFn("eyebrow")}
          title={tFn("title")}
          subtitle={tFn("subtitle")}
          size="lg"
          className="mb-8"
        />

        {/* Safety banner */}
        <div
          className="mb-8 rounded-xl border px-4 py-3 glass"
          style={{
            borderColor: "rgba(232, 179, 57, 0.25)",
            background:  "rgba(232, 179, 57, 0.04)",
            boxShadow:   "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <p className="font-mono text-xs text-warn uppercase tracking-wider">
            {tFn("safetyBanner")}
          </p>
        </div>

        {/* Section grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s, i) => (
            <a
              key={s.key}
              href={s.href}
              className="group relative rounded-2xl border border-line glass glass-hover overflow-hidden"
              style={{
                animationDelay: `${i * 60}ms`,
              }}
            >
              {/* Top accent line */}
              <div
                className="absolute top-0 inset-x-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(var(--signal-rgb),0.40), transparent)",
                  opacity: 0,
                  transition: "opacity 250ms",
                }}
              />
              <div className="px-5 py-5">
                {/* Icon */}
                <div className="mb-4 flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{
                      background: "rgba(var(--signal-rgb), 0.07)",
                      border:     "1px solid rgba(var(--signal-rgb), 0.15)",
                    }}
                  >
                    <span
                      className="text-lg text-signal select-none"
                      style={{ filter: "drop-shadow(0 0 6px rgba(var(--signal-rgb),0.5))" }}
                    >
                      {SECTION_ICONS[s.key] ?? "◎"}
                    </span>
                  </div>
                  <p className="font-mono text-[0.6rem] uppercase tracking-widest text-signal/80">
                    {tFn(`${s.key}.eyebrow`)}
                  </p>
                </div>
                <p className="font-semibold text-ink group-hover:text-signal transition-colors">
                  {tFn(`${s.key}.title`)}
                </p>
                <p className="mt-1 text-sm text-muted leading-relaxed">
                  {tFn(`${s.key}.description`)}
                </p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
