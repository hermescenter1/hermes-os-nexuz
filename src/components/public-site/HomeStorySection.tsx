// PHASE 87D.2 — editorial industrial story section (server component).
//
// One approved local illustrative image + label + H2 + two short paragraphs +
// one existing CTA route. Compositions alternate (`reverse`) so the homepage
// avoids a repeated identical rhythm. Integrity rules:
//   • the image is an AI-generated illustrative environment — every figure
//     carries the localized "illustrative" figcaption so it is never read as
//     an actual Hermes, customer or third-party facility;
//   • all copy comes from the `publicSite.story` catalogs (fa + en, de
//     carryover) — no fabricated metrics, customers or ownership claims;
//   • images are lazy-loaded with responsive `sizes` inside a stable
//     aspect-ratio frame (no CLS, no preload, hero excluded);
//   • the only motion is a ≤2% hover scale, disabled under
//     `prefers-reduced-motion` via Tailwind's motion-reduce variant.

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ds";
// Server-safe deep import — see PublicHeader.tsx for the rationale.
import { buttonVariants } from "@/components/ds/logic";
import { PublicPageContainer } from "./PublicPageContainer";
import { PublicSection, type PublicSectionTone } from "./PublicSection";

export interface HomeStorySectionProps {
  /** Anchor id — also referenced by the hero story navigation. */
  id: string;
  /** `publicSite.story.<storyKey>` copy group. */
  storyKey: "factory" | "energy" | "intelligence";
  /** Approved local asset path under /images/home-industrial/. */
  imageSrc: string;
  /** Image on the start side by default; `reverse` flips the composition. */
  reverse?: boolean;
  tone?: PublicSectionTone;
}

export function HomeStorySection({ id, storyKey, imageSrc, reverse = false, tone }: HomeStorySectionProps) {
  const t = useTranslations(`publicSite.story.${storyKey}`);
  const tStory = useTranslations("publicSite.story");
  const href =
    storyKey === "factory" ? "/platform" :
    storyKey === "energy" ? "/architecture" : "/industrial-brain";

  return (
    <PublicSection tone={tone} aria-labelledby={`${id}-title`} className="scroll-mt-24" id={id}>
      <PublicPageContainer
        className={cn(
          "grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14",
          reverse && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]",
        )}
      >
        <figure className={cn("group min-w-0", reverse && "lg:order-2")}>
          <div className="relative overflow-hidden rounded-2xl border border-border-subtle shadow-lg shadow-black/20">
            {/* stable aspect-ratio frame — the approved assets are 1672×941 */}
            <Image
              src={imageSrc}
              alt={t("alt")}
              width={1672}
              height={941}
              sizes="(min-width: 1024px) 54vw, 100vw"
              className="h-auto w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
            {/* low-opacity cyan atmosphere — decorative only */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background-base/25 via-transparent to-brand-primary/[0.04]"
            />
          </div>
          <figcaption className="mt-2 text-caption text-text-muted" dir="auto">
            {tStory("disclosure")}
          </figcaption>
        </figure>

        <div className={cn("min-w-0", reverse && "lg:order-1")}>
          <p className="text-label-compact font-semibold uppercase tracking-[0.14em] text-brand-primary">
            {t("label")}
          </p>
          <h2 id={`${id}-title`} className="mt-3 text-role-h2 font-bold tracking-tight text-text-primary">
            {t("title")}
          </h2>
          <p className="mt-4 max-w-xl text-body-lg text-text-secondary">{t("body1")}</p>
          <p className="mt-3 max-w-xl text-body-lg text-text-secondary">{t("body2")}</p>
          <div className="mt-7">
            <Link href={href} className={cn(buttonVariants("secondary", "lg"), "min-w-44")}>
              {t("cta")}
            </Link>
          </div>
        </div>
      </PublicPageContainer>
    </PublicSection>
  );
}
