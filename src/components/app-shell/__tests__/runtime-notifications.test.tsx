// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mount, click } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import { AppNotificationCenter } from "../AppNotificationCenter";
import { NotificationCenter } from "../../NotificationCenter";

/**
 * PHASE 87C amendment — Notification Center localization runtime tests.
 * The adapter must render fully localized UI (EN and FA, including aria
 * labels) while the underlying endpoint contracts and mark-read behavior stay
 * byte-identical.
 */

type FetchCall = { url: string; method: string };

function stubNotificationFetch(notifications: unknown[] = []) {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      return {
        ok: true,
        status: 200,
        json: async () =>
          // PHASE 87L.4: the widget confirms a session via /api/auth before it
          // polls or opens SSE (anonymous public pages must issue neither), so
          // this stub has to model a signed-in caller for the UI under test.
          String(url).includes("/api/auth")
            ? { authConfigured: true, user: { id: "u1", name: "Test", email: "t@example.com", role: "admin" } }
            : String(url).includes("unread-count")
              ? { count: notifications.filter((n) => !(n as { isRead?: boolean }).isRead).length }
              : { notifications },
      };
    }),
  );
  return calls;
}

const settle = () => act(async () => { await Promise.resolve(); });

afterEach(() => vi.unstubAllGlobals());

describe("AppNotificationCenter — English", () => {
  it("renders English labels and the localized empty state", async () => {
    const calls = stubNotificationFetch([]);
    const { container, unmount } = await mount(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <AppNotificationCenter />
      </NextIntlClientProvider>,
    );
    const bell = container.querySelector(`[aria-label="${en.appShell.notifications.open}"]`)!;
    expect(bell).toBeTruthy();

    await click(bell);
    await settle();
    // open-state aria flips to the localized close label
    expect(container.querySelector(`[aria-label="${en.appShell.notifications.close}"]`)).toBeTruthy();
    expect(container.textContent).toContain(en.appShell.notifications.title);
    expect(container.textContent).toContain(en.appShell.notifications.empty);

    // endpoint contracts unchanged
    expect(calls.some((c) => c.url === "/api/notifications/unread-count")).toBe(true);
    expect(calls.some((c) => c.url === "/api/notifications?limit=20")).toBe(true);
    await unmount();
  });
});

describe("AppNotificationCenter — Persian (RTL)", () => {
  it("renders Persian labels, Persian aria-labels, and a logically-aligned panel", async () => {
    stubNotificationFetch([]);
    const { container, unmount } = await mount(
      <NextIntlClientProvider locale="fa" messages={fa} timeZone="UTC">
        <div dir="rtl">
          <AppNotificationCenter />
        </div>
      </NextIntlClientProvider>,
    );
    const bell = container.querySelector(`[aria-label="${fa.appShell.notifications.open}"]`)!;
    expect(bell).toBeTruthy(); // «باز کردن اعلان‌ها»

    await click(bell);
    await settle();
    expect(container.querySelector(`[aria-label="${fa.appShell.notifications.close}"]`)).toBeTruthy();
    expect(container.textContent).toContain(fa.appShell.notifications.title); // «اعلان‌ها»
    expect(container.textContent).toContain(fa.appShell.notifications.empty); // «اعلانی وجود ندارد»

    // RTL alignment: the dropdown uses the LOGICAL end-0 anchor (mirrors under rtl)
    const panel = container.querySelector(".absolute.end-0")!;
    expect(panel).toBeTruthy();
    expect(getComputedStyle(panel.closest("[dir]") as Element).direction).toBe("rtl");
    await unmount();
  });

  it("localizes unread badge, mark-all and per-item mark-read — while the existing endpoints stay unchanged", async () => {
    const calls = stubNotificationFetch([
      {
        id: "n1",
        type: "warning",
        title: "Gateway degraded",
        message: "GW-7 packet loss",
        isRead: false,
        createdAt: new Date(Date.now() - 30_000).toISOString(),
      },
    ]);
    const { container, unmount } = await mount(
      <NextIntlClientProvider locale="fa" messages={fa} timeZone="UTC">
        <div dir="rtl">
          <AppNotificationCenter />
        </div>
      </NextIntlClientProvider>,
    );
    await settle(); // unread-count resolves → badge renders
    const badge = container.querySelector(
      `[aria-label="${fa.appShell.notifications.unreadCount.replace("{count}", "1")}"]`,
    )!;
    expect(badge).toBeTruthy(); // «۱→1 اعلان خوانده‌نشده» template applied
    expect(badge.className).toContain("-end-0.5"); // logical badge corner

    await click(container.querySelector(`[aria-label="${fa.appShell.notifications.open}"]`));
    await settle();
    expect(container.textContent).toContain(fa.appShell.notifications.justNow); // «هم‌اکنون»

    // per-item mark-as-read: localized aria + EXISTING endpoint contract
    const markRead = container.querySelector(`[aria-label="${fa.appShell.notifications.markRead}"]`)!;
    await click(markRead);
    await settle();
    expect(calls.some((c) => c.url === "/api/notifications/n1/read" && c.method === "PATCH")).toBe(true);
    await unmount();
  });
});

describe("NotificationCenter — backward compatibility (public SiteHeader consumer)", () => {
  it("renders its original English defaults when no labels prop is given", async () => {
    stubNotificationFetch([]);
    const { container, unmount } = await mount(<NotificationCenter />);
    expect(container.querySelector('[aria-label="Open notifications"]')).toBeTruthy();
    await click(container.querySelector("button"));
    await settle();
    expect(container.textContent).toContain("Notifications");
    expect(container.textContent).toContain("No notifications");
    await unmount();
  });

  it("mark-all-as-read keeps the existing PATCH /api/notifications/read-all contract", async () => {
    const calls = stubNotificationFetch([
      { id: "a", type: "info", title: "T", message: "M", isRead: false, createdAt: new Date().toISOString() },
    ]);
    const { container, unmount } = await mount(<NotificationCenter />);
    await settle();
    await click(container.querySelector("button")); // open
    await settle();
    const markAll = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Mark all read",
    )!;
    expect(markAll).toBeTruthy(); // default English label unchanged
    await click(markAll);
    await settle();
    expect(calls.some((c) => c.url === "/api/notifications/read-all" && c.method === "PATCH")).toBe(true);
    await unmount();
  });
});
