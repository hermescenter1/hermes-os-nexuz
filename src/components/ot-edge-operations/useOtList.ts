"use client";

// PHASE 94C1 — the shared load-and-URL machinery behind both OT lists.
//
// FOUR PROPERTIES THIS HOOK EXISTS TO GUARANTEE
//
// 1. THE URL IS THE STATE. The requested query is read from the address bar,
//    so a refresh, a Back button and a pasted link all reproduce the same
//    result set. Applying a filter pushes a new entry; paging replaces it, so
//    Back returns to the previous FILTER rather than walking every page.
//
// 2. THE DISPLAYED ROWS AND THE QUERY THAT PRODUCED THEM STAY TOGETHER. The
//    response is stored beside the exact query string it answered. A filter bar
//    can therefore never report "filtered by X" over rows fetched for Y — the
//    commonest way a console misleads its operator.
//
// 3. A SUPERSEDED REQUEST NEVER WINS. Each load aborts the previous one, and a
//    late response is dropped unless it matches the query still in flight.
//    Without this, typing a narrower filter can leave the broader result on
//    screen labelled as the narrower one.
//
// 4. NO SILENT FALLBACK. A failure produces a code the UI renders as its own
//    localized state. There is no demo data, no cached stand-in and no empty
//    list standing in for a 403.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { OtRequestError, type OtFailureCode } from "@/lib/ot-operations/api";
import type { ListPage } from "@/lib/ot-operations/contract";

export interface OtListLoad<T> {
  /** The rows on screen, together with the query string that produced them. */
  page: ListPage<T> | null;
  appliedQuery: string | null;
  loading: boolean;
  failure: OtFailureCode | null;
}

export interface UseOtListOptions<T> {
  /** The API query string for the current URL state. */
  requestQuery: string;
  /** The URL query string (defaults omitted) for the current state. */
  urlQuery: string;
  fetcher: (query: string, signal?: AbortSignal) => Promise<ListPage<T>>;
}

export function useOtList<T>({ requestQuery, urlQuery, fetcher }: UseOtListOptions<T>) {
  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] = useState<OtListLoad<T>>({
    page: null,
    appliedQuery: null,
    loading: true,
    failure: null,
  });

  // Identifies the request whose result is still wanted. Compared on arrival so
  // a superseded response cannot overwrite a newer one.
  const inFlight = useRef<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    inFlight.current = requestQuery;
    setState((previous) => ({ ...previous, loading: true, failure: null }));

    fetcher(requestQuery, controller.signal)
      .then((page) => {
        if (inFlight.current !== requestQuery) return;
        // The query is recorded WITH the rows: this pairing is what lets the UI
        // describe what is on screen instead of what was asked for.
        setState({ page, appliedQuery: requestQuery, loading: false, failure: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (inFlight.current !== requestQuery) return;
        const code: OtFailureCode = error instanceof OtRequestError ? error.code : "FAILED";
        // The previous rows are cleared: leaving them visible under an error
        // banner would present stale data as current.
        setState({ page: null, appliedQuery: null, loading: false, failure: code });
      });

    return () => controller.abort();
  }, [requestQuery, fetcher, reloadToken]);

  /** Retry the current query without changing the URL. */
  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  /**
   * Move to a new URL state.
   *
   * `push` for a filter change (Back should undo the filter) and `replace` for
   * paging (Back should leave the list, not step through every page visited).
   */
  const navigate = useCallback(
    (nextUrlQuery: string, mode: "push" | "replace") => {
      const href = nextUrlQuery ? `${pathname}?${nextUrlQuery}` : pathname;
      // The i18n router keeps the locale prefix; building the href by hand
      // would either drop it or double it.
      if (mode === "push") router.push(href);
      else router.replace(href);
    },
    [pathname, router],
  );

  return { ...state, retry, navigate, currentUrlQuery: urlQuery };
}
