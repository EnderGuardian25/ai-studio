import { describe, it, expect } from 'vitest'
import {
  parseColor,
  parseSize,
  escapeHtmlText,
  elementEditRequestSchema,
  applyElementEdit,
  editorElementPath,
  editorFingerprintText,
  type ElementEditRequest,
  type EditorDomElement,
} from '@/lib/drafts/inlineEdit'
import {
  parseHtmlDocument,
  resolveElementPath,
  elementTextContent,
  elementChildren,
  type HtmlElement,
} from '@/lib/drafts/htmlLocator'

// T22 (change 004 Phase 3) — the closed input grammar (FR-15/16, Ruling W5-C)
// and the pure element-edit core the route (T23) calls.

describe('parseColor — closed grammar, re-serialized', () => {
  const ok: Array<[string, string]> = [
    ['#ABC', '#aabbcc'],
    ['#a1B2c3', '#a1b2c3'],
    ['  #fff  ', '#ffffff'],
    ['rgb(1,2,255)', 'rgb(1, 2, 255)'],
    [' rgb( 1 , 2 ,  255 ) ', 'rgb(1, 2, 255)'],
    ['RGB(0,0,0)', 'rgb(0, 0, 0)'],
    ['rgb(007,0,0)', 'rgb(7, 0, 0)'],
    ['rgba(0,0,0,.5)', 'rgba(0, 0, 0, 0.5)'],
    ['rgba(10, 20, 30, 0.250)', 'rgba(10, 20, 30, 0.25)'],
    ['rgba(10,20,30,1)', 'rgba(10, 20, 30, 1)'],
    ['rgba(10,20,30,1.0)', 'rgba(10, 20, 30, 1)'],
    ['rgba(10,20,30,0)', 'rgba(10, 20, 30, 0)'],
  ]
  for (const [input, out] of ok) {
    it(`accepts ${JSON.stringify(input)} → ${out}`, () => {
      expect(parseColor(input)).toBe(out)
    })
  }

  const bad = [
    'red; background: url(http://evil.test/x)', // AC-22
    'red',
    'transparent',
    'url(http://evil.test/x)',
    '#fff;',
    '#fff}',
    '#fff\\',
    '"#fff"',
    "'#fff'",
    '#abcd',
    '#aabbccdd',
    '#ggg',
    '#',
    'rgb(256,0,0)',
    'rgb(-1,0,0)',
    'rgb(1.5,0,0)',
    'rgb(10%,0,0)',
    'rgb(0 0 0)',
    'rgb(0,0,0);',
    'rgb(0,0,0) url(x)',
    'rgba(0,0,0,1.5)',
    'rgba(0,0,0,2)',
    'rgba(0,0,0)',
    'rgb(0,0,0,0.5)',
    'hsl(0, 0%, 0%)',
    'var(--brand)',
    'expression(alert(1))',
    'rgb(0,0,0)/**/',
    '',
    '   ',
    '#fff !important',
  ]
  for (const input of bad) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      expect(parseColor(input)).toBeNull()
    })
  }

  it('rejects anything containing url( regardless of shape', () => {
    expect(parseColor('URL(#fff)')).toBeNull()
  })
})

describe('parseSize — number + allowed unit, bounded, re-serialized', () => {
  const ok: Array<[string, string]> = [
    ['24px', '24px'],
    [' 24px ', '24px'],
    ['24PX', '24px'],
    ['12.50pt', '12.5pt'],
    ['1.5em', '1.5em'],
    ['.5rem', '0.5rem'],
    ['150%', '150%'],
    ['1px', '1px'],
    ['1000px', '1000px'],
    ['750pt', '750pt'],
    ['62.5rem', '62.5rem'],
    ['6250%', '6250%'],
  ]
  for (const [input, out] of ok) {
    it(`accepts ${JSON.stringify(input)} → ${out}`, () => {
      expect(parseSize(input)).toBe(out)
    })
  }

  // AC-23: a disallowed unit or a non-numeric value is rejected.
  const bad = [
    '24',
    'px',
    'abc',
    'big',
    '24vh',
    '24vw',
    '24ch',
    '24px;',
    '24px; color: red',
    'calc(1px + 2px)',
    'url(1px)',
    '1e3px',
    '-5px',
    '+5px',
    '0px',
    '0.5px',
    '1001px',
    '751pt',
    '63rem',
    '0.05em',
    '6251%',
    '24 px',
    '12px 14px',
    '24px !important',
    '',
    'NaNpx',
    'Infinitypx',
  ]
  for (const input of bad) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      expect(parseSize(input)).toBeNull()
    })
  }
})

describe('escapeHtmlText (re-exported grammar text handling)', () => {
  it('turns markup into literal text', () => {
    expect(escapeHtmlText('<b>&</b>')).toBe('&lt;b&gt;&amp;&lt;/b&gt;')
  })
})

describe('elementEditRequestSchema (Ruling W5-B payload)', () => {
  const base = {
    mode: 'element',
    locator: { path: [0, 1], tag: 'h1', text: 'Hello' },
    edit: { kind: 'text', value: 'Hi' },
  }

  it('accepts the exact payload', () => {
    expect(elementEditRequestSchema.safeParse(base).success).toBe(true)
  })

  it('strips a client-supplied selector/target (AC-26: never a write target)', () => {
    const parsed = elementEditRequestSchema.parse({
      ...base,
      selector: 'body > p:nth-child(3)',
      target: { path: [9] },
      locator: { ...base.locator, selector: '#evil' },
      edit: { ...base.edit, selector: 'h2' },
    })
    expect(parsed).not.toHaveProperty('selector')
    expect(parsed).not.toHaveProperty('target')
    expect(parsed.locator).not.toHaveProperty('selector')
    expect(parsed.edit).not.toHaveProperty('selector')
  })

  it('rejects an unknown edit kind', () => {
    expect(
      elementEditRequestSchema.safeParse({ ...base, edit: { kind: 'style', value: 'color:red' } })
        .success,
    ).toBe(false)
    expect(
      elementEditRequestSchema.safeParse({ ...base, edit: { kind: 'html', value: '<b>x</b>' } })
        .success,
    ).toBe(false)
  })

  it('rejects negative / fractional path indices and a missing locator', () => {
    expect(
      elementEditRequestSchema.safeParse({ ...base, locator: { ...base.locator, path: [-1] } })
        .success,
    ).toBe(false)
    expect(
      elementEditRequestSchema.safeParse({ ...base, locator: { ...base.locator, path: [0.5] } })
        .success,
    ).toBe(false)
    expect(elementEditRequestSchema.safeParse({ mode: 'element', edit: base.edit }).success).toBe(
      false,
    )
  })

  it('rejects a non-string value and a missing mode', () => {
    expect(
      elementEditRequestSchema.safeParse({ ...base, edit: { kind: 'text', value: 5 } }).success,
    ).toBe(false)
    expect(elementEditRequestSchema.safeParse({ ...base, mode: undefined }).success).toBe(false)
  })
})

// ── applyElementEdit — the pure core of the element-mode write ─────────────

const HTML = [
  '<!doctype html>',
  '<html><head><meta charset="utf-8"><style>h1{color:#123456}</style></head>',
  '<body style="margin:0;width:1080px;height:1080px">',
  '<section class="hero">',
  '  <h1 class="title">Launch  day</h1>',
  '  <p>Fish &amp; Chips <b>tonight</b></p>',
  '  <script>var x = "<p>not an element</p>"</script>',
  '  <img src="https://minio.local/a.png" alt="">',
  '</section>',
  '</body></html>',
].join('\n')

function req(
  path: number[],
  tag: string,
  text: string,
  kind: ElementEditRequest['edit']['kind'],
  value: string,
): ElementEditRequest {
  return { mode: 'element', locator: { path, tag, text }, edit: { kind, value } }
}

function el(html: string, path: number[]): HtmlElement {
  const r = parseHtmlDocument(html)
  if (!r.ok) throw new Error(r.reason)
  const e = resolveElementPath(r.body, path)
  if (!e) throw new Error('missing')
  return e
}

function countElements(html: string): number {
  const r = parseHtmlDocument(html)
  if (!r.ok) throw new Error(r.reason)
  let n = 0
  const walk = (e: HtmlElement) => {
    n++
    elementChildren(e).forEach(walk)
  }
  walk(r.body)
  return n
}

describe('applyElementEdit — text (FR-15)', () => {
  it('AC-21: <script>alert(1)</script> is written as literal text, never as an element', () => {
    const r = applyElementEdit(HTML, req([0, 0], 'H1', 'Launch day', 'text', '<script>alert(1)</script>'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.html).toContain('<h1 class="title">&lt;script&gt;alert(1)&lt;/script&gt;</h1>')
    expect(r.html.match(/<script/gi)).toHaveLength(1) // only the pre-existing one
    expect(countElements(r.html)).toBe(countElements(HTML))
    const h1 = el(r.html, [0, 0])
    expect(elementChildren(h1)).toHaveLength(0)
    expect(elementTextContent(h1)).toBe('<script>alert(1)</script>')
    expect(r.instruction).toBe('Element edit: text')
  })

  it('confines the write to the resolved node — every byte outside its content is unchanged', () => {
    const target = el(HTML, [0, 0])
    const r = applyElementEdit(HTML, req([0, 0], 'h1', 'Launch day', 'text', 'New & better'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.html).toBe(
      HTML.slice(0, target.openEnd) + 'New &amp; better' + HTML.slice(target.closeStart!),
    )
  })

  it('the fingerprint is whitespace-normalized on both sides', () => {
    const r = applyElementEdit(HTML, req([0, 0], 'h1', '\n  Launch day ', 'text', 'x'))
    expect(r.ok).toBe(true)
  })

  it('rejects a text edit on an element with child elements (the leaf rule) — 400', () => {
    const r = applyElementEdit(HTML, req([0, 1], 'p', 'Fish & Chips tonight', 'text', 'x'))
    expect(r).toMatchObject({ ok: false, status: 400, code: 'element-not-text-leaf' })
  })

  it('rejects a text edit on a raw-text element (script/style) — 400', () => {
    const r = applyElementEdit(
      HTML,
      req([0, 2], 'script', 'var x = "<p>not an element</p>"', 'text', 'alert(1)'),
    )
    expect(r).toMatchObject({ ok: false, status: 400, code: 'element-not-editable' })
  })

  it('rejects a text edit on a void element — 400', () => {
    const r = applyElementEdit(HTML, req([0, 3], 'img', '', 'text', 'x'))
    expect(r).toMatchObject({ ok: false, status: 400, code: 'element-not-editable' })
  })

  it('rejects a NUL / control character in the text — 400', () => {
    const r = applyElementEdit(HTML, req([0, 0], 'h1', 'Launch day', 'text', 'a\u0000b'))
    expect(r).toMatchObject({ ok: false, status: 400, code: 'invalid-text' })
  })

  it('allows an empty text (clearing a line)', () => {
    const r = applyElementEdit(HTML, req([0, 0], 'h1', 'Launch day', 'text', ''))
    expect(r.ok && r.html).toContain('<h1 class="title"></h1>')
  })
})

describe('applyElementEdit — colour and size (FR-16)', () => {
  it('writes a re-serialized colour into the style attribute only', () => {
    const r = applyElementEdit(HTML, req([0, 0], 'h1', 'Launch day', 'color', '#ABC'))
    expect(r.ok && r.html).toContain('<h1 style="color: #aabbcc" class="title">')
    expect(r.ok && r.instruction).toBe('Element edit: color')
  })

  it('backgroundColor and fontSize map to their fixed CSS properties', () => {
    const bg = applyElementEdit(HTML, req([0], 'section', 'Launch day Fish & Chips tonight var x = "<p>not an element</p>"', 'backgroundColor', 'rgba(0,0,0,.5)'))
    expect(bg.ok && bg.html).toContain('<section style="background-color: rgba(0, 0, 0, 0.5)" class="hero">')
    const fs = applyElementEdit(HTML, req([], 'body', 'Launch day Fish & Chips tonight var x = "<p>not an element</p>"', 'fontSize', '2.50REM'))
    expect(fs.ok && fs.html).toContain(
      '<body style="margin:0;width:1080px;height:1080px; font-size: 2.5rem">',
    )
  })

  it('a style edit is allowed on a composite (non-leaf) element', () => {
    const r = applyElementEdit(HTML, req([0, 1], 'p', 'Fish & Chips tonight', 'color', '#000'))
    expect(r.ok).toBe(true)
  })

  it('AC-22: red; background: url(http://evil.test/x) is rejected and nothing is written — 400', () => {
    const r = applyElementEdit(
      HTML,
      req([0, 0], 'h1', 'Launch day', 'color', 'red; background: url(http://evil.test/x)'),
    )
    expect(r).toMatchObject({ ok: false, status: 400, code: 'invalid-color' })
    expect(r).not.toHaveProperty('html')
  })

  it('AC-22 also for backgroundColor', () => {
    const r = applyElementEdit(
      HTML,
      req([0, 0], 'h1', 'Launch day', 'backgroundColor', 'red; background: url(http://evil.test/x)'),
    )
    expect(r).toMatchObject({ ok: false, status: 400, code: 'invalid-color' })
  })

  it('AC-23: a disallowed unit or a non-numeric size is rejected — 400', () => {
    for (const v of ['12vh', 'abc', '12', '12px;color:red']) {
      const r = applyElementEdit(HTML, req([0, 0], 'h1', 'Launch day', 'fontSize', v))
      expect(r).toMatchObject({ ok: false, status: 400, code: 'invalid-size' })
    }
  })

  it('grammar rejection wins even when the locator is also stale (no resolution attempted)', () => {
    const r = applyElementEdit(HTML, req([99], 'h1', 'nope', 'color', 'red'))
    expect(r).toMatchObject({ ok: false, status: 400, code: 'invalid-color' })
  })

  it('refuses a style edit on <style>/<script> elements — 400', () => {
    const r = applyElementEdit(HTML, req([0, 2], 'script', 'var x = "<p>not an element</p>"', 'color', '#000'))
    expect(r).toMatchObject({ ok: false, status: 400, code: 'element-not-editable' })
  })
})

describe('applyElementEdit — stale / unsupported (FR-17/18, AC-25)', () => {
  it('a path miss is 409 element-stale', () => {
    const r = applyElementEdit(HTML, req([0, 9], 'h1', 'Launch day', 'text', 'x'))
    expect(r).toMatchObject({ ok: false, status: 409, code: 'element-stale' })
  })

  it('a tag mismatch is 409 element-stale', () => {
    const r = applyElementEdit(HTML, req([0, 0], 'h2', 'Launch day', 'text', 'x'))
    expect(r).toMatchObject({ ok: false, status: 409, code: 'element-stale' })
  })

  it('a text-fingerprint mismatch is 409 element-stale', () => {
    const r = applyElementEdit(HTML, req([0, 0], 'h1', 'Launch night', 'text', 'x'))
    expect(r).toMatchObject({ ok: false, status: 409, code: 'element-stale' })
  })

  it('AC-25: a refine that rewrites the markup between sessions cannot redirect an old address', () => {
    // Session 1 addressed the headline at [0, 0].
    const locator = { path: [0, 0], tag: 'h1', text: 'Launch day' }
    // A refine then restructured the document: a new h1 now sits at [0, 0].
    const refined = HTML.replace(
      '<section class="hero">',
      '<section class="hero">\n  <h1 class="kicker">New kicker</h1>',
    )
    const r = applyElementEdit(refined, {
      mode: 'element',
      locator,
      edit: { kind: 'text', value: 'x' },
    })
    expect(r).toMatchObject({ ok: false, status: 409, code: 'element-stale' })
  })

  it('a document the locator cannot parse reliably is 409 element-unsupported', () => {
    const broken = HTML.replace('</section>', '')
    const r = applyElementEdit(broken, req([0, 0], 'h1', 'Launch day', 'text', 'x'))
    expect(r).toMatchObject({ ok: false, status: 409, code: 'element-unsupported' })
  })

  it('an unverifiable fingerprint (unknown entity) is 409 element-unsupported', () => {
    const html = HTML.replace('Launch  day', 'Launch &alpha; day')
    const r = applyElementEdit(html, req([0, 0], 'h1', 'Launch α day', 'text', 'x'))
    expect(r).toMatchObject({ ok: false, status: 409, code: 'element-unsupported' })
  })

  it('an ambiguous style attribute is 409 element-unsupported', () => {
    const html = HTML.replace('<h1 class="title">', '<h1 style="color:red" style="color:blue">')
    const r = applyElementEdit(html, req([0, 0], 'h1', 'Launch day', 'color', '#000'))
    expect(r).toMatchObject({ ok: false, status: 409, code: 'element-unsupported' })
  })
})

// ── Client-side contract helpers (T24 uses these inside the editor iframe) ──

type Fake = EditorDomElement & { children: Fake[]; childNodes: Fake[]; parentElement: Fake | null }

function E(tagName: string, attrs: Record<string, string>, kids: Array<Fake | string>): Fake {
  const node: Fake = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    textContent: null,
    parentElement: null,
    children: [],
    childNodes: [],
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
  }
  for (const k of kids) {
    const child: Fake =
      typeof k === 'string'
        ? {
            nodeType: 3,
            tagName: '',
            textContent: k,
            parentElement: node,
            children: [],
            childNodes: [],
            getAttribute: () => null,
          }
        : k
    child.parentElement = node
    node.childNodes.push(child)
    if (child.nodeType === 1) node.children.push(child)
  }
  return node
}

describe('editorElementPath / editorFingerprintText (editor-chrome aware)', () => {
  // The editor wraps each <img> in an img-wrap span with a Replace-photo button.
  const img = E('img', { src: 'a.png' }, [])
  const btn = E('button', { 'data-inline-edit-chrome': 'img-btn' }, ['Replace photo'])
  const wrap = E('span', { 'data-inline-edit-chrome': 'img-wrap' }, [img, btn])
  const h1 = E('h1', {}, ['Hello'])
  const banner = E('div', { 'data-inline-edit-chrome': 'banner' }, ['Editing'])
  const card = E('div', {}, [wrap, ' caption ', h1])
  const p = E('p', {}, ['World'])
  const body = E('body', {}, [banner, card, p])

  it('skips chrome and treats img-wrap as transparent', () => {
    expect(editorElementPath(img, body)).toEqual([0, 0])
    expect(editorElementPath(h1, body)).toEqual([0, 1])
    expect(editorElementPath(card, body)).toEqual([0])
    expect(editorElementPath(p, body)).toEqual([1])
    expect(editorElementPath(body, body)).toEqual([])
  })

  it('returns null for a chrome element or a node outside body', () => {
    expect(editorElementPath(btn, body)).toBeNull()
    expect(editorElementPath(wrap, body)).toBeNull()
    const stray = E('div', {}, [])
    expect(editorElementPath(stray, body)).toBeNull()
  })

  it('the fingerprint text excludes chrome text (Replace photo)', () => {
    expect(editorFingerprintText(card)).toBe(' caption Hello')
  })

  it('matches the server path for the equivalent stored HTML', () => {
    const stored =
      '<!doctype html><html><body><div><img src="a.png"> caption <h1>Hello</h1></div><p>World</p></body></html>'
    const r = applyElementEdit(stored, {
      mode: 'element',
      locator: { path: editorElementPath(h1, body)!, tag: h1.tagName, text: editorFingerprintText(h1) },
      edit: { kind: 'text', value: 'Hi' },
    })
    expect(r.ok && r.html).toContain('<h1>Hi</h1>')
    const r2 = applyElementEdit(stored, {
      mode: 'element',
      locator: { path: editorElementPath(card, body)!, tag: card.tagName, text: editorFingerprintText(card) },
      edit: { kind: 'color', value: '#fff' },
    })
    expect(r2.ok).toBe(true)
  })
})
