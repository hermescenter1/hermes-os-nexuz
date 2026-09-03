// @vitest-environment jsdom
/**
 * PHASE 109-C1 — JSON-LD hydrates without a nonce mismatch, deterministically.
 *
 * THE DEFECT
 * The authenticated browser matrix reported, in all twelve cells:
 *
 *     <JsonLd>
 *       <script
 *   +     nonce="Yjk2MWEzNTIt…"        (client)
 *   -     nonce=""                     (server, as read back from the DOM)
 *         type="application/ld+json"
 *
 * The server HAD rendered the nonce. Under a header-delivered CSP the browser
 * hides every nonce content attribute once the element is connected —
 * getAttribute("nonce") returns "" while element.nonce keeps the value — and
 * React's hydration diff reads the attribute (hydrateAttribute → getAttribute).
 * So the "mismatch" was the browser doing exactly what the CSP specification
 * asks of it, on an attribute that governed nothing: a JSON-LD data block is
 * never executed, and script-src never applies to it.
 *
 * THE FIX, AND WHAT THIS FILE PROVES
 *   1. JsonLd renders NO nonce, and nothing request-scoped: its markup is a
 *      pure function of the data, identical across renders.
 *   2. Hydrating that markup in a real React root produces no hydration
 *      warning.
 *   3. The control: the OLD shape — a nonce on the data block — DOES produce
 *      the hydration warning once the browser's nonce hiding is applied to
 *      the DOM. That is the mechanism reproduced, not assumed.
 *   4. The nonce is still applied where it matters: the executing inline
 *      scripts in the locale layout, and the script-src policy in middleware.
 */

import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JsonLd } from "../JsonLd";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Hermes Novin Mehr",
  url: "https://www.hermesnovin.com",
  description: "PLC & SCADA <intelligence>",
};

/** Hydrate `html` against `ui` inside a real React root and collect console.error output. */
async function hydrate(html: string, ui: React.ReactElement, mutate?: (container: HTMLElement) => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = html;
  mutate?.(container);

  const errors: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  });
  let root: Root | null = null;
  try {
    await act(async () => {
      root = hydrateRoot(container, ui);
    });
  } finally {
    spy.mockRestore();
  }
  return {
    errors,
    container,
    cleanup: async () => {
      await act(async () => root?.unmount());
      container.remove();
    },
  };
}

const hydrationWarnings = (errors: string[]) =>
  errors.filter((e) => /hydrat/i.test(e) || /didn't match/i.test(e));

afterEach(() => {
  document.body.replaceChildren();
});

describe("JsonLd · pure, nonce-free markup", () => {
  it("renders a JSON-LD data block with no nonce attribute", () => {
    const html = renderToString(<JsonLd data={DATA} />);
    expect(html).toContain('type="application/ld+json"');
    expect(html).not.toMatch(/\bnonce=/);
  });

  it("is byte-identical across renders — nothing request-scoped can enter it", () => {
    const a = renderToString(<JsonLd data={DATA} />);
    const b = renderToString(<JsonLd data={DATA} />);
    expect(a).toBe(b);
  });

  it("takes only its data — no header, no nonce, no request", () => {
    // A component with a second way to vary is a component that can disagree
    // with itself between server and client.
    expect(JsonLd.length).toBe(1);
    const src = readFileSync(join(process.cwd(), "src/components/seo/JsonLd.tsx"), "utf8");
    expect(src).not.toContain("next/headers");
    expect(src).not.toMatch(/\bnonce\s*=\s*\{/);
  });

  it("still produces valid, lossless JSON-LD", () => {
    const html = renderToString(<JsonLd data={DATA} />);
    const container = document.createElement("div");
    container.innerHTML = html;
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    expect(JSON.parse(script!.textContent ?? "")).toEqual(DATA);
    // and the breakout guard is intact
    expect(script!.textContent).not.toContain("<");
  });

  it("renders one block per schema when given an array", () => {
    const html = renderToString(<JsonLd data={[DATA, { ...DATA, "@type": "WebSite" }]} />);
    expect(html.match(/application\/ld\+json/g)?.length).toBe(2);
  });
});

describe("JsonLd · hydration is clean, and the old shape reproduces the defect", () => {
  it("hydrates the server markup with zero hydration warnings", async () => {
    const html = renderToString(<JsonLd data={DATA} />);
    const { errors, cleanup } = await hydrate(html, <JsonLd data={DATA} />);
    expect(hydrationWarnings(errors)).toEqual([]);
    await cleanup();
  });

  it("hydrates cleanly even when the browser would have hidden a nonce (there is none to hide)", async () => {
    const html = renderToString(<JsonLd data={DATA} />);
    // The browser's CSP behaviour: every nonce content attribute is cleared.
    const hideNonces = (container: HTMLElement) => {
      for (const s of container.querySelectorAll("script[nonce]")) s.setAttribute("nonce", "");
    };
    const { errors, cleanup } = await hydrate(html, <JsonLd data={DATA} />, hideNonces);
    expect(hydrationWarnings(errors)).toEqual([]);
    await cleanup();
  });

  it("CONTROL — a nonce on the data block, after the browser hides it, DOES mismatch", async () => {
    // This is the pre-fix component shape, and the exact sequence a browser
    // under a header CSP performs. If this control stopped failing, the
    // mechanism this file explains would no longer be the mechanism.
    const NONCE = "Yjk2MWEzNTItNTgyOC00MTA0LWJmNmMtZGFmZjM3MDE4NjY3";
    const WithNonce = () => (
      <script
        nonce={NONCE}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(DATA).replace(/</g, "\\u003c") }}
      />
    );
    const html = renderToString(<WithNonce />);
    expect(html).toContain(`nonce="${NONCE}"`); // the server DID send it
    const hideNonces = (container: HTMLElement) => {
      for (const s of container.querySelectorAll("script[nonce]")) s.setAttribute("nonce", "");
    };
    const { errors, cleanup } = await hydrate(html, <WithNonce />, hideNonces);
    const warnings = hydrationWarnings(errors);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join("\n")).toMatch(/nonce/);
    await cleanup();
  });
});

describe("JsonLd · the CSP nonce still guards what executes", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("the locale layout passes the nonce to its executing inline script and not to JsonLd", () => {
    const layout = read("src/app/[locale]/layout.tsx");
    expect(layout).toMatch(/<JsonLd data=\{siteEntityGraph\(\)\}\s*\/>/);
    expect(layout).not.toMatch(/<JsonLd[^>]*nonce/);
    // The GA consent bootstrap executes, so it keeps the nonce.
    expect(layout).toMatch(/<script\s+nonce=\{nonce\}\s+dangerouslySetInnerHTML/);
  });

  it("middleware still issues a per-request nonce into script-src", () => {
    const middleware = read("src/middleware.ts");
    expect(middleware).toMatch(/script-src 'self' 'nonce-\$\{nonce\}'/);
    expect(middleware).toContain('reqHeaders.set("x-nonce", nonce)');
    expect(middleware).toContain('response.headers.set("content-security-policy", csp)');
  });
});
