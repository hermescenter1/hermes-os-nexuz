// PHASE 87D — homepage hero (server component). Carries the page's single H1.
// PHASE 87D.2 — the illustrative product composition gave way to the approved
// command-center photograph (01-command-center-hero.webp): editorial
// two-column desktop (copy + large image ≈55%), text-first on mobile with the
// image directly below the CTA group. The photograph is `priority` (LCP), sits
// in a stable 1672×941 aspect frame (no CLS) and carries the localized
// "illustrative industrial environment" figcaption so it is never read as an
// actual Hermes or customer facility. A compact anchor-only story navigation
// links the four industrial story areas — semantic links, no client JS.
// Conversion routes stay the approved pair (/demo primary, /platform
// secondary) and the trust line keeps its truthful architecture statements.

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ds";
// Server-safe deep import — see PublicHeader.tsx for the rationale.
import { buttonVariants } from "@/components/ds/logic";
import { PublicPageContainer } from "./PublicPageContainer";
import { PublicSection } from "./PublicSection";

const STORY_ANCHORS = [
  { key: "command", href: "#story-command" },
  { key: "factory", href: "#story-factory" },
  { key: "energy", href: "#story-energy" },
  { key: "intelligence", href: "#story-intelligence" },
] as const;

export function PublicHero() {
  const t = useTranslations("publicSite.hero");
  const tStory = useTranslations("publicSite.story");

  return (
    <PublicSection tone="deep" id="story-command" className="relative scroll-mt-24 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-border-subtle) 1px, transparent 1px), " +
            "linear-gradient(90deg, var(--color-border-subtle) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 80% 70% at 35% 25%, black, transparent)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 35% 25%, black, transparent)",
        }}
      />
      <PublicPageContainer className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-14">
        <div className="min-w-0">
          <p className="text-label-compact font-semibold uppercase tracking-[0.14em] text-brand-primary">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 text-role-h1 font-extrabold tracking-tight text-text-primary md:text-display">
            {t("headlineA")}
            <br />
            {t("headlineB")}
          </h1>
          <p className="mt-5 max-w-xl text-body-lg text-text-secondary">{t("lede")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/demo" className={cn(buttonVariants("primary", "lg"), "sm:min-w-44")}>
              {t("requestDemo")}
            </Link>
            <Link href="/platform" className={cn(buttonVariants("secondary", "lg"), "sm:min-w-44")}>
              {t("explorePlatform")}
            </Link>
          </div>
          <p className="mt-6 text-caption text-text-muted" dir="auto">
            {t("trustLine")}
          </p>
        </div>

        <figure className="min-w-0">
          <div className="relative overflow-hidden rounded-2xl border border-border-subtle shadow-xl shadow-black/25">
            {/* stable 1672×941 aspect frame — priority: this is the LCP image */}
            <Image
              src="/images/home-industrial/01-command-center-hero.webp"
              alt={tStory("hero.alt")}
              width={1672}
              height={941}
              priority
              sizes="(min-width: 1024px) 56vw, 100vw"
              className="h-auto w-full object-cover"
            />
            {/* soft transition into the deep background + faint cyan air —
                decorative, kept far below the point of washing out the photo */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background-deep/30 via-transparent to-brand-primary/[0.05]"
            />
          </div>
          <figcaption className="mt-2 text-caption text-text-muted" dir="auto">
            {tStory("disclosure")}
          </figcaption>
        </figure>
      </PublicPageContainer>

      {/* compact story navigation — anchors only, no carousel state */}
      <PublicPageContainer className="relative mt-10">
        <nav aria-label={tStory("nav.label")}>
          <ul className="flex flex-wrap gap-2">
            {STORY_ANCHORS.map(({ key, href }) => (
              <li key={key}>
                <a
                  href={href}
                  className="inline-flex min-h-11 items-center rounded-full border border-border-subtle bg-surface-primary/60 px-4 text-body-compact text-text-secondary transition-colors hover:border-brand-primary/40 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary motion-reduce:transition-none"
                >
                  {tStory(`nav.${key}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </PublicPageContainer>
    </PublicSection>
  );
}
