import { cn } from "@/components/ds";

// PHASE 87D — section heading block: optional eyebrow, one heading (h2 by
// default; the platform intro promotes it to the page h1), optional lede.
// Heading order on both pages is H1 → H2 per section (Figma a11y handoff).

export interface SectionHeaderProps {
  title: string;
  eyebrow?: string;
  lede?: string;
  /** Heading level — exactly one `h1` per page. */
  as?: "h1" | "h2";
  align?: "start" | "center";
  id?: string;
  className?: string;
}

export function SectionHeader({
  title,
  eyebrow,
  lede,
  as: Heading = "h2",
  align = "start",
  id,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? (
        <p className="text-label-compact font-semibold uppercase tracking-[0.14em] text-brand-primary">
          {eyebrow}
        </p>
      ) : null}
      <Heading
        id={id}
        className={cn(
          "font-bold tracking-tight text-text-primary",
          eyebrow && "mt-3",
          Heading === "h1" ? "text-role-h1 font-extrabold" : "text-role-h2",
        )}
      >
        {title}
      </Heading>
      {lede ? <p className="mt-4 text-body-lg text-text-secondary">{lede}</p> : null}
    </div>
  );
}
