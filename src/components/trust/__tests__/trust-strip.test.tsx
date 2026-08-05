// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { TrustBadgesSection } from "../TrustBadgesSection";

/**
 * Compact trust strip — the redesigned Trust & Verification area.
 *
 * The strip replaced the previous three oversized cards: a single centred
 * glass panel with three small equal badge slots. These tests pin the compact
 * geometry (so the card design cannot silently return), the badge uniqueness,
 * the official URLs and the direction-driven ordering.
 */

const messagesFor = { en, fa, de } as const;

function withIntl(locale: keyof typeof messagesFor, ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale={locale} messages={messagesFor[locale]} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

const strip = (c: HTMLElement) => c.querySelector("section > div")!;

describe("trust strip — compact container", () => {
  it("is a single centred w-fit glass panel, not a full-width grid", async () => {
    const { container, unmount } = await mount(withIntl("en", <TrustBadgesSection />));
    const panel = strip(container);
    expect(panel.className).toContain("mx-auto");
    expect(panel.className).toContain("w-fit");
    expect(panel.className).toContain("rounded-2xl");
    expect(panel.className).toContain("backdrop-blur-md");
    expect(panel.className).toContain("bg-surface-glass");
    // flex strip, not a grid
    expect(panel.className).toContain("flex");
    expect(panel.className).not.toContain("grid-cols");
    await unmount();
  });

  it("the oversized card layout is fully retired from the source", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/components/trust/TrustBadgesSection.tsx", "utf8");
    expect(src, "oversized card min-height returned").not.toContain("min-h-[248px]");
    expect(src, "three-column card grid returned").not.toContain("sm:grid-cols-3");
    expect(src, "opacity modifier silently fails on hex-var tokens").not.toContain("bg-surface-elevated/");
    // no big heading block — labels are tiny muted text
    expect(src).not.toContain("<h2");
    expect(src).not.toContain("<h3");
    await unmount_noop();
  });

  it("renders three compact slots with the fixed 184×116 footprint", async () => {
    const { container, unmount } = await mount(withIntl("en", <TrustBadgesSection />));
    const slots = container.querySelectorAll('[class*="h-[116px]"][class*="w-[184px]"]');
    expect(slots.length).toBe(3);
    await unmount();
  });
});

describe("trust strip — badges render exactly once, in eNAMAD→SaaSHub→ProvenExpert DOM order", () => {
  it.each(["en", "fa", "de"] as const)("%s: one of each badge, correct order", async (loc) => {
    const { container, unmount } = await mount(withIntl(loc, <TrustBadgesSection />));
    const enamad = container.querySelectorAll('a[href*="trustseal.enamad.ir"]');
    const saashub = container.querySelectorAll('a[href*="saashub.com/hermes-os"]');
    const proven = container.querySelectorAll("#proSealWidget");
    expect(enamad.length, "eNAMAD must appear exactly once").toBe(1);
    expect(saashub.length, "SaaSHub must appear exactly once").toBe(1);
    expect(proven.length, "ProvenExpert must appear exactly once").toBe(1);
    // DOM order drives visual order via document direction: SaaSHub centred,
    // eNAMAD at the text-start edge, ProvenExpert at the text-end edge.
    const html = container.innerHTML;
    expect(html.indexOf("trustseal.enamad.ir")).toBeLessThan(html.indexOf("saashub.com"));
    expect(html.indexOf("saashub.com")).toBeLessThan(html.indexOf("proSealWidget"));
    await unmount();
  });

  it("keeps the exact official SaaSHub destination and image", async () => {
    const { container, unmount } = await mount(withIntl("en", <TrustBadgesSection />));
    const a = container.querySelector<HTMLAnchorElement>('a[href*="saashub.com"]')!;
    expect(a.getAttribute("href")).toBe(
      "https://www.saashub.com/hermes-os?utm_source=badge&utm_campaign=badge&utm_content=hermes-os&badge_variant=color&badge_kind=approved"
    );
    expect(a.querySelector("img")!.getAttribute("src")).toBe(
      "https://cdn-b.saashub.com/img/badges/approved-color.png?v=1"
    );
    await unmount();
  });

  it("keeps the exact official eNAMAD parameters", async () => {
    const { container, unmount } = await mount(withIntl("en", <TrustBadgesSection />));
    const a = container.querySelector<HTMLAnchorElement>('a[href*="enamad"]')!;
    expect(a.getAttribute("href")).toBe(
      "https://trustseal.enamad.ir/?id=761266&Code=MFGRdDzn6UCFPL3FOx24Dj5yabncQMST"
    );
    const img = a.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(
      "https://trustseal.enamad.ir/logo.aspx?id=761266&Code=MFGRdDzn6UCFPL3FOx24Dj5yabncQMST"
    );
    expect(img.getAttribute("code")).toBe("MFGRdDzn6UCFPL3FOx24Dj5yabncQMST");
    expect(a.getAttribute("referrerpolicy")).toBe("origin");
    expect(img.getAttribute("referrerpolicy")).toBe("origin");
    expect(a.hasAttribute("rel"), "eNAMAD anchor must carry no rel").toBe(false);
    await unmount();
  });
});

describe("trust strip — compact labels", () => {
  it.each([
    ["en", en.trustBadges],
    ["fa", fa.trustBadges],
    ["de", de.trustBadges],
  ] as const)("%s: renders the three tiny slot labels", async (loc, msgs) => {
    const { container, unmount } = await mount(withIntl(loc, <TrustBadgesSection />));
    for (const label of [msgs.enamadHeading, msgs.saashubHeading, msgs.provenExpertHeading]) {
      const el = Array.from(container.querySelectorAll("span")).find(
        (s) => s.textContent === label
      );
      expect(el, `label "${label}" missing`).toBeTruthy();
      expect(el!.className).toContain("text-[10px]");
      expect(el!.className).toContain("text-text-muted");
    }
    await unmount();
  });

  it("fa labels are Persian and de labels are German (no carryover)", () => {
    expect(/[؀-ۿ]/.test(fa.trustBadges.enamadHeading)).toBe(true);
    expect(fa.trustBadges.saashubHeading).not.toBe(en.trustBadges.saashubHeading);
    expect(de.trustBadges.enamadHeading).not.toBe(en.trustBadges.enamadHeading);
    expect(de.trustBadges.saashubHeading).not.toBe(en.trustBadges.saashubHeading);
  });
});

describe("trust strip — eNAMAD compact chip and fallback", () => {
  it("the light chip wraps only the seal, and reserves a compact 80×76 box", async () => {
    const { container, unmount } = await mount(withIntl("en", <TrustBadgesSection />));
    const img = container.querySelector<HTMLImageElement>('img[src*="trustseal"]')!;
    const chip = img.parentElement!;
    expect(chip.className).toContain("bg-white");
    expect(chip.className).toContain("w-[80px]");
    expect(chip.className).toContain("min-h-[76px]");
    expect(chip.className).toContain("rounded-lg");
    // the SLOT around it is dark — the white chip must not swallow the slot
    const slot = chip.closest('[class*="w-[184px]"]')!;
    expect(slot.className).not.toContain("bg-white");
    await unmount();
  });

  it("a failed image collapses (no width/height attrs) and reveals the caption", async () => {
    const { container, unmount } = await mount(withIntl("en", <TrustBadgesSection />));
    const img = container.querySelector<HTMLImageElement>('img[src*="trustseal"]')!;
    expect(img.hasAttribute("width")).toBe(false);
    expect(img.hasAttribute("height")).toBe(false);
    const caption = img.parentElement!.querySelector('span[aria-hidden="true"]')!;
    expect(caption.textContent).toBe("eNAMAD");
    await unmount();
  });
});

describe("trust strip — ProvenExpert containment", () => {
  it("sits inside a fixed compact viewport with a pure transform scale", async () => {
    const { container, unmount } = await mount(withIntl("en", <TrustBadgesSection />));
    const widget = container.querySelector("#proSealWidget")!;
    const scaler = widget.closest('[class*="scale-"]')!;
    expect(scaler.className).toContain("scale-[0.38]");
    expect(scaler.className).toContain("origin-center");
    const viewport = scaler.parentElement!;
    expect(viewport.className).toContain("overflow-hidden");
    expect(viewport.className).toContain("h-[84px]");
    expect(viewport.className).toContain("w-[116px]");
    await unmount();
  });
});

/** the source-file test has nothing mounted to unmount */
async function unmount_noop() {}
