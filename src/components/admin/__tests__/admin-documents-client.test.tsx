// @vitest-environment jsdom
/**
 * F-2 — the organization document library client, rendered for real through
 * next-intl.
 *
 * Locks the two things the page's server-side decision controls:
 *   - without `manage_documents` (canManage=false) no upload form and no
 *     process/delete control is rendered at all;
 *   - the list is cursor-paged: "load more" fetches `?cursor=` with the tenant
 *     precondition header and appends without duplicates.
 * Presentation only — every request is re-authorized by the API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mount, click } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import { AdminDocumentsClient } from "../AdminDocumentsClient";

const ORG = "org-a";

type Call = { url: string; headers: Headers };
let calls: Call[] = [];
let pages: Record<
  string,
  { documents: unknown[]; nextCursor: string | null; stats?: { total: number; indexed: number; failed: number } }
> = {};

function row(id: string) {
  return {
    id,
    title: `Doc ${id}`,
    sourceType: "manual",
    originalFilename: `${id}.pdf`,
    sizeBytes: 2048,
    status: "uploaded",
    chunkCount: 0,
    metadata: { tags: [] },
    createdAt: "2026-09-24T10:00:00.000Z",
  };
}

beforeEach(() => {
  calls = [];
  pages = {
    first: {
      documents: [row("d1"), row("d2")],
      nextCursor: "cursor-1",
      stats: { total: 500, indexed: 40, failed: 7 },
    },
    "cursor-1": { documents: [row("d2"), row("d3")], nextCursor: null },
  };
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    const cursor = new URL(String(url), "http://localhost").searchParams.get("cursor");
    const body = pages[cursor ?? "first"] ?? { documents: [], nextCursor: null };
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  });
});

afterEach(() => vi.unstubAllGlobals());

function ui(canManage: boolean) {
  return (
    <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
      <div data-hermes-organization={ORG}>
        <AdminDocumentsClient canManage={canManage} />
      </div>
    </NextIntlClientProvider>
  );
}

async function settle() {
  for (let i = 0; i < 3; i += 1) await act(async () => {});
}

const labels = (c: HTMLElement) => [...c.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim());

describe("AdminDocumentsClient — view_documents only", () => {
  it("renders the list but no upload form and no process/delete control", async () => {
    const { container, unmount } = await mount(ui(false));
    await settle();
    expect(container.textContent).toContain("Doc d1");
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.textContent).not.toContain(en.adminDocuments.upload.heading);
    expect(labels(container)).toEqual([en.adminDocuments.list.loadMore]);
    await unmount();
  });
});

describe("AdminDocumentsClient — manage_documents", () => {
  it("renders the upload form and the per-row controls", async () => {
    const { container, unmount } = await mount(ui(true));
    await settle();
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
    const l = labels(container);
    expect(l).toContain(en.adminDocuments.upload.submit);
    expect(l.filter((x) => x === en.adminDocuments.list.process)).toHaveLength(2);
    expect(l.filter((x) => x === en.adminDocuments.list.delete)).toHaveLength(2);
    await unmount();
  });
});

describe("AdminDocumentsClient — cursor paging", () => {
  it("loads the next page with the cursor and the tenant header, appends without duplicates", async () => {
    const { container, unmount } = await mount(ui(false));
    await settle();
    const more = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === en.adminDocuments.list.loadMore
    );
    await click(more ?? null);
    await settle();

    const paged = calls.find((c) => c.url.includes("cursor="));
    expect(paged?.url).toBe("/api/documents?cursor=cursor-1");
    // Every DOCUMENT request asserts the rendered tenant. (StorageIndicator's own
    // /api/analysis probe is not a document request and is not asserted here.)
    const documentCalls = calls.filter((c) => c.url.startsWith("/api/documents"));
    expect(documentCalls.length).toBeGreaterThanOrEqual(2);
    for (const c of documentCalls) expect(c.headers.get("x-hermes-organization"), c.url).toBe(ORG);

    const titles = [...container.querySelectorAll("li p:first-child")].map((p) => p.textContent);
    expect(titles).toEqual(["Doc d1", "Doc d2", "Doc d3"]);
    // Last page reached: the control disappears.
    expect(labels(container)).not.toContain(en.adminDocuments.list.loadMore);
    await unmount();
  });
});

describe("AdminDocumentsClient — figures come from the server, not from the loaded rows", () => {
  const metricValues = (c: HTMLElement) => [...c.querySelectorAll(".metric")].map((m) => m.textContent);

  it("shows the whole-library stats (500 / 40 / 7) while only two rows are loaded", async () => {
    const { container, unmount } = await mount(ui(false));
    await settle();
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(metricValues(container)).toEqual(["500", "40", "7"]);
    await unmount();
  });

  it("loading another page does not change the figures", async () => {
    const { container, unmount } = await mount(ui(false));
    await settle();
    const more = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === en.adminDocuments.list.loadMore
    );
    await click(more ?? null);
    await settle();
    expect(container.querySelectorAll("li")).toHaveLength(3);
    expect(metricValues(container)).toEqual(["500", "40", "7"]);
    await unmount();
  });

  it("shows an unknown figure as a dash, never as zero, when the server sent none", async () => {
    pages.first = { documents: [row("d1")], nextCursor: null };
    const { container, unmount } = await mount(ui(false));
    await settle();
    expect(metricValues(container)).toEqual(["—", "—", "—"]);
    await unmount();
  });
});
