// @ts-check
/**
 * Small dependency-free JavaScript lexer used by the Phase 104 build gates.
 *
 * It removes comments while preserving line breaks and every executable token,
 * including strings, template literals and regular-expression literals. That is
 * intentional: a forbidden namespace inside a string is executable data and
 * must still fail the gate; the same text inside a comment must not.
 */

const REGEX_PRECEDERS = new Set([
  '', '(', '[', '{', ',', ';', ':', '?', '=', '==', '===', '!=', '!==',
  '=>', '+', '-', '*', '%', '**', '&', '|', '^', '!', '~', '&&', '||',
  '??', '<', '>', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=',
  '^=', 'return', 'throw', 'case', 'delete', 'void', 'typeof', 'instanceof',
  'in', 'of', 'yield', 'await', 'new', 'else', 'do',
])

const IDENT_START = /[A-Za-z_$]/
const IDENT_PART = /[A-Za-z0-9_$]/

/** @param {string} ch */
const isIdentStart = (ch) => !!ch && IDENT_START.test(ch)
/** @param {string} ch */
const isIdentPart = (ch) => !!ch && IDENT_PART.test(ch)

/**
 * Replace comment characters with spaces while preserving newlines and all
 * executable characters. The lexer is deliberately conservative: when `/` is
 * ambiguous it treats it as division, which cannot hide a comment token.
 *
 * @param {string} code
 * @returns {string}
 */
export function stripComments(code) {
  let out = ''
  let i = 0
  /** @type {{kind:'code'|'template', templateBraceDepth?:number, previous?:string}[]} */
  const stack = [{ kind: 'code', previous: '' }]

  const blank = (ch) => { out += ch === '\n' || ch === '\r' ? ch : ' ' }
  const top = () => stack[stack.length - 1]

  while (i < code.length) {
    const state = top()
    const ch = code[i]
    const next = code[i + 1]

    if (state.kind === 'template') {
      out += ch
      i += 1
      if (ch === '\\' && i < code.length) {
        out += code[i]
        i += 1
      } else if (ch === '`') {
        stack.pop()
      } else if (ch === '$' && next === '{') {
        out += next
        i += 1
        stack.push({ kind: 'code', templateBraceDepth: 1, previous: '{' })
      }
      continue
    }

    if (state.templateBraceDepth && ch === '}') {
      out += ch
      i += 1
      state.templateBraceDepth -= 1
      if (state.templateBraceDepth === 0) stack.pop()
      else state.previous = '}'
      continue
    }

    if (ch === '/' && next === '/') {
      blank(ch); blank(next); i += 2
      while (i < code.length && code[i] !== '\n' && code[i] !== '\r') {
        blank(code[i]); i += 1
      }
      continue
    }

    if (ch === '/' && next === '*') {
      blank(ch); blank(next); i += 2
      while (i < code.length) {
        if (code[i] === '*' && code[i + 1] === '/') {
          blank(code[i]); blank(code[i + 1]); i += 2
          break
        }
        blank(code[i]); i += 1
      }
      continue
    }

    if (ch === '\'' || ch === '"') {
      const quote = ch
      out += ch; i += 1
      while (i < code.length) {
        const q = code[i]
        out += q; i += 1
        if (q === '\\' && i < code.length) { out += code[i]; i += 1; continue }
        if (q === quote) break
      }
      state.previous = 'literal'
      continue
    }

    if (ch === '`') {
      out += ch; i += 1
      stack.push({ kind: 'template' })
      state.previous = 'literal'
      continue
    }

    if (ch === '/' && REGEX_PRECEDERS.has(state.previous || '')) {
      out += ch; i += 1
      let inClass = false
      while (i < code.length) {
        const r = code[i]
        out += r; i += 1
        if (r === '\\' && i < code.length) { out += code[i]; i += 1; continue }
        if (r === '[') inClass = true
        else if (r === ']') inClass = false
        else if (r === '/' && !inClass) break
      }
      while (i < code.length && /[A-Za-z]/.test(code[i])) { out += code[i]; i += 1 }
      state.previous = 'literal'
      continue
    }

    if (isIdentStart(ch)) {
      const start = i
      i += 1
      while (i < code.length && isIdentPart(code[i])) i += 1
      const token = code.slice(start, i)
      out += token
      state.previous = token
      continue
    }

    if (/[0-9]/.test(ch)) {
      const start = i
      i += 1
      while (i < code.length && /[0-9A-Fa-f_xXobOBn.eE+-]/.test(code[i])) i += 1
      out += code.slice(start, i)
      state.previous = 'literal'
      continue
    }

    if (state.templateBraceDepth && ch === '{') state.templateBraceDepth += 1

    const three = code.slice(i, i + 3)
    const two = code.slice(i, i + 2)
    const operator = ['===', '!==', '>>>', '<<=', '>>=', '**=', '&&=', '||=', '??='].includes(three)
      ? three
      : ['=>', '==', '!=', '<=', '>=', '++', '--', '&&', '||', '??', '**',
          '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '?.'].includes(two)
          ? two
          : ch
    out += operator
    i += operator.length
    if (!/\s/.test(operator)) state.previous = operator
  }

  return out
}

/**
 * @param {string} code
 * @param {string} needle
 * @returns {{line:number, text:string}[]}
 */
export function findInExecutableCode(code, needle) {
  const stripped = stripComments(code)
  const hits = []
  let from = 0
  while (needle && from <= stripped.length) {
    const at = stripped.indexOf(needle, from)
    if (at < 0) break
    const line = 1 + stripped.slice(0, at).split('\n').length - 1
    const start = stripped.lastIndexOf('\n', at - 1) + 1
    const endAt = stripped.indexOf('\n', at)
    const end = endAt < 0 ? stripped.length : endAt
    hits.push({ line, text: stripped.slice(start, end).trim() })
    from = at + Math.max(needle.length, 1)
  }
  return hits
}

/**
 * Every shared-plugin-data call must receive the constant `NAMESPACE` directly.
 * Aliases and string literals are rejected so a namespace change stays visible
 * to review and cannot be smuggled through an innocuous-looking variable.
 *
 * @param {string} code
 * @returns {{line:number, method:string, argument:string}[]}
 */
export function checkSharedPluginDataCalls(code) {
  const stripped = stripComments(code)
  const violations = []
  const call = /\b(getSharedPluginData|setSharedPluginData)\s*\(\s*([^,\)\r\n]+)/g
  for (const match of stripped.matchAll(call)) {
    const argument = match[2].trim()
    if (argument === 'NAMESPACE') continue
    const at = match.index || 0
    violations.push({
      line: 1 + stripped.slice(0, at).split('\n').length - 1,
      method: match[1],
      argument,
    })
  }
  return violations
}
