import { headers } from "next/headers";

/**
 * JsonLd — injects one or more JSON-LD <script> blocks into the page head.
 * This is a React Server Component (no "use client").
 * Safe: dangerouslySetInnerHTML is used only for structured-data blobs
 * that are serialised from our own schema builders — never from user input.
 */

type SchemaObject = Record<string, unknown>;

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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
