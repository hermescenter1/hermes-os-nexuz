/**
 * Phase 97 — Legal-document lifecycle pure logic (I/O-free).
 *
 * Proves the closed state machine, the approval/publication permission
 * separation, and that content is editable only while DRAFT.
 */
import { describe, it, expect } from "vitest";
import {
  LEGAL_DOCUMENT_TRANSITIONS,
  canTransitionLegalDocument,
  transitionAction,
  isContentEditableLifecycle,
  isKnownLifecycle,
  isPublishable,
} from "../legal-document-lifecycle";

describe("legal-document state machine", () => {
  it("follows the governed happy path", () => {
    expect(canTransitionLegalDocument("DRAFT", "IN_REVIEW")).toBe(true);
    expect(canTransitionLegalDocument("IN_REVIEW", "APPROVED")).toBe(true);
    expect(canTransitionLegalDocument("APPROVED", "SCHEDULED")).toBe(true);
    expect(canTransitionLegalDocument("APPROVED", "PUBLISHED")).toBe(true);
    expect(canTransitionLegalDocument("SCHEDULED", "PUBLISHED")).toBe(true);
    expect(canTransitionLegalDocument("PUBLISHED", "SUPERSEDED")).toBe(true);
    expect(canTransitionLegalDocument("SUPERSEDED", "ARCHIVED")).toBe(true);
  });

  it("rejects publication without approval and other skips", () => {
    expect(canTransitionLegalDocument("DRAFT", "PUBLISHED")).toBe(false);
    expect(canTransitionLegalDocument("DRAFT", "APPROVED")).toBe(false);
    expect(canTransitionLegalDocument("IN_REVIEW", "PUBLISHED")).toBe(false);
  });

  it("treats WITHDRAWN as distinct from SUPERSEDED (both reachable only from PUBLISHED)", () => {
    expect(canTransitionLegalDocument("PUBLISHED", "WITHDRAWN")).toBe(true);
    expect(canTransitionLegalDocument("WITHDRAWN", "ARCHIVED")).toBe(true);
    expect(canTransitionLegalDocument("WITHDRAWN", "PUBLISHED")).toBe(false);
  });

  it("ARCHIVED is terminal; no re-activation of archived/withdrawn/superseded", () => {
    expect(LEGAL_DOCUMENT_TRANSITIONS.ARCHIVED).toEqual([]);
    expect(canTransitionLegalDocument("ARCHIVED", "PUBLISHED")).toBe(false);
    expect(canTransitionLegalDocument("SUPERSEDED", "PUBLISHED")).toBe(false);
    expect(canTransitionLegalDocument("WITHDRAWN", "PUBLISHED")).toBe(false);
  });

  it("rejects self-transitions and unknown states", () => {
    expect(canTransitionLegalDocument("DRAFT", "DRAFT")).toBe(false);
    expect(isKnownLifecycle("PUBLISHED")).toBe(true);
    expect(isKnownLifecycle("WHATEVER")).toBe(false);
  });
});

describe("approval and publication are separate actions", () => {
  it("maps each transition to the right permission class", () => {
    expect(transitionAction("IN_REVIEW", "APPROVED")).toBe("approve");
    expect(transitionAction("APPROVED", "PUBLISHED")).toBe("publish");
    expect(transitionAction("SCHEDULED", "PUBLISHED")).toBe("publish");
    expect(transitionAction("PUBLISHED", "WITHDRAWN")).toBe("publish");
    expect(transitionAction("DRAFT", "IN_REVIEW")).toBe("manage");
    expect(transitionAction("APPROVED", "SCHEDULED")).toBe("manage");
    expect(transitionAction("DRAFT", "PUBLISHED")).toBeNull(); // not allowed at all
  });
  it("publication is only reachable from an approved state", () => {
    expect(isPublishable("APPROVED")).toBe(true);
    expect(isPublishable("SCHEDULED")).toBe(true);
    expect(isPublishable("DRAFT")).toBe(false);
    expect(isPublishable("IN_REVIEW")).toBe(false);
  });
});

describe("content editability", () => {
  it("content is editable only while DRAFT", () => {
    expect(isContentEditableLifecycle("DRAFT")).toBe(true);
    for (const s of ["IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "SUPERSEDED", "WITHDRAWN", "ARCHIVED"]) {
      expect(isContentEditableLifecycle(s)).toBe(false);
    }
  });
});
