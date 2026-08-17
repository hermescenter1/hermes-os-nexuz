import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/auth/config";
import { can, type Capability } from "@/lib/auth/roles";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";

/**
 * Server-side route guard (Phase 12A).
 *
 * Renders one of four states, none of which crash:
 *  - auth not configured  → setup-required message (public pages unaffected)
 *  - not signed in        → sign-in prompt with a link to /login
 *  - role lacks capability → access-restricted message
 *  - authorized           → the protected children
 */
export async function RequireCapability({
  capability,
  children,
  returnTo,
}: {
  capability: Capability;
  children: React.ReactNode;
  /**
   * Locale-prefixed internal path to come back to after signing in, e.g.
   * "/fa/articles/write". Optional and defaulted-off so the six existing
   * call sites are unaffected; the login surface re-validates the value with
   * `safeLocaleReturnPath` regardless of what is passed here.
   */
  returnTo?: string;
}) {
  const t = await getTranslations("auth");

  if (!isAuthConfigured()) {
    return (
      <PageShell>
        <PageIntro eyebrow="Hermes OS" title={t("setupRequiredTitle")} lede={t("setupRequired")} />
      </PageShell>
    );
  }

  const user = await getCurrentUser();

  if (!user) {
    return (
      <PageShell>
        <PageIntro eyebrow="Hermes OS" title={t("loginRequiredTitle")} lede={t("loginRequired")} />
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-6">
          <Link
            href={returnTo ? `/login?from=${encodeURIComponent(returnTo)}` : "/login"}
            className="inline-block rounded-lg bg-signal px-5 py-2.5 font-body text-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            {t("login")}
          </Link>
          {/* A visitor with no account at all needs the other half of the
              journey. Account creation is the reviewed access-request flow
              (Phase 81A), so this points there rather than at a self-serve
              signup that deliberately does not exist. */}
          <Link
            href="/auth/register"
            className="inline-block rounded-lg border border-line/60 px-5 py-2.5 font-body text-sm font-semibold text-muted transition-colors hover:border-signal/40 hover:text-ink"
          >
            {t("requestAccessTitle")}
          </Link>
        </div>
      </PageShell>
    );
  }

  if (!can(user.role, capability)) {
    return (
      <PageShell>
        <PageIntro eyebrow="Hermes OS" title={t("deniedTitle")} lede={t("denied")} />
      </PageShell>
    );
  }

  return <>{children}</>;
}
