// 007 AC-04: the authoring dataset invariants.
import { describe, it, expect } from 'vitest'
import { entries, fillTemplate, getEntry } from '@/lib/designData/authoring/entries'
import { isMeasurable } from '@/lib/designData/authoring/measurable'

describe('authoring dataset', () => {
  it('has exactly the seven v1 keys and no typography category', () => {
    expect(entries.map((e) => e.key).sort()).toEqual([
      'canvas-share',
      'edge-blend',
      'element-scale',
      'logo-clear-space',
      'margin-even',
      'mark-size-match',
      'whitespace-share',
    ])
    expect(entries.some((e) => (e.category as string) === 'typography')).toBe(false)
    expect(new Set(entries.map((e) => e.category))).toEqual(
      new Set(['size', 'spacing', 'proportion', 'colour-share']),
    )
  })

  it('every entry has every field', () => {
    for (const e of entries) {
      expect(e.key).toMatch(/^[a-z]+(-[a-z]+)+$/)
      expect(e.label).toBeTruthy()
      expect(e.triggers.length).toBeGreaterThan(0)
      expect(['replace', 'insert']).toContain(e.form)
      expect(e.template).toBeTruthy()
      expect(Object.keys(e.defaults).length).toBeGreaterThan(0)
      expect(e.rationale).toBeTruthy()
      expect(e.mockReplacement).toBeTruthy()
      expect(e.source.trim()).not.toBe('')
      for (const t of e.triggers) expect(() => new RegExp(t, 'giu')).not.toThrow()
    }
  })

  it('every template filled with its defaults is measurable; so is every mockReplacement', () => {
    for (const e of entries) {
      expect(isMeasurable(fillTemplate(e.template, e.defaults)), e.key).toBe(true)
      expect(isMeasurable(e.mockReplacement), `${e.key} mock`).toBe(true)
    }
  })

  it('every template slot has a default and a range, and every default is inside its range', () => {
    for (const e of entries) {
      const slots = [...e.template.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
      expect(slots.length, e.key).toBeGreaterThan(0)
      for (const s of slots) {
        expect(e.defaults[s], `${e.key}.${s} default`).toBeDefined()
        expect(e.ranges[s], `${e.key}.${s} range`).toBeDefined()
      }
      for (const [slot, value] of Object.entries(e.defaults)) {
        const r = e.ranges[slot]
        expect(value, `${e.key}.${slot}`).toBeGreaterThanOrEqual(r.min)
        expect(value, `${e.key}.${slot}`).toBeLessThanOrEqual(r.max)
      }
    }
  })

  it('getEntry and fillTemplate', () => {
    expect(getEntry('edge-blend')?.category).toBe('proportion')
    expect(getEntry('nope')).toBeUndefined()
    expect(fillTemplate('a {x} b {y}', { x: 1 })).toBe('a 1 b {y}')
  })
})
