/**
 * PHASE 104-B1.3 §2 — EXACT, fail-closed runtime validation of the public
 * careers API responses.
 *
 * The B1.2 checks were partial: they proved a handful of strings were present
 * and let everything else through, so a 2xx carrying `location: 42`, an object
 * inside `responsibilities`, or a `salaryMin` of `"65000"` reached
 * `phase="ready"` and rendered as though it were fact. Every field the
 * components actually consume is validated here — type, nullability and, for
 * collections, EVERY member — and anything short of the full contract is a
 * MALFORMED response (outage class), never a half-empty success.
 *
 * These validators are the single definition of "the API kept its promise":
 * both `JobDetailClient` and `CareersBoardClient` route their payloads through
 * them, and the component tests exercise them by rendering the real
 * components against real response shapes.
 */

export interface PublicJobDetail {
  id: string;
  title: string;
  shortSummary: string;
  description: string;
  departmentLabel: string;
  responsibilities: string[];
  requirements: string[];
  preferredExperience: string[];
  localizedSkills: Record<string, string>;
  skillCodes: string[];
  location: string;
  locationType: string | null;
  salaryCurrency: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  publishedAt: string;
  closingDate: string | undefined;
}

export interface PublicJobCard {
  id: string;
  title: string;
  shortSummary: string;
  department: string;
  departmentLabel: string;
  location: string;
  addressLocality: string | null;
  addressRegion: string | null;
  addressCountry: string | null;
  locationType: string | null;
  skills: string[];
  publishedAt: string;
  closingDate: string | undefined;
}

/** A non-empty string — a blank or whitespace-only value is not a value. */
const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** A nullable scalar string: present-and-real, or explicitly null. */
const nullableStr = (v: unknown): v is string | null => v === null || str(v);

/** An optional ISO-ish string: absent, or a real string. */
const optionalStr = (v: unknown): v is string | undefined => v === undefined || str(v);

/** Every member must be a real string — one object in the array fails the lot. */
const strArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim().length > 0);

/** A string→string map: keys are strings by construction; values must be too. */
const strMap = (v: unknown): v is Record<string, string> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every(
    (x) => typeof x === "string" && x.trim().length > 0,
  );
};

/**
 * Money is an integer or nothing. `"65000"`, `65000.5`, `NaN` and `Infinity`
 * are all refusals — a number the UI would format must be a number the record
 * actually holds.
 */
const nullableInt = (v: unknown): v is number | null =>
  v === null || (typeof v === "number" && Number.isInteger(v));

export function parsePublicJobDetail(v: unknown): PublicJobDetail | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  if (!str(d.id) || !str(d.title) || !str(d.shortSummary) || !str(d.description)) return null;
  if (!str(d.departmentLabel) || !str(d.location) || !str(d.publishedAt)) return null;
  if (!strArray(d.responsibilities) || !strArray(d.requirements) || !strArray(d.preferredExperience)) return null;
  if (!strArray(d.skillCodes)) return null;
  if (!strMap(d.localizedSkills)) return null;
  if (!nullableStr(d.locationType) || !nullableStr(d.salaryCurrency)) return null;
  if (!nullableInt(d.salaryMin) || !nullableInt(d.salaryMax)) return null;
  if (!optionalStr(d.closingDate)) return null;
  return d as unknown as PublicJobDetail;
}

export function parsePublicJobCard(v: unknown): PublicJobCard | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const c = v as Record<string, unknown>;
  if (!str(c.id) || !str(c.title) || !str(c.shortSummary)) return null;
  if (!str(c.department) || !str(c.departmentLabel) || !str(c.location)) return null;
  if (!str(c.publishedAt)) return null;
  if (!nullableStr(c.addressLocality) || !nullableStr(c.addressRegion) || !nullableStr(c.addressCountry)) return null;
  if (!nullableStr(c.locationType)) return null;
  if (!strArray(c.skills)) return null;
  if (!optionalStr(c.closingDate)) return null;
  return c as unknown as PublicJobCard;
}

/** The whole list, or nothing: ONE malformed card invalidates the response. */
export function parsePublicJobCards(v: unknown): PublicJobCard[] | null {
  if (!v || typeof v !== "object") return null;
  const jobs = (v as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) return null;
  const parsed = jobs.map(parsePublicJobCard);
  return parsed.every((c): c is PublicJobCard => c !== null) ? (parsed as PublicJobCard[]) : null;
}
