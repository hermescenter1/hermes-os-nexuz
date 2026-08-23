"use client";

/**
 * PHASE 107 STAGE 6-A — one explicit state machine for a fetched resource.
 *
 * The components this replaces held a boolean `loading` and a nullable payload,
 * which cannot express the difference between "the server said you have no
 * accounts" and "the request failed". Both rendered the same empty screen.
 *
 * The states are closed and mutually exclusive:
 *
 *   IDLE     nothing requested yet
 *   LOADING  a request is in flight
 *   SUCCESS  data arrived and is non-empty
 *   EMPTY    data arrived and is legitimately empty
 *   ERROR    the request failed; `failure` says how
 *
 * EMPTY is reached only from a 2xx. An error can never become EMPTY, which was
 * the defect: `d.rows ?? []` turned a 401 into "no records".
 */
import { useCallback, useEffect, useState } from "react";
import { ResourceRequestError, type ResourceFailureCode } from "./resource-request";

export type ResourceStatus = "IDLE" | "LOADING" | "SUCCESS" | "EMPTY" | "ERROR";

export interface ResourceState<T> {
  status: ResourceStatus;
  data: T | null;
  failure: ResourceFailureCode | null;
  /** HTTP status behind `failure`, for diagnostics — never rendered raw. */
  failureStatus: number | null;
  retry: () => void;
}

export interface UseResourceOptions<T> {
  /** Decides whether a successful payload counts as EMPTY. */
  isEmpty?: (value: T) => boolean;
  /** Skip fetching (e.g. a detail view with no id yet). */
  enabled?: boolean;
}

const defaultIsEmpty = <T,>(value: T): boolean =>
  value === null || value === undefined || (Array.isArray(value) && value.length === 0);

/**
 * Run `load` and expose the result as an explicit state.
 *
 * Two correctness properties the previous code lacked:
 *
 *   - LOADING always terminates. Every path out of the request sets a terminal
 *     state, so a failure can never leave a spinner running for ever.
 *   - A stale response cannot win. Each run has its own AbortController and the
 *     result is discarded if the effect has been superseded, so a slow response
 *     for an old id cannot overwrite a newer one, and nothing is set after
 *     unmount.
 */
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: UseResourceOptions<T> = {},
): ResourceState<T> {
  const { isEmpty = defaultIsEmpty, enabled = true } = options;

  const [status, setStatus] = useState<ResourceStatus>(enabled ? "LOADING" : "IDLE");
  const [data, setData] = useState<T | null>(null);
  const [failure, setFailure] = useState<ResourceFailureCode | null>(null);
  const [failureStatus, setFailureStatus] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) { setStatus("IDLE"); return; }

    const controller = new AbortController();
    let superseded = false;

    setStatus("LOADING");
    setFailure(null);
    setFailureStatus(null);

    load(controller.signal)
      .then((value) => {
        if (superseded || controller.signal.aborted) return;
        setData(value);
        setStatus(isEmpty(value) ? "EMPTY" : "SUCCESS");
      })
      .catch((error: unknown) => {
        // An abort is this component's own decision, not a failure to report.
        if (superseded || controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setData(null);
        setFailure(error instanceof ResourceRequestError ? error.code : "FAILED");
        setFailureStatus(error instanceof ResourceRequestError ? error.status : 0);
        setStatus("ERROR");
      });

    return () => { superseded = true; controller.abort(); };
    // `load` is intentionally excluded: callers define it inline, and including
    // it would restart the request on every render. `deps` is the caller's
    // explicit statement of what the request depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt, enabled]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { status, data, failure, failureStatus, retry };
}
