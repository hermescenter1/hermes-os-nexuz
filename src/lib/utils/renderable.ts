interface KnownRenderableObject {
  message?:        string;
  description?:    string;
  title?:          string;
  label?:          string;
  action?:         string;
  recommendation?: string;
}

export function toRenderableText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const obj = value as KnownRenderableObject;
    return (
      obj.message ??
      obj.description ??
      obj.title ??
      obj.label ??
      obj.action ??
      obj.recommendation ??
      JSON.stringify(value)
    );
  }
  return String(value);
}
