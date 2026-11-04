import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergedArticleTarget } from "../merged-editions";
import { articleRedirectPath } from "../slug";

const PLC_DUP = "راهنمای-جامع-plc؛-هر-آنچه-مهندسان-برق-و-اتوماسیون-باید-در-سال-۲۰۲۶-بدانند-mr2jshp5wszr";
const PLC_KEPT = "راهنمای-جامع-plc؛-هر-آنچه-مهندسان-برق-و-اتوماسیون-باید-در-سال-۲۰۲۶-بدانند-mr2k5nx5k026";
const AI_DUP = "آینده-هوش-مصنوعی-صنعتی؛-چگونه-ai-در-حال-متحول-کردن-plc،-scada-و-کارخانه-های-هوشم-mqyyerju0p84";
const AI_KEPT = "آینده-هوش-مصنوعی-صنعتی؛-چگونه-ai-در-حال-متحول-کردن-plc،-scada-و-کارخانه-های-هوشم-mr2asul8hgxc";

describe("mergedArticleTarget", () => {
  it("sends each archived duplicate to its kept edition", () => {
    expect(mergedArticleTarget(PLC_DUP)).toEqual({ locale: "fa", slug: PLC_KEPT });
    expect(mergedArticleTarget(AI_DUP)).toEqual({ locale: "fa", slug: AI_KEPT });
  });

  it("matches the percent-encoded form a browser or crawler requests", () => {
    expect(mergedArticleTarget(encodeURIComponent(PLC_DUP))).toEqual({ locale: "fa", slug: PLC_KEPT });
  });

  it("never redirects the kept editions themselves (no loop)", () => {
    expect(mergedArticleTarget(PLC_KEPT)).toBeNull();
    expect(mergedArticleTarget(AI_KEPT)).toBeNull();
  });

  it("ignores an unrelated slug that merely ends in a merged id", () => {
    expect(mergedArticleTarget("some-other-article-mr2jshp5wszr")).toBeNull();
    expect(mergedArticleTarget("mr2jshp5wszr")).toBeNull();
  });

  it("ignores ordinary and malformed slugs", () => {
    for (const s of ["", "scada-architecture-mrwakg3906q7", "%E0%A4%A", "-"]) {
      expect(mergedArticleTarget(s)).toBeNull();
    }
  });

  it("produces an encoded single-hop Location for the kept edition", () => {
    const target = mergedArticleTarget(AI_DUP)!;
    const location = articleRedirectPath(target.locale, target.slug);
    expect(location).toMatch(/^\/fa\/articles\/[\x21-\x7E]+$/);
    expect(decodeURIComponent(location)).toBe(`/fa/articles/${AI_KEPT}`);
  });

  it("is checked before any database read in both metadata and page", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "..", "app", "[locale]", "articles", "[slug]", "page.tsx"),
      "utf8",
    );
    const meta = src.slice(src.indexOf("export async function generateMetadata"), src.indexOf("export const dynamic"));
    const page = src.slice(src.indexOf("export default async function ArticleDetailPage"));
    for (const body of [meta, page]) {
      const guard = body.indexOf("mergedArticleTarget(slug)");
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(body.indexOf("getArticleDetailBySlug("));
    }
  });
});
