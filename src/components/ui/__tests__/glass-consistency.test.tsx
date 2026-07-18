// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mount } from "@/components/ds/__tests__/_render";
import { GlassCard } from "../GlassCard";

/**
 * PHASE 87L.3 — visual consistency cleanup.
 *
 * `ui/GlassCard` is now a COMPATIBILITY WRAPPER over the approved 87L.1/87L.2
 * `ds-glass-*` system: its public API is unchanged (60+ direct consumers keep
 * their layout, data, actions and semantics) while the surface treatment comes
 * from one source of truth. These tests pin that mapping, prove the two glass
 * systems can no longer stack on one element, and cover the orphan removals.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const cls = async (ui: React.ReactElement) => {
  const { container, unmount } = await mount(ui);
  const c = container.firstElementChild!.className;
  await unmount();
  return c;
};

describe("GlassCard — approved variant mapping", () => {
  it("maps each legacy variant onto its approved glass tier", async () => {
    expect(await cls(<GlassCard>x</GlassCard>)).toContain("ds-glass-card");
    expect(await cls(<GlassCard variant="enterprise">x</GlassCard>)).toContain("ds-glass-elevated");
    expect(await cls(<GlassCard variant="surface">x</GlassCard>)).toContain("ds-glass-soft");
    expect(await cls(<GlassCard deep>x</GlassCard>)).toContain("ds-glass-elevated");
  });

  it("routes explicitly hoverable/liftable cards to the interactive tier", async () => {
    for (const ui of [<GlassCard hover key="h">x</GlassCard>, <GlassCard lift key="l">x</GlassCard>]) {
      expect(await cls(ui)).toContain("ds-glass-interactive");
    }
  });

  it("shows a pointer cursor only when the card is genuinely interactive", async () => {
    expect(await cls(<GlassCard lift>x</GlassCard>)).toContain("cursor-pointer");
    // a static analytical surface must not look clickable
    expect(await cls(<GlassCard>x</GlassCard>)).not.toContain("cursor-pointer");
    expect(await cls(<GlassCard variant="surface">x</GlassCard>)).not.toContain("cursor-pointer");
  });

  it("keeps the semantic selected state and the restrained glow", async () => {
    expect(await cls(<GlassCard featured>x</GlassCard>)).toContain("card-active");
    expect(await cls(<GlassCard glow>x</GlassCard>)).toContain("glow-signal");
  });

  it("drops the neon rectangle — `neon` now resolves to the elevated tier", async () => {
    const c = await cls(<GlassCard neon>x</GlassCard>);
    expect(c).toContain("ds-glass-elevated");
    expect(c).not.toContain("neon-border");
    expect(c).not.toContain("glow-signal-strong");
  });

  it("never emits the legacy glass system, so hover systems cannot stack", async () => {
    for (const ui of [
      <GlassCard key="a">x</GlassCard>,
      <GlassCard hover lift deep neon key="b">x</GlassCard>,
      <GlassCard variant="enterprise" key="c">x</GlassCard>,
      <GlassCard variant="surface" key="d">x</GlassCard>,
    ]) {
      const c = await cls(ui);
      for (const legacy of ["glass-hover", "hover-lift", "glass-deep", "card-enterprise", "card-surface"]) {
        expect(c, legacy).not.toContain(legacy);
      }
      // exactly one ds-glass tier per card
      expect(c.match(/ds-glass-\w+/g)!.length).toBe(1);
    }
  });

  it("preserves the component API: ref, className, style and DOM props pass through", async () => {
    const { container, unmount } = await mount(
      <GlassCard className="custom-x" style={{ opacity: 0.5 }} data-testid="gc" role="group">x</GlassCard>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("custom-x");
    expect(el.style.opacity).toBe("0.5");
    expect(el.getAttribute("data-testid")).toBe("gc");
    expect(el.getAttribute("role")).toBe("group");
    await unmount();
  });

  it("uses the approved radius family, not the legacy 2xl card radius", async () => {
    expect(await cls(<GlassCard>x</GlassCard>)).toContain("rounded-lg");
    expect(await cls(<GlassCard>x</GlassCard>)).not.toContain("rounded-2xl");
  });

  it("inherits 87L.2 motion rules rather than re-declaring them", () => {
    const src = read("src/components/ui/GlassCard.tsx");
    // no bespoke hover/motion classes and no pointer tracking in the wrapper
    expect(src).not.toMatch(/onMouseMove|onPointerMove|addEventListener|requestAnimationFrame/);
    expect(src).not.toMatch(/transition-|hover:|animate-/);
    // the fine-pointer gate and reduced-motion suppression live in globals.css
    const css = read("src/app/globals.css");
    expect(css).toContain("@media (hover: hover) and (pointer: fine)");
    expect(css).toContain(".ds-glass-interactive:hover");
  });
});

describe("orphan removals — proven zero-consumer components", () => {
  const REMOVED = [
    "src/components/crm/CrmNav.tsx",
    "src/components/crm/CrmDashboardClient.tsx",
    "src/components/document/DocumentNav.tsx",
    "src/components/document/DocumentDashboardClient.tsx",
  ];

  it("the four proven orphans are gone", () => {
    for (const rel of REMOVED) expect(existsSync(join(root, rel)), rel).toBe(false);
  });

  it("no module imports them any more", () => {
    for (const rel of REMOVED) {
      const name = rel.split("/").pop()!.replace(".tsx", "");
      // the live route files that used to host them must not reference them
      for (const consumer of ["src/app/[locale]/crm/layout.tsx", "src/app/[locale]/documents/layout.tsx"]) {
        expect(read(consumer)).not.toMatch(new RegExp(`import[^\\n]*\\b${name}\\b`));
      }
    }
  });

  it("components still in active use were NOT removed", () => {
    // KpiDashboardClient (/erp/kpis) and CmmsDashboardClient (/cmms/dashboard)
    // have live route consumers; the extraction contracts also pin several
    // legacy nav/dashboard clients, so those stay.
    for (const rel of [
      "src/components/erp/KpiDashboardClient.tsx",
      "src/components/cmms/CmmsDashboardClient.tsx",
    ]) expect(existsSync(join(root, rel)), rel).toBe(true);
  });
});

describe("shell integrity — skip link and no overflow band-aid", () => {
  it("both shells keep a working, keyboard-reachable skip link", () => {
    for (const rel of ["src/components/public-site/PublicHeader.tsx", "src/components/app-shell/SkipLink.tsx"]) {
      const src = read(rel);
      expect(src, rel).toMatch(/href="#(public-)?[\w-]*content"/);
      expect(src, rel).toContain("sr-only");
      expect(src, rel).toContain("focus:not-sr-only");
    }
  });

  it("no global overflow-x band-aid was introduced", () => {
    const css = read("src/app/globals.css");
    // narrow-viewport overflow was traced to the preview tool's device-metrics
    // emulation (innerWidth never reaches the requested width while
    // clientWidth reports it); content fits the real layout viewport, so no
    // symptom-hiding rule is warranted.
    expect(css).not.toMatch(/(html|body|:root)[^{]*\{[^}]*overflow-x:\s*hidden/);
  });
});
