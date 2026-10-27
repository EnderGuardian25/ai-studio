import { describe, expect, it } from 'vitest'
import {
  AUDIT_SET,
  collectAttrs,
  diffAttrs,
  judge,
  parsePermits,
} from '../../scripts/lib/uiInvariants.mjs'

// Change 033 FR-01 / AC-01: the pure core of scripts/check-ui-invariants.mjs.

type Entry = { key: string; file: string }
const attrs = (src: string, file = 'a.tsx') => collectAttrs(src, file) as Entry[]
const run = (baseSrc: string, headSrc: string, md = '') => {
  const diff = diffAttrs(attrs(baseSrc), attrs(headSrc))
  const p = parsePermits(md)
  return judge(diff, p.permits, p.rows, p.duplicates) as {
    ok: boolean
    failures: string[]
    warnings: string[]
  }
}
const table = (rows: string[]) =>
  [
    '| ID | File | Element | Class | Reference | Fix | Permits | Status |',
    '| -- | ---- | ------- | ----- | --------- | --- | ------- | ------ |',
    ...rows,
  ].join('\n')

const BASE = `export const A = () => <button data-testid="save" aria-label="Save" onClick={go} role="tab">x</button>`

describe('collectAttrs', () => {
  it('keeps watched attributes and ignores className and others', () => {
    const e = attrs(`const a = <input id="x" className="c" type="text" disabled aria-hidden />`)
    expect(e.map((x) => x.key).sort()).toEqual(['aria-hidden=true', 'id=x', 'type=text'])
  })
  it('collapses whitespace in expression values and unwraps braced strings', () => {
    const e = attrs(`const a = <b onClick={() =>\n   go( 1 )} aria-label={"hi"} />`)
    expect(e.map((x) => x.key).sort()).toEqual(['aria-label=hi', 'onClick=() => go( 1 )'])
  })
  it('records a spread attribute', () => {
    expect(attrs(`const a = <b {...props} />`).map((x) => x.key)).toEqual(['...props'])
  })
})

describe('judge: failing cases (AC-01)', () => {
  it('fails on a dropped data-testid', () => {
    const r = run(BASE, BASE.replace('data-testid="save" ', ''))
    expect(r.ok).toBe(false)
    expect(r.failures.join('\n')).toContain('data-testid=save')
  })
  it('fails on a changed aria-label', () => {
    const r = run(BASE, BASE.replace('aria-label="Save"', 'aria-label="Store"'))
    expect(r.ok).toBe(false)
    expect(r.failures.join('\n')).toContain('aria-label=Save')
    expect(r.failures.join('\n')).toContain('aria-label=Store')
  })
  it('fails on a removed onClick', () => {
    const r = run(BASE, BASE.replace(' onClick={go}', ''))
    expect(r.ok).toBe(false)
    expect(r.failures.join('\n')).toContain('onClick=go')
  })
  it('fails on an added role', () => {
    const r = run(BASE, BASE.replace('>x<', ' role="menu">x<'))
    expect(r.ok).toBe(false)
    expect(r.failures.join('\n')).toContain('added x1: role=menu')
  })
  it('fails when a permit cites an unknown row', () => {
    const head = BASE.replace('data-testid="save" ', '')
    const p = {
      rowId: 'A-099',
      sign: '-',
      file: 'a.tsx',
      key: 'data-testid=save',
      status: 'approved',
    }
    const r = judge(
      diffAttrs(attrs(BASE), attrs(head)),
      [p],
      new Map([['A-001', 'approved']]),
      [],
    ) as { ok: boolean; failures: string[] }
    expect(r.ok).toBe(false)
    expect(r.failures.join('\n')).toContain('unknown row')
  })
  it('fails when a permit sits on a row that is not approved', () => {
    const md = table([
      '| A-001 | a.tsx | button | look | DS | drop | `-a.tsx:data-testid=save` | proposed |',
    ])
    const r = run(BASE, BASE.replace('data-testid="save" ', ''), md)
    expect(r.ok).toBe(false)
    expect(r.failures.join('\n')).toContain('not approved or closed')
    expect(r.failures.join('\n')).toContain('removed x1: data-testid=save')
  })
  it('fails on a duplicated row ID', () => {
    const row = '| A-001 | a.tsx | button | none | DS | — | — | approved |'
    expect(run(BASE, BASE, table([row, row])).ok).toBe(false)
  })
})

describe('judge: passing cases (AC-01)', () => {
  it('passes with no difference', () => {
    expect(run(BASE, BASE).ok).toBe(true)
  })
  it('passes when an element moves between two files', () => {
    const el = `<a href="/x" data-testid="go" />`
    const base = [...attrs(`const a = ${el}`, 'a.tsx'), ...attrs(`const b = <i />`, 'b.tsx')]
    const head = [...attrs(`const a = <i />`, 'a.tsx'), ...attrs(`const b = ${el}`, 'b.tsx')]
    expect((judge(diffAttrs(base, head), [], new Map(), []) as { ok: boolean }).ok).toBe(true)
  })
  it('passes a permitted removal, and warns on an unused permit', () => {
    const md = table([
      '| A-001 | a.tsx | button | look | DS | drop | `-a.tsx:data-testid=save` | approved |',
      '| A-002 | a.tsx | button | look | DS | drop | `-a.tsx:role=gone` | closed abc1234 |',
    ])
    const r = run(BASE, BASE.replace('data-testid="save" ', ''), md)
    expect(r.ok).toBe(true)
    expect(r.warnings.join('\n')).toContain('unused permit')
  })
  it('a permit consumes one count only', () => {
    const base = `const a = <><i role="x" /><i role="x" /></>`
    const head = `const a = <><i /><i /></>`
    const md = table(['| A-001 | a.tsx | i | look | DS | drop | `-a.tsx:role=x` | approved |'])
    const r = run(base, head, md)
    expect(r.ok).toBe(false)
    expect(r.failures.join('\n')).toContain('removed x1: role=x')
  })
})

describe('judge: review fixes', () => {
  const row = (permits: string, status = 'approved') =>
    table([`| A-001 | a.tsx | e | look | DS | f | ${permits} | ${status} |`])

  it('a template-literal permit (double-backtick span) passes', () => {
    const base = 'const a = <i id={`x-${i}`} />'
    const r = run(base, 'const a = <i />', row('`` -a.tsx:id=`x-${i}` ``'))
    expect(r.failures).toEqual([])
    expect(r.ok).toBe(true)
  })
  it('an escaped-pipe permit passes', () => {
    const base = 'const a = <a href={a || b} />'
    const r = run(base, 'const a = <a />', row('`-a.tsx:href=a \\|\\| b`'))
    expect(r.failures).toEqual([])
    expect(r.ok).toBe(true)
  })
  it('a permit naming the wrong file fails', () => {
    const r = run(BASE, BASE.replace('data-testid="save" ', ''), row('`-b.tsx:data-testid=save`'))
    expect(r.ok).toBe(false)
    expect(r.failures.join('\n')).toContain('removed x1: data-testid=save')
  })
  it('a + permit does not cover a removal', () => {
    const r = run(BASE, BASE.replace('data-testid="save" ', ''), row('`+a.tsx:data-testid=save`'))
    expect(r.ok).toBe(false)
  })
  it('an added duplicate (count 1 to 2) fails', () => {
    const base = 'const a = <i role="x" />'
    const r = run(base, 'const a = <><i role="x" /><i role="x" /></>')
    expect(r.ok).toBe(false)
    expect(r.failures.join('\n')).toContain('added x1: role=x')
  })
  it.each(['cut', 'behaviour', 'approvedX', 'proposed'])('a permit on a %s row fails', (status) => {
    const r = run(
      BASE,
      BASE.replace('data-testid="save" ', ''),
      row('`-a.tsx:data-testid=save`', status),
    )
    expect(r.ok).toBe(false)
    expect(r.failures.join('\n')).toContain('not approved or closed')
  })
  it('an unwrapped permit cell is malformed and fails', () => {
    const r = run(BASE, BASE, row('-a.tsx:data-testid=save'))
    expect(r.ok).toBe(false)
    expect(r.failures.join('\n')).toContain('malformed permit')
  })
})

describe('parsePermits and AUDIT_SET', () => {
  it('reads rows, files and several tokens in one cell', () => {
    const md = table([
      '| A-001 | src/x.tsx | b | look | DS | f | `-src/x.tsx:aria-label=A b` `+src/x.tsx:role=tab` | approved |',
    ])
    const p = parsePermits(md)
    expect(p.rows.get('A-001')).toBe('approved')
    expect(p.files.has('src/x.tsx')).toBe(true)
    expect(p.permits.map((x: { sign: string; key: string }) => x.sign + x.key)).toEqual([
      '-aria-label=A b',
      '+role=tab',
    ])
  })
  it('AUDIT_SET has 47 unique paths', () => {
    expect(AUDIT_SET).toHaveLength(47)
    expect(new Set(AUDIT_SET).size).toBe(47)
  })
})
