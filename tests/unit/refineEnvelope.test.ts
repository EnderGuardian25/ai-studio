import { describe, it, expect } from 'vitest'
import {
  parseRefineEnvelope,
  effectiveClasses,
  renderEnvelopeProtocol,
  REFINE_ENVELOPE_EXAMPLE,
} from '@/lib/agent/refineEnvelope'
import { INSTRUCTION_CLASS_KEYS } from '@/lib/agent/instructionClasses'

const DOC = `<!DOCTYPE html>
<html><head><style>body{margin:0} .hero{background-image:url('http://minio.local/images/new.jpg')}</style></head>
<body><h1>INDUSTRY READINESS PROGRAMME</h1></body>
</html>`

const FENCED = (json: string) => `\`\`\`json\n${json}\n\`\`\`\n${DOC}`

describe('parseRefineEnvelope — the documented wire format', () => {
  it('parses a fenced JSON header followed by the document', () => {
    const out = parseRefineEnvelope(FENCED('{"classes":["replace"],"supersedes":["http://minio.local/images/old.png"]}'))
    expect(out).toEqual({
      classes: ['replace'],
      supersedes: ['http://minio.local/images/old.png'],
      html: DOC,
      discarded: '',
      classificationDefaulted: false,
    })
  })

  it('parses a bare (unfenced) JSON header', () => {
    const out = parseRefineEnvelope(`{"classes":["remove"],"supersedes":["Join us for"]}\n${DOC}`)
    expect(out?.classes).toEqual(['remove'])
    expect(out?.supersedes).toEqual(['Join us for'])
    expect(out?.html).toBe(DOC)
    expect(out?.classificationDefaulted).toBe(false)
  })

  it('parses the example the protocol text shows the model', () => {
    const out = parseRefineEnvelope(REFINE_ENVELOPE_EXAMPLE)
    expect(out).not.toBeNull()
    expect(out?.classificationDefaulted).toBe(false)
    expect(out?.classes.length).toBeGreaterThan(0)
    expect(renderEnvelopeProtocol()).toContain(REFINE_ENVELOPE_EXAMPLE)
  })

  it('returns a multi-clause classification in order (AC-11)', () => {
    const out = parseRefineEnvelope(FENCED('{"classes":["replace","add"],"supersedes":["old.png"]}'))
    expect(out?.classes).toEqual(['replace', 'add'])
  })
})

describe('parseRefineEnvelope — tolerating a narrating model', () => {
  it('finds the header after a chat preamble and keeps the preamble in discarded', () => {
    const raw = `Sure — here is the updated design.\n\n${FENCED('{"classes":["constrain"],"supersedes":[]}')}`
    const out = parseRefineEnvelope(raw)
    expect(out?.classes).toEqual(['constrain'])
    expect(out?.html).toBe(DOC)
    expect(out?.discarded).toContain('here is the updated design')
    expect(out?.discarded).not.toContain('classes')
    expect(out?.discarded).not.toContain('```')
  })

  it('ignores brace-y narration that is not the envelope', () => {
    const raw = `I kept the {headline} styles and the {"note": 1} block.\n${FENCED('{"classes":["remove"],"supersedes":["a"]}')}`
    const out = parseRefineEnvelope(raw)
    expect(out?.classes).toEqual(['remove'])
    expect(out?.supersedes).toEqual(['a'])
  })

  it('survives an unbalanced brace in the narration', () => {
    const raw = `Oops { unbalanced.\n{"classes":["remove"],"supersedes":["b"]}\n${DOC}`
    expect(parseRefineEnvelope(raw)?.supersedes).toEqual(['b'])
  })

  it('handles braces and escaped quotes inside JSON strings', () => {
    const out = parseRefineEnvelope(FENCED(String.raw`{"classes":["replace"],"supersedes":["a}b{c","say \"hi\""]}`))
    expect(out?.supersedes).toEqual(['a}b{c', 'say "hi"'])
  })

  it('falls back to a header placed after the document', () => {
    const out = parseRefineEnvelope(`${DOC}\n\n{"classes":["remove"],"supersedes":["x"]}`)
    expect(out?.classes).toEqual(['remove'])
    expect(out?.html).toBe(DOC)
    expect(out?.classificationDefaulted).toBe(false)
  })

  it('never reads an envelope out of the document itself', () => {
    const docWithJson = DOC.replace('</body>', '<script type="application/json">{"classes":["remove"],"supersedes":["x"]}</script></body>')
    const out = parseRefineEnvelope(docWithJson)
    expect(out?.classes).toEqual(['add'])
    expect(out?.classificationDefaulted).toBe(true)
    expect(out?.html).toBe(docWithJson)
  })

  it('cuts the document with extractHtmlDocument (fences around the document fall away)', () => {
    const raw = `{"classes":["add"],"supersedes":[]}\n\`\`\`html\n${DOC}\n\`\`\`\nLet me know!`
    const out = parseRefineEnvelope(raw)
    expect(out?.html).toBe(DOC)
    expect(out?.discarded).toContain('Let me know!')
  })
})

describe('parseRefineEnvelope — defaults (FR-05)', () => {
  it('defaults a missing header to the preserving class, flagged', () => {
    const out = parseRefineEnvelope(DOC)
    expect(out).toMatchObject({ classes: ['add'], supersedes: [], html: DOC, classificationDefaulted: true })
  })

  it('defaults unparseable JSON', () => {
    const out = parseRefineEnvelope(FENCED('{"classes":["remove",],"supersedes":}'))
    expect(out?.classes).toEqual(['add'])
    expect(out?.classificationDefaulted).toBe(true)
  })

  it('defaults a header with no classes key, keeping any supersedes', () => {
    const out = parseRefineEnvelope(FENCED('{"supersedes":["old.png"]}'))
    expect(out?.classes).toEqual(['add'])
    expect(out?.supersedes).toEqual(['old.png'])
    expect(out?.classificationDefaulted).toBe(true)
  })

  it('drops unknown class values and defaults when none survive', () => {
    expect(parseRefineEnvelope(FENCED('{"classes":["remove","recolour"],"supersedes":["a"]}'))?.classes).toEqual(['remove'])
    const none = parseRefineEnvelope(FENCED('{"classes":["recolour", 3, null],"supersedes":["a"]}'))
    expect(none?.classes).toEqual(['add'])
    expect(none?.classificationDefaulted).toBe(true)
  })

  it('normalises case/whitespace and de-duplicates classes', () => {
    const out = parseRefineEnvelope(FENCED('{"classes":[" Remove ","remove","CONSTRAIN"],"supersedes":["a"]}'))
    expect(out?.classes).toEqual(['remove', 'constrain'])
  })

  it('accepts a single class string', () => {
    expect(parseRefineEnvelope(FENCED('{"classes":"replace","supersedes":"old.png"}'))).toMatchObject({
      classes: ['replace'],
      supersedes: ['old.png'],
      classificationDefaulted: false,
    })
  })

  it('defaults a missing supersedes to [] and cleans the list', () => {
    expect(parseRefineEnvelope(FENCED('{"classes":["add"]}'))?.supersedes).toEqual([])
    const out = parseRefineEnvelope(FENCED('{"classes":["remove"],"supersedes":["  a  ", "", 7, "a", null, "b"]}'))
    expect(out?.supersedes).toEqual(['a', 'b'])
  })

  it('returns null when no document can be cut', () => {
    expect(parseRefineEnvelope('{"classes":["remove"],"supersedes":["a"]}\nI could not apply that.')).toBeNull()
    expect(parseRefineEnvelope('')).toBeNull()
  })
})

describe('effectiveClasses — FR-04 downgrade, for the route to call', () => {
  it('leaves a destructive class with a named element alone', () => {
    expect(effectiveClasses({ classes: ['replace', 'add'], supersedes: ['old.png'] })).toEqual({
      classes: ['replace', 'add'],
      downgraded: [],
    })
  })

  // AC-10: an empty supersedes deletes nothing — it resolves to preserving.
  it('downgrades replace/remove with empty supersedes to the preserving class and reports it', () => {
    expect(effectiveClasses({ classes: ['replace'], supersedes: [] })).toEqual({ classes: ['add'], downgraded: ['replace'] })
    expect(effectiveClasses({ classes: ['remove', 'constrain'], supersedes: [] })).toEqual({
      classes: ['add', 'constrain'],
      downgraded: ['remove'],
    })
  })

  it('treats whitespace-only supersedes as empty', () => {
    expect(effectiveClasses({ classes: ['remove'], supersedes: ['  '] }).downgraded).toEqual(['remove'])
  })

  it('de-duplicates after downgrading', () => {
    expect(effectiveClasses({ classes: ['replace', 'remove', 'add'], supersedes: [] })).toEqual({
      classes: ['add'],
      downgraded: ['replace', 'remove'],
    })
  })

  it('leaves non-destructive classes alone even with empty supersedes', () => {
    expect(effectiveClasses({ classes: ['constrain'], supersedes: [] })).toEqual({ classes: ['constrain'], downgraded: [] })
  })
})

describe('renderEnvelopeProtocol — the output protocol T17 puts in the prompt', () => {
  it('names every class key and both fields, and demands the header before the document', () => {
    const p = renderEnvelopeProtocol()
    for (const k of INSTRUCTION_CLASS_KEYS) expect(p).toContain(k)
    expect(p).toContain('"classes"')
    expect(p).toContain('"supersedes"')
    expect(p).toMatch(/before the (HTML )?document/i)
  })
})
