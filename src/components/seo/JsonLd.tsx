/**
 * JsonLd — injects one or more JSON-LD <script> blocks into the page head.
 * This is a React Server Component (no "use client").
 * Safe: dangerouslySetInnerHTML is used only for structured-data blobs
 * that are serialised from our own schema builders — never from user input.
 *
 * NO NONCE, DELIBERATELY.
 *
 * A `<script type="application/ld+json">` is a DATA BLOCK. The browser never
 * prepares or executes it — the "prepare the script element" algorithm returns
 * as soon as it sees a type that is not JavaScript, a module or an import map,
 * and that return happens BEFORE the Content-Security-Policy check. So
 * `script-src` never applies to this element and a nonce on it protects
 * nothing: it is inert for the policy and inert for crawlers, which read the
 * text regardless.
 *
 * It was not inert for React. Under a header-delivered CSP the browser HIDES
 * every nonce content attribute once the element is connected — `getAttribute
 * ("nonce")` returns "" while `element.nonce` keeps the value — and React's
 * hydration diff reads the attribute. The server had rendered the real nonce,
 * the DOM reported an empty one, and every page carried a hydration mismatch
 * on this element. The authenticated browser matrix reported it in all twelve
 * cells.
 *
 * Removing the nonce from a data block removes the only thing about this
 * element the browser could disagree with, and changes nothing the policy
 * governs. The nonce is still applied, unchanged, to the inline scripts that
 * DO execute (see `src/app/[locale]/layout.tsx`), and the policy itself is
 * built in `src/middleware.ts` exactly as before.
 */

type SchemaObject = Record<string, unknown>;

/**
 * Serialise a schema object for embedding inside a `<script>` element.
 *
 * `JSON.stringify` alone is NOT safe here. Structured data legitimately carries
 * operator- and author-supplied strings (article headlines, vendor names,
 * course titles), and a value containing `</script>` would terminate the script
 * element early and inject the remainder into the document as markup.
 *
 * Escaping `<` to its `<` JSON escape closes that hole: the sequence can no
 * longer appear literally in the output, while `JSON.parse` — and therefore
 * every structured-data consumer — still reads back the exact original string.
 * U+2028/U+2029 are escaped as well; both are valid inside a JSON string but
 * are line terminators to a JavaScript parser.
 */
function serializeSchema(schema: SchemaObject): string {
  // Both the special characters AND the backslash of their replacement escape
  // are built with String.fromCharCode. Written as literal escape sequences in
  // source, this toolchain has already silently degraded them once (U+2028
  // became a plain space, and the replacement collapsed into a no-op).
  const BACKSLASH           = String.fromCharCode(92);
  const LINE_SEPARATOR      = String.fromCharCode(0x2028);
  const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
  return JSON.stringify(schema)
    .replace(/</g, BACKSLASH + "u003c")
    .replace(new RegExp(LINE_SEPARATOR, "g"), BACKSLASH + "u2028")
    .replace(new RegExp(PARAGRAPH_SEPARATOR, "g"), BACKSLASH + "u2029");
}

interface JsonLdProps {
  data: SchemaObject | SchemaObject[];
}

/**
 * Pure: the output is a function of `data` alone. Nothing request-scoped —
 * no header, no nonce — can enter the markup, so the server's HTML and the
 * client's hydration tree cannot disagree about this element.
 */
export function JsonLd({ data }: JsonLdProps) {
  const schemas = Array.isArray(data) ? data : [data];
  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeSchema(schema) }}
        />
      ))}
    </>
  );
}
