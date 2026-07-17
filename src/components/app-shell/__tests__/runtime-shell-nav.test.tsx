// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount, click, focus } from "@/components/ds/__tests__/_render";
import { visibleAppNavGroups } from "@/lib/navigation/app-nav";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import { AppSidebar } from "../AppSidebar";
import { AppBreadcrumbs } from "../AppBreadcrumbs";
import { SkipLink } from "../SkipLink";
import { OrganizationSelector, SiteSelector } from "../OrganizationSelector";

/**
 * PHASE 87C runtime tests — sidebar, breadcrumbs, skip link, context selectors.
 * Real React renders in jsdom with REAL message catalogs (so the tests also
 * prove every consumed translation key exists in en AND fa).
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
function FaWrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="fa" messages={fa} timeZone="UTC">
      <div dir="rtl">{children}</div>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  h.pathname = "/dashboard";
  h.push.mockClear();
  window.localStorage.clear();
});

describe("AppSidebar — expanded (EN/LTR)", () => {
  it("renders labelled primary nav with groups, items, and aria-current on the active route", async () => {
    const { container, unmount } = await mount(
      <EnWrap>
        <AppSidebar groups={GROUPS} />
      </EnWrap>,
    );
    const nav = container.querySelector("nav")!;
    expect(nav.getAttribute("aria-label")).toBe(en.appShell.shell.primaryNavLabel);

    // six groups (admin sees all)
    const groupLabels = Array.from(container.querySelectorAll("nav p")).map((p) => p.textContent);
    expect(groupLabels).toContain(en.appShell.nav.groups.intelligence);
    expect(groupLabels).toContain(en.appShell.nav.groups.administration);

    const active = container.querySelector('[aria-current="page"]')!;
    expect(active).toBeTruthy();
    expect(active.textContent).toContain(en.appShell.nav.items.dashboard);
    expect(active.getAttribute("href")).toBe("/dashboard");
    await unmount();
  });

  it("uses LOGICAL edge classes (border-e / start-0) — never physical left/right", async () => {
    const { container, unmount } = await mount(
      <EnWrap>
        <AppSidebar groups={GROUPS} />
      </EnWrap>,
    );
    const aside = container.querySelector("aside")!;
    expect(aside.className).toContain("border-e");
    expect(aside.className).not.toMatch(/\b(left-0|right-0|border-r\b|border-l\b)/);
    // active bar sits on the inline start
    const bar = container.querySelector('[aria-current="page"] span[aria-hidden="true"]')!;
    expect(bar.className).toContain("start-0");
    await unmount();
  });

  it("collapse control toggles the rail, persists, and keeps accessible labels + tooltips", async () => {
    const { container, unmount } = await mount(
      <EnWrap>
        <AppSidebar groups={GROUPS} />
      </EnWrap>,
    );
    const toggle = container.querySelector(`[aria-label="${en.appShell.shell.collapseSidebar}"]`)! as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    await click(toggle);

    const aside = container.querySelector("aside")!;
    expect(aside.getAttribute("data-collapsed")).toBe("true");
    expect(aside.className).toContain("w-16");
    // control flips to expand semantics
    const expand = container.querySelector(`[aria-label="${en.appShell.shell.expandSidebar}"]`)!;
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    // items keep an accessible name (sr-only) and a tooltip description
    const activeLink = container.querySelector('[aria-current="page"]')!;
    expect(activeLink.textContent).toContain(en.appShell.nav.items.dashboard); // sr-only text
    expect(activeLink.getAttribute("aria-describedby")).toBeTruthy(); // SideTooltip wiring
    // keyboard: still focusable
    await focus(activeLink);
    expect(document.activeElement).toBe(activeLink);
    // preference persisted
    expect(window.localStorage.getItem("hermes.appshell.sidebar.collapsed")).toBe("1");
    await unmount();
  });
});

describe("AppSidebar — Persian (RTL)", () => {
  it("renders Persian labels inside an RTL container with the same logical classes", async () => {
    const { container, unmount } = await mount(
      <FaWrap>
        <AppSidebar groups={GROUPS} />
      </FaWrap>,
    );
    const aside = container.querySelector("aside")!;
    expect(getComputedStyle(aside).direction).toBe("rtl");
    expect(aside.className).toContain("border-e"); // logical — mirrors automatically
    const active = container.querySelector('[aria-current="page"]')!;
    expect(active.textContent).toContain(fa.appShell.nav.items.dashboard); // داشبورد اجرایی
    const groupLabels = Array.from(container.querySelectorAll("nav p")).map((p) => p.textContent);
    expect(groupLabels).toContain(fa.appShell.nav.groups.intelligence);
    await unmount();
  });
});

describe("AppBreadcrumbs", () => {
  it("renders nav[aria-label] > ol with the group crumb and the current page marked", async () => {
    const { container, unmount } = await mount(
      <EnWrap>
        <AppBreadcrumbs groups={GROUPS} />
      </EnWrap>,
    );
    const nav = container.querySelector("nav")!;
    expect(nav.getAttribute("aria-label")).toBe(en.appShell.shell.breadcrumbsLabel);
    expect(nav.querySelector("ol")).toBeTruthy();
    const current = nav.querySelector('[aria-current="page"]')!;
    expect(current.textContent).toBe(en.appShell.nav.items.dashboard);
    expect(nav.textContent).toContain(en.appShell.nav.groups.intelligence);
    await unmount();
  });

  it("derives deeper routes to their owning item and accepts page-provided crumbs", async () => {
    h.pathname = "/dashboard/knowledge/cases";
    const derived = await mount(
      <EnWrap>
        <AppBreadcrumbs groups={GROUPS} />
      </EnWrap>,
    );
    expect(derived.container.querySelector('[aria-current="page"]')!.textContent).toBe(
      en.appShell.nav.items.cases,
    );
    await derived.unmount();

    const provided = await mount(
      <EnWrap>
        <AppBreadcrumbs items={[{ label: "Assets" }, { label: "PT-4012", current: true }]} />
      </EnWrap>,
    );
    expect(provided.container.querySelector('[aria-current="page"]')!.textContent).toBe("PT-4012");
    await provided.unmount();
  });
});

describe("SkipLink", () => {
  it("is the visually-hidden first control targeting #app-content", async () => {
    const { container, unmount } = await mount(<SkipLink label={en.appShell.shell.skipToContent} />);
    const a = container.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("#app-content");
    expect(a.className).toContain("sr-only");
    expect(a.textContent).toBe(en.appShell.shell.skipToContent);
    await focus(a);
    expect(document.activeElement).toBe(a);
    await unmount();
  });
});

describe("Organization / Site context selectors", () => {
  it("render the honest empty state when no context exists (no fake organizations)", async () => {
    const { container, unmount } = await mount(
      <EnWrap>
        <div>
          <OrganizationSelector name={null} />
          <SiteSelector name={null} />
        </div>
      </EnWrap>,
    );
    expect(container.textContent).toContain(en.appShell.shell.noOrganizationContext);
    expect(container.textContent).toContain(en.appShell.shell.noSiteContext);
    // display-only: no button/combobox is announced while switching is impossible
    expect(container.querySelector("button")).toBeNull();
    await unmount();
  });

  it("render the current context name and a loading skeleton", async () => {
    const { container, unmount } = await mount(
      <EnWrap>
        <div>
          <OrganizationSelector name="Hermes Novin Mehr" />
          <SiteSelector loading />
        </div>
      </EnWrap>,
    );
    expect(container.textContent).toContain("Hermes Novin Mehr");
    expect(container.querySelector(".ds-skeleton")).toBeTruthy();
    await unmount();
  });
});
