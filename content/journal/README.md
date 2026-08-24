# Hermes Journal — multilingual engineering corpus

Source of truth for the Journal's editorially-authored technical articles. Files
here are **content**, not code: they are read by the validator and the importer,
and they are written into the Journal's existing `Article` schema. There is no
second CMS and no parallel content table.

## Layout

```text
content/journal/
  taxonomy.json                     categories + tags (upserted, never invented)
  author.json                       the editorial byline
  articles/<slug>/
    article.json                    shared + per-edition metadata
    en.md  fa.md  de.md             the three bodies
```

The **directory name is the slug, and the slug is the translation-group key**.
The three editions of one article share it and differ only by `language`
(`Article @@unique([slug, language])`). That is what makes
`/fa/articles/{slug}`, `/en/articles/{slug}` and `/de/articles/{slug}` genuinely
the three translations the SEO layer already advertises as hreflang alternates.

## Commands

Validate the corpus — no database, no network:

```bash
npm run journal:validate
```

See exactly what an import would write, without opening a connection:

```bash
npm run journal:import:dry
```

Write to the database (requires `DATABASE_URL`; idempotent, additive only):

```bash
npm run journal:import
```

Import a single translation group:

```bash
node scripts/journal/import-articles.mjs --commit --only modern-plc-architecture-large-industrial-plants
```

## Editorial rules the validator enforces

These fail the build of the corpus, not just a review:

- all three locales present, with a body file for each
- no two editions of one article share a body — an untranslated copy is an error
- at least 900 words and 5 section headings per edition
- `title`, `excerpt`, `seoTitle`, `seoDescription` non-empty in every locale
- SEO titles and descriptions unique within each locale
- Persian text uses Persian `ی` / `ک`, never Arabic `ي` / `ك`
- slugs are lowercase ASCII kebab-case
- every category and tag already declared in `taxonomy.json`
- `publishedAt` a valid, non-future ISO timestamp

Warnings (reported, not fatal): SEO title 40–70 characters, meta description
120–170, excerpt at least 80 characters.

## Editorial rules the validator cannot enforce

Judgement, and the reason a human reviews before import:

- **No fabricated facts.** No invented statistics, plant results, efficiency
  gains, failure rates, customer names or test results. Industrial scenarios are
  written as illustrative engineering examples and labelled as such in the text.
- **No invented standard clauses.** Standards are referenced at the level of
  their scope and intent. If a precise clause cannot be verified, describe the
  standard instead of citing a number.
- **No fabricated credentials.** See `author.json` — the byline is an editorial
  desk, and `verifiedExpert` stays false.
- **Vendor-neutral** unless a topic is specifically about one ecosystem, and no
  claim of vendor endorsement.
- **Genuine translation.** Each edition must read naturally in its own language,
  not as a word-for-word rendering of the English.

## Content format

Markdown, rendered by `src/components/articles/article-content.ts` into React
nodes — never into HTML. Supported: `#`/`##`/`###` headings, paragraphs, bullet
and numbered lists, fenced code blocks (blank lines inside are preserved), GFM
pipe tables with alignment, block quotes, `**bold**` and `` `inline code` ``.

Anything else degrades to a paragraph rather than failing. Two notes:

- Code blocks and inline code render `dir="ltr"` in every locale, so ASCII block
  diagrams and tag names stay readable on the Persian edition.
- Table alignment is logical (`start`/`center`/`end`), so `---:` pins a column to
  the far edge in both LTR and RTL.

## Cover images

`article.json` carries an image *manifest* — concept, generation prompt, target
dimensions and alt text in all three locales — with `url: null`. The importer
writes `coverImageUrl` only when a real asset URL is present, so no article ever
references an image file that has not been produced. Populate `url` once the
asset exists; no binary placeholder is committed.
