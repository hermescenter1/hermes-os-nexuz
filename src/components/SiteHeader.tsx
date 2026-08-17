import { getTranslations } from "next-intl/server";
import { Link }            from "@/i18n/navigation";
import { LanguageSwitch }  from "./LanguageSwitch";
import { SiteNav }         from "./SiteNav";
import { AuthIndicator }   from "./auth/AuthIndicator";
import { HermesLogoMark }  from "./HermesLogo";
import { NotificationCenter } from "./NotificationCenter";
// AUTH-U1 — canonical identity facade (JWT first, legacy HMAC fallback).
// Read-only consumer: the resolved role only filters which nav links render.
// Middleware remains the authorization boundary, so this is a display concern.
import { getCurrentUserUnified } from "@/lib/auth/current-user";
import type { Role }       from "@/lib/auth/roles";

export async function SiteHeader() {
  const b = await getTranslations("brand");

  // Canonical platform role resolved server-side from the session, so admin nav
  // links are filtered before render (never fetched from a client endpoint).
  let role: Role | null = null;
  try {
    role = (await getCurrentUserUnified())?.role ?? null;
  } catch { /* unauthenticated or auth not configured */ }

  return (
    <header
      className="sticky top-0 z-20 border-b border-line/60"
      style={{
        background: "rgba(7, 9, 13, 0.88)",
        backdropFilter: "blur(24px) saturate(1.3)",
        WebkitBackdropFilter: "blur(24px) saturate(1.3)",
        boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.03), 0 1px 0 rgba(0,0,0,0.4)",
      }}
    >
      {/* PHASE 104-H — `px-4` below `sm`, `px-6` from `sm` (the AppTopbar rhythm).
          Owner decision A: the full SiteNav renders only from 1600px, and at that
          width the row cap widens from `max-w-6xl` (1152) to `max-w-screen-2xl`
          (1536) — the next standard step above the measured German intrinsic full
          row (1373px incl. gutters) — leaving a 163px safety margin. Below 1600
          the row keeps its 1152 cap with the compact navigation. */}
      <div className="relative mx-auto flex max-w-6xl items-center px-4 py-3.5 sm:px-6 min-[1600px]:max-w-screen-2xl">

        {/* Subtle top accent line */}
        <div
          className="absolute top-0 inset-x-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)",
          }}
          aria-hidden="true"
        />

        {/* Logo */}
        {/* PHASE 104-H — the legacy shell's mobile overflow: this logo block was
            `shrink-0` at 177–189px (wordmark + tagline) and, beside the hamburger,
            bell and language switch, could not fit a 320px row (measured: 395–408
            document width on a 320 viewport in en/de). The tagline is decorative —
            the accessible name is the aria-label — so it is hidden below `md`,
            and the link becomes a 44px-tall target.
            Owner decision B (compact-brand precedent of the authenticated
            AppTopbar): below `sm` only the textual wordmark hides; the H emblem
            stays visible, the link keeps its full accessible name and a 44×44
            target (`min-h-11 min-w-11`). One rule for every locale; logical
            positioning only. */}
        <Link
          href="/"
          className="group flex min-h-11 min-w-11 shrink-0 items-center justify-center leading-none"
          aria-label="Hermes OS — home"
        >
          <span className="flex items-center gap-2.5" dir="ltr">
            <HermesLogoMark className="h-8 w-8 shrink-0" />
            <span className="hidden flex-col sm:flex">
              <span className="font-display text-[1.05rem] font-bold tracking-tight leading-none">
                <span className="text-ink">Hermes</span>
                <span className="text-signal"> OS</span>
              </span>
              <span className="hidden font-body text-[0.58rem] font-medium leading-none text-muted/60 mt-0.5 md:block">
                {b("tagline")}
              </span>
            </span>
          </span>
        </Link>

        {/* Nav + action cluster */}
        <div className="ms-auto flex items-center gap-3">
          <SiteNav role={role} />
          {/* decorative divider between the FULL nav and the actions — same
              boundary as the full nav (decision A) so it never appears beside the
              hamburger. */}
          <div
            className="hidden h-5 w-px shrink-0 bg-line/40 min-[1600px]:block"
            aria-hidden="true"
          />
          <div className="flex shrink-0 items-center gap-2">
            <AuthIndicator />
            {/* PHASE 104-H — same scoped 44px hit-target wrapper the app-shell
                adapter uses (`.hermes-topbar-bell` in globals.css); the shared
                NotificationCenter and its fetch/SSE behaviour are untouched. */}
            <span className="hermes-topbar-bell inline-flex">
              <NotificationCenter />
            </span>
            <LanguageSwitch />
          </div>
        </div>

      </div>
    </header>
  );
}
