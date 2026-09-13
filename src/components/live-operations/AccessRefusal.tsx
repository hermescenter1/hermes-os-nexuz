/**
 * PHASE 109-C-UI.2 — the refusal surfaces.
 *
 * A server component: it renders a decision that was already made, so there is
 * nothing here for the browser to run.
 *
 * Each refusal keeps its own identity. Collapsing them into one "no access"
 * screen would hide the only one that matters operationally:
 * `MEMBERSHIP_UNAVAILABLE` means the membership store could not be read, and a
 * reader who sees a generic empty page will conclude there is nothing to see.
 */

import { getTranslations } from "next-intl/server";

import { cn } from "@/components/ds/cn";

export type RefusalState =
  | "UNAUTHENTICATED"
  | "NO_ACTIVE_ORGANIZATION"
  | "MULTIPLE_ACTIVE_ORGANIZATIONS"
  | "MEMBERSHIP_UNAVAILABLE"
  | "FORBIDDEN";

/** Message-key suffix per state. Exhaustive over the union by construction. */
const MESSAGE_KEY: Readonly<Record<RefusalState, string>> = {
  UNAUTHENTICATED: "unauthenticated",
  NO_ACTIVE_ORGANIZATION: "noOrganization",
  MULTIPLE_ACTIVE_ORGANIZATIONS: "multipleOrganizations",
  MEMBERSHIP_UNAVAILABLE: "membershipUnavailable",
  FORBIDDEN: "forbidden",
};

/**
 * Which refusals are an INFRASTRUCTURE failure rather than a decision about the
 * reader. Only these carry the alarming treatment, because only these mean the
 * screen is blind rather than empty.
 */
const IS_INFRASTRUCTURE: Readonly<Record<RefusalState, boolean>> = {
  UNAUTHENTICATED: false,
  NO_ACTIVE_ORGANIZATION: false,
  MULTIPLE_ACTIVE_ORGANIZATIONS: false,
  MEMBERSHIP_UNAVAILABLE: true,
  FORBIDDEN: false,
};

export async function AccessRefusal({ state }: { state: RefusalState }) {
  const t = await getTranslations("liveOperations");
  const key = MESSAGE_KEY[state];
  const infrastructure = IS_INFRASTRUCTURE[state];

  return (
    // A <div>, not a <main>: this renders inside the route layout's AppShell,
    // which already owns `<main id="app-content">` as the skip link's target. A
    // nested main is invalid HTML and a second main landmark.
    <div
      data-live-operations-refusal={state}
      className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col justify-center px-6 py-16"
    >
      <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-cyan-200/70">
        {t("eyebrow")}
      </p>
      <h1 className="mb-4 text-2xl font-semibold text-white">{t("title")}</h1>

      <div
        className={cn(
          "rounded-lg border p-5",
          infrastructure
            ? "border-amber-300/30 bg-amber-300/[0.06]"
            : "border-white/10 bg-white/[0.02]",
        )}
      >
        <h2
          className={cn(
            "mb-2 text-sm font-semibold",
            infrastructure ? "text-amber-100" : "text-white",
          )}
        >
          {t(`refusal.${key}.heading`)}
        </h2>
        <p className="text-sm leading-relaxed text-white/70">
          {t(`refusal.${key}.body`)}
        </p>
        {infrastructure && (
          <p className="mt-3 text-sm font-medium text-amber-100/90">
            {/* The sentence that stops a blind screen from reading as an
                all-clear. It is not a hint; it is the finding. */}
            {t("refusal.membershipUnavailable.notAnAllClear")}
          </p>
        )}
      </div>
    </div>
  );
}
