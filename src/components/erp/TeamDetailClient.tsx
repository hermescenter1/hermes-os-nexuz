"use client";

import { useState } from "react";
import Link                          from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ErpTeamDetailView, MemberCandidate } from "@/lib/erp/db";
import type { ErpTeamMember } from "@/lib/erp/types";
import type { ChildPage } from "@/lib/erp/pagination";
import { LoadMore, usePagedItems } from "./ErpPagedList";

type Person = { userId: string; name: string | null; email: string | null };

/** A member is shown by name, then email, and only then by the raw user id. */
const label = (p: Person): string => p.name ?? p.email ?? p.userId;

/**
 * Team detail with member management. Members are paged from the server and show
 * their name. Managers (manage_erp) can search active organization members, add one
 * with a fresh Idempotency-Key, and remove a member after an explicit confirmation.
 * The server enforces the same permission and tenant rules on every request.
 */
export function TeamDetailClient({ team, canManage }: { team: ErpTeamDetailView; canManage: boolean }) {
  const locale = useLocale();
  const t      = useTranslations("enterpriseOperations");
  const members = usePagedItems(team.members, `/api/erp/teams/${team.id}/members`);
  const [memberCount, setMemberCount] = useState(team.memberCount);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const [term, setTerm] = useState("");
  const [searchedTerm, setSearchedTerm] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MemberCandidate[]>([]);
  const [candidateCursor, setCandidateCursor] = useState<string | null>(null);
  const [candidatesHasMore, setCandidatesHasMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);

  async function fetchCandidates(search: string, cursor: string | null): Promise<ChildPage<MemberCandidate>> {
    const url = new URL(`/api/erp/teams/${team.id}/member-candidates`, "http://localhost");
    if (search) url.searchParams.set("q", search);
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(`${url.pathname}${url.search}`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("candidates refused");
    return (await res.json()) as ChildPage<MemberCandidate>;
  }

  async function search() {
    const next = term.trim();
    setSearching(true);
    setPickerError(null);
    try {
      const page = await fetchCandidates(next, null);
      setSearchedTerm(next);
      setCandidates(page.items);
      setCandidateCursor(page.nextCursor);
      setCandidatesHasMore(page.hasMore);
    } catch {
      setPickerError(t("teams.searchFailed"));
    } finally {
      setSearching(false);
    }
  }

  async function loadMoreCandidates() {
    if (!candidateCursor || searching || searchedTerm === null) return;
    setSearching(true);
    try {
      const page = await fetchCandidates(searchedTerm, candidateCursor);
      setCandidates(prev => [...prev, ...page.items]);
      setCandidateCursor(page.nextCursor);
      setCandidatesHasMore(page.hasMore);
    } catch {
      setPickerError(t("lists.loadFailed"));
    } finally {
      setSearching(false);
    }
  }

  async function addMember(c: MemberCandidate) {
    if (adding) return;
    setAdding(c.userId);
    setPickerError(null);
    try {
      const res = await fetch(`/api/erp/teams/${team.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ userId: c.userId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const added = (await res.json()) as ErpTeamMember;
      members.setItems(prev => [...prev, { ...added, name: c.name, email: c.email }]);
      setMemberCount(n => n + 1);
      setCandidates(prev => prev.filter(x => x.userId !== c.userId));
    } catch {
      setPickerError(t("teams.addFailed"));
    } finally {
      setAdding(null);
    }
  }

  async function removeMember(m: ErpTeamMember) {
    if (removing) return;
    setRemoving(m.userId);
    setActionError(null);
    try {
      const res = await fetch(`/api/erp/teams/${team.id}/members/${encodeURIComponent(m.userId)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(String(res.status));
      members.setItems(prev => prev.filter(x => x.userId !== m.userId));
      setMemberCount(n => Math.max(0, n - 1));
      setPendingRemoval(null);
    } catch {
      setActionError(t("teams.removeFailed"));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{team.name}</h1>
      {team.description && <p className="text-muted-foreground">{team.description}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">{t("teams.members")}</div>
          <div className="font-bold text-2xl">{memberCount}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">{t("teams.capacity")}</div>
          <div className="font-bold text-2xl">{team.capacity ?? "—"}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold mb-4">{t("teams.members")}</h3>
        {actionError && <p role="alert" className="text-xs text-red-400 mb-2">{actionError}</p>}
        {members.items.length === 0 && <p className="text-sm text-muted-foreground">{t("teams.noMembers")}</p>}
        {members.items.map(m => (
          <div key={m.userId} className="flex items-center justify-between gap-3 text-sm py-2 border-b last:border-0">
            <div className="min-w-0">
              <div className="truncate">{label(m)}</div>
              {m.name && m.email && <div className="text-xs text-muted-foreground truncate">{m.email}</div>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-muted-foreground capitalize text-xs">{m.role?.toLowerCase() ?? t("teams.memberRoleFallback")}</span>
              {canManage && pendingRemoval !== m.userId && (
                <button
                  type="button"
                  onClick={() => setPendingRemoval(m.userId)}
                  className="text-xs px-2 py-1 border rounded-md hover:bg-accent"
                >
                  {t("teams.removeAction")}
                </button>
              )}
              {canManage && pendingRemoval === m.userId && (
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span>{t("teams.removeConfirm", { name: label(m) })}</span>
                  <button
                    type="button"
                    disabled={removing !== null}
                    onClick={() => removeMember(m)}
                    className="px-2 py-1 border rounded-md text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {t("teams.confirmRemove")}
                  </button>
                  <button type="button" onClick={() => setPendingRemoval(null)} className="px-2 py-1 border rounded-md hover:bg-accent">
                    {t("teams.cancel")}
                  </button>
                </span>
              )}
            </div>
          </div>
        ))}
        <div className="mt-3">
          <LoadMore hasMore={members.hasMore} busy={members.busy} failed={members.failed} onLoad={members.loadMore} />
        </div>
      </div>

      {canManage && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold">{t("teams.addMember")}</h3>
          <form
            onSubmit={e => { e.preventDefault(); search(); }}
            className="flex gap-2"
          >
            <input
              type="search"
              value={term}
              maxLength={100}
              onChange={e => setTerm(e.target.value)}
              placeholder={t("teams.searchPlaceholder")}
              aria-label={t("teams.searchPlaceholder")}
              className="flex-1 min-w-0 rounded-md border bg-background px-2 py-1 text-sm"
            />
            <button
              type="submit"
              disabled={searching}
              className="text-xs px-3 py-1.5 border rounded-md hover:bg-accent disabled:opacity-50"
            >
              {t("teams.searchAction")}
            </button>
          </form>
          {pickerError && <p role="alert" className="text-xs text-red-400">{pickerError}</p>}
          {searchedTerm !== null && !searching && candidates.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("teams.noCandidates")}</p>
          )}
          {candidates.map(c => (
            <div key={c.userId} className="flex items-center justify-between gap-3 text-sm py-1">
              <div className="min-w-0">
                <div className="truncate">{label(c)}</div>
                {c.name && c.email && <div className="text-xs text-muted-foreground truncate">{c.email}</div>}
              </div>
              <button
                type="button"
                disabled={adding !== null}
                onClick={() => addMember(c)}
                className="text-xs px-2 py-1 border rounded-md hover:bg-accent disabled:opacity-50"
              >
                {t("teams.addAction")}
              </button>
            </div>
          ))}
          <LoadMore hasMore={candidatesHasMore} busy={searching} failed={false} onLoad={loadMoreCandidates} />
        </div>
      )}

      <Link href={`/${locale}/erp/teams`} className="text-sm px-3 py-1.5 border rounded-md hover:bg-accent inline-block">
        {t("teams.backToTeams")}
      </Link>
    </div>
  );
}
