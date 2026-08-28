"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ResourceFailureNotice } from "@/components/ui/ResourceFailureNotice";
import { requestJson, ResourceRequestError, type ResourceFailureCode } from "@/lib/client/resource-request";
import { parsePublicJobCards, type PublicJobCard } from "./public-job-contract";

/*
 * B1.3 §2 — the card contract and its EXACT validation live in
 * ./public-job-contract. No salary on a card (compensation is a detail-page
 * fact); `department` is the STABLE filter value and `departmentLabel` is
 * the only department string a person ever sees. ONE malformed card
 * invalidates the whole response — a partially-good list is not a list.
 */

/** B1.2 — the explicit async-state union (same contract as the detail page). */
type BoardState =
  | { phase: "loading" }
  | { phase: "ready"; jobs: PublicJobCard[] }
  | { phase: "failed"; code: ResourceFailureCode };

export function CareersBoardClient() {
  const t = useTranslations("careers");
  const locale = useLocale();
  const [state, setState] = useState<BoardState>({ phase: "loading" });
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    // Any dependency change first RETURNS TO LOADING, so stale results — or a
    // stale language — can never survive a failed follow-up request.
    setState({ phase: "loading" });
    const controller = new AbortController();
    const p = new URLSearchParams();
    p.set("locale", locale);
    if (dept) p.set("department", dept);
    if (search) p.set("search", search);
    (async () => {
      try {
        const payload = await requestJson<{ jobs?: unknown; source?: string }>(
          `/api/careers/jobs?${p}`,
          (body) => (body && typeof body === "object" ? (body as { jobs?: unknown; source?: string }) : undefined),
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (payload.source !== "db") {
          setState({ phase: "failed", code: "FAILED" });
          return;
        }
        const jobs = parsePublicJobCards(payload);
        setState(jobs ? { phase: "ready", jobs } : { phase: "failed", code: "FAILED" });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        const code: ResourceFailureCode =
          error instanceof ResourceRequestError ? error.code : "FAILED";
        // the LIST has no per-id enumeration concern: a 404 here is still an
        // outage-class failure, never an invented empty board
        setState({ phase: "failed", code });
      }
    })();
    return () => controller.abort();
  }, [search, dept, locale, attempt]);

  const jobs = state.phase === "ready" ? state.jobs : [];
  // value = stable department code; label = the locale's translation
  const departments = [...new Map(jobs.map((j) => [j.department, j.departmentLabel])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  return (
    <div>
      {/* Hero */}
      <div className="page-header-premium">
        <p className="eyebrow-label mb-2">HERMES OS · CAREERS</p>
        <h1 className="type-page-title">{t("boardTitle")}</h1>
        <p className="mt-2 type-secondary max-w-2xl">
          {t("boardLede")}
        </p>
      </div>

      {/* Filters — shown while a successful list is on screen */}
      {state.phase === "ready" && (jobs.length > 0 || search || dept) && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 min-h-11 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-signal"
          />
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            aria-label={t("allDepartments")}
            className="rounded-lg border border-line bg-surface px-3 py-2.5 min-h-11 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal sm:w-64"
          >
            <option value="">{t("allDepartments")}</option>
            {departments.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* KPI strip — only for a non-empty successful list */}
      {state.phase === "ready" && jobs.length > 0 && (
        <div className="global-ops-strip mb-8">
          <div className="global-ops-cell">
            <span className="kpi-label">{t("openRolesLabel")}</span>
            <span className="intel-kpi-value">{jobs.length}</span>
          </div>
          <div className="global-ops-cell">
            <span className="kpi-label">{t("departmentsLabel")}</span>
            <span className="intel-kpi-value">{departments.length}</span>
          </div>
          <div className="global-ops-cell">
            <span className="kpi-label">{t("globalOfficesLabel")}</span>
            <span className="intel-kpi-value">
              {[...new Set(jobs.map((j) => j.location))].length}
            </span>
          </div>
        </div>
      )}

      {/* The four async states, kept apart on purpose (B1.2 §2):
          loading / outage (with retry) / genuine empty / results. A 503 or a
          dead connection NEVER wears the empty-board clothes. */}
      {state.phase === "loading" ? (
        <div className="py-20 text-center text-muted text-sm">
          {t("loading")}
        </div>
      ) : state.phase === "failed" ? (
        <div className="py-12">
          <ResourceFailureNotice code={state.code} onRetry={retry} />
        </div>
      ) : jobs.length === 0 ? (
        <div className="py-20 text-center text-muted text-sm">
          {t("noResults")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A single job card — every visible string is locale-true. */
function JobCard({
  job,
  t,
}: {
  job: PublicJobCard;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Link
      href={`/careers/${job.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 transition hover:border-signal/40 hover:bg-surface/80"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-mono text-sm font-semibold text-ink group-hover:text-signal transition-colors leading-snug">
          {job.title}
        </h2>
        {/* B1.2 §7 — the badge is the LOCALIZED department label; the stable
            English code is a filter value, never display copy */}
        <span className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide bg-signal/10 text-signal">
          {job.departmentLabel}
        </span>
      </div>

      <p className="text-xs text-muted leading-relaxed line-clamp-2">{job.shortSummary}</p>

      <div className="flex flex-wrap gap-1.5">
        {(Array.isArray(job.skills) ? job.skills : []).slice(0, 3).map((s) => (
          <span
            key={s}
            className="rounded-md bg-bg px-2 py-0.5 text-[10px] font-mono text-muted border border-line"
          >
            {s}
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between text-xs text-muted font-mono">
        <span>{job.location}</span>
      </div>

      {/* B1.4 §1 — the card promises exactly what the click does: it opens the
          posting. It said "View and apply" while the server refused every
          application, so the word "apply" is gone from the card entirely —
          not hidden behind a flag, because a job card never submits anything
          and has no business advertising an apply journey either way. */}
      <div className="pt-2 border-t border-line">
        <span className="text-xs text-signal font-mono group-hover:underline">
          {t("viewDetails")} →
        </span>
      </div>
    </Link>
  );
}
