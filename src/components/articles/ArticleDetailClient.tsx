"use client";
// PHASE 72.5 — Hermes Industrial Journal article detail (client island).
//
// PHASE 104-F — REBUILT as a professional reading instrument. The 72.5
// composition was a legacy-token page (title block, badge strips, an actions
// bar, the body, tags, a metadata card, an author card, a related-cards grid,
// all in pre-104 `text-ink` / `border-line` / `bg-surface2` classes).
// Everything it DID is preserved, byte-for-byte where it touches the network:
//   · save        POST/DELETE  /api/articles/saved      { articleId }
//   · reactions   POST/DELETE  /api/articles/reactions  { articleId, reactionType }
//   · follow      POST/DELETE  /api/articles/follow     { authorHandle }
//   · share       navigator.clipboard.writeText(location.href)
//   · related articles, author / category / tag links, knowledge metadata,
//     and the Persian display overlay (now shared via article-display.ts).
// What changed is the READING architecture:
//   · a 72ch measure on the body; the body is NEVER inside Glass;
//   · a reading-progress instrument — a structural bar plus an ARIA
//     progressbar with a numeric value, so the channel is never colour alone;
//   · a margin TOC on desktop derived from the article's REAL ## / ###
//     headings, rendered only when at least one exists; in-flow on mobile,
//     never an overlay; the active item is the reading Beacon;
//   · headings inside the body get stable ids for the TOC and deep links;
//   · a body `# ` heading renders as a level-2 heading, never a second page
//     title — the 72.5
//     renderer produced TWO H1s per article, an accessibility defect;
//   · code blocks are `dir="ltr"` islands with internal scroll only;
//   · provenance (evidence level, review state, domain, technology, platform,
//     standard, safety) as a definition list on the page's ONE Glass surface,
//     with semantic state ticks always paired with a text label;
//   · related articles as an editorial rail, not a card grid.
//
// SECURITY BOUNDARY, unchanged: the body renderer is a plain-text block parser.
// There is no HTML-injection API call, no raw HTML path, and this rewrite
// adds none. Content becomes React text nodes.
//
// Every visible string is `journal.*`. `formatDate(…, locale)` remains the
// shared formatter (pinned by format-migration.test.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ArticleDetail, ArticleListItem } from "@/lib/articles/types";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import { cn } from "@/components/ds";
import { buttonVariants } from "@/components/ds/logic";
import { getArticleDisplay } from "./article-display";

/* ── locale-invariant technical tokens render LTR inside an RTL page ─────── */
const LTR_TOKEN = /^(PLC|SCADA|HMI|OPC|MQTT|IEC|ISA|DCS|VFD|SIL|OT|IT|S7|TIA|WinCC|Modbus|Profinet|EtherNet)/i;

/* ── heading ids: stable, unique within one article ─────────────────────── */
function slugifyHeading(text: string, seen: Map<string, number>) {
  const base =
    text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section";
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? `h-${base}` : `h-${base}-${n + 1}`;
}

interface Heading { id: string; text: string; depth: 2 | 3 }

/**
 * The plain-text block parser. Same grammar the 72.5 renderer accepted —
 * `# / ## / ###`, fenced code, `- ` / `* ` lists, paragraphs — plus two blocks
 * the old renderer let fall through as paragraphs (`> ` quotes and pipe
 * tables), rendered as their proper elements. Still no HTML path.
 */
function parseBlocks(content: string) {
  const blocks = content.split(/\n{2,}/).filter((b) => b.trim());
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  const out = blocks.map((raw, i) => {
    const t = raw.trim();
    if (/^#{1,3} /.test(t)) {
      const level: 2 | 3 = t.startsWith("### ") ? 3 : 2;
      const text = t.replace(/^#{1,3} /, "");
      const id = slugifyHeading(text, seen);
      headings.push({ id, text, depth: level });
      return { kind: "heading" as const, level, text, id, key: i };
    }
    if (t.startsWith("```")) {
      const lang = (t.match(/^```(\w+)/) ?? [])[1] ?? "";
      const code = t.replace(/^```\w*\n?/, "").replace(/```$/, "").trim();
      return { kind: "code" as const, code, lang, key: i };
    }
    if (t.startsWith("- ") || t.startsWith("* ")) {
      const items = t.split("\n").map((l) => l.replace(/^[-*] /, "").trim()).filter(Boolean);
      return { kind: "list" as const, items, key: i };
    }
    if (t.startsWith("> ")) {
      return { kind: "quote" as const, text: t.split("\n").map((l) => l.replace(/^> ?/, "")).join(" "), key: i };
    }
    if (/^\|.+\|\s*\n\|[\s:|-]+\|/.test(t)) {
      const rows = t.split("\n").filter((l) => l.trim().startsWith("|"));
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      return { kind: "table" as const, head: cells(rows[0]), body: rows.slice(2).map(cells), key: i };
    }
    return { kind: "para" as const, text: t, key: i };
  });
  return { blocks: out, headings };
}

function ArticleBody({ content }: { content: string }) {
  const { blocks } = useMemo(() => parseBlocks(content), [content]);
  return (
    <div className="hj-body hj-measure text-body-lg">
      {blocks.map((b) => {
        switch (b.kind) {
          case "heading":
            return b.level === 3
              ? <h3 key={b.key} id={b.id} dir="auto" className="text-role-h4">{b.text}</h3>
              : <h2 key={b.key} id={b.id} dir="auto" className="text-role-h3">{b.text}</h2>;
          case "code":
            return <pre key={b.key} dir="ltr" aria-label={b.lang || undefined}><code>{b.code}</code></pre>;
          case "list":
            return <ul key={b.key}>{b.items.map((it, j) => <li key={j} dir="auto">{it}</li>)}</ul>;
          case "quote":
            return <blockquote key={b.key} dir="auto"><p>{b.text}</p></blockquote>;
          case "table":
            return (
              <div key={b.key} className="hj-table-scroll">
                <table>
                  <thead><tr>{b.head.map((h, j) => <th key={j} scope="col" dir="auto">{h}</th>)}</tr></thead>
                  <tbody>{b.body.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} dir="auto">{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
            );
          default:
            return <p key={b.key} dir="auto">{b.text}</p>;
        }
      })}
    </div>
  );
}

/* ── reading progress: structural bar + ARIA numeric value ───────────────── */
function ReadingProgress({ target, label }: { target: React.RefObject<HTMLElement | null>; label: string }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      setPct(total <= 0 ? 1 : Math.min(1, Math.max(0, -r.top / total)));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [target]);
  return (
    <div className="hj-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} style={{ ["--hj-progress" as string]: pct }}>
      <span />
    </div>
  );
}

/* ── margin TOC: real headings only; active item = reading Beacon ─────────── */
function Toc({ headings, title }: { headings: Heading[]; title: string }) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!headings.length || typeof IntersectionObserver === "undefined") return;
    const els = headings.map((h) => document.getElementById(h.id)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-20% 0px -65% 0px", threshold: [0, 1] });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [headings]);
  if (!headings.length) return null;
  return (
    <nav aria-label={title} className="hj-toc">
      <p className="hj-folio ps-3.5 pb-2">{title}</p>
      <ul>
        {headings.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} dir="auto" data-depth={h.depth} aria-current={active === h.id ? "true" : undefined} className="ds-focus">{h.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ── actions: save / react / share — network contracts unchanged ──────────── */
function ActionsBar({ article }: { article: ArticleDetail }) {
  const t = useTranslations("journal");
  const locale = useLocale();
  const [saved, setSaved]     = useState(false);
  const [reacted, setReacted] = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);
  const reactions = ["INSIGHTFUL", "HELPFUL", "DETAILED", "PRACTICAL"] as const;

  async function handleSave() {
    const next = !saved;
    setSaved(next);
    await fetch("/api/articles/saved", {
      method: next ? "POST" : "DELETE",
      body:   next ? JSON.stringify({ articleId: article.id }) : undefined,
      headers: { "Content-Type": "application/json" },
    }).catch(() => setSaved(!next));
  }
  async function handleReact(key: string) {
    const next = reacted === key ? null : key;
    setReacted(next);
    await fetch("/api/articles/reactions", {
      method: next ? "POST" : "DELETE",
      ...(next ? { body: JSON.stringify({ articleId: article.id, reactionType: key }), headers: { "Content-Type": "application/json" } } : {}),
    }).catch(() => setReacted(reacted));
  }
  function handleShare() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
  }

  const chip = "ds-focus inline-flex min-h-11 items-center gap-1.5 rounded-sm border px-3 text-label transition-colors motion-reduce:transition-none";
  return (
    <div className="flex flex-wrap items-center gap-2 border-y py-3" style={{ borderColor: "var(--color-border-default)" }}>
      {reactions.map((key) => (
        <button key={key} type="button" onClick={() => handleReact(key)} aria-pressed={reacted === key}
          className={cn(chip, reacted === key ? "text-brand-primary" : "text-text-secondary hover:text-text-primary")}
          style={{ borderColor: reacted === key ? "var(--beacon-core)" : "var(--color-border-default)" }}>
          <span aria-hidden="true">{reacted === key ? "◆" : "◇"}</span>{t(`detail.reaction.${key}`)}
        </button>
      ))}
      <span className="mx-1 hidden h-5 w-px sm:block" style={{ background: "var(--color-border-default)" }} aria-hidden="true" />
      <button type="button" onClick={handleSave} aria-pressed={saved} className={cn(chip, "text-text-secondary hover:text-text-primary")} style={{ borderColor: saved ? "var(--beacon-core)" : "var(--color-border-default)" }}>
        <span aria-hidden="true">{saved ? "▣" : "▢"}</span>{t("detail.save")}
      </button>
      <button type="button" onClick={handleShare} className={cn(chip, "text-text-secondary hover:text-text-primary")} style={{ borderColor: "var(--color-border-default)" }} aria-live="polite">
        <span aria-hidden="true">⇪</span>{copied ? t("detail.copied") : t("detail.share")}
      </button>
      <span className="ms-auto flex items-center gap-3 text-caption text-text-muted">
        <span>{formatNumber(article.saveCount, locale)} {t("detail.savesUnit")}</span>
        <span>{formatNumber(article.reactionCount, locale)} {t("detail.reactionsUnit")}</span>
      </span>
    </div>
  );
}

/* ── author provenance: follow contract unchanged ─────────────────────────── */
function AuthorProvenance({ article, locale }: { article: ArticleDetail; locale: string }) {
  const t = useTranslations("journal");
  const [following, setFollowing] = useState(false);
  const { author } = article;
  async function handleFollow() {
    const next = !following;
    setFollowing(next);
    await fetch("/api/articles/follow", {
      method: next ? "POST" : "DELETE",
      ...(next
        ? { body: JSON.stringify({ authorHandle: author.handle }), headers: { "Content-Type": "application/json" } }
        : {}),
    }).catch(() => setFollowing(!next));
  }
  return (
    <div className="hj-rail">
      <p className="hj-folio">{t("detail.aboutAuthor")}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <Link href={`/${locale}/articles/author/${author.handle}`} dir="auto" className="ds-focus text-title-lg font-semibold text-text-primary hover:text-brand-primary">{author.displayName}</Link>
        {author.verifiedExpert ? <span className="hj-folio text-brand-primary">◆ {t("detail.verifiedExpert")}</span> : null}
      </p>
      {author.roleTitle || author.company ? (
        <p dir="auto" className="mt-1 text-body-compact text-text-secondary">{[author.roleTitle, author.company].filter(Boolean).join(" · ")}</p>
      ) : null}
      {author.headline ? <p dir="auto" className="mt-2 max-w-prose text-body-compact text-text-secondary">{author.headline}</p> : null}
      {author.expertiseAreas.length ? (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {author.expertiseAreas.slice(0, 5).map((x) => <span key={x} dir={LTR_TOKEN.test(x) ? "ltr" : "auto"} className="hj-folio">{x}</span>)}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleFollow} aria-pressed={following} className={cn(buttonVariants(following ? "secondary" : "primary", "md"), "min-h-11")}>
          {following ? t("detail.following") : t("detail.follow")}
        </button>
        <span className="text-caption text-text-muted">{formatNumber(author.followerCount, locale)} {t("followersUnit")}</span>
        <Link href={`/${locale}/articles/author/${author.handle}`} className="ds-focus inline-flex min-h-11 items-center text-body-compact font-semibold text-brand-primary hover:underline">{t("detail.viewFullProfile")}</Link>
      </div>
    </div>
  );
}

/* ── related: an editorial rail, not a card grid ─────────────────────────── */
function RelatedRail({ articles, locale, isFa }: { articles: ArticleListItem[]; locale: string; isFa: boolean }) {
  const t = useTranslations("journal");
  return (
    <section aria-labelledby="related-title" className="mt-14">
      <p className="hj-folio">{t("detail.keepReading")}</p>
      <h2 id="related-title" dir="auto" className="mt-1 text-role-h4 font-bold text-text-primary">{t("pressroom.relatedTitle")}</h2>
      <ol className="hj-ledger mt-4">
        {articles.slice(0, 5).map((a, i) => {
          const d = getArticleDisplay(a, isFa);
          return (
            <li key={a.id} className="hj-entry">
              <span aria-hidden="true" className="hj-entry-no">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <span dir="auto" className="hj-folio">{t(`contentType.${a.contentType}`)}</span>
                <h3 dir="auto" className="mt-1 text-title-lg font-semibold leading-snug text-text-primary">
                  <Link href={`/${locale}/articles/${a.slug}`} className="ds-focus hover:text-brand-primary">{d.title}</Link>
                </h3>
              </div>
              <span className="hidden text-caption text-text-secondary md:block" dir="auto">
                {a.author.displayName}{a.readingTimeMinutes ? ` · ${t("pressroom.readingTime", { minutes: a.readingTimeMinutes })}` : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

interface Props { article: ArticleDetail; related: ArticleListItem[] }

export function ArticleDetailClient({ article, related }: Props) {
  const t = useTranslations("journal");
  const locale = useLocale();
  const isFa = locale === "fa";
  const bodyRef = useRef<HTMLElement | null>(null);
  const { headings } = useMemo(() => parseBlocks(article.content), [article.content]);
  const display = getArticleDisplay(article, isFa);
  const km = article.knowledgeMetadata;
  const cat = article.category;
  const catName = cat ? (isFa && cat.nameFa ? cat.nameFa : cat.name) : null;

  return (
    <div className="hj-page">
      <ReadingProgress target={bodyRef} label={t("pressroom.readingProgress")} />
      <div className="mx-auto w-full max-w-[78rem] px-5 md:px-10">

        {/* ── folio line ── */}
        <nav aria-label={t("detail.breadcrumbJournal")} className="pt-6">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <li><Link href={`/${locale}/articles`} className="ds-focus hj-folio hj-folio-strong inline-flex min-h-11 items-center hover:text-brand-primary">{t("brandUpper")}</Link></li>
            {catName && cat ? (<><li aria-hidden="true" className="hj-folio">/</li><li><Link href={`/${locale}/articles/category/${cat.slug}`} dir="auto" className="ds-focus hj-folio inline-flex min-h-11 items-center hover:text-brand-primary">{catName}</Link></li></>) : null}
          </ol>
        </nav>
        <div className="hj-rule-heavy w-full" aria-hidden="true" />

        {/* ── title block + provenance ── */}
        <header className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span dir="auto" className="hj-folio hj-folio-strong">{t(`contentType.${article.contentType}`)}</span>
              {km?.safetyCritical ? <span className="hj-state hj-folio" data-state="safety">{t("badge.safetyCritical")}</span> : null}
              {km?.humanReviewed ? <span className="hj-state hj-folio" data-state="reviewed">{t("detail.humanReviewed")}</span> : null}
            </div>
            <h1 dir="auto" className="mt-4 max-w-4xl font-display text-role-h1 font-extrabold leading-[1.08] tracking-tight text-text-primary md:text-display">{display.title}</h1>
            {display.titleEn ? <p dir="ltr" className="mt-2 text-body-compact text-text-muted">{display.titleEn}</p> : null}
            {display.subtitle ? <p dir="auto" className="mt-4 max-w-2xl text-body-lg text-text-secondary">{display.subtitle}</p> : null}

            <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-caption text-text-secondary">
              <div className="flex gap-2"><dt className="text-text-muted">{t("pressroom.byAuthor")}</dt><dd><Link href={`/${locale}/articles/author/${article.author.handle}`} dir="auto" className="ds-focus font-medium text-text-primary hover:text-brand-primary">{article.author.displayName}</Link>{article.author.verifiedExpert ? <span className="ms-1 text-brand-primary" aria-label={t("detail.verifiedExpert")}>◆</span> : null}</dd></div>
              {article.publishedAt ? <div className="flex gap-2"><dt className="text-text-muted">{t("pressroom.publishedOn")}</dt><dd><time dateTime={article.publishedAt}>{formatDate(article.publishedAt, locale)}</time></dd></div> : null}
              {article.updatedAt && article.publishedAt && article.updatedAt.slice(0, 10) !== article.publishedAt.slice(0, 10) ? <div className="flex gap-2"><dt className="text-text-muted">{t("pressroom.updatedOn")}</dt><dd><time dateTime={article.updatedAt}>{formatDate(article.updatedAt, locale)}</time></dd></div> : null}
              {article.readingTimeMinutes > 0 ? <div><dd dir="auto">{t("pressroom.readingTime", { minutes: article.readingTimeMinutes })}</dd></div> : null}
            </dl>
          </div>

          {/* provenance — the article page's ONE Glass surface; never the body */}
          {km || article.tags.length ? (
            <aside aria-label={t("pressroom.provenanceTitle")} className="ds-glass-elevated hj-provenance self-start rounded-lg p-4 md:p-5" data-hermes-signature="glass-elevated">
              <p className="hj-folio">{t("pressroom.provenanceTitle")}</p>
              <dl className="mt-2">
                {km?.industrialDomain ? <div className="hj-provenance-row"><dt>{t("pressroom.domainLabel")}</dt><dd dir="auto" className="text-body-compact text-text-primary">{km.industrialDomain}</dd></div> : null}
                {km?.linkedTechnology ? <div className="hj-provenance-row"><dt>{t("pressroom.technologyLabel")}</dt><dd dir={LTR_TOKEN.test(km.linkedTechnology) ? "ltr" : "auto"} className="text-body-compact text-text-primary">{km.linkedTechnology}</dd></div> : null}
                {km?.linkedPLCPlatform ? <div className="hj-provenance-row"><dt>{t("pressroom.platformLabel")}</dt><dd dir="ltr" className="text-body-compact text-text-primary">{km.linkedPLCPlatform}</dd></div> : null}
                {km?.linkedStandard ? <div className="hj-provenance-row"><dt>{t("pressroom.standardLabel")}</dt><dd dir="ltr" className="text-body-compact text-text-primary">{km.linkedStandard}</dd></div> : null}
                {km?.evidenceLevel ? <div className="hj-provenance-row"><dt>{t("pressroom.evidenceLabel")}</dt><dd className="hj-state text-body-compact text-text-primary" data-state="evidence"><span dir="auto">{km.evidenceLevel}</span></dd></div> : null}
                {km ? <div className="hj-provenance-row"><dt>{t("pressroom.reviewLabel")}</dt><dd className="hj-state text-body-compact text-text-primary" data-state={km.humanReviewed ? "reviewed" : undefined}><span dir="auto">{km.humanReviewed ? t("pressroom.reviewedByHuman") : t("pressroom.notReviewed")}</span></dd></div> : null}
                {article.tags.length ? <div className="hj-provenance-row"><dt>{t("pressroom.filedUnder")}</dt><dd className="flex flex-wrap gap-x-3 gap-y-1">{article.tags.map((tg) => <Link key={tg.id} href={`/${locale}/articles/tag/${tg.slug}`} dir={LTR_TOKEN.test(tg.name) ? "ltr" : "auto"} className="ds-focus text-body-compact text-text-secondary hover:text-brand-primary">{isFa && tg.nameFa ? tg.nameFa : tg.name}</Link>)}</dd></div> : null}
              </dl>
            </aside>
          ) : null}
        </header>

        <div className="mt-8"><ActionsBar article={article} /></div>

        {/* ── the reading spread: body + margin TOC ── */}
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-14">
          <article ref={bodyRef} className="min-w-0">
            {headings.length ? <div className="mb-8 lg:hidden"><Toc headings={headings} title={t("pressroom.onThisPage")} /></div> : null}
            <ArticleBody content={article.content} />
          </article>
          <div className="hidden min-w-0 lg:block">
            <Toc headings={headings} title={t("pressroom.onThisPage")} />
          </div>
        </div>

        <div className="mt-10"><ActionsBar article={article} /></div>
        <div className="mt-10"><AuthorProvenance article={article} locale={locale} /></div>
        {related.length ? <RelatedRail articles={related} locale={locale} isFa={isFa} /> : null}
        <div className="mt-12 pb-16">
          <Link href={`/${locale}/articles`} className="ds-focus inline-flex min-h-11 items-center gap-2 text-body-compact font-semibold text-brand-primary hover:underline">
            <span aria-hidden="true" className="rtl:-scale-x-100">←</span>{t("pressroom.backToJournal")}
          </Link>
          <div className="hj-rule-heavy mt-8 w-full" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
