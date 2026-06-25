"use client";

import { useEffect, useState } from "react";
import type { CustomerAccount, CustomerContact } from "@/lib/customer-portal/types";

export function CustomerAccountClient() {
  const [account, setAccount]   = useState<CustomerAccount | null>(null);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [noAccount, setNoAccount] = useState(false);

  useEffect(() => {
    fetch("/api/customer/account")
      .then((r) => r.json())
      .then((d: { account?: CustomerAccount | null; contacts?: CustomerContact[]; noAccount?: boolean }) => {
        if (d.noAccount) { setNoAccount(true); return; }
        setAccount(d.account ?? null);
        setContacts(d.contacts ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-64 rounded-xl border border-line bg-surface animate-pulse" />;

  if (noAccount || !account) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center">
        <h2 className="text-lg font-bold text-ink">No Account Found</h2>
        <p className="mt-2 text-sm text-muted">Contact your account manager to set up your customer portal.</p>
      </div>
    );
  }

  const Field = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div>
      <p className="text-xs text-faint uppercase tracking-wide font-mono">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{value || "—"}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Account details */}
      <div className="rounded-xl border border-line bg-surface p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-faint">Account Details</p>
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
          <Field label="Member Since" value={account.onboardedAt ? new Date(account.onboardedAt).toLocaleDateString() : null} />
        </div>
        {account.contractStart && (
          <div className="pt-4 border-t border-line grid grid-cols-2 gap-6">
            <Field label="Contract Start" value={new Date(account.contractStart).toLocaleDateString()} />
            <Field label="Contract End"   value={account.contractEnd ? new Date(account.contractEnd).toLocaleDateString() : "Ongoing"} />
          </div>
        )}
      </div>

      {/* Contacts */}
      <div className="rounded-xl border border-line bg-surface">
        <div className="px-6 py-4 border-b border-line">
          <p className="font-mono text-xs uppercase tracking-widest text-faint">Account Contacts</p>
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
