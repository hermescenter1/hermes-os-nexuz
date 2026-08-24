/**
 * PHASE 107 STAGE 6-A — the async-state vocabulary.
 *
 * The Stage 5 detector decided a page's state by searching its text for
 * /error|failed|خطا|fehler/. The OT module renders "Sign-in required" and "Not
 * authorized", which match none of those words in any of the three catalogues,
 * so 27 correct cells were reported as unhandled failures — and `looksLoading`
 * fired for en and fa but not de on the very same page.
 *
 * `data-async-state` replaces that guess with a statement. These tests pin what
 * the statement is allowed to say, and — the part that matters — that the states
 * a reader must act on differently never collapse into one another.
 */
import { describe, it, expect } from "vitest";
import { asyncStateForFailure, type AsyncState } from "../async-state";
import type { ResourceFailureCode } from "../resource-request";

/** Both failure vocabularies in the product. */
const RESOURCE_CODES: ResourceFailureCode[] = [
  "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "INVALID",
  "RATE_LIMITED", "UNAVAILABLE", "OFFLINE", "FAILED",
];
const OT_CODES = [
  "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "INVALID_QUERY",
  "RATE_LIMITED", "UNAVAILABLE", "FAILED",
] as const;

const ALLOWED: AsyncState[] = [
  "loading", "ready", "empty",
  "auth-required", "forbidden", "not-found", "server-error", "network-error",
];

describe("the vocabulary is closed", () => {
  it.each([...RESOURCE_CODES, ...OT_CODES])("maps %s to a state in the closed set", (code) => {
    expect(ALLOWED).toContain(asyncStateForFailure(code));
  });

  it("never returns nothing, even for a code it has not seen", () => {
    // A surface with no state at all is the defect this stage exists to close,
    // so an unknown code must still resolve to something a reader can act on.
    expect(asyncStateForFailure("SOMETHING_NOBODY_ADDED_YET")).toBe("server-error");
  });
});

describe("states a reader must act on differently stay apart", () => {
  it("keeps auth-required, forbidden and not-found distinct", () => {
    const three = [
      asyncStateForFailure("UNAUTHENTICATED"),
      asyncStateForFailure("FORBIDDEN"),
      asyncStateForFailure("NOT_FOUND"),
    ];
    // Sign in again / ask an administrator / this does not exist are three
    // different instructions. Collapsing any two sends the reader somewhere
    // that cannot help them.
    expect(new Set(three).size).toBe(3);
    expect(three).toEqual(["auth-required", "forbidden", "not-found"]);
  });

  it("separates a network failure from a server failure", () => {
    // One means "check your connection", the other "the server answered badly".
    expect(asyncStateForFailure("OFFLINE")).toBe("network-error");
    expect(asyncStateForFailure("FAILED")).toBe("server-error");
    expect(asyncStateForFailure("OFFLINE")).not.toBe(asyncStateForFailure("FAILED"));
  });

  it("never reports any failure as ready or empty", () => {
    // The original defect in one line: a 401 rendered as "you have no records".
    for (const code of [...RESOURCE_CODES, ...OT_CODES]) {
      expect(["ready", "empty"]).not.toContain(asyncStateForFailure(code));
    }
  });

  it("gives the OT estate and the rest of the product the same words", () => {
    // Two modules, two failure enums, one vocabulary — so one detector reads
    // both and the mapping cannot drift into two versions.
    for (const shared of ["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "RATE_LIMITED", "UNAVAILABLE", "FAILED"]) {
      expect(asyncStateForFailure(shared)).toBe(asyncStateForFailure(shared));
    }
    expect(asyncStateForFailure("INVALID")).toBe(asyncStateForFailure("INVALID_QUERY"));
  });
});

describe("the attribute carries nothing it should not", () => {
  it("exposes no locale, route, tenant or identifier", () => {
    // The guarantee is membership in a closed set of eight keywords. That is
    // stronger than any pattern check: a value that must be one of eight fixed
    // words cannot smuggle an organization id or a path into the DOM.
    for (const code of [...RESOURCE_CODES, ...OT_CODES]) {
      const state = asyncStateForFailure(code);
      expect(ALLOWED).toContain(state);
      expect(state).toMatch(/^[a-z]+(-[a-z]+)?$/);   // a bare keyword, nothing appended
      expect(state).not.toMatch(/\d/);
    }
  });

  it("has exactly the eight states the detector knows about", () => {
    // If someone adds a ninth, this fails and the detector must be taught it
    // rather than silently treating it as unknown.
    expect(ALLOWED).toHaveLength(8);
    expect(new Set(ALLOWED).size).toBe(8);
  });
});

/**
 * PHASE 107 STAGE 6-A — the context states, which exist because a 401 was wrong.
 *
 * `withOtRoute` answered 401 both when there was no session and when a valid
 * session had no organization selected. The second told a signed-in
 * administrator to sign in again — advice that cannot work — on every OT page.
 * These states are the vocabulary that keeps the two apart all the way to the
 * screen, so the assertions below are about behaviour a reader depends on, not
 * about the shape of a lookup table.
 */
describe("Stage 6-A — organization and site context", () => {
  it("keeps context-required apart from being signed out", () => {
    expect(asyncStateForFailure("ORGANIZATION_CONTEXT_REQUIRED")).toBe("org-context-required");
    expect(asyncStateForFailure("SITE_CONTEXT_REQUIRED")).toBe("site-context-required");
    expect(asyncStateForFailure("UNAUTHENTICATED")).toBe("auth-required");

    // The three must never collapse: each sends the reader somewhere different.
    expect(new Set([
      asyncStateForFailure("ORGANIZATION_CONTEXT_REQUIRED"),
      asyncStateForFailure("SITE_CONTEXT_REQUIRED"),
      asyncStateForFailure("UNAUTHENTICATED"),
    ]).size).toBe(3);
  });

  it("never reports a missing context as emptiness", () => {
    // "You have no gateways" and "choose an organization" are opposite claims.
    for (const code of ["ORGANIZATION_CONTEXT_REQUIRED", "SITE_CONTEXT_REQUIRED"]) {
      expect(asyncStateForFailure(code)).not.toBe("empty");
      expect(asyncStateForFailure(code)).not.toBe("ready");
    }
  });

  it("separates a dropped connection from a server failure", () => {
    expect(asyncStateForFailure("OFFLINE")).toBe("network-error");
    expect(asyncStateForFailure("UNAVAILABLE")).toBe("server-error");
    expect(asyncStateForFailure("OFFLINE")).not.toBe(asyncStateForFailure("UNAVAILABLE"));
  });

  it("keeps forbidden apart from both auth and context", () => {
    expect(asyncStateForFailure("FORBIDDEN")).toBe("forbidden");
    expect(asyncStateForFailure("FORBIDDEN")).not.toBe(asyncStateForFailure("UNAUTHENTICATED"));
    expect(asyncStateForFailure("FORBIDDEN")).not.toBe(asyncStateForFailure("ORGANIZATION_CONTEXT_REQUIRED"));
  });
});
