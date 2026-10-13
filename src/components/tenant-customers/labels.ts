/**
 * Translated label sets for the customer client components, built on the
 * server from the `executive.customers` catalogue so no client bundle carries
 * a message catalogue.
 */
import type { CustomerFormLabels } from "./CustomerForm";
import type { InteractionFormLabels } from "./InteractionForm";

type T = (key: string) => string;

export function customerFormLabels(t: T, mode: "create" | "edit"): CustomerFormLabels {
  const k = (s: string) => t(`customers.${s}`);
  return {
    displayName: k("form.displayName"),
    legalName: k("form.legalName"),
    status: k("form.status"),
    statuses: { PROSPECT: k("status.PROSPECT"), ACTIVE: k("status.ACTIVE"), INACTIVE: k("status.INACTIVE") },
    email: k("form.email"),
    phone: k("form.phone"),
    city: k("form.city"),
    country: k("form.country"),
    countryHelp: k("form.countryHelp"),
    notes: k("form.notes"),
    owner: k("form.owner"),
    ownerNone: k("form.ownerNone"),
    nextActionAt: k("form.nextActionAt"),
    nextActionAtHelp: k("form.nextActionAtHelp"),
    nextActionNote: k("form.nextActionNote"),
    submit: mode === "create" ? k("form.create") : k("form.save"),
    saving: k("form.saving"),
    saved: k("form.saved"),
    conflict: k("form.conflict"),
    duplicate: k("form.duplicate"),
    ownerNotEligible: k("form.ownerNotEligible"),
    archivedLocked: k("form.archivedLocked"),
    invalid: k("form.invalid"),
    failed: k("form.failed"),
    fieldInvalid: k("form.fieldInvalid"),
    fieldTooLong: k("form.fieldTooLong"),
  };
}

export function interactionFormLabels(t: T): InteractionFormLabels {
  const k = (s: string) => t(`customers.interactions.${s}`);
  return {
    kind: k("form.kind"),
    kinds: { CALL: k("kind.CALL"), MEETING: k("kind.MEETING"), EMAIL: k("kind.EMAIL"), VISIT: k("kind.VISIT"), NOTE: k("kind.NOTE") },
    occurredAt: k("form.occurredAt"),
    summary: k("form.summary"),
    add: k("form.add"),
    adding: k("form.adding"),
    added: k("form.added"),
    future: k("form.future"),
    archived: k("form.archived"),
    failed: k("form.failed"),
  };
}
