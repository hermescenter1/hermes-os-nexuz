/**
 * Review F4 — the per-conversation message bound keeps the NEWEST messages.
 *
 * The fake honours `orderBy` and `take` the way PostgreSQL does, so what is
 * asserted is the observable thread, not the shape of the query: a conversation
 * longer than the bound still shows its latest message, in chronological order.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Msg = { id: string; conversationId: string; role: string; content: string; metadata: Record<string, unknown>; createdAt: Date };

const h = vi.hoisted(() => ({ messages: [] as Msg[] }));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    copilotConversation: {
      findFirst: async (a: { where: { id: string; organizationId: string; userId: string } }) =>
        a.where.id === "conv-1" && a.where.organizationId === "org-a" && a.where.userId === "user-1"
          ? { id: "conv-1", organizationId: "org-a", userId: "user-1", title: "t", createdAt: new Date(0), updatedAt: new Date(0) }
          : null,
    },
    copilotMessage: {
      findMany: async (a: {
        where: { conversationId: string };
        orderBy: { createdAt?: "asc" | "desc"; id?: "asc" | "desc" }[];
        take?: number;
      }) => {
        const rows = h.messages.filter((m) => m.conversationId === a.where.conversationId);
        rows.sort((x, y) => {
          for (const key of a.orderBy) {
            const [field, dir] = Object.entries(key)[0] as ["createdAt" | "id", "asc" | "desc"];
            const xv = field === "createdAt" ? x.createdAt.getTime() : x.id;
            const yv = field === "createdAt" ? y.createdAt.getTime() : y.id;
            if (xv < yv) return dir === "asc" ? -1 : 1;
            if (xv > yv) return dir === "asc" ? 1 : -1;
          }
          return 0;
        });
        return a.take === undefined ? rows : rows.slice(0, a.take);
      },
    },
  }),
}));

import { getConversation } from "../copilot";

const viewer = { organizationId: "org-a", userId: "user-1", siteIds: ["site-1"] };

function seed(count: number): void {
  h.messages = Array.from({ length: count }, (_, i) => ({
    id: `m-${String(i).padStart(4, "0")}`,
    conversationId: "conv-1",
    role: "USER",
    content: `message ${i}`,
    metadata: {},
    createdAt: new Date(Date.UTC(2026, 0, 1) + i * 1000),
  }));
}

describe("getConversation — message window (review F4)", () => {
  beforeEach(() => { h.messages = []; });

  it("a conversation longer than the bound still returns its newest message, last", async () => {
    seed(620);
    const out = await getConversation("conv-1", viewer);
    expect(out).not.toBeNull();
    const contents = out!.messages.map((m) => m.content);
    expect(contents).toHaveLength(500);
    expect(contents[contents.length - 1]).toBe("message 619");
    expect(contents[0]).toBe("message 120");
  });

  it("the window is returned in chronological order", async () => {
    seed(620);
    const out = await getConversation("conv-1", viewer);
    const times = out!.messages.map((m) => Date.parse(m.createdAt));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("a short conversation is returned whole, oldest first", async () => {
    seed(3);
    const out = await getConversation("conv-1", viewer);
    expect(out!.messages.map((m) => m.content)).toEqual(["message 0", "message 1", "message 2"]);
  });

  it("another member's conversation is still not found", async () => {
    seed(3);
    expect(await getConversation("conv-1", { ...viewer, userId: "user-2" })).toBeNull();
  });
});
