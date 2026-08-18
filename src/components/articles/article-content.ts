/**
 * PHASE 106 — the Journal's article-content parser.
 *
 * WHY A PARSER AND NOT A MARKDOWN LIBRARY
 * ───────────────────────────────────────
 * `ArticleContent` has always rendered stored Markdown as React NODES, never as
 * HTML — article bodies are author-supplied, and nothing in this pipeline may
 * ever reach `dangerouslySetInnerHTML`. That property is worth more than full
 * CommonMark coverage, so this stays a small hand-written block parser and the
 * repository gains no Markdown dependency.
 *
 * WHY IT MOVED OUT OF THE .tsx
 * ────────────────────────────
 * Two reasons. It is pure logic and deserves direct unit tests; and the test
 * runner's transform cannot import `.tsx` into vitest, so parser tests would be
 * impossible if this lived beside the JSX.
 *
 * WHAT PHASE 106 ADDED, AND WHY
 * ─────────────────────────────
 * The previous renderer understood headings, fenced code and bullet lists.
 * Everything else — tables, numbered procedures, block quotes, bold — fell
 * through to a paragraph and rendered as literal source text: a troubleshooting
 * procedure collapsed into one run-on line, and a parameter table appeared as a
 * wall of pipe characters. Long-form engineering content is mostly those
 * constructs, so they are now parsed:
 *
 *   - ordered lists      — numbered commissioning/diagnostic procedures
 *   - GFM pipe tables    — parameter/limit/failure-mode tables
 *   - block quotes       — cited engineering guidance
 *   - inline code + bold — tag names, block names, register addresses
 *
 * BACKWARD COMPATIBILITY: every construct the old renderer understood parses to
 * the same blocks, and anything unrecognised still degrades to a paragraph.
 * Existing articles render exactly as before.
 *
 * FENCED CODE IS TOKENISED BEFORE BLANK-LINE SPLITTING. The old renderer split
 * the whole document on blank lines first, which silently tore any code block
 * containing one into fragments — and an ASCII signal-path diagram, the single
 * most useful figure in a controls article, is mostly blank lines.
 */

/** A run of inline text. `code` and `strong` are the only decorations. */
export interface InlineSpan {
  type: "text" | "strong" | "code";
  value: string;
}

/** Logical column alignment — `start`/`end` so tables mirror under RTL. */
export type ColumnAlign = "start" | "center" | "end";

export type ArticleBlock =
  | { type: "heading"; level: 1 | 2 | 3; spans: InlineSpan[] }
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "list"; ordered: boolean; items: InlineSpan[][] }
  | { type: "code"; language: string | null; code: string }
  | { type: "quote"; spans: InlineSpan[] }
  | { type: "table"; head: InlineSpan[][]; rows: InlineSpan[][][]; align: ColumnAlign[] };

/**
 * An ordered-list marker, in ASCII, Persian-Indic (۰-۹) or Arabic-Indic (٠-٩)
 * digits.
 *
 * JavaScript's `\d` matches ASCII only, so a Persian numbered procedure written
 * `۱.` `۲.` fell through to a paragraph while the SAME article's English and
 * German editions rendered a real `<ol>` — the three editions of one document
 * disagreed on their own structure, and the Persian one lost its list
 * semantics for assistive technology. Found during the RTL rehearsal.
 */
const ORDERED_ITEM = /^\s*[0-9۰-۹٠-٩]+[.)]\s+/;
const BULLET_ITEM = /^\s*[-*]\s+/;
const QUOTE_LINE = /^\s*>\s?/;

/**
 * Split inline text into spans.
 *
 * Code spans are resolved BEFORE emphasis, matching Markdown: the contents of
 * `` `x ** y` `` are literal, not bold. Unterminated markers are emitted as
 * plain text rather than swallowing the rest of the paragraph.
 */
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      spans.push({ type: "text", value: buffer });
      buffer = "";
    }
  };

  let i = 0;
  while (i < text.length) {
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        spans.push({ type: "code", value: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        spans.push({ type: "strong", value: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    buffer += text[i];
    i += 1;
  }
  flush();

  // A block always yields at least one span so renderers need no empty case.
  return spans.length > 0 ? spans : [{ type: "text", value: text }];
}

/** Split one pipe-table row into trimmed cells, ignoring the outer pipes. */
function tableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/**
 * Is this the `| --- | :--: |` row that turns the line above it into a header?
 * Requires at least one dash so a row of empty cells is not mistaken for one.
 */
function isTableDelimiter(line: string): boolean {
  const cells = tableCells(line);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{1,}:?$/.test(c));
}

function alignOf(cell: string): ColumnAlign {
  const start = cell.startsWith(":");
  const end = cell.endsWith(":");
  if (start && end) return "center";
  // A trailing colon means "align to the far edge" — `end` in logical terms, so
  // it becomes right under LTR and left under RTL without a second code path.
  if (end) return "end";
  return "start";
}

/** Classify one blank-line-delimited group of lines into blocks. */
function classify(lines: string[]): ArticleBlock[] {
  const trimmed = lines.filter((l) => l.trim().length > 0);
  if (trimmed.length === 0) return [];

  const first = trimmed[0].trim();

  // Headings consume exactly their own line; whatever follows is classified
  // independently, so a heading immediately followed by prose is not absorbed.
  const heading = /^(#{1,3})\s+(.*)$/.exec(first);
  if (heading) {
    const level = heading[1].length as 1 | 2 | 3;
    return [
      { type: "heading", level, spans: parseInline(heading[2].trim()) },
      ...classify(trimmed.slice(1)),
    ];
  }

  // Table: a header row plus a delimiter row directly beneath it.
  if (trimmed.length >= 2 && first.includes("|") && isTableDelimiter(trimmed[1])) {
    const head = tableCells(first);
    const align = tableCells(trimmed[1]).map(alignOf);
    const rows = trimmed.slice(2).map((line) => {
      const cells = tableCells(line);
      // Pad or trim to the header width so the rendered grid is never ragged.
      const normalised = Array.from({ length: head.length }, (_, i) => cells[i] ?? "");
      return normalised.map(parseInline);
    });
    return [
      {
        type: "table",
        head: head.map(parseInline),
        rows,
        align: Array.from({ length: head.length }, (_, i) => align[i] ?? "start"),
      },
    ];
  }

  if (trimmed.every((l) => QUOTE_LINE.test(l))) {
    const text = trimmed.map((l) => l.replace(QUOTE_LINE, "")).join(" ").trim();
    return [{ type: "quote", spans: parseInline(text) }];
  }

  if (trimmed.every((l) => ORDERED_ITEM.test(l))) {
    return [
      {
        type: "list",
        ordered: true,
        items: trimmed.map((l) => parseInline(l.replace(ORDERED_ITEM, "").trim())),
      },
    ];
  }

  if (trimmed.every((l) => BULLET_ITEM.test(l))) {
    return [
      {
        type: "list",
        ordered: false,
        items: trimmed.map((l) => parseInline(l.replace(BULLET_ITEM, "").trim())),
      },
    ];
  }

  // A mixed group where SOME lines are bullets: the old renderer kept only the
  // bullet lines and dropped the rest. Keeping the leading prose as its own
  // paragraph loses nothing instead.
  const firstBullet = trimmed.findIndex((l) => BULLET_ITEM.test(l) || ORDERED_ITEM.test(l));
  if (firstBullet > 0) {
    return [
      { type: "paragraph", spans: parseInline(trimmed.slice(0, firstBullet).join(" ").trim()) },
      ...classify(trimmed.slice(firstBullet)),
    ];
  }

  // Paragraph. Lines are joined with a space because HTML collapses newlines
  // anyway — this is exactly what the previous renderer produced.
  return [{ type: "paragraph", spans: parseInline(trimmed.join(" ").trim()) }];
}

/**
 * Parse a stored article body into renderable blocks.
 *
 * Never throws and never returns `null`: unparseable input degrades to
 * paragraphs, because a rendering failure on a published article is a worse
 * outcome than an imperfectly formatted one.
 */
export function parseArticleContent(content: string): ArticleBlock[] {
  if (typeof content !== "string" || content.trim().length === 0) return [];

  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ArticleBlock[] = [];
  let group: string[] = [];

  const flushGroup = () => {
    if (group.length > 0) {
      blocks.push(...classify(group));
      group = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code first — its interior is opaque, blank lines included.
    const fence = /^\s*```(\w*)\s*$/.exec(line);
    if (fence) {
      flushGroup();
      const language = fence[1] || null;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      // An unterminated fence consumes to the end rather than dropping content.
      blocks.push({ type: "code", language, code: body.join("\n").replace(/\s+$/, "") });
      continue;
    }

    if (line.trim().length === 0) {
      flushGroup();
      continue;
    }
    group.push(line);
  }
  flushGroup();

  return blocks;
}

/** Plain text of a span list — used for reading-time and excerpt derivation. */
export function spansToText(spans: InlineSpan[]): string {
  return spans.map((s) => s.value).join("");
}

/**
 * Words in an article body, ignoring code blocks and table scaffolding.
 *
 * Used by the content validator to enforce the editorial depth floor. Persian
 * and German are counted the same way — whitespace-delimited runs — which is
 * accurate enough for a floor check and avoids pretending to do morphology.
 */
export function countArticleWords(content: string): number {
  let words = 0;
  for (const block of parseArticleContent(content)) {
    if (block.type === "code") continue;
    if (block.type === "table") {
      for (const row of block.rows) {
        for (const cell of row) words += spansToText(cell).split(/\s+/).filter(Boolean).length;
      }
      continue;
    }
    if (block.type === "list") {
      for (const item of block.items) words += spansToText(item).split(/\s+/).filter(Boolean).length;
      continue;
    }
    words += spansToText(block.spans).split(/\s+/).filter(Boolean).length;
  }
  return words;
}
