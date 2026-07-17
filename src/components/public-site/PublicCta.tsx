// PHASE 87D — conversion band (server component). One title, one primary CTA.
// The only conversion routes on the public site are the approved pair; this
// component takes the label/target so both pages reuse it (/demo everywhere).

import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ds";
// Server-safe deep import — see PublicHeader.tsx for the rationale.
import { buttonVariants } from "@/components/ds/logic";
import { PublicPageContainer } from "./PublicPageContainer";
import { PublicSection } from "./PublicSection";

export interface PublicCtaProps {
  title: string;
  ctaLabel: string;
  href: string;
}

export function PublicCta({ title, ctaLabel, href }: PublicCtaProps) {
  return (
    <PublicSection tone="raised">
      <PublicPageContainer className="flex flex-col items-center gap-7 text-center">
        <h2 className="max-w-3xl text-role-h2 font-bold tracking-tight text-text-primary">{title}</h2>
        <Link href={href} className={cn(buttonVariants("primary", "lg"), "min-w-44")}>
          {ctaLabel}
        </Link>
      </PublicPageContainer>
    </PublicSection>
  );
}
