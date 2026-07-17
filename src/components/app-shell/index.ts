/**
 * PHASE 87C — Hermes authenticated application shell.
 *
 * The canonical shared shell for internal modules: sidebar + topbar +
 * command palette + mobile drawer, with a full-screen "engineering" mode for
 * workspace-class surfaces (Industrial Brain, Knowledge Graph, Digital Twin).
 *
 * Navigation data/policy lives in `@/lib/navigation/app-nav` (pure, tested:
 * visibility is derived from the middleware authorization policy and can never
 * exceed it). The shell performs no authorization itself.
 *
 * Usage (server components):
 *   import { AppShell, AppPage } from "@/components/app-shell";
 *   <AppShell><AppPage title={t("title")}>…</AppPage></AppShell>
 *   <AppShell mode="engineering" workspaceTitle="Industrial Brain — Diagnostic Console">…</AppShell>
 */
export { AppShell, type AppShellProps } from "./AppShell";
export { AppPage, type AppPageProps } from "./AppPage";
export { AppTopbar, type AppTopbarProps } from "./AppTopbar";
export { AppSidebar, type AppSidebarProps } from "./AppSidebar";
export { AppMobileNav, type AppMobileNavProps } from "./AppMobileNav";
export { AppBreadcrumbs, type AppBreadcrumbsProps, type BreadcrumbItem } from "./AppBreadcrumbs";
export { AppCommandPalette, type AppCommandPaletteProps } from "./AppCommandPalette";
export { AppUserMenu, type AppUserMenuProps } from "./AppUserMenu";
export { OrganizationSelector, SiteSelector } from "./OrganizationSelector";
export { SideTooltip, type SideTooltipProps } from "./SideTooltip";
export { SearchTrigger } from "./SearchTrigger";
export { AppNotificationCenter } from "./AppNotificationCenter";
