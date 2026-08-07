/**
 * Hermes OS — Phase 98 migration SQL classifier.
 *
 * Pure static analysis of a single Prisma migration's `migration.sql` text.
 * Never executes SQL, never inspects the live database — this is a text-only
 * safety classifier used by the release gate to decide whether a migration is
 * safe to auto-apply, requires a pre-migration backup, or must block the
 * deploy outright until a human confirms intent.
 *
 * SQL comments are stripped BEFORE pattern matching so that a comment merely
 * *mentioning* a dangerous keyword (e.g. "-- do not DROP TABLE here") can
 * never be misclassified as the dangerous operation itself, and — just as
 * importantly — a real dangerous statement can never be hidden by wrapping it
 * in a comment (stripping removes the comment text entirely, so a statement
 * that is genuinely commented out produces no match at all, which is the
 * correct, non-executing outcome).
 */

/** @typedef {{ pattern: string, severity: "breaking"|"forward-only" }} Hit */
/** @typedef {"BREAKING_OR_UNKNOWN"|"FORWARD_ONLY_REQUIRES_BACKUP"|"ADDITIVE_COMPATIBLE"} MigrationClassification */

/**
 * Strip `-- ...` line comments and `/* ... *\/` block comments from SQL text.
 * Does not attempt full SQL string-literal awareness beyond simple comment
 * removal, which is sufficient for Prisma-generated migration files.
 *
 * @param {string} sqlText
 * @returns {string}
 */
export function stripSqlComments(sqlText) {
  const noBlock = sqlText.replace(/\/\*[\s\S]*?\*\//g, " ");
  const noLine = noBlock.replace(/--[^\n\r]*/g, "");
  return noLine;
}

/**
 * @typedef {Object} DangerPattern
 * @property {string} pattern    human-readable name of the construct
 * @property {"breaking"|"forward-only"} severity
 * @property {RegExp} regex      case-insensitive regex tested against stripped SQL
 */

/**
 * @typedef {Object} StatementPattern
 * @property {string} pattern
 * @property {"breaking"|"forward-only"} severity
 * @property {RegExp[]} allOf   every regex must match WITHIN the same statement
 */

/** @type {StatementPattern[]} */
const BREAKING_STATEMENT_PATTERNS = [
  { pattern: "DROP COLUMN", severity: "breaking", allOf: [/\bALTER\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i] },
  { pattern: "ALTER TABLE ... RENAME TO", severity: "breaking", allOf: [/\bALTER\s+TABLE\b/i, /\bRENAME\s+TO\b/i] },
  { pattern: "ALTER TYPE ... RENAME/DROP", severity: "breaking", allOf: [/\bALTER\s+TYPE\b/i, /\b(RENAME|DROP)\b/i] },
];

/**
 * @param {string} strippedSql
 * @param {StatementPattern[]} patterns
 * @returns {Hit[]}
 */
function matchStatementPatterns(strippedSql, patterns) {
  const statements = strippedSql.split(";");
  /** @type {Hit[]} */
  const hits = [];
  for (const { pattern, severity, allOf } of patterns) {
    const matched = statements.some((stmt) => allOf.every((re) => re.test(stmt)));
    if (matched) hits.push({ pattern, severity });
  }
  return hits;
}

/** @type {DangerPattern[]} */
const BREAKING_PATTERNS = [
  { pattern: "DROP TABLE", severity: "breaking", regex: /\bDROP\s+TABLE\b/i },
  { pattern: "TRUNCATE", severity: "breaking", regex: /\bTRUNCATE\b/i },
  { pattern: "DELETE FROM", severity: "breaking", regex: /\bDELETE\s+FROM\b/i },
  {
    pattern: "ALTER COLUMN ... TYPE",
    severity: "breaking",
    regex: /\bALTER\s+(?:COLUMN\s+)?"?[\w]+"?\s+TYPE\b/i,
  },
  { pattern: "RENAME COLUMN", severity: "breaking", regex: /\bRENAME\s+COLUMN\b/i },
  { pattern: "DROP TYPE", severity: "breaking", regex: /\bDROP\s+TYPE\b/i },
  { pattern: "DROP DATABASE", severity: "breaking", regex: /\bDROP\s+DATABASE\b/i },
  { pattern: "DROP SCHEMA", severity: "breaking", regex: /\bDROP\s+SCHEMA\b/i },
];

/**
 * ADD COLUMN ... NOT NULL without a DEFAULT in the same statement. Matched by
 * scanning each ALTER TABLE ... ADD COLUMN statement (split on `;`) rather
 * than a single global regex, so DEFAULT elsewhere in the file cannot mask a
 * missing DEFAULT in this statement.
 *
 * @param {string} strippedSql
 * @returns {boolean}
 */
function hasAddColumnNotNullWithoutDefault(strippedSql) {
  const statements = strippedSql.split(";");
  for (const stmt of statements) {
    if (!/\bADD\s+COLUMN\b/i.test(stmt)) continue;
    if (!/\bNOT\s+NULL\b/i.test(stmt)) continue;
    if (/\bDEFAULT\b/i.test(stmt)) continue;
    return true;
  }
  return false;
}

/** @type {StatementPattern[]} */
const FORWARD_ONLY_STATEMENT_PATTERNS = [
  { pattern: "ADD CONSTRAINT ... UNIQUE", severity: "forward-only", allOf: [/\bADD\s+CONSTRAINT\b/i, /\bUNIQUE\b/i] },
  {
    pattern: "ADD CONSTRAINT ... FOREIGN KEY",
    severity: "forward-only",
    allOf: [/\bADD\s+CONSTRAINT\b/i, /\bFOREIGN\s+KEY\b/i],
  },
  { pattern: "SET NOT NULL", severity: "forward-only", allOf: [/\bALTER\s+COLUMN\b/i, /\bSET\s+NOT\s+NULL\b/i] },
];

/** @type {DangerPattern[]} */
const FORWARD_ONLY_PATTERNS = [
  { pattern: "CREATE UNIQUE INDEX", severity: "forward-only", regex: /\bCREATE\s+UNIQUE\s+INDEX\b/i },
  { pattern: "REFERENCES (foreign key)", severity: "forward-only", regex: /\bREFERENCES\b/i },
];

/**
 * @param {string} strippedSql
 * @returns {boolean} true if an UPDATE statement has no WHERE clause
 */
function hasUnboundedUpdate(strippedSql) {
  const statements = strippedSql.split(";");
  for (const stmt of statements) {
    if (!/\bUPDATE\b/i.test(stmt)) continue;
    if (!/\bSET\b/i.test(stmt)) continue;
    if (/\bWHERE\b/i.test(stmt)) continue;
    return true;
  }
  return false;
}

/**
 * Classify a single migration's SQL text.
 *
 * @param {string} sqlText raw contents of a `migration.sql` file
 * @returns {{ classification: MigrationClassification, hits: Hit[] }}
 */
export function classifyMigrationSql(sqlText) {
  const stripped = stripSqlComments(String(sqlText ?? ""));

  /** @type {Hit[]} */
  const hits = [];

  for (const { pattern, severity, regex } of BREAKING_PATTERNS) {
    if (regex.test(stripped)) hits.push({ pattern, severity });
  }
  hits.push(...matchStatementPatterns(stripped, BREAKING_STATEMENT_PATTERNS));

  for (const { pattern, severity, regex } of FORWARD_ONLY_PATTERNS) {
    if (regex.test(stripped)) hits.push({ pattern, severity });
  }
  hits.push(...matchStatementPatterns(stripped, FORWARD_ONLY_STATEMENT_PATTERNS));

  if (hasAddColumnNotNullWithoutDefault(stripped)) {
    hits.push({ pattern: "ADD COLUMN ... NOT NULL without DEFAULT", severity: "forward-only" });
  }

  if (hasUnboundedUpdate(stripped)) {
    hits.push({ pattern: "UPDATE without WHERE (unbounded)", severity: "forward-only" });
  }

  const hasBreaking = hits.some((h) => h.severity === "breaking");
  const hasForwardOnly = hits.some((h) => h.severity === "forward-only");

  /** @type {MigrationClassification} */
  let classification;
  if (hasBreaking) {
    classification = "BREAKING_OR_UNKNOWN";
  } else if (hasForwardOnly) {
    classification = "FORWARD_ONLY_REQUIRES_BACKUP";
  } else {
    // Empty/no-op migrations are additive-compatible; NO_MIGRATION (no NEW
    // migration folder at all) is decided by the release gate, not here.
    classification = "ADDITIVE_COMPATIBLE";
  }

  return { classification, hits };
}
