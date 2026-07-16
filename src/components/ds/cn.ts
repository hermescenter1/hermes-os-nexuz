/**
 * cn — tiny dependency-free className composer for the Hermes Design System.
 *
 * The repo has no clsx / tailwind-merge / cva (see PHASE 87B audit); adding one
 * was not justified for this phase. This helper covers the cases the ds
 * components need: strings, arrays, and conditional `{ "class": boolean }`
 * objects, filtering falsy values and de-duplicating exact repeats.
 *
 * It does NOT resolve Tailwind conflicts the way tailwind-merge would — ds
 * components are authored so their own classes never conflict, and a caller's
 * `className` is always appended last so it wins by CSS source order.
 */
export type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];

  const push = (value: ClassValue): void => {
    if (!value) return;
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) push(v);
      return;
    }
    if (typeof value === "object") {
      for (const key in value) {
        if (value[key]) out.push(key);
      }
    }
  };

  for (const input of inputs) push(input);

  // Flatten space-separated tokens and drop exact duplicates (last wins in CSS,
  // so keeping the first occurrence is fine for non-conflicting utilities).
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of out.join(" ").split(/\s+/)) {
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens.join(" ");
}
