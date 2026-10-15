// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { click, mount, type Mounted } from "@/components/ds/__tests__/_render";
import type { ErpTeamDetailView } from "@/lib/erp/db";
import en from "../../../../messages/en.json";
import { TeamDetailClient } from "../TeamDetailClient";

/**
 * Team member management UI: managers see the add picker and remove controls,
 * a removal needs an explicit confirmation before any request, and an add sends a
 * fresh Idempotency-Key and moves the chosen person into the team. Everything the
 * page shows comes from the server's responses, and the server enforces the rules.
 */

const team: ErpTeamDetailView = {
  id: "team-1",
  organizationId: "org-A",
  name: "Line Team",
  description: null,
  leadId: null,
  capacity: 5,
  version: 1,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  members: {
    items: [
      { id: "tm-1", teamId: "team-1", userId: "user-alice", role: "lead", availability: 100, joinedAt: "2026-10-01T00:00:00.000Z", name: "Alice Ahmadi", email: "alice@example.test" },
    ],
    hasMore: false,
    nextCursor: null,
  },
  memberCount: 1,
};

type Call = { url: string; init: RequestInit | undefined };
let calls: Call[] = [];
let respond: (call: Call) => Response;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function renderTeam(canManage: boolean): Promise<Mounted> {
  return mount(
    <NextIntlClientProvider locale="en" messages={en}>
      <TeamDetailClient team={team} canManage={canManage} />
    </NextIntlClientProvider>,
  );
}

const byText = (root: HTMLElement, text: string): HTMLElement | undefined =>
  Array.from(root.querySelectorAll<HTMLElement>("button, span, div, p")).find(el => el.textContent?.trim() === text);

beforeEach(() => {
  calls = [];
  respond = () => json({}, 500);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const call: Call = { url, init };
    calls.push(call);
    return respond(call);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("team detail: member management", () => {
  it("shows members by name and gives a manager the add picker and remove control", async () => {
    const m = await renderTeam(true);
    expect(m.container.textContent).toContain("Alice Ahmadi");
    expect(byText(m.container, "Remove")).toBeDefined();
    expect(m.container.querySelector('input[type="search"]')).not.toBeNull();
    await m.unmount();
  });

  it("gives a non-manager no add picker and no remove control, and makes no request on render", async () => {
    const m = await renderTeam(false);
    expect(m.container.textContent).toContain("Alice Ahmadi");
    expect(byText(m.container, "Remove")).toBeUndefined();
    expect(m.container.querySelector('input[type="search"]')).toBeNull();
    expect(calls).toHaveLength(0);
    await m.unmount();
  });

  it("a removal asks for confirmation first, and only the confirmed removal issues one DELETE", async () => {
    respond = () => new Response(null, { status: 204 });
    const m = await renderTeam(true);
    await click(byText(m.container, "Remove") ?? null);
    expect(calls).toHaveLength(0);
    expect(m.container.textContent).toContain("Remove Alice Ahmadi from this team?");
    await click(byText(m.container, "Confirm removal") ?? null);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/erp/teams/team-1/members/user-alice");
    expect(calls[0].init?.method).toBe("DELETE");
    expect(m.container.textContent).not.toContain("Alice Ahmadi");
    await m.unmount();
  });

  it("an add searches active candidates, sends a fresh Idempotency-Key, and moves the person into the team", async () => {
    const bob = { userId: "user-bob", name: "Bob Karimi", email: "bob@example.test" };
    respond = call => {
      if (call.url.startsWith("/api/erp/teams/team-1/member-candidates")) return json({ items: [bob], hasMore: false, nextCursor: null });
      if (call.url === "/api/erp/teams/team-1/members" && call.init?.method === "POST") {
        return json({ id: "tm-2", teamId: "team-1", userId: "user-bob", role: "member", availability: 100, joinedAt: "2026-10-07T00:00:00.000Z", name: null, email: null }, 201);
      }
      return json({}, 500);
    };
    const m = await renderTeam(true);
    const form = m.container.querySelector("form") as HTMLFormElement;
    await click(form.querySelector("button[type='submit']"));
    await vi.waitFor(() => expect(m.container.textContent).toContain("Bob Karimi"));
    expect(calls[0].url).toBe("/api/erp/teams/team-1/member-candidates");
    await click(byText(m.container, "Add") ?? null);
    await vi.waitFor(() => expect(calls.some(c => c.init?.method === "POST")).toBe(true));
    const post = calls.find(c => c.init?.method === "POST");
    expect(post?.url).toBe("/api/erp/teams/team-1/members");
    expect(JSON.parse(String(post?.init?.body))).toEqual({ userId: "user-bob" });
    const key = (post?.init?.headers as Record<string, string>)["Idempotency-Key"];
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    await vi.waitFor(() => expect(m.container.textContent).toContain("Bob Karimi"));
    expect(byText(m.container, "Add")).toBeUndefined();
    await m.unmount();
  });

  it("a refused add shows a failure and leaves the picker and the team unchanged", async () => {
    const bob = { userId: "user-bob", name: "Bob Karimi", email: "bob@example.test" };
    respond = call => {
      if (call.url.startsWith("/api/erp/teams/team-1/member-candidates")) return json({ items: [bob], hasMore: false, nextCursor: null });
      return json({ error: "MEMBER_NOT_IN_ORGANIZATION" }, 422);
    };
    const m = await renderTeam(true);
    const form = m.container.querySelector("form") as HTMLFormElement;
    await click(form.querySelector("button[type='submit']"));
    await vi.waitFor(() => expect(m.container.textContent).toContain("Bob Karimi"));
    await click(byText(m.container, "Add") ?? null);
    await vi.waitFor(() => expect(m.container.querySelector("[role='alert']")?.textContent).toBe("The member could not be added. Try again."));
    expect(m.container.textContent).toContain("Bob Karimi");
    expect(m.container.textContent).toContain("Alice Ahmadi");
    await m.unmount();
  });
});
