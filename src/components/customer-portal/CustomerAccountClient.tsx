"use client";

// PHASE 107 STAGE 6-A — "No Account Found" is now reserved for the API actually
// saying so. It previously also appeared when the request failed, which told a
// paying customer their account did not exist. `noAccount` remains the API's own
// signal and keeps its own wording; endpoint and payload shape are unchanged.

import { useLocale } from "next-intl";
import type { CustomerAccount, CustomerContact } from "@/lib/customer-portal/types";
import { formatDate } from "@/lib/i18n/format";
import { ResourceFailureNotice } from "@/components/ui/ResourceFailureNotice";
import { useResource } from "@/lib/client/use-resource";
import { requestJson } from "@/lib/client/resource-request";

interface AccountPayload {
  account: CustomerAccount | null;
  contacts: CustomerContact[];
  noAccount: boolean;
}

export function CustomerAccountClient() {
  const locale = useLocale();

  const accountState = useResource<AccountPayload>(
    (signal) => requestJson(
      "/api/customer/account",
      (body) => {
        const d = body as {
          account?: CustomerAccount | null;
          contacts?: CustomerContact[];
          noAccount?: boolean;
        };
        // Neither key present means this is not the account envelope at all.
        if (d.account === undefined && d.noAccount === undefined) return undefined;

        /*
         * PHASE 107 FINAL — `contacts` is required in the shape that has an
         * account, and legitimately absent in the shape that does not.
         *
         * The route (src/app/api/customer/account/route.ts) answers exactly:
         *     { account: null, noAccount: true }   — no portal account, no contacts key
         *     { account, contacts }                — both always present
         *
         * `contacts ?? []` treated those two as one, so a truncated or
         * regressed account response rendered a confident "no contacts" for a
         * customer who may well have them. Proving `account` says nothing about
         * `contacts`; each field needs its own proof, which is what the
         * order-sensitive selector audit now requires.
         */
        if (d.noAccount) {
          return { account: d.account ?? null, contacts: [], noAccount: true };
        }
        if (d.contacts === undefined) return undefined;
        return {
          account: d.account ?? null,
          contacts: d.contacts,
          noAccount: false,
        };
      },
      { signal },
    ),
    [],
    { isEmpty: (v) => v.noAccount || v.account === null },
  );

  if (accountState.status === "LOADING") {
    return <div data-async-state="loading" className="h-64 rounded-xl border border-line bg-surface animate-pulse" />;
  }

  if (accountState.status === "ERROR" && accountState.failure) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <ResourceFailureNotice code={accountState.failure} onRetry={accountState.retry} />
      </div>
    );
  }

  const account = accountState.data?.account ?? null;
  const contacts = accountState.data?.contacts ?? [];

  if (!account) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center">
        <h2 className="text-lg font-bold text-ink">No Account Found</h2>
        <p className="mt-2 text-sm text-muted">Contact your account manager to set up your customer portal.</p>
      </div>
    );
  }

  const Field = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div>
      <p className="text-xs text-metadata uppercase tracking-wide font-mono">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{value || "—"}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Account details */}
      <div className="rounded-xl border border-line bg-surface p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-metadata">Account Details</p>
            <h2 className="mt-1 text-lg font-bold text-ink">{account.displayName}</h2>
          </div>
          <span className={`rounded border px-3 py-1 text-xs font-mono font-semibold ${
            account.status === "ACTIVE"
              ? "border-signal/30 bg-signal/10 text-signal"
              : "border-amber-400/30 bg-amber-400/10 text-amber-400"
          }`}>{account.status}</span>
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <Field label="Account #"  value={account.accountNumber} />
          <Field label="Industry"   value={account.industry} />
          <Field label="Region"     value={account.region} />
          <Field label="Tier"       value={account.tier} />
          <Field label="Health"     value={account.healthScore ? `${Math.round(account.healthScore)}%` : null} />
          <Field label="Member Since" value={account.onboardedAt ? formatDate(account.onboardedAt, locale) : null} />
        </div>
        {account.contractStart && (
          <div className="pt-4 border-t border-line grid grid-cols-2 gap-6">
            <Field label="Contract Start" value={formatDate(account.contractStart, locale)} />
            <Field label="Contract End"   value={account.contractEnd ? formatDate(account.contractEnd, locale) : "Ongoing"} />
          </div>
        )}
      </div>

      {/* Contacts */}
      <div className="rounded-xl border border-line bg-surface">
        <div className="px-6 py-4 border-b border-line">
          <p className="font-mono text-xs uppercase tracking-widest text-metadata">Account Contacts</p>
        </div>
        {contacts.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted">No contacts on file.</div>
        ) : (
          <ul className="divide-y divide-line">
            {contacts.map((c) => (
              <li key={c.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink">{c.fullName}</p>
                  <p className="text-xs text-muted">{c.email}{c.title ? ` · ${c.title}` : ""}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {c.isPrimary   && <span className="rounded border border-signal/30 bg-signal/10 px-2 py-0.5 text-[10px] font-mono text-signal">Primary</span>}
                  {c.isBilling   && <span className="rounded border border-ice/30 bg-ice/10 px-2 py-0.5 text-[10px] font-mono text-ice">Billing</span>}
                  {c.isTechnical && <span className="rounded border border-line px-2 py-0.5 text-[10px] font-mono text-muted">Technical</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
