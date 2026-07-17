// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mount, click, focus, keyDown, active } from "@/components/ds/__tests__/_render";
import { visibleAppNavGroups } from "@/lib/navigation/app-nav";
import en from "../../../../messages/en.json";
import { AppMobileNav } from "../AppMobileNav";
import { AppCommandPalette } from "../AppCommandPalette";
import { AppUserMenu } from "../AppUserMenu";
import { NotificationCenter } from "../../NotificationCenter";

/**
 * PHASE 87C runtime tests — mobile drawer, command palette, user menu, and the
 * notification entry point. Real dispatched events, real focus assertions.
 */

const h = vi.hoisted(() => ({
  pathname: "/dashboard",
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => h.pathname,
  useRouter: () => ({ push: h.push, replace: h.replace, refresh: h.refresh }),
  getPathname: vi.fn(),
  redirect: vi.fn(),
  Link: ({ href, children, ...props }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

const GROUPS = visibleAppNavGroups("admin");

function EnWrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  h.pathname = "/dashboard";
  h.push.mockClear();
  h.replace.mockClear();
  h.refresh.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const dialog = () => document.querySelector('[role="dialog"]');

describe("AppMobileNav — drawer", () => {
  it("opens from the ≥44px trigger, traps focus, closes on Escape, and restores focus", async () => {
    const { container, unmount } = await mount(
      <EnWrap>
        <AppMobileNav groups={GROUPS} />
      </EnWrap>,
    );
    const trigger = container.querySelector(`[aria-label="${en.appShell.shell.openMenu}"]`)! as HTMLButtonElement;
    expect(trigger.className).toContain("h-11"); // 44px touch target
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await focus(trigger);
    await click(trigger);

    const panel = dialog()!;
    expect(panel).toBeTruthy();
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(panel.contains(active())).toBe(true); // focus moved inside
    // grouped navigation is present with the current page marked
    expect(panel.querySelector('[aria-current="page"]')).toBeTruthy();
    expect(panel.textContent).toContain(en.appShell.nav.groups.operations);
    // body scroll locked while open (ds Drawer behaviour)
    expect(document.body.style.overflow).toBe("hidden");

    await keyDown(active(), "Escape");
    expect(dialog()).toBeNull();
    expect(active()).toBe(trigger); // focus restored
    await unmount();
  });

  it("closes automatically when the route changes", async () => {
    const { container, rerender, unmount } = await mount(
      <EnWrap>
        <AppMobileNav groups={GROUPS} />
      </EnWrap>,
    );
    await click(container.querySelector(`[aria-label="${en.appShell.shell.openMenu}"]`));
    expect(dialog()).toBeTruthy();

    h.pathname = "/assets";
    await rerender(
      <EnWrap>
        <AppMobileNav groups={GROUPS} />
      </EnWrap>,
    );
    expect(dialog()).toBeNull();
    await unmount();
  });
});

describe("AppCommandPalette", () => {
  it("opens on Ctrl+K, navigates with arrows + Enter, closes on Escape", async () => {
    const { unmount } = await mount(
      <EnWrap>
        <AppCommandPalette groups={GROUPS} />
      </EnWrap>,
    );
    expect(dialog()).toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    const panel = dialog()!;
    expect(panel).toBeTruthy();
    expect(panel.getAttribute("aria-label")).toBe(en.appShell.shell.commandPaletteTitle);
    // navigation-only disclosure is visible
    expect(panel.textContent).toContain(en.appShell.shell.commandPaletteNavHint);

    const input = panel.querySelector("input")!;
    expect(active()).toBe(input); // first focusable receives focus

    // options render from the registry with aria-selected on the highlight
    const options = panel.querySelectorAll('[role="option"]');
    expect(options.length).toBeGreaterThan(10);
    expect(options[0].getAttribute("aria-selected")).toBe("true");

    await keyDown(input, "ArrowDown");
    expect(panel.querySelectorAll('[role="option"]')[1].getAttribute("aria-selected")).toBe("true");

    await keyDown(input, "Enter");
    expect(h.push).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull(); // closed after navigation
    await unmount();
  });

  it("opens via the shared trigger event and closes on Escape with no navigation", async () => {
    const { unmount } = await mount(
      <EnWrap>
        <AppCommandPalette groups={GROUPS} />
      </EnWrap>,
    );
    await act(async () => {
      window.dispatchEvent(new CustomEvent("hermes:command-palette"));
    });
    expect(dialog()).toBeTruthy();
    await keyDown(active(), "Escape");
    expect(dialog()).toBeNull();
    expect(h.push).not.toHaveBeenCalled();
    await unmount();
  });
});

describe("AppUserMenu", () => {
  it("exposes menu semantics, shows identity, and signs out via the existing POST /api/auth contract", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchSpy);

    const { container, unmount } = await mount(
      <EnWrap>
        <AppUserMenu name="Hamid Forozandeh" email="hf@hermes.example" role="admin" />
      </EnWrap>,
    );
    const trigger = container.querySelector(`[aria-label="${en.appShell.shell.accountMenuLabel}"]`)! as HTMLButtonElement;
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.textContent).toContain("HF"); // initials

    await click(trigger);
    const menu = container.querySelector('[role="menu"]')!;
    expect(menu).toBeTruthy();
    expect(menu.textContent).toContain("Hamid Forozandeh");
    expect(menu.textContent).toContain("hf@hermes.example");
    expect(menu.querySelectorAll('[role="menuitem"]').length).toBe(3);

    // sign out uses the EXISTING mechanism: POST /api/auth {action:"logout"} + refresh()
    const signOut = Array.from(menu.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === en.appShell.shell.signOut,
    )!;
    await click(signOut);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/auth",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "logout" }) }),
    );
    expect(h.refresh).toHaveBeenCalled();
    await unmount();
  });

  it("closes on Escape and restores focus to the avatar trigger", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    const { container, unmount } = await mount(
      <EnWrap>
        <AppUserMenu name="Test User" />
      </EnWrap>,
    );
    const trigger = container.querySelector('[aria-haspopup="menu"]')! as HTMLButtonElement;
    await click(trigger);
    expect(container.querySelector('[role="menu"]')).toBeTruthy();
    await keyDown(document.body, "Escape");
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(active()).toBe(trigger);
    await unmount();
  });
});

describe("NotificationCenter — shell entry point (existing component, existing data only)", () => {
  it("renders the bell and a non-deceptive empty state when the backend returns no notifications", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          String(url).includes("unread-count") ? { count: 0 } : { notifications: [] },
      })),
    );

    const { container, unmount } = await mount(
      <EnWrap>
        <NotificationCenter />
      </EnWrap>,
    );
    const bell = container.querySelector("button")!;
    expect(bell).toBeTruthy();

    await click(bell);
    // allow the fetch promise chain to settle
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("No notifications");
    await unmount();
  });
});
