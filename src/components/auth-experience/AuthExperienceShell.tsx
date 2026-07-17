// PHASE 87E — canonical premium authentication shell (async Server Component).
//
// One centered, elevated auth panel over a restrained obsidian industrial
// background, with an optional desktop capability panel. Built entirely on the
// 87B design-system tokens and consistent with Homepage / Platform / AppShell.
// No PublicHeader, no AppShell, no duplicate navigation — auth pages stay
// visually focused. The single <h1> is the page title inside the panel; the
// capability panel uses non-heading copy so heading order stays clean.

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ds";
import { HermesLogoMark } from "@/components/HermesLogo";

export interface AuthExperienceShellProps {
  /** The page's single H1. */
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Cross-link row rendered under the panel (sign-in/register/etc.). */
  footer?: ReactNode;
  /** Show the desktop supporting capability panel (default true). */
  capabilityPanel?: boolean;
}

const CAPABILITY_KEYS = ["tenant", "rbac", "audit", "deploy"] as const;

export function AuthExperienceShell({
  title,
  subtitle,
  children,
  footer,
  capabilityPanel = true,
}: AuthExperienceShellProps) {
  const t = useTranslations("authExperience");
  // Trust line lives in the (frozen) auth namespace, already corrected to drop
  // the unsupported SOC 2 claim — read, never mutate.
  const a = useTranslations("auth");

  return (
    <div className="relative min-h-screen bg-background-deep lg:grid lg:grid-cols-2">
      {/* Restrained industrial grid — decorative. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.25]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-border-subtle) 1px, transparent 1px), " +
            "linear-gradient(90deg, var(--color-border-subtle) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black, transparent)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black, transparent)",
        }}
      />

      {/* Desktop capability panel — no heading (keeps one H1 + clean order). */}
      {capabilityPanel ? (
        <aside
          aria-label={t("panelAriaLabel")}
          className="relative z-10 hidden flex-col justify-center border-e border-border-subtle px-14 py-16 lg:flex"
        >
          <p className="max-w-md text-role-h3 font-bold tracking-tight text-text-primary">
            {t("positioningTitle")}
          </p>
          <p className="mt-4 max-w-md text-body text-text-secondary">{t("positioningLede")}</p>
          <ul className="mt-8 flex max-w-md flex-col gap-3">
            {CAPABILITY_KEYS.map((key) => (
              <li key={key} className="flex items-center gap-3">
                <span aria-hidden="true" className="text-brand-primary">◈</span>
                <span className="text-body-compact font-medium text-text-secondary" dir="auto">
                  {t(`capabilities.${key}`)}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {/* Form column — always visible (mobile-safe). */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-14">
        <Link
          href="/"
          aria-label={t("backToSite")}
          dir="ltr"
          className="ds-focus mb-8 flex items-center gap-2.5 rounded-sm"
        >
          <HermesLogoMark />
          <span className="text-title font-extrabold tracking-tight text-text-primary">
            Hermes <span className="text-brand-primary">OS</span>
          </span>
        </Link>

        <main
          className={cn(
            "relative w-full max-w-[26rem] rounded-lg border border-border-default",
            "bg-surface-elevated p-7 shadow-e3 sm:p-9",
          )}
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-9 top-0 h-px rounded-full"
            style={{ background: "linear-gradient(90deg, transparent, var(--color-brand-border), transparent)" }}
          />
          <h1 className="text-center text-role-h3 font-bold tracking-tight text-text-primary">{title}</h1>
          {subtitle ? (
            <p className="mt-2 text-center text-body-compact text-text-secondary">{subtitle}</p>
          ) : null}
          <div className={subtitle ? "mt-7" : "mt-7"}>{children}</div>
        </main>

        {footer ? (
          <div className="mt-6 text-center text-body-compact text-text-secondary">{footer}</div>
        ) : null}

        <p className="mt-8 text-center text-caption text-text-muted" dir="auto">
          {a("trustLine")}
        </p>
      </div>
    </div>
  );
}
