/**
 * PHASE 110-A2.1 — describing a thrown value without touching it unsafely.
 *
 * WHY THIS EXISTS. Code that logs from a `catch` reads properties off a value it
 * did not create. `String(err)`, `err.message`, `err.code` and `err.constructor`
 * are all property accesses, and a property access can RAISE: a getter that
 * throws, a `Proxy` whose traps throw, a `toString` that detonates. The second
 * exception then escapes the handler whose whole purpose was to contain the
 * first, and a deliberate fail-closed answer becomes an unhandled crash.
 *
 * Measured, not imagined: driving the real logger with a value whose `toString`
 * throws produced no log line at all and propagated the error, because
 * `String(err)` runs before the logger is even called.
 *
 * WHAT IT PRODUCES. A short descriptor built by CONSTRUCTION rather than by
 * filtering: an error class name that matches a conservative pattern, and, when
 * present, a stable driver code that matches another. Nothing else can appear —
 * no message, no connection string, no host, no statement, no customer value —
 * because nothing else is ever read.
 */

/** Class names we are willing to print: letters and digits, bounded length. */
const SAFE_CLASS = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
/** Driver codes: `P1001`, `23505`, `ECONNREFUSED` — never free text. */
const SAFE_CODE = /^[A-Za-z0-9_]{1,32}$/;

/**
 * Read one property off a possibly hostile value.
 *
 * A non-object cannot carry properties, so it is answered before any access.
 * Everything else goes through a `try`, because the access itself is what may
 * throw.
 */
export function safeReadProperty(value: unknown, key: string | symbol): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return undefined;
  try {
    return (value as Record<string | symbol, unknown>)[key];
  } catch {
    return undefined;
  }
}

/**
 * A one-line, safe description of anything that was thrown.
 *
 * Never throws, never returns free text from the value, and never returns an
 * empty string — an unreadable value is reported as `UnknownError`, which is
 * itself information an operator can act on.
 */
export function describeErrorSafely(err: unknown): string {
  if (err === null) return "NullThrown";
  if (err === undefined) return "UndefinedThrown";

  let cls: string | null = null;
  try {
    if (err instanceof Error) {
      const ctor = safeReadProperty(err, "constructor");
      const name = safeReadProperty(ctor, "name");
      if (typeof name === "string" && SAFE_CLASS.test(name)) cls = name;
      if (!cls) {
        const own = safeReadProperty(err, "name");
        if (typeof own === "string" && SAFE_CLASS.test(own)) cls = own;
      }
    } else {
      cls = `${typeof err}Thrown`;
    }
  } catch {
    cls = null;
  }

  const rawCode = safeReadProperty(err, "code");
  const code = typeof rawCode === "string" && SAFE_CODE.test(rawCode) ? rawCode : null;

  const safeCls = cls && SAFE_CLASS.test(cls) ? cls : "UnknownError";
  return code ? `${safeCls}(${code})` : safeCls;
}
