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
}: {
  capability: Capability;
  children: React.ReactNode;
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
        <div className="mx-auto max-w-3xl px-6">
          <Link
            href="/login"
            className="inline-block rounded-lg bg-signal px-5 py-2.5 font-body text-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            {t("login")}
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
