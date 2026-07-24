// PHASE 94C2 — the action links on an OT list or detail page.
//
// WHAT IS DELIBERATELY ABSENT
// No delete, no disable, no restart, no key rotation, no firmware push, no
// remote command. None of those has a server handler, and a control for an
// operation the platform cannot perform is worse than a missing one — an
// operator who sees "Restart" believes the capability exists.
//
// VISIBILITY IS NOT AUTHORIZATION
// These are links, and they are shown to everyone the layout already admits.
// Whether the operator may actually create or change a record is decided by
// `manage_ot_gateway` / `manage_ot_device` on the API, and an unauthorized
// attempt renders the localized access-denied state. Hiding the link would be a
// convenience, never a boundary — and hiding it correctly would require the org
// role in the client, which this surface deliberately never has.

import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ds";

/** The shared visual treatment for a header action. */
const ACTION = cn(
  "ds-focus inline-flex min-h-11 items-center rounded-sm px-3 text-label font-semibold",
  "border border-border-default bg-surface-interactive text-text-primary",
  "hover:border-border-active transition-colors duration-fast",
);

const PRIMARY = cn(
  "ds-focus inline-flex min-h-11 items-center rounded-sm px-3 text-label font-semibold",
  "bg-brand-primary text-text-inverse hover:opacity-90 transition-opacity duration-fast",
);

/** "Register gateway" / "Register device", for a list page header. */
export function OtRegisterAction({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={PRIMARY}>
      {label}
    </Link>
  );
}

/** "Edit profile" + "Back to the list", for a detail page header. */
export function OtDetailActions({
  editHref,
  editLabel,
  listHref,
  listLabel,
}: {
  editHref: string;
  editLabel: string;
  listHref: string;
  listLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={editHref} className={PRIMARY}>
        {editLabel}
      </Link>
      <Link href={listHref} className={ACTION}>
        {listLabel}
      </Link>
    </div>
  );
}
