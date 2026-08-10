// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, keyDown, mount } from "@/components/ds/__tests__/_render";
import { MediaPlayer } from "../MediaPlayer";
import { STALL_TIMEOUT_MS } from "../logic";
import type { MediaPlaybackView } from "../view-model";
import {
  IntlHarness,
  MEDIA_LOCALES,
  assertNoIntlFailures,
  messagesFor,
  resetIntlFailures,
  type MediaLocale,
} from "./_catalog";
import {
  fireMedia,
  installMediaElementStub,
  mediaState,
  setRangeValue,
  setSelectValue,
} from "./_media-stub";

/**
 * PHASE 102 — MediaPlayer runtime.
 *
 * The arithmetic and the keyboard map are proven in `media-logic.test.ts` under
 * the node environment. What is proven HERE is the wiring that only a real DOM
 * can show: that the timeline never inherits RTL, that every control is a real
 * button with a name, that each failure mode renders its own honest surface, and
 * that a key pressed on a focused control is not handled twice.
 *
 * EVERY string below is resolved from `messages/{locale}.json` through `EN`/`FA`
 * — the same catalog and the same ICU formatter the browser uses. Nothing in
 * this file restates copy, so re-wording a message in the catalog cannot make a
 * behavioural test fail, and REMOVING one cannot make it pass.
 */

const EN = messagesFor("en");
const FA = messagesFor("fa");

let restoreMedia: () => void;

beforeEach(() => {
  restoreMedia = installMediaElementStub();
  resetIntlFailures();
});

afterEach(() => {
  restoreMedia();
  // No test in this file may leave a MISSING_MESSAGE, an INSUFFICIENT_PATH or a
  // fallback behind — including the ones that assert nothing about copy.
  assertNoIntlFailures();
});

function wrap(ui: ReactNode, locale: MediaLocale = "en"): ReactNode {
  return <IntlHarness locale={locale}>{ui}</IntlHarness>;
}

function media(over: Partial<MediaPlaybackView> = {}): MediaPlaybackView {
  return {
    id: "asset-1",
    slug: "plc-fundamentals",
    title: "PLC fundamentals",
    src: "/api/media/asset-1/bytes",
    contentType: "video/mp4",
    posterUrl: null,
    durationSeconds: 600,
    processingState: "READY",
    chapters: [],
    subtitleTracks: [],
    progress: null,
    ...over,
  };
}

const byLabel = (root: HTMLElement, label: string): HTMLElement | null =>
  root.querySelector(`[aria-label="${label}"]`);

const video = (root: HTMLElement): HTMLVideoElement =>
  root.querySelector("video") as HTMLVideoElement;

const seekBar = (root: HTMLElement, t = EN): HTMLInputElement =>
  byLabel(root, t("player.seek")) as HTMLInputElement;

/** Load metadata with a concrete duration, as a real element would. */
async function loadMetadata(root: HTMLElement, duration = 600): Promise<HTMLVideoElement> {
  const element = video(root);
  mediaState(element).duration = duration;
  await fireMedia(element, "loadedmetadata");
  return element;
}

const statusTexts = (root: HTMLElement): string[] =>
  Array.from(root.querySelectorAll('[role="status"]')).map((node) => node.textContent ?? "");

/* ═══════════════════ honest degradation ═══════════════════ */

describe("MediaPlayer — refuses to pretend", () => {
  it("mounts no <video> at all when nothing is servable, and names the reason", async () => {
    const cases: Array<[MediaPlaybackView["processingState"], string]> = [
      ["PENDING_UPLOAD", EN("player.blocked.PENDING_UPLOAD.title")],
      ["UPLOADED", EN("player.blocked.PROCESSING.title")],
      ["VALIDATING", EN("player.blocked.PROCESSING.title")],
      ["FAILED", EN("player.blocked.FAILED.title")],
      ["QUARANTINED", EN("player.blocked.QUARANTINED.title")],
    ];
    for (const [processingState, expected] of cases) {
      const { container, unmount } = await mount(
        wrap(<MediaPlayer media={media({ processingState })} />),
      );
      // No element, therefore no spinner and no request for bytes that cannot
      // be served — a blocked asset has no worker to unblock it (ADR §5).
      expect(container.querySelector("video")).toBeNull();
      expect(container.textContent).toContain(expected);
      await unmount();
    }
  });

  it("reports a missing URL rather than mounting <video src=\"\">", async () => {
    const { container, unmount } = await mount(
      wrap(<MediaPlayer media={media({ src: null })} />),
    );
    expect(container.querySelector("video")).toBeNull();
    expect(container.textContent).toContain(EN("player.blocked.NO_SOURCE.title"));
    await unmount();
  });

  it("renders a decode failure with NO retry — it will not decode next time either", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const element = video(container);
    mediaState(element).error = { code: 4 }; // MEDIA_ERR_SRC_NOT_SUPPORTED
    await fireMedia(element, "error");

    expect(container.textContent).toContain(EN("player.error.UNSUPPORTED.title"));
    expect(container.textContent).not.toContain(EN("player.error.retry"));
    await unmount();
  });

  it("offers a retry for a network failure, and clears the error on retry", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const element = video(container);
    mediaState(element).error = { code: 2 }; // MEDIA_ERR_NETWORK
    await fireMedia(element, "error");
    expect(container.textContent).toContain(EN("player.error.NETWORK.title"));

    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === EN("player.error.retry"),
    );
    expect(retry).toBeTruthy();
    await click(retry ?? null);
    expect(container.textContent).not.toContain(EN("player.error.NETWORK.title"));
    await unmount();
  });

  it("shows a spinner while buffering, then STOPS claiming to buffer once stalled", async () => {
    // The specific lie the brief forbids: a spinner that never resolves.
    vi.useFakeTimers();
    try {
      const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
      const element = video(container);
      await fireMedia(element, "waiting");
      expect(container.querySelector(".animate-spin")).toBeTruthy();
      expect(container.textContent).toContain(EN("player.buffering"));
      expect(container.textContent).not.toContain(EN("player.stalled.title"));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS + 10);
      });

      // The spinner is gone — replaced by a statement that it is NOT progressing,
      // with a retry. This is the whole point: no indefinite spinner.
      expect(container.querySelector(".animate-spin")).toBeNull();
      expect(container.textContent).toContain(EN("player.stalled.title"));
      await unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears buffering as soon as playback actually resumes", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const element = video(container);
    await fireMedia(element, "waiting");
    expect(container.textContent).toContain(EN("player.buffering"));
    await fireMedia(element, "playing");
    expect(container.textContent).not.toContain(EN("player.buffering"));
    await unmount();
  });
});

/* ═══════════════════ the RTL trap ═══════════════════ */

describe("MediaPlayer — RTL", () => {
  it("pins the seek bar to LTR even inside an RTL document", async () => {
    const { container, unmount } = await mount(
      wrap(
        <div dir="rtl">
          <MediaPlayer media={media()} />
        </div>,
        "fa",
      ),
    );
    const slider = seekBar(container, FA);
    expect(slider).toBeTruthy();
    // The nearest ancestor that declares a direction must be the timeline itself,
    // and it must say ltr. Inheriting rtl here inverts the native range AND the
    // browser's own Arrow handling: a forward drag would seek backwards.
    expect(slider.closest("[dir]")?.getAttribute("dir")).toBe("ltr");
    await unmount();
  });

  it("pins the volume slider to LTR too, so both transports agree", async () => {
    const { container, unmount } = await mount(
      wrap(
        <div dir="rtl">
          <MediaPlayer media={media()} />
        </div>,
        "fa",
      ),
    );
    const volume = byLabel(container, FA("player.volume")) as HTMLInputElement;
    expect(volume.closest("[dir]")?.getAttribute("dir")).toBe("ltr");
    await unmount();
  });

  it("pins ONLY the direction-agnostic elements, leaving the chrome to the document", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    // Exactly two classes of element may declare a direction: the two transports
    // (whose scale is time, not language) and the <bdi> timecodes (so "1:05" is
    // not reordered by adjacent Persian text). Everything else must inherit, or
    // Persian labels would silently lay out LTR.
    const pinned = Array.from(container.querySelectorAll("[dir]"));
    expect(pinned.length).toBeGreaterThan(0);
    for (const node of pinned) {
      expect(node.getAttribute("dir")).toBe("ltr");
      const isSlider = node.querySelector('input[type="range"]') !== null;
      const isBdi = node.tagName.toLowerCase() === "bdi";
      expect(isSlider || isBdi, node.outerHTML.slice(0, 80)).toBe(true);
    }
    expect(pinned.filter((node) => node.querySelector('input[type="range"]')).length).toBe(2);
    await unmount();
  });
});

/* ═══════════════════ accessible controls ═══════════════════ */

describe("MediaPlayer — controls are real, named and keyboard-reachable", () => {
  it("exposes every transport control as a native button with an aria-label", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const labels = [
      EN("player.play"),
      EN("player.mute"),
      EN("player.enterFullscreen"),
      EN("subtitles.turnOn"),
    ];
    for (const label of labels) {
      const control = byLabel(container, label);
      expect(control, label).toBeTruthy();
      expect(control?.tagName.toLowerCase()).toBe("button");
      expect((control as HTMLButtonElement).type).toBe("button");
    }
    await unmount();
  });

  it("uses a native range for the seek bar with explicit aria-valuemin/max/now", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    await loadMetadata(container, 600);
    const slider = seekBar(container);
    expect(slider.tagName.toLowerCase()).toBe("input");
    expect(slider.type).toBe("range");
    expect(slider.getAttribute("aria-valuemin")).toBe("0");
    expect(slider.getAttribute("aria-valuemax")).toBe("600");
    expect(slider.getAttribute("aria-valuenow")).toBe("0");
    expect(slider.getAttribute("aria-valuetext")).toBe(
      EN("player.timeOf", { current: "0:00", total: "10:00" }),
    );
    await unmount();
  });

  it("disables the seek bar until a duration is known, rather than faking a scale", async () => {
    const { container, unmount } = await mount(
      wrap(<MediaPlayer media={media({ durationSeconds: null })} />),
    );
    expect(seekBar(container).disabled).toBe(true);
    await loadMetadata(container, 600);
    expect(seekBar(container).disabled).toBe(false);
    await unmount();
  });

  it("seeks the element when the slider is moved", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const element = await loadMetadata(container, 600);
    await setRangeValue(seekBar(container), 300);
    expect(element.currentTime).toBe(300);
    await unmount();
  });

  it("offers every playback rate through a native select and applies it", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "0.5",
      "0.75",
      "1",
      "1.25",
      "1.5",
      "1.75",
      "2",
    ]);
    await setSelectValue(select, "1.5");
    expect(video(container).playbackRate).toBe(1.5);
    await unmount();
  });

  it("toggles mute, reflects it in aria-pressed, and announces it politely", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const mute = byLabel(container, EN("player.mute")) as HTMLButtonElement;
    expect(mute.getAttribute("aria-pressed")).toBe("false");
    await click(mute);
    expect(video(container).muted).toBe(true);
    expect(byLabel(container, EN("player.unmute"))?.getAttribute("aria-pressed")).toBe("true");
    expect(statusTexts(container).join(" ")).toContain(EN("player.announce.muted"));
    await unmount();
  });

  it("disables the captions control when the asset genuinely has no track", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    expect((byLabel(container, EN("subtitles.turnOn")) as HTMLButtonElement).disabled).toBe(true);
    await unmount();
  });

  it("enables captions and renders a <track> per uploaded subtitle", async () => {
    const { container, unmount } = await mount(
      wrap(
        <MediaPlayer
          media={media({
            subtitleTracks: [
              { id: "t1", locale: "fa", label: "فارسی", src: "/fa.vtt", isDefault: true },
              { id: "t2", locale: "en", label: "English", src: "/en.vtt", isDefault: false },
            ],
          })}
        />,
      ),
    );
    const tracks = container.querySelectorAll("track");
    expect(tracks.length).toBe(2);
    expect(tracks[0].getAttribute("srclang")).toBe("fa");
    expect(tracks[0].getAttribute("kind")).toBe("subtitles");
    const toggle = byLabel(container, EN("subtitles.turnOff")) as HTMLButtonElement;
    expect(toggle.disabled).toBe(false);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await click(toggle);
    expect(byLabel(container, EN("subtitles.turnOn"))?.getAttribute("aria-pressed")).toBe("false");
    await unmount();
  });

  it("reports honestly when the browser exposes no fullscreen API", async () => {
    // jsdom has none — the same situation as a locked-down embedded webview.
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    await click(byLabel(container, EN("player.enterFullscreen")));
    expect(container.textContent).toContain(EN("player.fullscreenUnavailable.title"));
    await unmount();
  });

  it("names the player region and publishes the keyboard map to screen readers", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const region = container.querySelector("section");
    expect(region?.getAttribute("aria-label")).toBe(
      EN("player.region", { title: "PLC fundamentals" }),
    );
    const describedBy = region?.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
      EN("player.keyboardHelp"),
    );
    await unmount();
  });
});

/* ═══════════════════ keyboard ═══════════════════ */

describe("MediaPlayer — keyboard", () => {
  it("seeks ten seconds on L from a focused control", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const element = await loadMetadata(container, 600);
    await keyDown(byLabel(container, EN("player.play")), "l");
    expect(element.currentTime).toBe(10);
    await unmount();
  });

  it("jumps to a tenth of the timeline on a digit", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const element = await loadMetadata(container, 600);
    await keyDown(byLabel(container, EN("player.play")), "5");
    expect(element.currentTime).toBe(300);
    await unmount();
  });

  it("does NOT double-handle Space while a button has focus", async () => {
    // Without the ignore rule the button activates AND the map toggles play, so
    // playback flips twice and lands exactly where it started.
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const element = video(container);
    await keyDown(byLabel(container, EN("player.play")), " ");
    expect(element.paused).toBe(true); // the map declined; only the button would act
    await unmount();
  });

  it("does NOT double-handle an arrow while the seek slider has focus", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const element = await loadMetadata(container, 600);
    await keyDown(seekBar(container), "ArrowRight");
    // The native range owns this key; the map must not add a second five seconds.
    expect(element.currentTime).toBe(0);
    await unmount();
  });

  it("toggles playback from the video surface itself", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const element = video(container);
    await keyDown(element, "k");
    expect(element.paused).toBe(false);
    await keyDown(element, "k");
    expect(element.paused).toBe(true);
    await unmount();
  });

  it("mutes on M and steps volume with the arrows", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const element = video(container);
    await keyDown(byLabel(container, EN("player.play")), "ArrowDown");
    expect(element.volume).toBe(0.95);
    await keyDown(byLabel(container, EN("player.play")), "m");
    expect(element.muted).toBe(true);
    await unmount();
  });

  it("ignores modified keystrokes so browser shortcuts keep working", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    const element = await loadMetadata(container, 600);
    await keyDown(byLabel(container, EN("player.play")), "l", { ctrlKey: true });
    expect(element.currentTime).toBe(0);
    await unmount();
  });
});

/* ═══════════════════ chapters, resume, reporting ═══════════════════ */

describe("MediaPlayer — chapters", () => {
  const chapters = [
    { id: "c1", title: "Scan cycle", startSeconds: 0 },
    { id: "c2", title: "Ladder logic", startSeconds: 120 },
    { id: "c3", title: "Diagnostics", startSeconds: 300 },
  ];

  it("shows transport buttons only when the asset actually has chapters", async () => {
    const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />));
    expect(byLabel(container, EN("chapters.next"))).toBeNull();
    await unmount();

    const withChapters = await mount(wrap(<MediaPlayer media={media({ chapters })} />));
    expect(byLabel(withChapters.container, EN("chapters.next"))).toBeTruthy();
    expect(byLabel(withChapters.container, EN("chapters.previous"))).toBeTruthy();
    await withChapters.unmount();
  });

  it("skips to the next chapter start", async () => {
    const { container, unmount } = await mount(
      wrap(<MediaPlayer media={media({ chapters })} />),
    );
    const element = await loadMetadata(container, 600);
    await click(byLabel(container, EN("chapters.next")));
    expect(element.currentTime).toBe(120);
    await unmount();
  });

  it("reports the crossing into and out of a chapter", async () => {
    const onChapterChange = vi.fn();
    const { container, unmount } = await mount(
      wrap(<MediaPlayer media={media({ chapters })} onChapterChange={onChapterChange} />),
    );
    const element = await loadMetadata(container, 600);
    expect(onChapterChange).toHaveBeenLastCalledWith(0); // starts inside chapter 1
    mediaState(element).currentTime = 150;
    await fireMedia(element, "timeupdate");
    expect(onChapterChange).toHaveBeenLastCalledWith(1);
    await unmount();
  });
});

describe("MediaPlayer — resume", () => {
  it("resumes, says so in a live region, and offers a way back to the start", async () => {
    const { container, unmount } = await mount(
      wrap(
        <MediaPlayer
          media={media({
            durationSeconds: 600,
            progress: { positionSeconds: 120, progressPct: 20, completed: false },
          })}
        />,
      ),
    );
    const element = await loadMetadata(container, 600);
    expect(element.currentTime).toBe(120);
    expect(container.textContent).toContain(EN("player.resumedAt", { time: "2:00" }));

    const startOver = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === EN("player.startOver"),
    );
    await click(startOver ?? null);
    expect(element.currentTime).toBe(0);
    expect(container.textContent).not.toContain(EN("player.resumedAt", { time: "2:00" }));
    await unmount();
  });

  it("does not resume a completed asset", async () => {
    const { container, unmount } = await mount(
      wrap(
        <MediaPlayer
          media={media({
            progress: { positionSeconds: 500, progressPct: 100, completed: true },
          })}
        />,
      ),
    );
    const element = await loadMetadata(container, 600);
    expect(element.currentTime).toBe(0);
    // 500s of a 600s asset would resume at 8:20 had `completed` not been set.
    expect(container.textContent).not.toContain(EN("player.resumedAt", { time: "8:20" }));
    await unmount();
  });
});

describe("MediaPlayer — progress reporting", () => {
  it("throttles progress and fires completion exactly once", async () => {
    const onProgress = vi.fn();
    const onComplete = vi.fn();
    const { container, unmount } = await mount(
      wrap(<MediaPlayer media={media()} onProgress={onProgress} onComplete={onComplete} />),
    );
    const element = await loadMetadata(container, 600);

    mediaState(element).currentTime = 2;
    await fireMedia(element, "timeupdate");
    expect(onProgress).toHaveBeenCalledTimes(1);

    mediaState(element).currentTime = 4; // inside the throttle window
    await fireMedia(element, "timeupdate");
    expect(onProgress).toHaveBeenCalledTimes(1);

    mediaState(element).currentTime = 12;
    await fireMedia(element, "timeupdate");
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({ positionSeconds: 12, progressPct: 2 });

    mediaState(element).currentTime = 580; // past the 95% threshold
    await fireMedia(element, "timeupdate");
    expect(onComplete).toHaveBeenCalledTimes(1);

    mediaState(element).currentTime = 599;
    await fireMedia(element, "timeupdate");
    await fireMedia(element, "ended");
    expect(onComplete).toHaveBeenCalledTimes(1); // never twice
    await unmount();
  });
});

/* ═══════════════ the real catalog, in all three languages ═══════════════ */

/**
 * PHASE 102 / RELEASE BLOCKER 1 — the MediaPlayer half of the sweep.
 *
 * `runtime-media-surfaces.test.tsx` sweeps the twenty browsing and watch-page
 * components across fa/en/de. The player was the one component it could not
 * cover, because reaching its interesting states needs the HTMLMediaElement stub
 * and a fired event rather than a prop. So it is covered HERE, in the file that
 * already has that machinery, over exactly the branches that resolve a DIFFERENT
 * group of keys: every block reason, every W3C error code, the stall, the
 * buffering notice, the resume offer and the chapter/caption controls.
 *
 * `assertNoIntlFailures(container)` is the assertion. It fails on MISSING_MESSAGE
 * and INSUFFICIENT_PATH via `onError`, on any fallback via `getMessageFallback`,
 * and on a message that rendered as its own key path by scanning the DOM — so a
 * German gap in `player.*` cannot reach production while `en` looks healthy.
 */
describe.each(MEDIA_LOCALES)("MediaPlayer real catalog render — %s", (locale) => {
  const rich = media({
    posterUrl: "/api/media/asset-1/poster",
    progress: { positionSeconds: 120, progressPct: 20, completed: false },
    chapters: [
      { id: "c1", title: "Scan cycle", startSeconds: 30 },
      { id: "c2", title: "Ladder logic", startSeconds: 120 },
    ],
    subtitleTracks: [
      { id: "t1", locale: "fa", label: "فارسی", src: "/fa.vtt", isDefault: true },
    ],
  });

  /** Mount, run the branch, assert nothing degraded, unmount. */
  async function sweep(
    ui: ReactNode,
    reach: (container: HTMLElement) => Promise<void> = async () => {},
  ): Promise<void> {
    const { container, unmount } = await mount(wrap(ui, locale));
    await reach(container);
    assertNoIntlFailures(container);
    await unmount();
  }

  it("renders a playable asset with chapters, captions and a resume offer", async () => {
    await sweep(<MediaPlayer media={rich} />, async (container) => {
      await loadMetadata(container, 600);
    });
  });

  it.each(["PENDING_UPLOAD", "UPLOADED", "VALIDATING", "FAILED", "QUARANTINED"] as const)(
    "renders the %s block surface",
    async (processingState) => {
      await sweep(<MediaPlayer media={media({ processingState })} />);
    },
  );

  it("renders the missing-source surface", async () => {
    await sweep(<MediaPlayer media={media({ src: null })} />);
  });

  it.each([1, 2, 3, 4, 99])("renders the surface for MediaError code %i", async (code) => {
    await sweep(<MediaPlayer media={media()} />, async (container) => {
      const element = video(container);
      mediaState(element).error = { code };
      await fireMedia(element, "error");
    });
  });

  it("renders the buffering notice", async () => {
    await sweep(<MediaPlayer media={media()} />, async (container) => {
      await fireMedia(video(container), "waiting");
    });
  });

  it("renders the stalled surface", async () => {
    vi.useFakeTimers();
    try {
      const { container, unmount } = await mount(wrap(<MediaPlayer media={media()} />, locale));
      await fireMedia(video(container), "waiting");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS + 10);
      });
      assertNoIntlFailures(container);
      await unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
