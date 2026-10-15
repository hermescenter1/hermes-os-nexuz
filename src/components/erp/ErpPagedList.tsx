"use client";

import { Fragment, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ChildPage } from "@/lib/erp/pagination";

/**
 * Cursor-paged ERP collection state. The first page comes from the server render;
 * `loadMore` asks the collection's own GET route for the next page, starting at
 * `nextCursor`, until `hasMore` is false. A failed request is reported as a failure,
 * never as an empty or complete list. `endpoint` may already carry a filter query.
 */
export function usePagedItems<T extends { id: string }>(page: ChildPage<T>, endpoint: string) {
  const [items, setItems] = useState(page.items);
  const [cursor, setCursor] = useState(page.nextCursor);
  const [hasMore, setHasMore] = useState(page.hasMore);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const url = new URL(endpoint, "http://localhost");
      url.searchParams.set("cursor", cursor);
      const res = await fetch(`${url.pathname}${url.search}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("page refused");
      const next = (await res.json()) as ChildPage<T>;
      setItems(prev => [...prev, ...next.items]);
      setCursor(next.nextCursor);
      setHasMore(next.hasMore);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return { items, setItems, hasMore, busy, failed, loadMore };
}

/** The "load more" control and its failure message; renders nothing when no page remains. */
export function LoadMore({ hasMore, busy, failed, onLoad }: { hasMore: boolean; busy: boolean; failed: boolean; onLoad: () => void }) {
  const t = useTranslations("enterpriseOperations");
  return (
    <>
      {hasMore && (
        <button
          type="button"
          onClick={onLoad}
          disabled={busy}
          className="text-xs px-3 py-1.5 border rounded-md hover:bg-accent disabled:opacity-50"
        >
          {t("lists.loadMore")}
        </button>
      )}
      {failed && (
        <p role="alert" className="text-xs text-red-400">
          {t("lists.loadFailed")}
        </p>
      )}
    </>
  );
}

export function ErpPagedList<T extends { id: string }>({
  page,
  endpoint,
  renderItem,
}: {
  page: ChildPage<T>;
  endpoint: string;
  renderItem: (item: T) => ReactNode;
}) {
  const { items, hasMore, busy, failed, loadMore } = usePagedItems(page, endpoint);
  return (
    <div className="space-y-2">
      {items.map(item => (
        <Fragment key={item.id}>{renderItem(item)}</Fragment>
      ))}
      <LoadMore hasMore={hasMore} busy={busy} failed={failed} onLoad={loadMore} />
    </div>
  );
}
