import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  parseArticleContent,
  parseInline,
  spansToText,
  countArticleWords,
  type ArticleBlock,
} from "../article-content";

/**
 * PHASE 106 — the article-content parser.
 *
 * Two things are being protected here. First, that the constructs long-form
 * engineering writing depends on — numbered procedures, parameter tables, ASCII
 * signal-path diagrams, inline tag names — reach the renderer as STRUCTURE
 * rather than as literal source text. Second, that nothing the previous
 * renderer understood changed shape, because the existing published corpus is
 * parsed by this same function.
 */

const kinds = (blocks: ArticleBlock[]) => blocks.map((b) => b.type);

describe("backward compatibility with the pre-Phase-106 renderer", () => {
  it("parses the four constructs the old renderer supported, unchanged", () => {
    const blocks = parseArticleContent(
      ["# Title", "", "## Section", "", "Some prose.", "", "- one", "- two"].join("\n"),
    );
    expect(kinds(blocks)).toEqual(["heading", "heading", "paragraph", "list"]);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks[1]).toMatchObject({ type: "heading", level: 2 });
    expect(blocks[3]).toMatchObject({ type: "list", ordered: false });
  });

  it("still joins a multi-line paragraph into one block, as HTML would render it", () => {
    const [block] = parseArticleContent("line one\nline two");
    expect(block.type).toBe("paragraph");
    expect(block.type === "paragraph" && spansToText(block.spans)).toBe("line one line two");
  });

  it("degrades unknown syntax to a paragraph instead of dropping it", () => {
    const [block] = parseArticleContent(":::admonition\nsomething odd\n:::");
    expect(block.type).toBe("paragraph");
    expect(block.type === "paragraph" && spansToText(block.spans)).toContain("something odd");
  });

  it("returns an empty document for empty or non-string input, never throws", () => {
    expect(parseArticleContent("")).toEqual([]);
    expect(parseArticleContent("   \n\n  ")).toEqual([]);
    expect(parseArticleContent(null as unknown as string)).toEqual([]);
  });
});

describe("fenced code survives blank lines", () => {
  // This is the regression that mattered most: the old renderer split the whole
  // document on blank lines FIRST, so an ASCII block diagram — which is mostly
  // blank lines — was torn into fragments and rendered as broken paragraphs.
  const diagram = [
    "```text",
    "Field Device",
    "    |",
    "",
    "Remote I/O",
    "    |",
    "",
    "PLC",
    "```",
  ].join("\n");

  it("keeps a diagram containing blank lines as ONE code block", () => {
    const blocks = parseArticleContent(diagram);
    expect(kinds(blocks)).toEqual(["code"]);
    const [block] = blocks;
    expect(block.type === "code" && block.code).toContain("Field Device");
    expect(block.type === "code" && block.code).toContain("PLC");
    // All 7 body lines survive, INCLUDING the two blank separators that used to
    // split this diagram into three unrelated paragraph blocks.
    const codeLines = block.type === "code" ? block.code.split("\n") : [];
    expect(codeLines).toHaveLength(7);
    expect(codeLines.filter((l) => l.trim() === "")).toHaveLength(2);
  });

  it("captures the fence language", () => {
    const [block] = parseArticleContent("```scl\nIF x THEN\nEND_IF;\n```");
    expect(block).toMatchObject({ type: "code", language: "scl" });
  });

  it("an unterminated fence consumes to the end rather than dropping content", () => {
    const [block] = parseArticleContent("```\nnever closed\nstill here");
    expect(block.type).toBe("code");
    expect(block.type === "code" && block.code).toContain("still here");
  });

  it("does not interpret markup inside a code block", () => {
    const [block] = parseArticleContent("```\n| a | b |\n| --- | --- |\n1. not a list\n```");
    expect(block.type).toBe("code");
  });
});

describe("ordered lists — numbered engineering procedures", () => {
  it("parses a numbered investigation sequence as an ordered list", () => {
    const [block] = parseArticleContent(
      ["1. Check the PLC output module.", "2. Verify field terminal voltage.", "3. Verify the contactor coil."].join("\n"),
    );
    expect(block).toMatchObject({ type: "list", ordered: true });
    expect(block.type === "list" && block.items).toHaveLength(3);
    expect(block.type === "list" && spansToText(block.items[1])).toBe("Verify field terminal voltage.");
  });

  it("accepts the `1)` form as well as `1.`", () => {
    const [block] = parseArticleContent("1) first\n2) second");
    expect(block).toMatchObject({ type: "list", ordered: true });
  });

  it("keeps bullets and numbers distinguishable", () => {
    const [ul] = parseArticleContent("- a\n- b");
    const [ol] = parseArticleContent("1. a\n2. b");
    expect(ul).toMatchObject({ ordered: false });
    expect(ol).toMatchObject({ ordered: true });
  });
});

describe("pipe tables — parameter and failure-mode tables", () => {
  const table = [
    "| Parameter | Engineering Meaning | Typical Concern |",
    "| --- | :---: | ---: |",
    "| PLC cycle time | Execution interval | Control latency |",
    "| Network jitter | Timing variation | Synchronization |",
  ].join("\n");

  it("parses header, alignment and body rows", () => {
    const [block] = parseArticleContent(table);
    expect(block.type).toBe("table");
    if (block.type !== "table") return;
    expect(block.head.map(spansToText)).toEqual([
      "Parameter",
      "Engineering Meaning",
      "Typical Concern",
    ]);
    expect(block.rows).toHaveLength(2);
    expect(block.rows[0].map(spansToText)).toEqual([
      "PLC cycle time",
      "Execution interval",
      "Control latency",
    ]);
  });

  it("maps alignment to LOGICAL edges so tables mirror correctly under RTL", () => {
    const [block] = parseArticleContent(table);
    // `---:` must be "end", not "right" — otherwise a Persian table pins the
    // column to the wrong side of the page.
    expect(block.type === "table" && block.align).toEqual(["start", "center", "end"]);
  });

  it("normalises ragged rows to the header width", () => {
    const [block] = parseArticleContent(
      ["| A | B | C |", "| --- | --- | --- |", "| only one |"].join("\n"),
    );
    expect(block.type === "table" && block.rows[0]).toHaveLength(3);
  });

  it("does not mistake ordinary prose containing a pipe for a table", () => {
    const [block] = parseArticleContent("Use the | operator carefully.\nIt is not a table.");
    expect(block.type).toBe("paragraph");
  });

  it("requires a real delimiter row — an all-empty row is not one", () => {
    const [block] = parseArticleContent("| a | b |\n|  |  |");
    expect(block.type).toBe("paragraph");
  });
});

describe("inline spans", () => {
  it("extracts inline code and bold", () => {
    expect(parseInline("set `FB_CONVEYOR` to **TRUE**")).toEqual([
      { type: "text", value: "set " },
      { type: "code", value: "FB_CONVEYOR" },
      { type: "text", value: " to " },
      { type: "strong", value: "TRUE" },
    ]);
  });

  it("treats code as opaque — emphasis inside a code span stays literal", () => {
    expect(parseInline("`a ** b`")).toEqual([{ type: "code", value: "a ** b" }]);
  });

  it("leaves an unterminated marker as plain text instead of swallowing the line", () => {
    expect(spansToText(parseInline("2 ** 3 = 8"))).toBe("2 ** 3 = 8");
    expect(spansToText(parseInline("a ` b"))).toBe("a ` b");
  });

  it("round-trips Persian text with embedded Latin technical terms", () => {
    const text = "پروتکل `PROFINET` برای ارتباط **قطعی** استفاده می‌شود";
    expect(spansToText(parseInline(text))).toBe(text.replace(/[`*]/g, ""));
  });
});

describe("block quotes and headings", () => {
  it("parses a multi-line quote as one block", () => {
    const [block] = parseArticleContent("> first line\n> second line");
    expect(block.type).toBe("quote");
    expect(block.type === "quote" && spansToText(block.spans)).toBe("first line second line");
  });

  it("a heading immediately followed by prose does not absorb the prose", () => {
    // The old renderer sliced the whole block after "## ", so an unseparated
    // paragraph ended up inside the <h2>.
    const blocks = parseArticleContent("## Failure Modes\nThe first mode is bearing wear.");
    expect(kinds(blocks)).toEqual(["heading", "paragraph"]);
    expect(blocks[0].type === "heading" && spansToText(blocks[0].spans)).toBe("Failure Modes");
  });

  it("caps heading depth at three levels, matching the renderer", () => {
    const [block] = parseArticleContent("#### too deep");
    expect(block.type).toBe("paragraph");
  });
});

describe("the renderer's direction contract", () => {
  /**
   * These are SOURCE assertions, not behavioural ones, and the reason is a tool
   * limitation rather than a choice: the test runner's transform cannot import
   * `.tsx` into vitest, so `ArticleDetailClient` cannot be rendered here. The
   * parser above is behaviourally tested; the JSX below is pinned so the
   * direction handling cannot be silently dropped.
   */
  const tsx = readFileSync(
    join(process.cwd(), "src/components/articles/ArticleDetailClient.tsx"),
    "utf8",
  );

  it("forces LTR on code blocks so ASCII diagrams stay readable in the Persian edition", () => {
    const codeBlock = tsx.slice(tsx.indexOf('case "code":'), tsx.indexOf('case "list":'));
    expect(codeBlock).toContain('dir="ltr"');
  });

  it("forces LTR on inline code so tag names do not reorder inside RTL prose", () => {
    const inline = tsx.slice(tsx.indexOf('if (span.type === "code")'), tsx.indexOf('return <span key={i}>'));
    expect(inline).toContain('dir="ltr"');
  });

  it("renders table alignment from the parser's logical edges, not hard-coded sides", () => {
    const table = tsx.slice(tsx.indexOf('case "table":'), tsx.indexOf("default:"));
    expect(table).toContain("textAlign: block.align[j]");
    expect(table).toContain("textAlign: block.align[k]");
    expect(table).not.toMatch(/textAlign:\s*["'](left|right)["']/);
  });

  it("scrolls a wide table inside its own container so the page never overflows", () => {
    const table = tsx.slice(tsx.indexOf('case "table":'), tsx.indexOf("default:"));
    expect(table).toContain("overflow-x-auto");
  });

  it("renders every parser block type — none falls through unhandled", () => {
    for (const kind of ['case "heading":', 'case "code":', 'case "list":', 'case "quote":', 'case "table":']) {
      expect(tsx, kind).toContain(kind);
    }
    // `paragraph` is the default branch.
    expect(tsx).toContain("default:");
  });

  it("uses semantic ol/ul/table/blockquote elements rather than styled divs", () => {
    for (const tag of ["<ol ", "<ul ", "<table ", "<blockquote", "<thead>", "<tbody>", "<th"]) {
      expect(tsx, tag).toContain(tag);
    }
  });

  it("never injects HTML — the whole reason this renderer exists", () => {
    expect(tsx).not.toContain("dangerouslySetInnerHTML");
  });
});

/**
 * PHASE 106 BATCH 2 — the REAL corpus, parsed.
 *
 * The suites above prove the parser against constructed input. This one runs it
 * over every published edition on disk, because Batch 2 introduced a construct
 * the Batch 1 corpus never contained (block quotes) and because the Persian
 * ordered-list defect found during the RTL rehearsal was invisible to
 * construct-level tests — the English and German editions of one article
 * produced a list while the Persian edition of the same article produced a
 * paragraph.
 *
 * These assertions are structural, not editorial. They do not police wording;
 * they fail when a body renders as something other than what it is written as.
 */
describe("every edition of the shipped corpus parses to real structure", () => {
  const ARTICLES = join(process.cwd(), "content/journal/articles");
  const slugs = readdirSync(ARTICLES).filter((d) => statSync(join(ARTICLES, d)).isDirectory());
  const editions = slugs.flatMap((slug) =>
    ["en.md", "fa.md", "de.md"].map((file) => ({
      id: slug + "/" + file,
      source: readFileSync(join(ARTICLES, slug, file), "utf8"),
    })),
  );

  it("finds a corpus to check", () => {
    expect(editions.length).toBeGreaterThanOrEqual(30);
  });

  it("opens every edition with exactly one level-1 heading", () => {
    for (const { id, source } of editions) {
      const blocks = parseArticleContent(source);
      expect(blocks[0], id).toMatchObject({ type: "heading", level: 1 });
      expect(blocks.filter((b) => b.type === "heading" && b.level === 1), id).toHaveLength(1);
    }
  });

  it("emits no empty block — nothing reaches the page as a blank element", () => {
    for (const { id, source } of editions) {
      for (const block of parseArticleContent(source)) {
        const where = id + " :: " + block.type;
        if (block.type === "list") expect(block.items.length, where).toBeGreaterThan(0);
        else if (block.type === "table") expect(block.rows.length, where).toBeGreaterThan(0);
        else if (block.type === "code") expect(block.code.length, where).toBeGreaterThan(0);
        else expect(spansToText(block.spans).trim(), where).not.toBe("");
      }
    }
  });

  it("turns every source construct into its own block type, in every language", () => {
    for (const { id, source } of editions) {
      const types = new Set(kinds(parseArticleContent(source)));
      if (/^> /m.test(source)) expect(types, id + " quote").toContain("quote");
      if (/^\|/m.test(source)) expect(types, id + " table").toContain("table");
      if (/^```/m.test(source)) expect(types, id + " code").toContain("code");
      if (/^- /m.test(source)) expect(types, id + " list").toContain("list");
    }
  });

  it("never leaves a numbered procedure stranded as a paragraph, in any script", () => {
    // The RTL regression guard: an ordered item that reaches the renderer as
    // prose has lost its list semantics for assistive technology.
    const STRANDED = /^\s*[0-9۰-۹٠-٩]+[.)]\s+\S/;
    for (const { id, source } of editions) {
      for (const block of parseArticleContent(source)) {
        if (block.type !== "paragraph") continue;
        expect(STRANDED.test(spansToText(block.spans)), id).toBe(false);
      }
    }
  });
});

describe("countArticleWords", () => {
  it("counts prose, list and table words but ignores code blocks", () => {
    const doc = ["one two three", "", "```", "ignored ignored ignored ignored", "```", "", "- four five"].join("\n");
    expect(countArticleWords(doc)).toBe(5);
  });

  it("counts Persian and German text", () => {
    expect(countArticleWords("این یک جمله است")).toBe(4);
    expect(countArticleWords("Die Auslegung der Antriebstechnik")).toBe(4);
  });
});

describe("ordered lists in non-ASCII numeral systems", () => {
  /**
   * REGRESSION: `\d` is ASCII-only in JavaScript, so Persian procedures written
   * `۱.` `۲.` degraded to paragraphs while the same article's English and German
   * editions rendered a real <ol>. Found during the RTL rehearsal.
   */
  it("parses a Persian-Indic numbered procedure as an ordered list", () => {
    const [block] = parseArticleContent("۱. گام نخست\n۲. گام دوم\n۳. گام سوم");
    expect(block).toMatchObject({ type: "list", ordered: true });
    expect(block.type === "list" && block.items).toHaveLength(3);
    expect(block.type === "list" && spansToText(block.items[0])).toBe("گام نخست");
  });

  it("parses Arabic-Indic numerals too", () => {
    const [block] = parseArticleContent("١. اول\n٢. ثاني");
    expect(block).toMatchObject({ type: "list", ordered: true });
  });

  it("handles multi-digit Persian markers", () => {
    const [block] = parseArticleContent("۹. نهم\n۱۰. دهم");
    expect(block.type === "list" && block.items).toHaveLength(2);
    expect(block.type === "list" && spansToText(block.items[1])).toBe("دهم");
  });

  it("still treats ordinary Persian prose as a paragraph", () => {
    const [block] = parseArticleContent("این یک جملهٔ عادی است که با عدد شروع نمی‌شود.");
    expect(block.type).toBe("paragraph");
  });

  it("every Persian edition that authors a numbered procedure now yields a list", () => {
    // Guards the actual shipped corpus, not just synthetic input.
    const doc = "۱. **ابتدا وضع موجود را اندازه بگیرید.** متن\n۲. **به سراغ صدر فهرست بروید.** متن";
    const [block] = parseArticleContent(doc);
    expect(block).toMatchObject({ type: "list", ordered: true });
  });
});
