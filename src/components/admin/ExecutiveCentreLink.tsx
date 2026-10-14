import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { resolveExecutiveScope } from "@/lib/executive/scope";

/**
 * The audit console's pointer to the Executive Management Centre.
 *
 * WHY THIS EXISTS. Observed in production on 2026-10-14: `/fa/admin` is the
 * audit console, the management centre built this season lives at
 * `/fa/dashboard/executive`, and nothing joined them. An authorized reader had
 * no way to find the centre except by being told the URL — which, from the
 * owner's seat, is indistinguishable from the centre not existing.
 *
 * WHY IT CALLS THE REAL GATE. The link is shown only to a reader the executive
 * gate would actually admit, and the only honest way to know that is to ask
 * the gate: `resolveExecutiveScope()`, the same function the page and the API
 * route call. Re-implementing the condition here — "platform admin plus some
 * role" — would be a second copy of an authorization rule, which is how the
 * two drift apart and how one of them ends up wrong.
 *
 * It therefore WIDENS NOTHING. A reader who follows the link sees exactly what
 * the gate already decided they may see, and a reader the gate would refuse is
 * never shown a link that leads to a refusal.
 *
 * It renders nothing at all on refusal — no greyed-out entry, no "you do not
 * have access" — because the audit console should not advertise a surface its
 * reader cannot use, and because the refusal CODE can itself be informative
 * (`ACTIVE_ORGANIZATION_REQUIRED` tells a reader an organization exists to
 * choose). The centre's own page states the reason when someone goes there.
 */
export async function ExecutiveCentreLink({ locale }: { locale: string }) {
  const resolved = await resolveExecutiveScope();
  if (!resolved.ok) return null;

  // The copy lives in the EXECUTIVE namespace: `admin` is a closed 87L wave
  // with a pinned leaf count and a pinned German title, and this link is a
  // piece of the executive centre reaching back into the console.
  const t = await getTranslations("executive");

  return (
    <nav
      aria-label={t("adminBridge.ariaLabel")}
      className="mb-6 rounded-xl border border-line bg-surface-glass px-5 py-4"
    >
      <p className="text-sm text-text-primary">{t("adminBridge.lede")}</p>
      <Link
        href="/dashboard/executive"
        locale={locale as "fa" | "en" | "de"}
        className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-signal underline underline-offset-4"
      >
        {t("adminBridge.cta")}
        <span aria-hidden="true">→</span>
      </Link>
    </nav>
  );
}
