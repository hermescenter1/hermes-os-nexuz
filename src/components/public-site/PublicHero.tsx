// PHASE 87D — homepage hero (server component). Carries the page's single H1.
// PHASE 87D.2 — the approved command-center photograph (01-command-center-hero
// .webp), `priority` (LCP), in a stable 1672×941 aspect frame (no CLS), with
// the localized "illustrative industrial environment" figcaption so it is never
// read as an actual Hermes or customer facility. A compact anchor-only story
// navigation links the four industrial story areas — semantic links, no client
// JS. Conversion routes stay the approved pair (/demo primary, /platform
// secondary).
//
// PHASE 104-E — RECOMPOSED for the homepage reference surface.
//
// The 87D.2 hero was a conventional editorial two-column: copy left, photo
// right, CTA group, a trust sentence, a chip row. Correct, and completely
// generic — it is the hero on every enterprise SaaS homepage. The owner's
// verdict was that the product still looked like a template, and this was the
// first thing a visitor saw.
//
// What changed, structurally:
//   · Hermes Horizon now renders BEHIND the hero and is actually visible
//     (`.hh-horizon` — same ember tokens, same 22% band ratio, same mandatory
//     vignette; the vignette simply opens in the centre instead of washing the
//     whole frame). Horizon stays atmosphere-only: pointer-inert, aria-hidden,
//     and no foreground element takes an ember token.
//   · The photograph sits in a drafted instrument frame with corner ticks and
//     a signal path that ties the headline column to it, so the two columns
//     read as one drawing rather than two unrelated blocks.
//   · The trust line sits on a rule with a Beacon tick instead of floating as
//     grey text under the buttons.
//   · The story navigation became a labelled index bar with ordinals.
//
// Every 87D.2 invariant is preserved deliberately: single H1, priority hero
// image at 1672×941 with responsive `sizes`, the illustrative figcaption, the
// /demo + /platform pair, `id="story-command"`, and the four keyboard-focusable
// ≥44px story anchors. No client island, no animation library, no fetch.

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
    <PublicSection
      tone="deep"
      id="story-command"
      padding="none"
      className="relative scroll-mt-24 overflow-hidden pb-14 pt-12 md:pb-20 md:pt-16"
    >
      {/* The deep field — atmospheric only, behind every content layer.
          Deliberately NOT the Horizon signature: Horizon is permitted on
          login / workspace-home / video-watch only, and a single-consumer gate
          enforces it. See `.hh-deepfield` in globals.css. */}
      <div aria-hidden="true" className="hh-deepfield" />

      {/* The engineering plate: a drafting coordinate field, masked so it never
          competes with the headline.

          This is the hero's ONLY CSS background layer, and the 87D.2 gate
          counts that by matching the property name against the raw source —
          prose included. Naming the property in a comment makes the count 2
          and fails the gate, so it is deliberately not written out here. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-border-subtle) 1px, transparent 1px), " +
            "linear-gradient(90deg, var(--color-border-subtle) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 85% 75% at 30% 20%, black, transparent)",
          WebkitMaskImage: "radial-gradient(ellipse 85% 75% at 30% 20%, black, transparent)",
        }}
      />

      <PublicPageContainer className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="font-mono text-label-compact font-semibold tracking-[0.2em] text-brand-primary"
            >
              01
            </span>
            <span
              aria-hidden="true"
              className="h-px w-10 shrink-0"
              style={{ background: "var(--edge-structural)" }}
            />
            <p
              dir="auto"
              className="text-label-compact font-semibold uppercase tracking-[0.14em] text-brand-primary"
            >
              {t("eyebrow")}
            </p>
          </div>

          <h1
            dir="auto"
            className="mt-6 text-role-h1 font-extrabold tracking-tight text-text-primary md:text-display"
          >
            {t("headlineA")}
            <br />
            <span className="text-brand-primary">{t("headlineB")}</span>
          </h1>

          <p dir="auto" className="mt-6 max-w-xl text-body-lg text-text-secondary">
            {t("lede")}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/demo" className={cn(buttonVariants("primary", "lg"), "sm:min-w-44")}>
              {t("requestDemo")}
            </Link>
            <Link href="/platform" className={cn(buttonVariants("secondary", "lg"), "sm:min-w-44")}>
              {t("explorePlatform")}
            </Link>
          </div>

          {/* The trust statements, on a rule rather than as loose grey text.
              Rendered as ONE string, deliberately: the 87D runtime test asserts
              the hero states the full architecture line verbatim (it replaced a
              mock certification claim, so the exact wording is the point).
              Splitting it into cells drops the separators from `textContent`
              and silently defeats that check, so the treatment is typographic
              rather than structural. */}
          <p
            dir="auto"
            className="mt-10 flex items-start gap-3 border-t pt-4 text-caption text-text-secondary"
            style={{ borderColor: "var(--edge-structural)" }}
          >
            <span
              aria-hidden="true"
              className="mt-2 block h-px w-6 shrink-0"
              style={{ background: "var(--beacon-core)", opacity: 0.5 }}
            />
            <span className="min-w-0">{t("trustLine")}</span>
          </p>
        </div>

        <figure className="relative min-w-0">
          {/* Drafted instrument frame: corner ticks + a signal path entering
              from the copy column. Decorative, so hidden from AT. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute -inset-3 z-10 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)]"
            role="presentation"
          >
            <path className="hh-signal-track" d="M0 6 L0 0 L8 0" vectorEffect="non-scaling-stroke" />
            <path className="hh-signal-track" d="M92 0 L100 0 L100 6" vectorEffect="non-scaling-stroke" />
            <path className="hh-signal-track" d="M0 94 L0 100 L8 100" vectorEffect="non-scaling-stroke" />
            <path className="hh-signal-track" d="M92 100 L100 100 L100 94" vectorEffect="non-scaling-stroke" />
          </svg>

          <div
            className="relative overflow-hidden rounded-lg"
            style={{ border: "var(--edge-width) solid var(--edge-hairline)" }}
          >
            {/* stable 1672×941 aspect frame — priority: this is the LCP image */}
            <Image
              src="/images/home-industrial/01-command-center-hero.webp"
              alt={tStory("hero.alt")}
              width={1672}
              height={941}
              priority
              sizes="(min-width: 1024px) 52vw, 100vw"
              className="h-auto w-full object-cover"
            />
            {/* Seats the photograph into the deep background. Deliberately far
                below the point of washing the image out. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background-deep/40 via-transparent to-transparent"
            />
          </div>
          <figcaption dir="auto" className="mt-3 text-caption text-text-muted">
            {tStory("disclosure")}
          </figcaption>
        </figure>
      </PublicPageContainer>

      {/* Story index bar — anchors only, no carousel state. */}
      <PublicPageContainer className="relative mt-14">
        <nav aria-label={tStory("nav.label")}>
          <ul
            className="grid border-t sm:grid-cols-2 lg:grid-cols-4"
            style={{ borderColor: "var(--edge-structural)" }}
          >
            {STORY_ANCHORS.map(({ key, href }, i) => (
              <li key={key} className="flex min-w-0 items-center gap-3 lg:px-4 lg:first:ps-0">
                {/* The ordinal is a sheet mark, NOT part of the link. Keeping
                    it outside the anchor keeps the accessible name of each
                    story link exactly the catalog label — a decorative span
                    inside the anchor would prepend "01" to it. */}
                <span
                  aria-hidden="true"
                  className="font-mono text-caption tracking-[0.18em] text-text-muted"
                >
                  {`0${i + 1}`}
                </span>
                <a
                  href={href}
                  dir="auto"
                  className="ds-focus flex min-h-11 min-w-0 flex-1 items-center py-4 text-body-compact text-text-secondary transition-colors hover:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary motion-reduce:transition-none"
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
