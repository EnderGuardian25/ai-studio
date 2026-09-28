// Server-side node locator for element-targeted inline editing (change 004
// Phase 3, T22 — Ruling W5-A). Pure and node-safe: no DOM, no parser
// dependency, no I/O. It is imported by the inline-edit route (via
// inlineEdit.ts) and, transitively, by the editor bundle, so it must stay free
// of server-only imports.
//
// What it does. A small tokenizer walks the RAW stored HTML string, builds an
// element tree that records SOURCE OFFSETS for every element (start tag, end
// tag, each attribute), resolves an element by structural path (element-child
// indices from <body>), and splices an edit into exactly that element — its
// text content, or its style attribute — leaving every other byte of the
// document unchanged.
//
// Why fail closed. The editor computes a path against the BROWSER's parse of
// the same HTML. A browser's tree construction silently repairs bad markup
// (implied end tags, foster parenting, <p> auto-closing, adoption agency…), and
// wherever our tree could differ from the browser's, a path could name a
// different element. So instead of emulating repair, this parser REJECTS every
// construct where the two could diverge (see parseHtmlDocument's checks): a
// rejected document just means element mode is unavailable for that draft
// (409 upstream) — the edit is never misapplied. The whole-document inline
// editor is unaffected. The text fingerprint (tag + normalized textContent) is
// a second, independent guard against a path landing on the wrong node.
//
// Being MORE conservative than the browser is always safe here (a refusal);
// being less conservative is the bug to avoid. Several checks below are
// deliberately broader than the HTML spec for that reason.

export type HtmlNamespace = 'html' | 'svg'

export interface HtmlAttr {
  // Lowercased attribute name.
  name: string
  // Offset of the name's first character.
  start: number
  // Offset just past the whole attribute (closing quote / unquoted value / name).
  end: number
  // Raw (undecoded) value span, inside any quotes; null for a valueless attribute.
  valueStart: number | null
  valueEnd: number | null
}

export interface HtmlText {
  type: 'text'
  start: number
  end: number
  // The DOM text (entities decoded where the context decodes them); null when
  // it contains a character reference this module cannot decode with certainty.
  value: string | null
}

export interface HtmlComment {
  type: 'comment'
  start: number
  end: number
}

export interface HtmlElement {
  type: 'element'
  // Lowercased tag name ('#root' for the synthetic document root).
  tag: string
  ns: HtmlNamespace
  // Offset of the '<' of the start tag.
  start: number
  // Offset just past the start tag's name (where a new attribute may be inserted).
  tagNameEnd: number
  // Offset just past the start tag's '>'.
  openEnd: number
  // Offset of the '<' of the end tag; null when the element has no content
  // range (a void element, or a self-closed foreign element).
  closeStart: number | null
  // Offset just past the end tag (or openEnd when there is none).
  end: number
  attrs: HtmlAttr[]
  children: HtmlNode[]
  parent: HtmlElement | null
}

export type HtmlNode = HtmlElement | HtmlText | HtmlComment

export type ParseResult = { ok: true; body: HtmlElement } | { ok: false; reason: string }

// ── Element classes ────────────────────────────────────────────────────────

export const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'source', 'track', 'wbr', 'param', 'basefont', 'bgsound',
])
// Content is raw text: no tags, no character references.
const RAW_TEXT = new Set(['script', 'style', 'xmp', 'iframe', 'noembed', 'noframes'])
// Content is text with character references, but no tags.
const RCDATA = new Set(['textarea', 'title'])
// Elements whose parse depends on context this module does not model (the
// scripting flag, select/ruby/frameset insertion modes, MathML) — any
// occurrence rejects the whole document.
const UNSUPPORTED = new Set([
  'noscript', 'plaintext', 'select', 'option', 'optgroup', 'math', 'frameset', 'frame',
  'image', 'isindex', 'keygen', 'rb', 'rp', 'rt', 'rtc',
])
// Start tags that implicitly close an open <p> (HTML "in body" rules).
const CLOSES_P = new Set([
  'address', 'article', 'aside', 'blockquote', 'center', 'details', 'dialog', 'dir', 'div',
  'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'header', 'hgroup', 'hr', 'listing', 'main', 'menu', 'nav', 'ol', 'p', 'pre',
  'search', 'section', 'summary', 'table', 'ul', 'xmp', 'li', 'dd', 'dt',
])
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
// Elements the browser refuses to nest inside themselves (it closes the outer one).
const NO_SELF_NESTING = new Set(['a', 'button', 'form', 'nobr'])
// Allowed element children of the table-structure elements; anything else
// would be foster-parented or get an implied wrapper (tbody) in a browser.
const TABLE_TEMPLATE_OK = ['script', 'style', 'template']
const TABLE_CHILDREN: Record<string, Set<string>> = {
  table: new Set(['caption', 'colgroup', 'thead', 'tbody', 'tfoot', ...TABLE_TEMPLATE_OK]),
  thead: new Set(['tr', ...TABLE_TEMPLATE_OK]),
  tbody: new Set(['tr', ...TABLE_TEMPLATE_OK]),
  tfoot: new Set(['tr', ...TABLE_TEMPLATE_OK]),
  tr: new Set(['td', 'th', ...TABLE_TEMPLATE_OK]),
  colgroup: new Set(['col', 'template']),
}
// Required parent of each table-internal element.
const TABLE_PARENT: Record<string, Set<string>> = {
  caption: new Set(['table']),
  colgroup: new Set(['table']),
  thead: new Set(['table']),
  tbody: new Set(['table']),
  tfoot: new Set(['table']),
  tr: new Set(['thead', 'tbody', 'tfoot']),
  td: new Set(['tr']),
  th: new Set(['tr']),
  col: new Set(['colgroup']),
}
// HTML start tags that break out of SVG foreign content (the browser closes
// the <svg> and continues in HTML).
const SVG_BREAKOUT = new Set([
  'b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div', 'dl', 'dt', 'em',
  'embed', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img', 'li', 'listing',
  'menu', 'meta', 'nobr', 'ol', 'p', 'pre', 'ruby', 's', 'small', 'span', 'strong', 'strike',
  'sub', 'sup', 'table', 'tt', 'u', 'ul', 'var', 'font',
])
// SVG elements whose content is parsed as HTML again.
const SVG_HTML_INTEGRATION = new Set(['foreignobject', 'desc', 'title'])
// Elements that may appear in <head> (or before <body> without a <head> tag).
const HEAD_CONTENT = new Set([
  'meta', 'link', 'style', 'script', 'title', 'base', 'template', 'basefont', 'bgsound',
])

const WS = new Set([' ', '\t', '\n', '\f', '\r'])
const isWs = (c: string | undefined) => c !== undefined && WS.has(c)
const isAsciiAlpha = (c: string | undefined) =>
  c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))
const isAsciiAlnum = (c: string | undefined) =>
  c !== undefined && (isAsciiAlpha(c) || (c >= '0' && c <= '9'))
const isWhitespaceOnly = (s: string) => /^[ \t\n\f\r]*$/.test(s)

// ── Character references ───────────────────────────────────────────────────
// Only the references this module can decode with certainty. Everything the
// full HTML table might decode differently makes the text UNVERIFIABLE (null)
// rather than guessed — the fingerprint then cannot match, and the edit fails
// closed.

const LATIN1_NAMES = [
  'nbsp', 'iexcl', 'cent', 'pound', 'curren', 'yen', 'brvbar', 'sect', 'uml', 'copy', 'ordf',
  'laquo', 'not', 'shy', 'reg', 'macr', 'deg', 'plusmn', 'sup2', 'sup3', 'acute', 'micro',
  'para', 'middot', 'cedil', 'sup1', 'ordm', 'raquo', 'frac14', 'frac12', 'frac34', 'iquest',
  'Agrave', 'Aacute', 'Acirc', 'Atilde', 'Auml', 'Aring', 'AElig', 'Ccedil', 'Egrave',
  'Eacute', 'Ecirc', 'Euml', 'Igrave', 'Iacute', 'Icirc', 'Iuml', 'ETH', 'Ntilde', 'Ograve',
  'Oacute', 'Ocirc', 'Otilde', 'Ouml', 'times', 'Oslash', 'Ugrave', 'Uacute', 'Ucirc', 'Uuml',
  'Yacute', 'THORN', 'szlig', 'agrave', 'aacute', 'acirc', 'atilde', 'auml', 'aring', 'aelig',
  'ccedil', 'egrave', 'eacute', 'ecirc', 'euml', 'igrave', 'iacute', 'icirc', 'iuml', 'eth',
  'ntilde', 'ograve', 'oacute', 'ocirc', 'otilde', 'ouml', 'divide', 'oslash', 'ugrave',
  'uacute', 'ucirc', 'uuml', 'yacute', 'thorn', 'yuml',
] // U+00A0 … U+00FF, in order

// The "legacy" references a browser decodes even WITHOUT a trailing semicolon.
const LEGACY: Record<string, number> = {
  amp: 38, lt: 60, gt: 62, quot: 34, AMP: 38, LT: 60, GT: 62, QUOT: 34, COPY: 169, REG: 174,
}
LATIN1_NAMES.forEach((name, i) => {
  LEGACY[name] = 0xa0 + i
})
const LEGACY_NAMES_LONGEST_FIRST = Object.keys(LEGACY).sort((a, b) => b.length - a.length)

// References decoded only WITH a semicolon (a small, certain subset).
const NAMED: Record<string, number> = {
  ...LEGACY,
  apos: 39, Tab: 9, NewLine: 10, hellip: 8230, mdash: 8212, ndash: 8211, lsquo: 8216,
  rsquo: 8217, sbquo: 8218, ldquo: 8220, rdquo: 8221, bdquo: 8222, bull: 8226, trade: 8482,
  euro: 8364, dagger: 8224, Dagger: 8225, permil: 8240, lsaquo: 8249, rsaquo: 8250,
  prime: 8242, Prime: 8243, larr: 8592, uarr: 8593, rarr: 8594, darr: 8595, harr: 8596,
  ensp: 8194, emsp: 8195, thinsp: 8201, zwnj: 8204, zwj: 8205, lrm: 8206, rlm: 8207,
  minus: 8722, le: 8804, ge: 8805, ne: 8800, infin: 8734, hearts: 9829, spades: 9824,
  clubs: 9827, diams: 9830, OElig: 338, oelig: 339, Scaron: 352, scaron: 353, Yuml: 376,
  fnof: 402, circ: 710, tilde: 732, check: 10003, star: 9734, starf: 9733,
}

// Decodes character references as a browser would in text content
// ('text') or in an attribute value ('attribute'). Returns null when the input
// holds a reference whose decoding this module cannot be certain of.
export function decodeHtmlEntities(raw: string, context: 'text' | 'attribute'): string | null {
  if (!raw.includes('&')) return raw
  let out = ''
  let i = 0
  while (i < raw.length) {
    const amp = raw.indexOf('&', i)
    if (amp === -1) {
      out += raw.slice(i)
      break
    }
    out += raw.slice(i, amp)
    let j = amp + 1
    if (raw[j] === '#') {
      j++
      const hex = raw[j] === 'x' || raw[j] === 'X'
      if (hex) j++
      const digitsStart = j
      while (j < raw.length && (hex ? /[0-9a-fA-F]/ : /[0-9]/).test(raw[j])) j++
      if (j === digitsStart) {
        // "&#" / "&#x" with no digits: not a reference, kept literally.
        out += raw.slice(amp, j)
        i = j
        continue
      }
      const digits = raw.slice(digitsStart, j).replace(/^0+(?=.)/, '')
      if (digits.length > 8) return null
      const code = parseInt(digits, hex ? 16 : 10)
      // NUL, out-of-range, surrogates and the C1 range (which a browser remaps
      // through windows-1252) are not decoded here — unverifiable.
      if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) || (code >= 0x80 && code <= 0x9f)) {
        return null
      }
      out += String.fromCodePoint(code)
      if (raw[j] === ';') j++
      i = j
      continue
    }
    while (j < raw.length && isAsciiAlnum(raw[j])) j++
    const run = raw.slice(amp + 1, j)
    if (!run) {
      out += '&'
      i = amp + 1
      continue
    }
    if (raw[j] === ';') {
      const code = NAMED[run]
      if (code === undefined) return null // may be a reference in the full table
      out += String.fromCodePoint(code)
      i = j + 1
      continue
    }
    const legacy = LEGACY_NAMES_LONGEST_FIRST.find((name) => run.startsWith(name))
    if (!legacy) {
      out += '&'
      i = amp + 1
      continue
    }
    const after = raw[amp + 1 + legacy.length]
    if (context === 'attribute') {
      // In attributes a legacy reference followed by an alphanumeric or "=" is
      // left literal (so query strings survive); otherwise it is decoded but
      // this module refuses to vouch for it.
      if (isAsciiAlnum(after) || after === '=') {
        out += '&'
        i = amp + 1
        continue
      }
      return null
    }
    out += String.fromCodePoint(LEGACY[legacy])
    i = amp + 1 + legacy.length
  }
  return out
}

// ── Tokenizer + tree builder ───────────────────────────────────────────────

class Reject extends Error {}

interface TagToken {
  name: string
  nameEnd: number
  attrs: HtmlAttr[]
  selfClosing: boolean
  end: number // offset just past '>'
}

// Parses a start or end tag's name + attributes, starting at the first name
// character. Mirrors the HTML tokenizer's tag/attribute states closely enough
// that a '>' inside a quoted value never ends the tag.
function readTag(html: string, nameStart: number): TagToken {
  const n = html.length
  let i = nameStart
  while (i < n && !isWs(html[i]) && html[i] !== '/' && html[i] !== '>') i++
  if (i >= n) throw new Reject('end of document inside a tag')
  const name = html.slice(nameStart, i).toLowerCase()
  const nameEnd = i
  const attrs: HtmlAttr[] = []
  let selfClosing = false
  for (;;) {
    while (i < n && isWs(html[i])) i++
    if (i >= n) throw new Reject('end of document inside a tag')
    const c = html[i]
    if (c === '>') return { name, nameEnd, attrs, selfClosing, end: i + 1 }
    if (c === '/') {
      if (html[i + 1] === '>') {
        selfClosing = true
        return { name, nameEnd, attrs, selfClosing, end: i + 2 }
      }
      i++
      continue
    }
    // Attribute name (a leading "=" belongs to the name).
    const aStart = i
    i++
    while (i < n && !isWs(html[i]) && html[i] !== '/' && html[i] !== '>' && html[i] !== '=') i++
    const aName = html.slice(aStart, i).toLowerCase()
    let aEnd = i
    let j = i
    while (j < n && isWs(html[j])) j++
    let valueStart: number | null = null
    let valueEnd: number | null = null
    if (html[j] === '=') {
      j++
      while (j < n && isWs(html[j])) j++
      if (j >= n) throw new Reject('end of document inside a tag')
      const q = html[j]
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, j + 1)
        if (close === -1) throw new Reject('end of document inside an attribute value')
        valueStart = j + 1
        valueEnd = close
        aEnd = close + 1
        i = close + 1
      } else if (q === '>') {
        // "name=>" — an empty value; the '>' ends the tag.
        valueStart = j
        valueEnd = j
        aEnd = j
        i = j
      } else {
        let k = j
        while (k < n && !isWs(html[k]) && html[k] !== '>') k++
        if (k >= n) throw new Reject('end of document inside a tag')
        valueStart = j
        valueEnd = k
        aEnd = k
        i = k
      }
    }
    attrs.push({ name: aName, start: aStart, end: aEnd, valueStart, valueEnd })
  }
}

// Finds the matching raw-text end tag ("</name" + a terminator), case-insensitively.
function findRawTextEnd(html: string, from: number, name: string): number {
  let i = from
  for (;;) {
    const lt = html.indexOf('</', i)
    if (lt === -1) throw new Reject(`<${name}> is never closed`)
    const candidate = html.slice(lt + 2, lt + 2 + name.length).toLowerCase()
    const term = html[lt + 2 + name.length]
    if (candidate === name && (isWs(term) || term === '/' || term === '>')) return lt
    i = lt + 2
  }
}

function newElement(
  tag: string,
  ns: HtmlNamespace,
  start: number,
  parent: HtmlElement | null,
): HtmlElement {
  return {
    type: 'element', tag, ns, start, tagNameEnd: start, openEnd: start, closeStart: null,
    end: start, attrs: [], children: [], parent,
  }
}

function build(html: string): HtmlElement {
  const n = html.length
  const root = newElement('#root', 'html', 0, null)
  const stack: HtmlElement[] = [root]
  const top = () => stack[stack.length - 1]
  let seenHtml = false
  let seenHead = false
  let seenBody = false

  const pushText = (start: number, end: number, value: string | null) => {
    if (end <= start) return
    const parent = top()
    if (parent.ns === 'html' && TABLE_CHILDREN[parent.tag] && (value === null || !isWhitespaceOnly(value))) {
      throw new Reject(`text directly inside <${parent.tag}>`)
    }
    parent.children.push({ type: 'text', start, end, value })
  }
  const pushDataText = (start: number, end: number) => {
    if (end > start) pushText(start, end, decodeHtmlEntities(html.slice(start, end), 'text'))
  }
  const pushComment = (start: number, end: number) => {
    top().children.push({ type: 'comment', start, end })
  }
  const htmlStack = () => stack.filter((e) => e.ns === 'html' && e !== root)
  const inForeign = () => {
    const t = top()
    return t.ns === 'svg' && !SVG_HTML_INTEGRATION.has(t.tag)
  }

  const openStart = (lt: number, tok: TagToken) => {
    const parent = top()
    const { name } = tok
    let ns: HtmlNamespace
    if (inForeign()) {
      if (SVG_BREAKOUT.has(name)) throw new Reject(`<${name}> breaks out of <svg>`)
      ns = 'svg'
    } else {
      ns = name === 'svg' ? 'svg' : 'html'
    }

    if (ns === 'html') {
      if (UNSUPPORTED.has(name)) throw new Reject(`<${name}> is not supported in element mode`)
      if (name === 'html') {
        if (seenHtml || parent !== root) throw new Reject('unexpected <html>')
        seenHtml = true
      } else if (name === 'head') {
        if (seenHead || seenBody || (parent.tag !== 'html' && parent !== root)) {
          throw new Reject('unexpected <head>')
        }
        seenHead = true
      } else if (name === 'body') {
        if (seenBody || (parent.tag !== 'html' && parent !== root)) throw new Reject('unexpected <body>')
        seenBody = true
      }
      const open = htmlStack()
      if (CLOSES_P.has(name) && open.some((e) => e.tag === 'p')) {
        throw new Reject(`<${name}> inside <p> (the browser would close the <p>)`)
      }
      if (name === 'li') {
        for (let k = open.length - 1; k >= 0; k--) {
          const t = open[k].tag
          if (t === 'ul' || t === 'ol' || t === 'menu') break
          if (t === 'li') throw new Reject('<li> inside <li> without a list between them')
        }
      }
      if (name === 'dd' || name === 'dt') {
        for (let k = open.length - 1; k >= 0; k--) {
          const t = open[k].tag
          if (t === 'dl') break
          if (t === 'dd' || t === 'dt') throw new Reject(`<${name}> inside <${t}>`)
        }
      }
      if (HEADINGS.has(name) && open.some((e) => HEADINGS.has(e.tag))) {
        throw new Reject('a heading inside a heading')
      }
      if (NO_SELF_NESTING.has(name) && open.some((e) => e.tag === name)) {
        throw new Reject(`<${name}> inside <${name}>`)
      }
      const allowedKids = parent.ns === 'html' ? TABLE_CHILDREN[parent.tag] : undefined
      if (allowedKids && !allowedKids.has(name)) {
        throw new Reject(`<${name}> directly inside <${parent.tag}>`)
      }
      const requiredParent = TABLE_PARENT[name]
      if (requiredParent && !(parent.ns === 'html' && requiredParent.has(parent.tag))) {
        throw new Reject(`<${name}> outside its table context`)
      }
    }

    const el = newElement(name, ns, lt, parent)
    el.tagNameEnd = tok.nameEnd
    el.openEnd = tok.end
    el.attrs = tok.attrs
    parent.children.push(el)

    // Void (HTML) and self-closed (foreign) elements have no content range.
    // A self-closing slash on a non-void HTML element is ignored, as in a browser.
    if ((ns === 'html' && VOID_ELEMENTS.has(name)) || (ns === 'svg' && tok.selfClosing)) {
      el.end = tok.end
      return tok.end
    }
    stack.push(el)

    if (ns === 'html' && (RAW_TEXT.has(name) || RCDATA.has(name))) {
      const closeAt = findRawTextEnd(html, tok.end, name)
      const raw = html.slice(tok.end, closeAt)
      if (name === 'script' && raw.includes('<!--')) {
        throw new Reject('<!-- inside <script> (script-data escape states are not modelled)')
      }
      pushText(tok.end, closeAt, RCDATA.has(name) ? decodeHtmlEntities(raw, 'text') : raw)
      const endTok = readTag(html, closeAt + 2)
      stack.pop()
      el.closeStart = closeAt
      el.end = endTok.end
      return endTok.end
    }
    return tok.end
  }

  let i = 0
  let textStart = 0
  while (i < n) {
    const lt = html.indexOf('<', i)
    if (lt === -1) break
    const c = html[lt + 1]
    if (isAsciiAlpha(c)) {
      pushDataText(textStart, lt)
      const tok = readTag(html, lt + 1)
      i = textStart = openStart(lt, tok)
      continue
    }
    if (c === '/') {
      const d = html[lt + 2]
      if (isAsciiAlpha(d)) {
        pushDataText(textStart, lt)
        const tok = readTag(html, lt + 2)
        const cur = top()
        if (cur === root || cur.tag !== tok.name) {
          throw new Reject(`</${tok.name}> does not close the open <${cur === root ? '(none)' : cur.tag}>`)
        }
        stack.pop()
        cur.closeStart = lt
        cur.end = tok.end
        i = textStart = tok.end
        continue
      }
      if (d === '>') {
        // "</>" is dropped entirely by a browser.
        pushDataText(textStart, lt)
        i = textStart = lt + 3
        continue
      }
      if (d === undefined) break // "</" at EOF is text
      // "</" + anything else: a bogus comment up to the next '>'.
      pushDataText(textStart, lt)
      const gt = html.indexOf('>', lt + 2)
      if (gt === -1) throw new Reject('end of document inside a bogus comment')
      pushComment(lt, gt + 1)
      i = textStart = gt + 1
      continue
    }
    if (c === '!') {
      pushDataText(textStart, lt)
      if (html.startsWith('<!--', lt)) {
        let end: number
        if (html.startsWith('<!-->', lt)) end = lt + 5
        else if (html.startsWith('<!--->', lt)) end = lt + 6
        else {
          const a = html.indexOf('-->', lt + 4)
          const b = html.indexOf('--!>', lt + 4)
          if (a === -1 && b === -1) throw new Reject('end of document inside a comment')
          end = a !== -1 && (b === -1 || a < b) ? a + 3 : b + 4
        }
        pushComment(lt, end)
        i = textStart = end
        continue
      }
      if (inForeign() && html.startsWith('<![CDATA[', lt)) {
        const close = html.indexOf(']]>', lt + 9)
        if (close === -1) throw new Reject('end of document inside CDATA')
        pushText(lt, close + 3, html.slice(lt + 9, close))
        i = textStart = close + 3
        continue
      }
      // <!doctype …> and any other "<!" construct: a bogus comment to '>'.
      const gt = html.indexOf('>', lt + 2)
      if (gt === -1) throw new Reject('end of document inside a markup declaration')
      pushComment(lt, gt + 1)
      i = textStart = gt + 1
      continue
    }
    if (c === '?') {
      pushDataText(textStart, lt)
      const gt = html.indexOf('>', lt + 2)
      if (gt === -1) throw new Reject('end of document inside a processing instruction')
      pushComment(lt, gt + 1)
      i = textStart = gt + 1
      continue
    }
    // A '<' that opens nothing is text; keep scanning within the same run.
    i = lt + 1
  }
  pushDataText(textStart, n)
  if (stack.length !== 1) throw new Reject(`<${top().tag}> is never closed`)
  root.end = n
  root.openEnd = 0
  return root
}

function isIgnorable(node: HtmlNode): boolean {
  return node.type === 'comment' || (node.type === 'text' && node.value !== null && isWhitespaceOnly(node.value))
}

// The document skeleton must be one the browser builds exactly as written:
// nothing that would open an implied <body> before ours, nothing that would be
// moved into <body> after it, and only head content in <head>.
function validateSkeleton(root: HtmlElement): HtmlElement {
  const htmlEl = root.children.find((c): c is HtmlElement => c.type === 'element' && c.tag === 'html')
  const container = htmlEl ?? root
  if (htmlEl) {
    for (const c of root.children) {
      if (c !== htmlEl && !isIgnorable(c)) throw new Reject('content outside <html>')
    }
  }
  const bodyIdx = container.children.findIndex((c) => c.type === 'element' && c.tag === 'body')
  if (bodyIdx === -1) throw new Reject('the document has no <body>')
  const body = container.children[bodyIdx] as HtmlElement
  container.children.forEach((c, idx) => {
    if (c === body || isIgnorable(c)) return
    if (idx > bodyIdx) throw new Reject('content after </body>')
    if (c.type !== 'element') throw new Reject('text before <body>')
    if (c.tag === 'head') {
      for (const h of c.children) {
        if (isIgnorable(h)) continue
        if (h.type !== 'element' || !HEAD_CONTENT.has(h.tag)) throw new Reject('non-head content inside <head>')
      }
      return
    }
    if (!HEAD_CONTENT.has(c.tag)) throw new Reject(`<${c.tag}> before <body>`)
  })
  return body
}

// Parses the raw document and returns its <body> element. ok:false means the
// document contains something whose browser parse this module cannot
// reproduce with certainty — element mode must refuse it.
export function parseHtmlDocument(html: string): ParseResult {
  try {
    return { ok: true, body: validateSkeleton(build(html)) }
  } catch (err) {
    if (err instanceof Reject) return { ok: false, reason: err.message }
    throw err
  }
}

// ── Queries ────────────────────────────────────────────────────────────────

export function elementChildren(el: HtmlElement): HtmlElement[] {
  return el.children.filter((c): c is HtmlElement => c.type === 'element')
}

// Element-child indices from <body>. [] is <body> itself. null = no such element.
export function resolveElementPath(body: HtmlElement, path: readonly number[]): HtmlElement | null {
  let cur = body
  for (const idx of path) {
    if (!Number.isInteger(idx) || idx < 0) return null
    const next = elementChildren(cur)[idx]
    if (!next) return null
    cur = next
  }
  return cur
}

// The element's DOM textContent: every descendant text node, concatenated
// (comments excluded; <template> content excluded, since a browser keeps it in
// a separate fragment). null when any contributing text is unverifiable.
export function elementTextContent(el: HtmlElement): string | null {
  let out = ''
  for (const c of el.children) {
    if (c.type === 'comment') continue
    if (c.type === 'text') {
      if (c.value === null) return null
      out += c.value
      continue
    }
    if (c.ns === 'html' && c.tag === 'template') continue
    const inner = elementTextContent(c)
    if (inner === null) return null
    out += inner
  }
  return out
}

// The fingerprint comparison form: every whitespace run (JS \s — includes
// nbsp and newlines) collapsed to one space, then trimmed. Applied to BOTH the
// client's text and ours, so the client may send raw textContent.
export function normalizeFingerprintText(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

// ── Node-scoped writers ────────────────────────────────────────────────────

// A string that can only ever be a text node's content: &, < and > escaped.
// (Quotes need no escaping in text content.)
export function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Replaces the element's entire content range with escaped `text`. The caller
// enforces the leaf rule; this refuses only a content-less element.
export function replaceElementText(html: string, el: HtmlElement, text: string): string {
  if (el.closeStart === null) throw new Error(`<${el.tag}> has no content to replace`)
  return html.slice(0, el.openEnd) + escapeHtmlText(text) + html.slice(el.closeStart)
}

export type StyleProperty = 'color' | 'background-color' | 'font-size'
const STYLE_PROPERTIES: ReadonlySet<string> = new Set<StyleProperty>(['color', 'background-color', 'font-size'])
// Belt-and-braces: the only value shapes the grammar (inlineEdit.ts) ever
// emits. A value that does not match is a programming error, never written.
const SERIALIZED_VALUE = /^(?:#[0-9a-f]{6}|rgba?\((?:\d{1,3}, ){2}\d{1,3}(?:, (?:0|1|0\.\d+))?\)|\d+(?:\.\d+)?(?:px|pt|em|rem|%))$/

// Splits a (decoded) style attribute value into declarations on top-level ';'
// — outside strings, comments and parentheses. null when a string, comment or
// parenthesis is left open (the value is ambiguous — refuse it).
function splitDeclarations(style: string): string[] | null {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let segStart = 0
  for (let i = 0; i < style.length; i++) {
    const c = style[i]
    if (c === '\\') {
      i++
      continue
    }
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '/' && style[i + 1] === '*') {
      const close = style.indexOf('*/', i + 2)
      if (close === -1) return null
      i = close + 1
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '(') depth++
    else if (c === ')') {
      if (depth === 0) return null
      depth--
    } else if (c === ';' && depth === 0) {
      out.push(style.slice(segStart, i))
      segStart = i + 1
    }
  }
  if (quote || depth !== 0) return null
  out.push(style.slice(segStart))
  return out
}

function declarationProperty(decl: string): string | null {
  const m = /^\s*([-A-Za-z0-9_]+)\s*:/.exec(decl.replace(/\/\*[\s\S]*?\*\//g, ''))
  return m ? m[1].toLowerCase() : null
}

const encodeAttributeValue = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

// Sets exactly one declaration (`property: value`) in the element's style
// attribute: any existing declaration of the same property is removed, the
// others are kept as written, and the new one is appended. Only the style
// attribute's bytes change (inserted right after the tag name when absent,
// otherwise that one attribute is re-serialized double-quoted). `value` must
// already be grammar-serialized; anything else throws.
export function setStyleDeclaration(
  html: string,
  el: HtmlElement,
  property: StyleProperty,
  value: string,
): { ok: true; html: string } | { ok: false; reason: string } {
  if (!STYLE_PROPERTIES.has(property)) throw new Error(`style property "${property}" is not allowed`)
  if (!SERIALIZED_VALUE.test(value)) throw new Error(`style value "${value}" is not grammar-serialized`)
  const decl = `${property}: ${value}`

  const styles = el.attrs.filter((a) => a.name === 'style')
  if (styles.length > 1) return { ok: false, reason: 'the element has more than one style attribute' }
  if (styles.length === 0) {
    const at = el.tagNameEnd
    return { ok: true, html: `${html.slice(0, at)} style="${decl}"${html.slice(at)}` }
  }

  const attr = styles[0]
  const raw = attr.valueStart === null ? '' : html.slice(attr.valueStart, attr.valueEnd!)
  const current = decodeHtmlEntities(raw, 'attribute')
  if (current === null) return { ok: false, reason: 'the style attribute holds an undecodable character reference' }
  const segments = splitDeclarations(current)
  if (!segments) return { ok: false, reason: 'the style attribute has an unterminated string, comment or parenthesis' }
  const kept = segments
    .filter((s) => declarationProperty(s) !== property)
    .join(';')
    .replace(/^\s+/, '')
    .replace(/[\s;]+$/, '')
  const next = kept ? `${kept}; ${decl}` : decl
  return {
    ok: true,
    html: `${html.slice(0, attr.start)}style="${encodeAttributeValue(next)}"${html.slice(attr.end)}`,
  }
}
