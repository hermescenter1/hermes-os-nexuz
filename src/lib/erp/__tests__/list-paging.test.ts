import { describe, expect, it } from "vitest";
import { collectionEndpoint, cursorArgs, pageOf } from "../pagination";

describe("cursor paging helpers", () => {
  it("pageOf keeps `limit` rows, flags the probe row as hasMore and names the last kept row as the cursor", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const page = pageOf(rows, 2, r => r.id.toUpperCase());
    expect(page).toEqual({ items: ["A", "B"], hasMore: true, nextCursor: "b" });
  });

  it("pageOf reports no further page when the rows fit, and never returns the probe row", () => {
    const page = pageOf([{ id: "a" }], 2, r => r.id);
    expect(page).toEqual({ items: ["a"], hasMore: false, nextCursor: null });
  });

  it("cursorArgs continues after the cursor row and skips it; no cursor means the first page", () => {
    expect(cursorArgs("row-9")).toEqual({ cursor: { id: "row-9" }, skip: 1 });
    expect(cursorArgs(undefined)).toEqual({});
  });

  it("collectionEndpoint keeps the filters that define the list and omits the ones that are not set", () => {
    expect(collectionEndpoint("/api/erp/projects", { limit: 50, status: "ACTIVE", projectId: undefined })).toBe(
      "/api/erp/projects?limit=50&status=ACTIVE",
    );
    expect(collectionEndpoint("/api/erp/teams", {})).toBe("/api/erp/teams");
  });
});
