import { describe, it, expect } from "vitest";
import { safeReturnPath, safeLocaleReturnPath } from "../safe-return-path";

/**
 * The login surface assigns `window.location.href` from the `from` query
 * parameter so a visitor sent to sign in returns to where they were going —
 * the Journal's "Write article" entry point being the reason it exists.
 *
 * That parameter is attacker-controllable and the assignment is a navigation,
 * so these tests are the open-redirect boundary: everything in the "rejects"
 * block below is a URL that, if followed, would take a user who just typed
 * their password on hermesnovin.com to somewhere else.
 */

describe("safeReturnPath — accepts genuine internal paths", () => {
  it.each([
    "/fa/articles/write",
    "/en/articles/write",
    "/de/articles/write",
    "/en/dashboard",
    "/en/articles/my-articles?submitted=1",
    "/en/articles/some-slug#section",
  ])("accepts %s", (p) => {
    expect(safeReturnPath(p)).toBe(p);
  });

  it("decodes a percent-encoded path once", () => {
    expect(safeReturnPath("%2Ffa%2Farticles%2Fwrite")).toBe("/fa/articles/write");
  });
});

describe("safeReturnPath — rejects off-origin destinations", () => {
  it.each([
    ["absolute http URL",         "http://evil.example/steal"],
    ["absolute https URL",        "https://evil.example/steal"],
    ["protocol-relative",         "//evil.example/steal"],
    ["encoded protocol-relative", "%2F%2Fevil.example"],
    ["backslash authority",       "/\\evil.example"],
    ["double backslash",          "\\\\evil.example"],
    ["mixed slash-backslash",     "/\\/evil.example"],
    ["javascript scheme",         "javascript:alert(1)"],
    ["data scheme",               "data:text/html,<script>"],
    ["scheme after path",         "/redirect:https://evil.example"],
    ["relative path",             "articles/write"],
    ["bare host",                 "evil.example"],
    ["traversal",                 "/en/../../etc/passwd"],
  ])("rejects %s", (_label, value) => {
    expect(safeReturnPath(value)).toBeNull();
  });

  it("rejects empty, missing and malformed values", () => {
    expect(safeReturnPath("")).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    // A lone % is not a decodable sequence.
    expect(safeReturnPath("/en/%")).toBeNull();
  });

  it("rejects control characters smuggled through percent-encoding", () => {
    // %0A and %0D would let a value span a line in anything that logs it,
    // and %09/%20 are trimmed differently by different URL parsers.
    expect(safeReturnPath("/en/%0Ahttps://evil.example")).toBeNull();
    expect(safeReturnPath("/en/%0D%0Aevil")).toBeNull();
    expect(safeReturnPath("/en/ articles")).toBeNull();
    expect(safeReturnPath("%20//evil.example")).toBeNull();
  });

  it("rejects an absurdly long value", () => {
    expect(safeReturnPath("/en/" + "a".repeat(600))).toBeNull();
  });
});

describe("safeLocaleReturnPath — additionally requires a known locale segment", () => {
  it.each(["/fa/articles/write", "/en/dashboard", "/de/articles/write"])(
    "accepts %s",
    (p) => expect(safeLocaleReturnPath(p)).toBe(p),
  );

  it.each([
    "/articles/write",        // no locale segment
    "/xx/articles/write",     // unknown locale
    "/",                      // no segment at all
    "//evil.example",         // still rejected by the base check
    "https://evil.example",
  ])("rejects %s", (p) => {
    expect(safeLocaleReturnPath(p)).toBeNull();
  });
});
