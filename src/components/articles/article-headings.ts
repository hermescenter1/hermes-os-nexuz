/**
 * PHASE 104 R1 (V-M8) — the article's leading title heading.
 *
 * An imported article opens with its own `# Title`, so the detail page rendered
 * the title three times within one viewport: the display `h1`, that leading
 * heading as the first body `h2`, and the same text again as the first
 * "On this page" entry.
 *
 * The rule lives here, as a pure function, because the body and the table of
 * contents both derive from it — a single decision neither can contradict — and
 * because a layout claim deserves a test that runs the actual rule rather than
 * grepping the component.
 */

/** Comparison form: NFC, collapsed whitespace, trimmed, locale-lowercased. */
export function normalizeHeading(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export interface LeadingHeadingBlock {
  type: string;
  spans?: unknown;
}

/**
 * Drops the FIRST block when it is a heading that repeats `title`.
 *
 * Deliberately narrow: only the first block, and only on an exact normalised
 * match, so a section that legitimately restates the title later in the article
 * is left alone. Returns the input unchanged when there is no title, no blocks,
 * or no duplicate.
 */
export function dropDuplicateLeadingTitle<T extends LeadingHeadingBlock>(
  blocks: T[],
  title: string | undefined,
  textOf: (block: T) => string,
): T[] {
  const first = blocks[0];
  if (!title || !first || first.type !== "heading") return blocks;
  return normalizeHeading(textOf(first)) === normalizeHeading(title) ? blocks.slice(1) : blocks;
}
