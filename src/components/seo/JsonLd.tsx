import { headers } from "next/headers";

/**
 * JsonLd — injects one or more JSON-LD <script> blocks into the page head.
 * This is a React Server Component (no "use client").
 * Safe: dangerouslySetInnerHTML is used only for structured-data blobs
 * that are serialised from our own schema builders — never from user input.
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
  nonce?: string;
}

export async function JsonLd({ data, nonce }: JsonLdProps) {
  const requestNonce =
    nonce ?? (await headers()).get("x-nonce") ?? undefined;

  const schemas = Array.isArray(data) ? data : [data];
  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={i}
          nonce={requestNonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeSchema(schema) }}
        />
      ))}
    </>
  );
}
