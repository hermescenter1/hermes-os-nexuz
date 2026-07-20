"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale }                   from "next-intl";
import { GlassCard }                         from "@/components/ui/GlassCard";
import { DashboardPanel }                    from "@/components/ui/DashboardPanel";
import { ALL_SCOPES, SCOPE_LABELS }          from "@/lib/api/scopes";
import type { ApiKeyRecord, RateLimitState } from "@/lib/api/types";
import { formatDate, formatNumber } from "@/lib/i18n/format";

// ── Sub-components ────────────────────────────────────────────────────────────

function KeyStatusBadge({ apiKey }: { apiKey: ApiKeyRecord }) {
  if (apiKey.revokedAt) {
    return <span className="text-xs px-2 py-0.5 rounded-full border border-red-400/30 text-red-400 bg-red-400/10">Revoked</span>;
  }
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return <span className="text-xs px-2 py-0.5 rounded-full border border-amber-400/30 text-amber-400 bg-amber-400/10">Expired</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full border border-signal/30 text-signal bg-signal/10">Active</span>;
}

function ScopeChip({ scope }: { scope: string }) {
  const isAdmin = scope === "admin";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border ${
      isAdmin
        ? "border-amber-400/40 text-amber-400 bg-amber-400/10"
        : "border-line text-muted bg-surface"
    }`}>
      {scope}
    </span>
  );
}

// ── Copy-once raw key modal ───────────────────────────────────────────────────

function RawKeyModal({ rawKey, onDismiss }: { rawKey: string; onDismiss: () => void }) {
  const t = useTranslations("apiPlatform");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <GlassCard className="w-full max-w-lg p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-amber-400 text-xl">⚠</span>
          <div>
            <h2 className="text-lg font-bold text-ink">
              {(t as unknown as (k: string) => string)("rawKey.title")}
            </h2>
            <p className="text-sm text-muted mt-1">
              {(t as unknown as (k: string) => string)("rawKey.warning")}
            </p>
          </div>
        </div>

        <div className="relative">
          <code className="block text-xs font-mono text-signal bg-black/30 border border-signal/20 rounded p-3 break-all select-all">
            {rawKey}
          </code>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => void copy()}
            className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
              copied
                ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                : "bg-signal text-black hover:bg-signal/80"
            }`}
          >
            {copied
              ? (t as unknown as (k: string) => string)("rawKey.copied")
              : (t as unknown as (k: string) => string)("rawKey.copy")}
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 py-2 rounded text-sm border border-line text-muted hover:text-ink transition-colors"
          >
            {(t as unknown as (k: string) => string)("rawKey.done")}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

// ── Create key form ───────────────────────────────────────────────────────────

interface CreateFormProps {
  onCreated: (rawKey: string) => void;
  onCancel:  () => void;
}

function CreateKeyForm({ onCreated, onCancel }: CreateFormProps) {
  const t = useTranslations("apiPlatform");
  const [name, setName]       = useState("");
  const [scopes, setScopes]   = useState<string[]>([]);
  const [expires, setExpires] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  function toggleScope(s: string) {
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  async function submit() {
    if (!name.trim()) { setError("Name is required"); return; }
    if (scopes.length === 0) { setError("Select at least one scope"); return; }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/keys", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: name.trim(), scopes, expiresAt: expires || undefined }),
      });
      const data = await res.json() as { key?: { rawKey: string }; error?: string };
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      if (data.key?.rawKey) onCreated(data.key.rawKey);
    } finally { setCreating(false); }
  }

  return (
    <GlassCard className="p-4 space-y-4 mb-4">
      <h3 className="text-sm font-semibold text-ink">
        {(t as unknown as (k: string) => string)("keys.createTitle")}
      </h3>

      {error && (
        <div className="p-2 rounded bg-red-400/10 border border-red-400/30 text-xs text-red-400">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs text-muted mb-1">
          {(t as unknown as (k: string) => string)("keys.name")}
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Production SCADA Integration"
          className="w-full px-3 py-2 rounded bg-surface border border-line text-ink text-sm focus:border-signal outline-none"
        />
      </div>

      <div>
        <label className="block text-xs text-muted mb-2">
          {(t as unknown as (k: string) => string)("keys.scopes")}
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_SCOPES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleScope(s)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                scopes.includes(s)
                  ? "border-signal text-signal bg-signal/10"
                  : "border-line text-muted hover:border-signal/50"
              }`}
            >
              {SCOPE_LABELS[s] ?? s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted mb-1">
          {(t as unknown as (k: string) => string)("keys.expiresAt")} ({(t as unknown as (k: string) => string)("optional")})
        </label>
        <input
          type="date"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
          className="w-full px-3 py-2 rounded bg-surface border border-line text-ink text-sm focus:border-signal outline-none"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => void submit()}
          disabled={creating}
          className="px-4 py-2 rounded bg-signal text-black text-sm font-medium hover:bg-signal/80 disabled:opacity-50 transition-colors"
        >
          {creating
            ? (t as unknown as (k: string) => string)("creating")
            : (t as unknown as (k: string) => string)("keys.create")}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded border border-line text-sm text-muted hover:text-ink transition-colors"
        >
          {(t as unknown as (k: string) => string)("cancel")}
        </button>
      </div>
    </GlassCard>
  );
}

// ── Rate limit bar ────────────────────────────────────────────────────────────

function RateLimitBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const locale = useLocale();
  const pct     = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const color   = pct >= 100 ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-signal";
  return (
    <div>
      <div className="flex justify-between text-xs text-muted mb-1">
        <span>{label}</span>
        <span className={pct >= 100 ? "text-red-400" : ""}>
          {formatNumber(used, locale)} / {formatNumber(limit, locale)}
        </span>
      </div>
      <div className="h-1.5 bg-line/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export function ApiKeysDashboard() {
  const locale = useLocale();
  const t = useTranslations("apiPlatform");
  const [keys, setKeys]           = useState<ApiKeyRecord[]>([]);
  const [rl, setRl]               = useState<RateLimitState | null>(null);
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [rawKey, setRawKey]       = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [revoking, setRevoking]   = useState<string | null>(null);
  const [rotating, setRotating]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keysRes, rlRes] = await Promise.all([
        fetch("/api/platform/keys"),
        fetch("/api/platform/rate-limits"),
      ]);
      if (keysRes.ok) {
        const d = await keysRes.json() as { keys: ApiKeyRecord[] };
        setKeys(d.keys);
      }
      if (rlRes.ok) {
        const d = await rlRes.json() as { rateLimit: RateLimitState };
        setRl(d.rateLimit);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function revoke(id: string) {
    if (!confirm((t as unknown as (k: string) => string)("keys.confirmRevoke"))) return;
    setRevoking(id);
    setError(null);
    const res = await fetch(`/api/platform/keys/${id}`, { method: "DELETE" });
    const d   = await res.json() as { error?: string };
    if (!res.ok) setError(d.error ?? "Revoke failed");
    setRevoking(null);
    void load();
  }

  async function rotate(id: string) {
    if (!confirm((t as unknown as (k: string) => string)("keys.confirmRotate"))) return;
    setRotating(id);
    setError(null);
    const res = await fetch(`/api/platform/keys/${id}/rotate`, { method: "POST" });
    const d   = await res.json() as { key?: { rawKey: string }; error?: string };
    if (!res.ok) { setError(d.error ?? "Rotate failed"); setRotating(null); return; }
    if (d.key?.rawKey) setRawKey(d.key.rawKey);
    setRotating(null);
    void load();
  }

  function handleCreated(key: string) {
    setShowCreate(false);
    setRawKey(key);
    void load();
  }

  if (loading) {
    return (
      <DashboardPanel title="">
        <p className="text-muted text-sm">{(t as unknown as (k: string) => string)("loading")}</p>
      </DashboardPanel>
    );
  }

  return (
    <>
      {rawKey && (
        <RawKeyModal rawKey={rawKey} onDismiss={() => setRawKey(null)} />
      )}

      <div className="space-y-6">
        {/* Rate Limits */}
        {rl && (
          <DashboardPanel title={(t as unknown as (k: string) => string)("rateLimit.title")}>
            <div className="space-y-4">
              <RateLimitBar
                label={(t as unknown as (k: string) => string)("rateLimit.perMinute")}
                used={rl.usedThisMinute}
                limit={rl.limitPerMinute}
              />
              <RateLimitBar
                label={(t as unknown as (k: string) => string)("rateLimit.perDay")}
                used={rl.usedToday}
                limit={rl.limitPerDay}
              />
              {rl.exceeded && (
                <div className="p-2 rounded bg-red-400/10 border border-red-400/30 text-xs text-red-400">
                  {(t as unknown as (k: string) => string)("rateLimit.exceeded")}
                </div>
              )}
            </div>
          </DashboardPanel>
        )}

        {/* API Keys */}
        <DashboardPanel title={(t as unknown as (k: string) => string)("keys.title")}>
          {error && (
            <div className="mb-4 p-3 rounded bg-red-400/10 border border-red-400/30 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end mb-4">
            {!showCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="px-3 py-1.5 rounded bg-signal/10 border border-signal/30 text-signal text-sm hover:bg-signal/20 transition-colors"
              >
                {(t as unknown as (k: string) => string)("keys.new")}
              </button>
            )}
          </div>

          {showCreate && (
            <CreateKeyForm
              onCreated={handleCreated}
              onCancel={() => setShowCreate(false)}
            />
          )}

          {keys.length === 0 ? (
            <p className="text-sm text-muted">
              {(t as unknown as (k: string) => string)("keys.empty")}
            </p>
          ) : (
            <div className="space-y-3">
              {keys.map((k) => (
                <GlassCard key={k.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-ink">{k.name}</span>
                        <KeyStatusBadge apiKey={k} />
                      </div>

                      {/* Display: prefix + ... + last4 */}
                      <code className="text-xs font-mono text-muted">
                        hk_{k.prefix}…{k.last4}
                      </code>

                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((s) => <ScopeChip key={s} scope={s} />)}
                      </div>

                      <div className="flex gap-4 text-xs text-muted">
                        <span>
                          {(t as unknown as (k: string) => string)("keys.created")}{" "}
                          {formatDate(k.createdAt, locale)}
                        </span>
                        {k.lastUsedAt && (
                          <span>
                            {(t as unknown as (k: string) => string)("keys.lastUsed")}{" "}
                            {formatDate(k.lastUsedAt, locale)}
                          </span>
                        )}
                        {k.expiresAt && (
                          <span>
                            {(t as unknown as (k: string) => string)("keys.expires")}{" "}
                            {formatDate(k.expiresAt, locale)}
                          </span>
                        )}
                      </div>
                    </div>

                    {!k.revokedAt && (
                      <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                        <button
                          onClick={() => void rotate(k.id)}
                          disabled={rotating === k.id}
                          className="text-xs px-2 py-1 rounded border border-signal/30 text-signal hover:bg-signal/10 disabled:opacity-50 transition-colors"
                        >
                          {rotating === k.id
                            ? "…"
                            : (t as unknown as (k: string) => string)("keys.rotate")}
                        </button>
                        <button
                          onClick={() => void revoke(k.id)}
                          disabled={revoking === k.id}
                          className="text-xs px-2 py-1 rounded border border-red-400/30 text-red-400 hover:bg-red-400/10 disabled:opacity-50 transition-colors"
                        >
                          {revoking === k.id
                            ? "…"
                            : (t as unknown as (k: string) => string)("keys.revoke")}
                        </button>
                      </div>
                    )}
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </DashboardPanel>
      </div>
    </>
  );
}
