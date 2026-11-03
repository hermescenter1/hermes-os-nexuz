import { describe, it, expect, vi } from "vitest";

/**
 * The academy layout's `buildMetadata` gives every child route `index, follow`
 * plus a canonical and hreflang cluster for `/academy`. Three per-viewer pages
 * declared only a title, so they inherited all of it: live on 2026-11-02,
 * /en/academy/learning and /en/academy/certs answered `index, follow` with a
 * canonical of /en/academy, and /en/academy/learning drew clicks in Search
 * Console as a duplicate of the hub. Next merges metadata per key, so each page
 * must set `robots` AND `alternates` itself.
 */

vi.mock("@/components/academy/MyLearningClient", () => ({ MyLearningClient: () => null }));
vi.mock("@/components/academy/MyCertificatesClient", () => ({ MyCertificatesClient: () => null }));
vi.mock("@/components/academy/CertificateViewClient", () => ({ CertificateViewClient: () => null }));

const PAGES = {
  "academy/learning": () => import("@/app/[locale]/academy/learning/page"),
  "academy/certs": () => import("@/app/[locale]/academy/certs/page"),
  "academy/certificate/[id]": () => import("@/app/[locale]/academy/certificate/[id]/page"),
} as const;

describe.each(Object.entries(PAGES))("%s metadata", (_route, load) => {
  it("is noindex", async () => {
    const { metadata } = await load();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("overrides the inherited canonical and hreflang with an empty alternates", async () => {
    const { metadata } = await load();
    expect(metadata.alternates).toEqual({});
  });

  it("keeps its own title", async () => {
    const { metadata } = await load();
    expect(metadata.title).toMatch(/Hermes Academy$/);
  });
});
