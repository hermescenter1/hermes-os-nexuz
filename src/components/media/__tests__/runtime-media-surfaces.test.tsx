// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, mount } from "@/components/ds/__tests__/_render";
import {
  FALLBACK_MARK,
  IntlHarness,
  MEDIA_LOCALES,
  assertNoIntlFailures,
  intlFailures,
  mediaHubOf,
  messagesFor,
  resetIntlFailures,
  type MediaLocale,
} from "./_catalog";
import {
  MEDIA_LIFECYCLE_STATUSES,
  MEDIA_PROCESSING_STATES,
  MEDIA_SKILL_LEVELS,
} from "@/lib/media/types";
import { setSelectValue } from "./_media-stub";
import { VideoCard } from "../VideoCard";
import { VideoGrid } from "../VideoGrid";
import { VideoHero } from "../VideoHero";
import { ChapterList } from "../ChapterList";
import { TranscriptPanel } from "../TranscriptPanel";
import { SubtitleToggle } from "../SubtitleToggle";
import { AttachmentList } from "../AttachmentList";
import { MediaFilters } from "../MediaFilters";
import { MediaSearchInput } from "../MediaSearchInput";
import { CategoryChips } from "../CategoryChips";
import { InstructorCard } from "../InstructorCard";
import { RelatedVideos } from "../RelatedVideos";
import { ContinueWatchingRow } from "../ContinueWatchingRow";
import { FavouriteButton } from "../FavouriteButton";
import { MediaEmptyState, type MediaEmptyReason } from "../MediaEmptyState";
import { MediaErrorState, type MediaFailureCode } from "../MediaErrorState";
import { MediaLifecycleBadge, MediaProcessingBadge, MediaSkillLevelBadge } from "../MediaStateBadge";
import {
  EMPTY_MEDIA_FILTERS,
  MEDIA_DURATION_BUCKETS,
  MEDIA_DURATION_BUCKET_LABEL_VALUES,
  MEDIA_DURATION_MEDIUM_MAX_SECONDS,
  MEDIA_DURATION_SHORT_MAX_SECONDS,
  SECONDS_PER_MINUTE,
  type MediaDurationBucket,
} from "../logic";
import type { MediaCardView } from "../view-model";

/**
 * PHASE 102 — the browsing, discovery and watch-page surfaces.
 *
 * `next/link` is replaced with a plain anchor: these tests exercise markup and
 * semantics, and the real Link needs an App Router context that does not exist
 * outside a Next render. The href handed to it is already locale-prefixed by the
 * page, so nothing about routing behaviour is under test here anyway.
 */
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/**
 * Every expectation about copy below resolves through `EN` — the real
 * `messages/en.json`, formatted by the real ICU pipeline. There is no fixture
 * catalog any more: a key the components read and the catalog does not carry now
 * fails HERE, at the assertion, instead of shipping.
 */
const EN = messagesFor("en");

beforeEach(() => {
  resetIntlFailures();
});

afterEach(() => {
  // Applies to every test in the file, including the ones that assert only
  // structure — a MISSING_MESSAGE anywhere in a rendered tree fails the test.
  assertNoIntlFailures();
});

/**
 * The two component-local vocabularies, listed so the sweep below can render
 * each member. `Exclude<…> extends never` makes omitting one a COMPILE error, so
 * these cannot silently fall behind the union they mirror.
 */
const MEDIA_EMPTY_REASONS = [
  "LIBRARY_EMPTY",
  "NO_MATCHES",
  "NO_RESULTS",
  "NOT_ENTITLED",
] as const satisfies readonly MediaEmptyReason[];
const MEDIA_FAILURE_CODES = [
  "FORBIDDEN",
  "NOT_FOUND",
  "STORAGE_UNAVAILABLE",
  "RATE_LIMITED",
  "ERROR",
  "UNKNOWN",
] as const satisfies readonly MediaFailureCode[];

type Exhaustive<Union, Listed> = Exclude<Union, Listed> extends never ? true : never;
const EMPTY_REASONS_ARE_EXHAUSTIVE: Exhaustive<
  MediaEmptyReason,
  (typeof MEDIA_EMPTY_REASONS)[number]
> = true;
const FAILURE_CODES_ARE_EXHAUSTIVE: Exhaustive<
  MediaFailureCode,
  (typeof MEDIA_FAILURE_CODES)[number]
> = true;
it("mirrors both component vocabularies exhaustively", () => {
  // Fails to COMPILE if a union member is missing; asserted at runtime too so
  // the constants are not dead code.
  expect([EMPTY_REASONS_ARE_EXHAUSTIVE, FAILURE_CODES_ARE_EXHAUSTIVE]).toEqual([true, true]);
  expect(MEDIA_EMPTY_REASONS.length).toBe(4);
  expect(MEDIA_FAILURE_CODES.length).toBe(6);
});

/** The raw (unformatted) `mediaHub.duration.<bucket>` message in a locale. */
function durationMessage(locale: MediaLocale, bucket: MediaDurationBucket): string {
  const duration = mediaHubOf(locale).duration as Record<string, string>;
  return duration[bucket];
}

function wrap(ui: ReactNode, locale: MediaLocale = "en"): ReactNode {
  return <IntlHarness locale={locale}>{ui}</IntlHarness>;
}

function card(over: Partial<MediaCardView> = {}): MediaCardView {
  return {
    id: "a1",
    slug: "plc-fundamentals",
    href: "/en/media/plc-fundamentals",
    title: "PLC fundamentals",
    summary: "Scan cycle, I/O and ladder logic.",
    posterUrl: null,
    durationSeconds: 754,
    skillLevel: "BEGINNER",
    status: "PUBLISHED",
    processingState: "READY",
    instructor: null,
    category: null,
    viewCount: 42,
    progress: null,
    saved: null,
    ...over,
  };
}

const text = (root: HTMLElement): string => root.textContent ?? "";

/* ═══════════════════════════ VideoCard ═══════════════════════════ */

describe("VideoCard", () => {
  it("renders exactly one link, so the card is one stop for keyboard and AT users", async () => {
    const { container, unmount } = await mount(wrap(<VideoCard asset={card()} />));
    const links = container.querySelectorAll("a");
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("href")).toBe("/en/media/plc-fundamentals");
    expect(links[0].textContent).toBe("PLC fundamentals");
    await unmount();
  });

  it("shows the duration as a timecode, and says so plainly when it is unknown", async () => {
    const known = await mount(wrap(<VideoCard asset={card()} />));
    expect(text(known.container)).toContain("12:34");
    await known.unmount();

    // Nothing probes duration (ADR §9) — null must not render as 0:00.
    const unknown = await mount(wrap(<VideoCard asset={card({ durationSeconds: null })} />));
    expect(text(unknown.container)).toContain(EN("card.durationUnknown"));
    expect(text(unknown.container)).not.toContain("0:00");
    await unknown.unmount();
  });

  it("exposes watch progress as a real progressbar with aria values", async () => {
    const { container, unmount } = await mount(
      wrap(
        <VideoCard
          asset={card({ progress: { positionSeconds: 300, progressPct: 40, completed: false } })}
        />,
      ),
    );
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    // Elapsed time is not a language — the rail is pinned LTR.
    expect(bar.getAttribute("dir")).toBe("ltr");
    await unmount();
  });

  it("names the missing poster instead of showing a broken image", async () => {
    const { container, unmount } = await mount(wrap(<VideoCard asset={card()} />));
    expect(container.querySelector("img")).toBeNull();
    expect(text(container)).toContain(EN("card.noPoster"));
    await unmount();
  });

  it("keeps the poster decorative, because the title already names the destination", async () => {
    const { container, unmount } = await mount(
      wrap(<VideoCard asset={card({ posterUrl: "/api/media/a1/poster" })} />),
    );
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("loading")).toBe("lazy");
    await unmount();
  });

  it("hides editorial state on public surfaces and shows it in the management library", async () => {
    const publicCard = await mount(
      wrap(<VideoCard asset={card({ status: "DRAFT", processingState: "QUARANTINED" })} />),
    );
    expect(text(publicCard.container)).not.toContain(EN("processing.QUARANTINED"));
    await publicCard.unmount();

    const editorial = await mount(
      wrap(
        <VideoCard
          asset={card({ status: "DRAFT", processingState: "QUARANTINED" })}
          showEditorialState
        />,
      ),
    );
    expect(text(editorial.container)).toContain(EN("lifecycle.DRAFT"));
    expect(text(editorial.container)).toContain(EN("processing.QUARANTINED"));
    await editorial.unmount();
  });
});

/* ═══════════════════════════ VideoGrid ═══════════════════════════ */

describe("VideoGrid", () => {
  it("announces loading once and hides the skeleton lattice from screen readers", async () => {
    const { container, unmount } = await mount(
      wrap(<VideoGrid items={[]} loading skeletonCount={3} />),
    );
    expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(EN("grid.loading"));
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
    await unmount();
  });

  it("never shows an empty state while still loading", async () => {
    // The 300ms lie: "no videos found" before the first response has arrived.
    const { container, unmount } = await mount(wrap(<VideoGrid items={[]} loading />));
    expect(text(container)).not.toContain(EN("empty.LIBRARY_EMPTY.title"));
    await unmount();
  });

  it("distinguishes an empty library from an over-filtered one", async () => {
    const empty = await mount(wrap(<VideoGrid items={[]} emptyReason="LIBRARY_EMPTY" />));
    expect(text(empty.container)).toContain(EN("empty.LIBRARY_EMPTY.title"));
    await empty.unmount();

    const filtered = await mount(wrap(<VideoGrid items={[]} emptyReason="NO_MATCHES" />));
    expect(text(filtered.container)).toContain(EN("empty.NO_MATCHES.title"));
    await filtered.unmount();
  });

  it("renders a labelled list of cards", async () => {
    const { container, unmount } = await mount(
      wrap(<VideoGrid items={[card(), card({ id: "a2", slug: "s2", title: "SCADA" })]} />),
    );
    const list = container.querySelector("ul") as HTMLUListElement;
    expect(list.getAttribute("aria-label")).toBe(EN("grid.label"));
    expect(list.querySelectorAll("li").length).toBe(2);
    await unmount();
  });
});

/* ═══════════════════════════ VideoHero ═══════════════════════════ */

describe("VideoHero", () => {
  it("labels the section by its own heading and links to the watch page", async () => {
    const { container, unmount } = await mount(wrap(<VideoHero asset={card()} />));
    const section = container.querySelector("section") as HTMLElement;
    const heading = container.querySelector("h2") as HTMLElement;
    expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(text(container)).toContain(EN("hero.watch"));
    await unmount();
  });

  it("offers a resume point when the viewer has one", async () => {
    const { container, unmount } = await mount(
      wrap(
        <VideoHero
          asset={card({
            durationSeconds: 600,
            progress: { positionSeconds: 120, progressPct: 20, completed: false },
          })}
        />,
      ),
    );
    expect(text(container)).toContain(EN("hero.resumeAt", { time: "2:00" }));
    await unmount();
  });

  it("does not autoplay a preview — there is no <video> in the hero at all", async () => {
    const { container, unmount } = await mount(
      wrap(<VideoHero asset={card({ posterUrl: "/p.jpg" })} />),
    );
    expect(container.querySelector("video")).toBeNull();
    await unmount();
  });
});

/* ═══════════════════════════ ChapterList ═══════════════════════════ */

describe("ChapterList", () => {
  const chapters = [
    { id: "c1", title: "Scan cycle", startSeconds: 30 },
    { id: "c2", title: "Ladder logic", startSeconds: 120 },
  ];

  it("renders each chapter as a real button and seeks on activation", async () => {
    const onSeek = vi.fn();
    const { container, unmount } = await mount(
      wrap(
        <ChapterList
          chapters={chapters}
          currentSeconds={0}
          durationSeconds={600}
          onSeek={onSeek}
        />,
      ),
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    await click(buttons[1]);
    expect(onSeek).toHaveBeenCalledWith(120);
    await unmount();
  });

  it("marks the containing chapter with aria-current, and none before the first mark", async () => {
    const inGap = await mount(
      wrap(
        <ChapterList chapters={chapters} currentSeconds={5} durationSeconds={600} onSeek={vi.fn()} />,
      ),
    );
    expect(inGap.container.querySelectorAll('[aria-current="true"]').length).toBe(0);
    await inGap.unmount();

    const inside = await mount(
      wrap(
        <ChapterList
          chapters={chapters}
          currentSeconds={130}
          durationSeconds={600}
          onSeek={vi.fn()}
        />,
      ),
    );
    const current = inside.container.querySelector('[aria-current="true"]') as HTMLElement;
    expect(current.textContent).toContain("Ladder logic");
    await inside.unmount();
  });

  it("says the video has no chapters rather than rendering an empty list", async () => {
    const { container, unmount } = await mount(
      wrap(<ChapterList chapters={[]} currentSeconds={0} durationSeconds={600} onSeek={vi.fn()} />),
    );
    expect(text(container)).toContain(EN("chapters.empty"));
    expect(container.querySelector("ol")).toBeNull();
    await unmount();
  });
});

/* ═══════════════════════════ TranscriptPanel ═══════════════════════════ */

describe("TranscriptPanel", () => {
  const cues = [
    { id: "q1", startSeconds: 0, endSeconds: 5, text: "Welcome.", speaker: null },
    { id: "q2", startSeconds: 10, endSeconds: 15, text: "The scan cycle.", speaker: "Instructor" },
  ];

  it("highlights the cue covering the playhead and seeks on click", async () => {
    const onSeek = vi.fn();
    const { container, unmount } = await mount(
      wrap(<TranscriptPanel cues={cues} currentSeconds={12} onSeek={onSeek} />),
    );
    const current = container.querySelector('[aria-current="true"]') as HTMLElement;
    expect(current.textContent).toContain("The scan cycle.");
    await click(current);
    expect(onSeek).toHaveBeenCalledWith(10);
    await unmount();
  });

  it("highlights nothing in the silence between cues", async () => {
    const { container, unmount } = await mount(
      wrap(<TranscriptPanel cues={cues} currentSeconds={7} onSeek={vi.fn()} />),
    );
    expect(container.querySelectorAll('[aria-current="true"]').length).toBe(0);
    await unmount();
  });

  it("lets the reader stop the auto-scroll", async () => {
    const { container, unmount } = await mount(
      wrap(<TranscriptPanel cues={cues} currentSeconds={0} onSeek={vi.fn()} />),
    );
    const follow = container.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(follow.getAttribute("aria-checked")).toBe("true");
    await click(follow);
    expect(follow.getAttribute("aria-checked")).toBe("false");
    await unmount();
  });

  it("reports an absent transcript instead of an empty scroller", async () => {
    const { container, unmount } = await mount(
      wrap(<TranscriptPanel cues={[]} currentSeconds={0} onSeek={vi.fn()} />),
    );
    expect(text(container)).toContain(EN("transcript.empty"));
    expect(container.querySelector("ol")).toBeNull();
    await unmount();
  });
});

/* ═══════════════════════════ SubtitleToggle ═══════════════════════════ */

describe("SubtitleToggle", () => {
  const tracks = [
    { id: "t1", locale: "fa" as const, label: "فارسی", src: "/fa.vtt", isDefault: true },
    { id: "t2", locale: "en" as const, label: "English", src: "/en.vtt", isDefault: false },
  ];

  it("is a labelled native select with an explicit off option", async () => {
    const { container, unmount } = await mount(
      wrap(<SubtitleToggle tracks={tracks} activeLocale="fa" onChange={vi.fn()} />),
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    const label = container.querySelector("label") as HTMLLabelElement;
    expect(label.getAttribute("for")).toBe(select.id);
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      EN("subtitles.off"),
      "فارسی",
      "English",
    ]);
    expect(select.value).toBe("fa");
    await unmount();
  });

  it("reports null when captions are switched off, not an empty string", async () => {
    const onChange = vi.fn();
    const { container, unmount } = await mount(
      wrap(<SubtitleToggle tracks={tracks} activeLocale="fa" onChange={onChange} />),
    );
    await setSelectValue(container.querySelector("select") as HTMLSelectElement, "__off__");
    expect(onChange).toHaveBeenCalledWith(null);
    await unmount();
  });

  it("says captions are unavailable rather than vanishing", async () => {
    const { container, unmount } = await mount(
      wrap(<SubtitleToggle tracks={[]} activeLocale={null} onChange={vi.fn()} />),
    );
    expect(text(container)).toContain(EN("subtitles.unavailable"));
    await unmount();
  });
});

/* ═══════════════════════════ AttachmentList ═══════════════════════════ */

describe("AttachmentList", () => {
  it("renders download links, isolating the filename with <bdi>", async () => {
    const { container, unmount } = await mount(
      wrap(
        <AttachmentList
          attachments={[
            {
              id: "f1",
              fileName: "گزارش-2024.pdf",
              href: "/api/media/a1/attachments/f1",
              byteSize: 1024 * 1024 * 2,
              contentType: "application/pdf",
            },
          ]}
        />,
      ),
    );
    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("download")).toBe("گزارش-2024.pdf");
    // The RTL-override filename spoof is a real attack, not a cosmetic issue.
    expect(link.querySelector("bdi")?.getAttribute("dir")).toBe("ltr");
    expect(text(container)).toContain("2 MB");
    await unmount();
  });

  it("omits the size when it was never recorded, rather than claiming 0 B", async () => {
    const { container, unmount } = await mount(
      wrap(
        <AttachmentList
          attachments={[
            { id: "f1", fileName: "tags.csv", href: "/x", byteSize: null, contentType: null },
          ]}
        />,
      ),
    );
    expect(text(container)).not.toContain("0 B");
    await unmount();
  });

  it("says there are no attachments", async () => {
    const { container, unmount } = await mount(wrap(<AttachmentList attachments={[]} />));
    expect(text(container)).toContain(EN("attachments.empty"));
    await unmount();
  });
});

/* ═══════════════════════════ MediaFilters ═══════════════════════════ */

describe("MediaFilters", () => {
  const categories = [
    { id: "c1", slug: "plc", name: "PLC", count: 12 },
    { id: "c2", slug: "scada", name: "SCADA", count: null },
  ];

  it("offers a labelled select per supported axis", async () => {
    const { container, unmount } = await mount(
      wrap(
        <MediaFilters
          value={EMPTY_MEDIA_FILTERS}
          onChange={vi.fn()}
          categories={categories}
          languages={[{ code: "fa", label: "فارسی" }]}
        />,
      ),
    );
    const labels = Array.from(container.querySelectorAll("label")).map((l) => l.textContent);
    expect(labels).toEqual([
      EN("filters.category"),
      EN("filters.skillLevel"),
      EN("filters.duration"),
      EN("filters.language"),
      EN("filters.sort"),
    ]);
    for (const label of container.querySelectorAll("label")) {
      expect(document.getElementById(label.getAttribute("for") ?? "")).toBeTruthy();
    }
    await unmount();
  });

  it("patches only the axis that changed", async () => {
    const onChange = vi.fn();
    const { container, unmount } = await mount(
      wrap(
        <MediaFilters
          value={{ ...EMPTY_MEDIA_FILTERS, query: "plc" }}
          onChange={onChange}
          categories={categories}
        />,
      ),
    );
    const selects = container.querySelectorAll("select");
    await setSelectValue(selects[1], "EXPERT"); // Level
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ skillLevel: "EXPERT", query: "plc" }),
    );
    await unmount();
  });

  it("shows a clear control only when something is actually narrowing, and keeps the sort", async () => {
    const clean = await mount(
      wrap(
        <MediaFilters
          value={{ ...EMPTY_MEDIA_FILTERS, sort: "TITLE" }}
          onChange={vi.fn()}
          categories={categories}
        />,
      ),
    );
    // Sort is not a filter — it must not summon a "clear the filters (1)" button.
    expect(text(clean.container)).not.toContain(EN("filters.clear", { count: 1 }));
    await clean.unmount();

    const onChange = vi.fn();
    const dirty = await mount(
      wrap(
        <MediaFilters
          value={{ ...EMPTY_MEDIA_FILTERS, skillLevel: "EXPERT", sort: "TITLE" }}
          onChange={onChange}
          categories={categories}
        />,
      ),
    );
    const clear = Array.from(dirty.container.querySelectorAll("button")).find(
      (b) => b.textContent === EN("filters.clear", { count: 1 }),
    );
    expect(clear?.textContent).toBe(EN("filters.clear", { count: 1 }));
    await click(clear ?? null);
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_MEDIA_FILTERS, sort: "TITLE" });
    await dirty.unmount();
  });

  it("offers no sort option that the API cannot return", async () => {
    const { container, unmount } = await mount(
      wrap(
        <MediaFilters value={EMPTY_MEDIA_FILTERS} onChange={vi.fn()} categories={categories} />,
      ),
    );
    const selects = container.querySelectorAll("select");
    const sort = selects[selects.length - 1];
    expect(Array.from(sort.options).some((option) => option.value === "")).toBe(false);
    await unmount();
  });
});

/* ═══════════════════════════ MediaSearchInput ═══════════════════════════ */

describe("MediaSearchInput", () => {
  function Harness({ onChange }: { onChange: (value: string) => void }) {
    const [value, setValue] = useState("");
    return (
      <MediaSearchInput
        value={value}
        debounceMs={300}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    );
  }

  it("keeps typing responsive but notifies once, on the trailing edge", async () => {
    vi.useFakeTimers();
    try {
      const onChange = vi.fn();
      const { container, unmount } = await mount(wrap(<Harness onChange={onChange} />));
      const input = container.querySelector("input") as HTMLInputElement;

      for (const value of ["P", "PL", "PLC"]) {
        await act(async () => {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
          )?.set;
          setter?.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(input.value).toBe(value); // the visible field never lags
      }
      expect(onChange).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(320);
      });
      // One request, in order — not three that can land out of order.
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("PLC");
      await unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears immediately, without waiting out the debounce", async () => {
    const onChange = vi.fn();
    const { container, unmount } = await mount(
      wrap(<MediaSearchInput value="plc" onChange={onChange} />),
    );
    const clear = container.querySelector(
      `[aria-label="${EN("search.clear")}"]`,
    ) as HTMLButtonElement;
    expect(clear.tagName.toLowerCase()).toBe("button");
    await click(clear);
    expect(onChange).toHaveBeenCalledWith("");
    await unmount();
  });

  it("names the field for screen readers even though the label is not shown", async () => {
    const { container, unmount } = await mount(
      wrap(<MediaSearchInput value="" onChange={vi.fn()} />),
    );
    const input = container.querySelector("input") as HTMLInputElement;
    const label = container.querySelector("label") as HTMLLabelElement;
    expect(label.getAttribute("for")).toBe(input.id);
    expect(label.className).toContain("sr-only");
    await unmount();
  });
});

/* ═══════════════════════════ CategoryChips ═══════════════════════════ */

describe("CategoryChips", () => {
  const categories = [
    { id: "c1", slug: "plc", name: "PLC", count: 12 },
    { id: "c2", slug: "scada", name: "SCADA", count: null },
  ];

  it("uses aria-pressed toggle buttons inside a named group", async () => {
    const { container, unmount } = await mount(
      wrap(<CategoryChips categories={categories} value={null} onChange={vi.fn()} />),
    );
    const group = container.querySelector('[role="group"]') as HTMLElement;
    expect(group.getAttribute("aria-label")).toBe(EN("categories.label"));
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBe(3); // All + two categories
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    await unmount();
  });

  it("clears the filter when the active chip is pressed again", async () => {
    const onChange = vi.fn();
    const { container, unmount } = await mount(
      wrap(<CategoryChips categories={categories} value="c1" onChange={onChange} />),
    );
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
    await click(buttons[1]);
    expect(onChange).toHaveBeenCalledWith(null);
    await unmount();
  });

  it("shows a count only where one was actually counted", async () => {
    const { container, unmount } = await mount(
      wrap(<CategoryChips categories={categories} value={null} onChange={vi.fn()} />),
    );
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons[1].textContent).toBe("PLC12");
    expect(buttons[2].textContent).toBe("SCADA"); // count: null is not zero
    await unmount();
  });
});

/* ═══════════════════════════ InstructorCard ═══════════════════════════ */

describe("InstructorCard", () => {
  it("derives a monogram from the person's own name instead of a stock face", async () => {
    const { container, unmount } = await mount(
      wrap(
        <InstructorCard
          instructor={{
            id: "i1",
            name: "Sara Ahmadi",
            headline: null,
            avatarUrl: null,
            href: null,
            videoCount: null,
          }}
        />,
      ),
    );
    expect(container.querySelector("img")).toBeNull();
    expect(text(container)).toContain("S");
    // No invented job title, and no fabricated "0 recordings" — a `videoCount`
    // of null means nobody counted, which is not the same as counting zero.
    expect(text(container)).not.toContain(EN("instructor.videoCount", { count: 0 }));
    expect(text(container)).not.toMatch(/\d/);
    await unmount();
  });

  it("links the profile only when a route exists", async () => {
    const { container, unmount } = await mount(
      wrap(
        <InstructorCard
          instructor={{
            id: "i1",
            name: "Sara Ahmadi",
            headline: "Automation engineer",
            avatarUrl: null,
            href: "/en/media/instructors/i1",
            videoCount: 7,
          }}
        />,
      ),
    );
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/en/media/instructors/i1");
    expect(text(container)).toContain("Automation engineer");
    expect(text(container)).toContain(EN("instructor.videoCount", { count: 7 }));
    await unmount();
  });

  it("handles a Persian name without producing an empty monogram", async () => {
    const { container, unmount } = await mount(
      wrap(
        <InstructorCard
          instructor={{
            id: "i2",
            name: "سارا احمدی",
            headline: null,
            avatarUrl: null,
            href: null,
            videoCount: null,
          }}
        />,
      ),
    );
    expect(text(container)).toContain("س");
    await unmount();
  });
});

/* ═══════════════════════════ rails ═══════════════════════════ */

describe("RelatedVideos and ContinueWatchingRow", () => {
  it("render nothing at all when there is nothing to show", async () => {
    const related = await mount(wrap(<RelatedVideos items={[]} />));
    expect(related.container.innerHTML).toBe("");
    await related.unmount();

    const rail = await mount(wrap(<ContinueWatchingRow items={[]} />));
    expect(rail.container.innerHTML).toBe("");
    await rail.unmount();
  });

  it("render a labelled section when they have content", async () => {
    const { container, unmount } = await mount(wrap(<RelatedVideos items={[card()]} />));
    const section = container.querySelector("section") as HTMLElement;
    expect(section.getAttribute("aria-labelledby")).toBe("media-related");
    expect(text(container)).toContain(EN("related.title"));
    await unmount();
  });

  it("scroll the continue-watching rail without any auto-advancing carousel", async () => {
    const { container, unmount } = await mount(
      wrap(<ContinueWatchingRow items={[card(), card({ id: "a2", slug: "s2" })]} />),
    );
    const list = container.querySelector("ul") as HTMLUListElement;
    expect(list.className).toContain("overflow-x-auto");
    expect(container.querySelectorAll("li").length).toBe(2);
    await unmount();
  });
});

/* ═══════════════════════════ FavouriteButton ═══════════════════════════ */

describe("FavouriteButton", () => {
  it("is disabled with an explanatory name when there is no viewer identity", async () => {
    const { container, unmount } = await mount(
      wrap(<FavouriteButton saved={null} onToggle={vi.fn()} title="PLC fundamentals" />),
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe(EN("favourite.signInRequired"));
    await unmount();
  });

  it("flips optimistically and reports the new state through aria-pressed", async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    const { container, unmount } = await mount(
      wrap(<FavouriteButton saved={false} onToggle={onToggle} title="PLC fundamentals" />),
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe(
      EN("favourite.add", { title: "PLC fundamentals" }),
    );
    await click(button);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe(
      EN("favourite.remove", { title: "PLC fundamentals" }),
    );
    await unmount();
  });

  it("reverts and announces when the write fails — a silent failure would lie", async () => {
    const onToggle = vi.fn().mockRejectedValue(new Error("500"));
    const { container, unmount } = await mount(
      wrap(<FavouriteButton saved={false} onToggle={onToggle} title="PLC fundamentals" />),
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    await click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(EN("favourite.failed"));
    await unmount();
  });
});

/* ═══════════════════════════ status surfaces ═══════════════════════════ */

describe("status surfaces", () => {
  it("renders each status vocabulary as its own badge", async () => {
    const { container, unmount } = await mount(
      wrap(
        <div>
          <MediaLifecycleBadge status="IN_REVIEW" />
          <MediaProcessingBadge state="QUARANTINED" />
          <MediaSkillLevelBadge level="EXPERT" />
          <MediaSkillLevelBadge level={null} />
        </div>,
      ),
    );
    expect(text(container)).toContain(EN("lifecycle.IN_REVIEW"));
    expect(text(container)).toContain(EN("processing.QUARANTINED"));
    expect(text(container)).toContain(EN("skillLevel.EXPERT"));
    // An ungraded asset is not "beginner" by default — it renders nothing.
    expect(container.querySelectorAll("span[class*='badge'], span").length).toBeGreaterThan(0);
    expect(text(container)).not.toContain(EN("skillLevel.BEGINNER"));
    await unmount();
  });

  it("offers a retry only for failures where another attempt could succeed", async () => {
    const forbidden = await mount(
      wrap(<MediaErrorState code="FORBIDDEN" onRetry={vi.fn()} />),
    );
    expect(text(forbidden.container)).toContain(EN("failure.FORBIDDEN.title"));
    expect(text(forbidden.container)).not.toContain(EN("failure.retry"));
    await forbidden.unmount();

    const transient = await mount(
      wrap(<MediaErrorState code="STORAGE_UNAVAILABLE" onRetry={vi.fn()} />),
    );
    expect(text(transient.container)).toContain(EN("failure.retry"));
    await transient.unmount();
  });

  it("never echoes an unrecognised server code into the DOM", async () => {
    // A raw reason could carry a database error or another tenant's identifier.
    const { container, unmount } = await mount(
      wrap(<MediaErrorState code="P2002_UNIQUE_CONSTRAINT_ON_media_asset_slug" />),
    );
    expect(text(container)).not.toContain("P2002");
    expect(text(container)).toContain(EN("failure.UNKNOWN.title"));
    await unmount();
  });

  it("names the entitlement gate as its own outcome", async () => {
    const { container, unmount } = await mount(
      wrap(<MediaEmptyState reason="NOT_ENTITLED" />),
    );
    expect(text(container)).toContain(EN("empty.NOT_ENTITLED.title"));
    await unmount();
  });
});

/* ═══════════════════ the real catalog, in all three languages ═══════════════════ */

/**
 * PHASE 102 / RELEASE BLOCKER 1 — the sweep.
 *
 * Every media component, every branch that reaches a different key, rendered
 * against the SHIPPED `messages/{fa,en,de}.json` with an `onError` handler that
 * fails the test. This is the test the hand-written fixture made impossible: a
 * key present in `en` and absent from `de` used to be invisible here, because
 * the fixture was the only catalog these components ever saw.
 *
 * The permutations are not decoration. Each one reaches a key that no other
 * permutation reaches — every empty reason, every failure code, every lifecycle,
 * processing and skill-level vocabulary member, an active filter set — so the
 * sweep covers the DYNAMIC families as well as the static keys.
 */
describe.each(MEDIA_LOCALES)("real catalog render — %s", (locale) => {
  const chapters = [
    { id: "c1", title: "Scan cycle", startSeconds: 30 },
    { id: "c2", title: "Ladder logic", startSeconds: 120 },
  ];
  const cues = [{ id: "q1", startSeconds: 0, endSeconds: 5, text: "Welcome.", speaker: null }];
  const tracks = [
    { id: "t1", locale: "fa" as const, label: "فارسی", src: "/fa.vtt", isDefault: true },
  ];
  const categories = [{ id: "c1", slug: "plc", name: "PLC", count: 12 }];

  // `react/jsx-key` fires on JSX sitting directly inside an array literal, because
  // the rule cannot distinguish a rendered sibling list from a table of test cases.
  // These elements are never rendered as siblings — `it.each` mounts each one alone —
  // so a `key` would be pure noise. Routing them through a function states that
  // intent in the code rather than suppressing the rule.
  const surface = (name: string, ui: ReactNode): [string, ReactNode] => [name, ui];

  const surfaces: Array<[string, ReactNode]> = [
    surface("VideoCard", <VideoCard asset={card()} />),
    surface("VideoCard/unknown-length", <VideoCard asset={card({ durationSeconds: null })} />),
    surface(
      "VideoCard/completed",
      <VideoCard
        asset={card({ progress: { positionSeconds: 300, progressPct: 100, completed: true } })}
      />,
    ),
    surface(
      "VideoCard/editorial",
      <VideoCard asset={card({ status: "DRAFT", processingState: "FAILED" })} showEditorialState />,
    ),
    surface("VideoGrid/loading", <VideoGrid items={[]} loading skeletonCount={2} />),
    surface("VideoGrid/items", <VideoGrid items={[card()]} />),
    surface("VideoHero", <VideoHero asset={card()} />),
    surface(
      "VideoHero/resume",
      <VideoHero
        asset={card({ progress: { positionSeconds: 120, progressPct: 20, completed: false } })}
      />,
    ),
    surface(
      "ChapterList",
      <ChapterList
        chapters={chapters}
        currentSeconds={130}
        durationSeconds={600}
        onSeek={vi.fn()}
      />,
    ),
    surface(
      "ChapterList/empty",
      <ChapterList chapters={[]} currentSeconds={0} durationSeconds={600} onSeek={vi.fn()} />,
    ),
    surface("TranscriptPanel", <TranscriptPanel cues={cues} currentSeconds={2} onSeek={vi.fn()} />),
    surface(
      "TranscriptPanel/empty",
      <TranscriptPanel cues={[]} currentSeconds={0} onSeek={vi.fn()} />,
    ),
    surface("SubtitleToggle", <SubtitleToggle tracks={tracks} activeLocale="fa" onChange={vi.fn()} />),
    surface(
      "SubtitleToggle/empty",
      <SubtitleToggle tracks={[]} activeLocale={null} onChange={vi.fn()} />,
    ),
    surface(
      "AttachmentList",
      <AttachmentList
        attachments={[
          {
            id: "f1",
            fileName: "wiring.pdf",
            href: "/x",
            byteSize: 2048,
            contentType: "application/pdf",
          },
        ]}
      />,
    ),
    surface("AttachmentList/empty", <AttachmentList attachments={[]} />),
    surface(
      "MediaFilters",
      <MediaFilters
        value={EMPTY_MEDIA_FILTERS}
        onChange={vi.fn()}
        categories={categories}
        languages={[{ code: "fa", label: "فارسی" }]}
      />,
    ),
    surface(
      // Reaches `filters.clear` and a non-zero `filters.activeCount`.
      "MediaFilters/active",
      <MediaFilters
        value={{ ...EMPTY_MEDIA_FILTERS, skillLevel: "EXPERT", duration: "LONG", sort: "TITLE" }}
        onChange={vi.fn()}
        categories={categories}
      />,
    ),
    surface("MediaSearchInput", <MediaSearchInput value="plc" onChange={vi.fn()} />),
    surface("CategoryChips", <CategoryChips categories={categories} value="c1" onChange={vi.fn()} />),
    surface(
      "InstructorCard",
      <InstructorCard
        instructor={{
          id: "i1",
          name: "Sara Ahmadi",
          headline: "Automation engineer",
          avatarUrl: null,
          href: "/en/media/instructors/i1",
          videoCount: 7,
        }}
      />,
    ),
    surface("RelatedVideos", <RelatedVideos items={[card()]} />),
    surface("ContinueWatchingRow", <ContinueWatchingRow items={[card()]} />),
    surface(
      "FavouriteButton/anonymous",
      <FavouriteButton saved={null} onToggle={vi.fn()} title="PLC fundamentals" />,
    ),
    surface("FavouriteButton/saved", <FavouriteButton saved onToggle={vi.fn()} title="PLC" />),
    ...MEDIA_EMPTY_REASONS.map((reason) =>
      surface(`MediaEmptyState/${reason}`, <MediaEmptyState reason={reason} />),
    ),
    ...MEDIA_FAILURE_CODES.map((code) =>
      surface(`MediaErrorState/${code}`, <MediaErrorState code={code} onRetry={vi.fn()} />),
    ),
    ...MEDIA_LIFECYCLE_STATUSES.map((status) =>
      surface(`MediaLifecycleBadge/${status}`, <MediaLifecycleBadge status={status} />),
    ),
    ...MEDIA_PROCESSING_STATES.map((state) =>
      surface(`MediaProcessingBadge/${state}`, <MediaProcessingBadge state={state} />),
    ),
    ...MEDIA_SKILL_LEVELS.map((level) =>
      surface(`MediaSkillLevelBadge/${level}`, <MediaSkillLevelBadge level={level} />),
    ),
  ];

  it.each(surfaces)("renders %s with no missing message and no fallback", async (_name, ui) => {
    const { container, unmount } = await mount(wrap(ui, locale));
    assertNoIntlFailures(container);
    await unmount();
  });
});

/* ═══════════════════ duration buckets are stated once ═══════════════════ */

describe("duration bucket labels are derived from the thresholds, not retyped", () => {
  it("supplies exactly the ICU arguments each message declares, in every language", () => {
    for (const bucket of MEDIA_DURATION_BUCKETS) {
      const supplied = Object.keys(MEDIA_DURATION_BUCKET_LABEL_VALUES[bucket]).sort();
      for (const locale of MEDIA_LOCALES) {
        const message = durationMessage(locale, bucket);
        const required = [...message.matchAll(/\{\s*([A-Za-z0-9_]+)/g)]
          .map((match) => match[1])
          .sort();
        expect(required, `${locale} duration.${bucket}`).toEqual(supplied);
      }
    }
  });

  it("writes no number into the copy at all — the boundary lives only in logic.ts", () => {
    for (const locale of MEDIA_LOCALES) {
      for (const bucket of MEDIA_DURATION_BUCKETS) {
        expect(durationMessage(locale, bucket), `${locale} duration.${bucket}`).not.toMatch(/\d/);
      }
    }
    expect(MEDIA_DURATION_BUCKET_LABEL_VALUES.SHORT.minutes).toBe(
      MEDIA_DURATION_SHORT_MAX_SECONDS / SECONDS_PER_MINUTE,
    );
    expect(MEDIA_DURATION_BUCKET_LABEL_VALUES.MEDIUM.from).toBe(
      MEDIA_DURATION_SHORT_MAX_SECONDS / SECONDS_PER_MINUTE,
    );
    expect(MEDIA_DURATION_BUCKET_LABEL_VALUES.MEDIUM.to).toBe(
      MEDIA_DURATION_MEDIUM_MAX_SECONDS / SECONDS_PER_MINUTE,
    );
    expect(MEDIA_DURATION_BUCKET_LABEL_VALUES.LONG.minutes).toBe(
      MEDIA_DURATION_MEDIUM_MAX_SECONDS / SECONDS_PER_MINUTE,
    );
  });

  it("renders the thresholds the bucketing function actually uses", async () => {
    const shortMinutes = MEDIA_DURATION_SHORT_MAX_SECONDS / SECONDS_PER_MINUTE;
    const longMinutes = MEDIA_DURATION_MEDIUM_MAX_SECONDS / SECONDS_PER_MINUTE;

    for (const locale of MEDIA_LOCALES) {
      const { container, unmount } = await mount(
        wrap(
          <MediaFilters
            value={EMPTY_MEDIA_FILTERS}
            onChange={vi.fn()}
            categories={[{ id: "c1", slug: "plc", name: "PLC", count: null }]}
          />,
          locale,
        ),
      );
      const options = Array.from(container.querySelectorAll("option")).map(
        (option) => option.textContent ?? "",
      );
      // SHORT names one boundary, LONG the other, MEDIUM both — and every number
      // on screen came from MEDIA_DURATION_*_SECONDS, not from a translator.
      expect(
        options.some(
          (label) => label.includes(String(shortMinutes)) && !label.includes(String(longMinutes)),
        ),
        `${locale}: no SHORT label carrying ${shortMinutes}`,
      ).toBe(true);
      expect(
        options.some(
          (label) => label.includes(String(longMinutes)) && !label.includes(String(shortMinutes)),
        ),
        `${locale}: no LONG label carrying ${longMinutes}`,
      ).toBe(true);
      expect(
        options.some(
          (label) => label.includes(String(shortMinutes)) && label.includes(String(longMinutes)),
        ),
        `${locale}: no MEDIUM label carrying both boundaries`,
      ).toBe(true);

      assertNoIntlFailures(container);
      await unmount();
    }
  });
});

/* ═══════════════ the harness is itself proven to fail ═══════════════ */

/**
 * PHASE 102 / RELEASE BLOCKER 1 — evidence for the sweep above.
 *
 * Every "renders X with no missing message" assertion is only worth what
 * `assertNoIntlFailures` is worth, and a sink that never receives anything is
 * indistinguishable from a tree that never fails. So a deliberately broken
 * consumer is rendered here and the harness is required to notice — both halves
 * of it: `onError` must record the next-intl error code, and the fallback must
 * land in the DOM wearing a marker no copy could be mistaken for.
 */
describe("the render harness detects what it claims to detect", () => {
  function BrokenConsumer() {
    const t = useTranslations("mediaHub");
    return <p>{t("thisKeyIsNotInAnyCatalog")}</p>;
  }

  function ObjectConsumer() {
    const t = useTranslations("mediaHub");
    // `duration` is a GROUP, not a leaf — next-intl reports INSUFFICIENT_PATH.
    return <p>{t("duration")}</p>;
  }

  it("records a MISSING_MESSAGE and marks the fallback in the DOM", async () => {
    const { container, unmount } = await mount(wrap(<BrokenConsumer />));
    const codes = intlFailures().map((failure) => failure.code);
    expect(codes).toContain("MISSING_MESSAGE");
    expect(container.textContent).toContain(FALLBACK_MARK);
    expect(() => assertNoIntlFailures(container)).toThrow();
    await unmount();
    resetIntlFailures();
  });

  it("records an INSUFFICIENT_PATH when a key resolves to a group", async () => {
    const { container, unmount } = await mount(wrap(<ObjectConsumer />));
    expect(intlFailures().map((failure) => failure.code)).toContain("INSUFFICIENT_PATH");
    expect(() => assertNoIntlFailures(container)).toThrow();
    await unmount();
    resetIntlFailures();
  });
});
