/**
 * JsonLd — injects one or more JSON-LD <script> blocks into the page head.
 * This is a React Server Component (no "use client").
 * Safe: dangerouslySetInnerHTML is used only for structured-data blobs
 * that are serialised from our own schema builders — never from user input.
 */

type SchemaObject = Record<string, unknown>;

interface JsonLdProps {
  data: SchemaObject | SchemaObject[];
}

export function JsonLd({ data }: JsonLdProps) {
  const schemas = Array.isArray(data) ? data : [data];
  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
