"use client";
// PHASE 72.5 — Hermes Industrial Journal article detail (client island).
//
// PHASE 104-F — REBUILT as a professional reading instrument. The 72.5
// composition was a legacy-token page (title block, badge strips, an actions
// bar, the body, tags, a metadata card, an author card, a related-cards grid,
// all in pre-104 `text-ink` / `border-line` / `bg-surface2` classes).
// Everything it DID is preserved, byte-for-byte where it touches the network:
//   · save        POST /api/articles/saved { articleId } · DELETE /api/articles/saved?articleId=
//                 (PR #70: page-owned, server-seeded, anonymous → sign-in link)
//   · reactions   server-truthful, rendered by <ArticleEngagement> (PR #70:
//                 POST/DELETE /api/articles/{id}/reaction) — no local reaction state here
//   · discussion  first page server-loaded, replies preserved (PR #70, <ArticleEngagement>)
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
import { dropDuplicateLeadingTitle } from "./article-headings";
import type { ArticleDetail, ArticleListItem } from "@/lib/articles/types";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import { cn } from "@/components/ds";
import { buttonVariants } from "@/components/ds/logic";
import { getArticleDisplay } from "./article-display";
// PR #70 — server-truthful reactions + discussion (reply-preserving) and the viewer contract.
import { parseArticleContent, type InlineSpan } from "./article-content";
import { ArticleEngagement, type EngagementViewer } from "./ArticleEngagement";
import type { CommentPage, ReactionSummary } from "@/lib/articles/engagement-types";

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



/* ── the body renderer: 104-F pressroom shell over MAIN's tested parser ────
   Blocks and inline spans come from ./article-content — the parser main
   ships and unit-tests. That preserves, verbatim, main's content semantics:
   inline strong/code, ordered lists whose ASCII or Persian-Indic markers
   become a real <ol> (marker digits localize in CSS via :lang(fa), so no
   locale ternary lives here), authored column alignment, and the single-h1
   rule — a body "# " renders as an h2 element; the page's only h1 is the title.
   The pressroom look (hj-* typography, per-block dir="auto", the internal
   table scroll) stays 104-F. Heading ids for the margin TOC are derived
   with the same slug rule as before. */
function spanText(spans: InlineSpan[]) {
  return spans.map((sp) => sp.value).join("");
}

function Inline({ spans }: { spans: InlineSpan[] }) {
  return (
    <>
      {spans.map((span, i) => {
        if (span.type === "strong") return <strong key={i}>{span.value}</strong>;
        if (span.type === "code")
          // dir="ltr": a tag name, block name or register address must not
          // reorder visually inside Persian prose (.hj-body code isolates too —
          // belt and braces, both pinned by article-content.test.ts).
          return <code key={i} dir="ltr">{span.value}</code>;
        return <span key={i}>{span.value}</span>;
      })}
    </>
  );
}

function articleModel(content: string, title?: string) {
  /* PHASE 104 R1 (V-M8) - the body and the TOC both come from here, so the
     leading heading that merely repeats the page title is dropped once, for
     both. The rule itself lives in ./article-headings so it can be tested
     directly. */
  const blocks = dropDuplicateLeadingTitle(parseArticleContent(content), title, (b) =>
    b.type === "heading" ? spanText(b.spans) : "");
  const seen = new Map<string, number>();
  const headings: Heading[] = [];
  const ids = blocks.map((b) => {
    if (b.type !== "heading") return null;
    const text = spanText(b.spans);
    const id = slugifyHeading(text, seen);
    headings.push({ id, text, depth: b.level === 3 ? 3 : 2 });
    return id;
  });
  return { blocks, ids, headings };
}

function ArticleBody({ content, title }: { content: string; title?: string }) {
  const { blocks, ids } = useMemo(() => articleModel(content, title), [content, title]);
  return (
    <div className="hj-body hj-measure text-body-lg">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            return block.level === 3
              ? <h3 key={i} id={ids[i]!} dir="auto" className="text-role-h4"><Inline spans={block.spans} /></h3>
              : <h2 key={i} id={ids[i]!} dir="auto" className="text-role-h3"><Inline spans={block.spans} /></h2>;
          case "code":
            return <pre key={i} dir="ltr" aria-label={block.language || undefined}><code>{block.code}</code></pre>;
          case "list":
            return block.ordered
              ? <ol key={i}>{block.items.map((item, j) => <li key={j} dir="auto"><Inline spans={item} /></li>)}</ol>
              : <ul key={i}>{block.items.map((item, j) => <li key={j} dir="auto"><Inline spans={item} /></li>)}</ul>;
          case "quote":
            return <blockquote key={i} dir="auto"><p><Inline spans={block.spans} /></p></blockquote>;
          case "table":
            return (
              <div key={i} className="hj-table-scroll overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>{block.head.map((cell, j) => <th key={j} scope="col" dir="auto" style={{ textAlign: block.align[j] }}><Inline spans={cell} /></th>)}</tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => <tr key={j}>{row.map((cell, k) => <td key={k} dir="auto" style={{ textAlign: block.align[k] }}><Inline spans={cell} /></td>)}</tr>)}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <p key={i} dir="auto"><Inline spans={block.spans} /></p>;
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

/* ── actions: save / share — save is PAGE-owned (PR #70); reactions live in <ArticleEngagement> ── */
/**
 * PR #70 — save state is owned by the PAGE, not by this bar. The bar renders
 * twice (above and below the body); when each copy held its own state, saving
 * in one left the other showing the opposite label — two controls for one fact.
 * It is lifted so both render the same value, seeded from the server, and
 * reverted to server truth on failure. An anonymous reader gets a sign-in link
 * that returns to this article instead of a toggle. Reactions used to be local
 * state here; they are server-truthful now and rendered by <ArticleEngagement>,
 * so this bar keeps save, share and the counters. 104-F chip geometry unchanged.
 */
interface SaveControl {
  saved:     boolean;
  busy:      boolean;
  error:     string | null;
  /** Absent for an anonymous reader, who is sent to sign-in instead. */
  onToggle?: () => void;
  /** Localized sign-in URL that returns to this article. */
  authHref?: string;
}

function ActionsBar({ article, save }: { article: ArticleDetail; save: SaveControl }) {
  const t = useTranslations("journal");
  const locale = useLocale();
  const [copied, setCopied]   = useState(false);

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
      {/* Save — the glyph switches ▢ → ▣ AND the label changes word, so the state
          is never colour alone; aria-pressed carries it to assistive tech. */}
      {save.onToggle ? (
        <button type="button" onClick={save.onToggle} disabled={save.busy} aria-pressed={save.saved}
          className={cn(chip, "text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60")}
          style={{ borderColor: save.saved ? "var(--beacon-core)" : "var(--color-border-default)" }}>
          <span aria-hidden="true">{save.saved ? "▣" : "▢"}</span>{save.saved ? t("engagement.saved") : t("detail.save")}
        </button>
      ) : (
        <a href={save.authHref ?? "#"} title={t("engagement.signInToSave")}
          className={cn(chip, "text-text-secondary hover:text-text-primary")}
          style={{ borderColor: "var(--color-border-default)" }}>
          <span aria-hidden="true">▢</span>{t("detail.save")}
        </a>
      )}
      {save.error ? <span role="alert" className="text-caption text-state-critical">{save.error}</span> : null}
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

interface Props {
  article: ArticleDetail;
  related: ArticleListItem[];
  /**
   * PR #70 — reactions and the first page of the discussion, loaded on the
   * server so the conversation is present in the initial HTML rather than
   * appearing after a client round-trip. Optional so the mock/offline render
   * path and any other caller keep working unchanged.
   */
  engagement?: {
    reactions: ReactionSummary;
    comments:  CommentPage;
    /** Whether the signed-in reader has bookmarked this article. */
    saved:     boolean;
    viewer:    EngagementViewer | null;
  };
}

export function ArticleDetailClient({ article, related, engagement }: Props) {
  const t = useTranslations("journal");
  const locale = useLocale();
  const isFa = locale === "fa";
  const bodyRef = useRef<HTMLElement | null>(null);
  const display = getArticleDisplay(article, isFa);
  // Same title the h1 renders, so body and TOC drop exactly the heading it repeats.
  const { headings } = useMemo(
    () => articleModel(article.content, display.title),
    [article.content, display.title],
  );
  const km = article.knowledgeMetadata;
  const cat = article.category;
  const catName = cat ? (isFa && cat.nameFa ? cat.nameFa : cat.name) : null;

  // ── Bookmark (PR #70) ────────────────────────────────────────────────────
  // Seeded from the server so the correct label is in the first paint, then
  // kept in step with what the server actually confirmed.
  const [saved, setSaved]             = useState(engagement?.saved ?? false);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  // Synchronous guard — React's disabled={busy} is not instantaneous, so a fast
  // double-click could otherwise fire POST and DELETE out of order.
  const savingRef = useRef(false);

  async function toggleSave() {
    if (savingRef.current) return;
    const next = !saved;
    savingRef.current = true;
    setSavePending(true);
    setSaveError(null);
    // Optimistic, but reverted below if the server disagrees.
    setSaved(next);
    try {
      const res = await fetch(
        next ? "/api/articles/saved" : `/api/articles/saved?articleId=${encodeURIComponent(article.id)}`,
        next
          ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: article.id }) }
          : { method: "DELETE" },
      );
      if (!res.ok) {
        setSaved(!next);
        setSaveError(t("engagement.saveFailed"));
        return;
      }
      // Server truth wins over the optimistic guess.
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (typeof data.saved === "boolean")        setSaved(data.saved);
      else if (typeof data.unsaved === "boolean") setSaved(!data.unsaved);
    } catch {
      setSaved(!next);
      setSaveError(t("engagement.networkError"));
    } finally {
      setSavePending(false);
      savingRef.current = false;
    }
  }

  const saveControl: SaveControl = {
    saved,
    busy:  savePending,
    error: saveError,
    // An anonymous reader has no toggle at all — they get the sign-in link,
    // carrying a return path back to this exact article.
    ...(engagement?.viewer
      ? { onToggle: toggleSave }
      : { authHref: `/${locale}/auth/login?from=${encodeURIComponent(`/${locale}/articles/${article.slug}`)}` }),
  };

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
                {article.tags.length ? <div className="hj-provenance-row"><dt>{t("pressroom.filedUnder")}</dt><dd className="flex flex-wrap gap-x-3 gap-y-1">{article.tags.map((tg) => <Link key={tg.id} href={`/${locale}/articles/tag/${tg.slug}`} dir={LTR_TOKEN.test(tg.name) ? "ltr" : "auto"} className="ds-focus inline-flex min-h-11 items-center text-body-compact text-text-secondary hover:text-brand-primary">{isFa && tg.nameFa ? tg.nameFa : tg.name}</Link>)}</dd></div> : null}
              </dl>
            </aside>
          ) : null}
        </header>

        {/* PR #70 — cover image. Decorative by design: the headline above already
            names the article, so an empty alt is the correct accessible
            treatment. The fixed 16:9 frame reserves its space before the bytes
            arrive, so the reading spread does not jump. Absent cover => nothing. */}
        {article.coverImageUrl ? (
          <figure className="mt-8 overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-border-default)" }}>
            <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={article.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </div>
          </figure>
        ) : null}

        <div className="mt-8"><ActionsBar article={article} save={saveControl} /></div>

        {/* ── the reading spread: body + margin TOC ── */}
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-14">
          <article ref={bodyRef} className="min-w-0">
            {headings.length ? <div className="mb-8 lg:hidden"><Toc headings={headings} title={t("pressroom.onThisPage")} /></div> : null}
            <ArticleBody content={article.content} title={display.title} />
          </article>
          <div className="hidden min-w-0 lg:block">
            <Toc headings={headings} title={t("pressroom.onThisPage")} />
          </div>
        </div>

        <div className="mt-10"><ActionsBar article={article} save={saveControl} /></div>

        {/* PR #70 — reactions + discussion (reply-preserving), rendered from
            server-loaded state; absent only on the offline/mock path, where
            there is no database to hold a conversation in the first place. */}
        {engagement ? (
          <div className="mt-10">
            <ArticleEngagement
              articleId={article.id}
              articleSlug={article.slug}
              reactions={engagement.reactions}
              comments={engagement.comments}
              viewer={engagement.viewer}
            />
          </div>
        ) : null}

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
