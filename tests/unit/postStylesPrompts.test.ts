// 027 FR-09 / AC-08 (text half): the checklist prompt text, pinned exactly.
import { describe, it, expect } from 'vitest'
import { checklistPromptText, CHECKLIST_PREAMBLE } from '@/lib/postStyles'
import { styles } from '@/lib/postStyles/styles'
import type { PostStyle } from '@/lib/postStyles/types'

const PREAMBLE_GENERAL =
  'Content rules for this post (post style: General). They outrank the brand voice and the campaign briefing where they conflict. "Stated in the brief" means the value appears in the topic, the description, the campaign briefing or the brand voice text. If a value is not stated, do not write it.'

describe('checklistPromptText', () => {
  it('the preamble constant has one label placeholder and the exact words', () => {
    expect(CHECKLIST_PREAMBLE.split('{label}')).toHaveLength(2)
    expect(CHECKLIST_PREAMBLE.replace('{label}', 'General')).toBe(PREAMBLE_GENERAL)
  })

  it('general, caption scope: exact text', () => {
    expect(checklistPromptText('general', 1, 'caption')).toBe(
      [
        PREAMBLE_GENERAL,
        '- Write a date, price, percentage or other number only if the brief states it. If it does not, leave it out.',
        '- Include exactly one call to action.',
      ].join('\n'),
    )
  })

  it('general, image scope: exact text', () => {
    expect(checklistPromptText('general', 1, 'image')).toBe(
      [
        PREAMBLE_GENERAL,
        '- Print a date, price, percentage or other number on the image only if the brief states it.',
      ].join('\n'),
    )
  })

  it('every style and scope renders the preamble with its own label then one bullet per rule, in order', () => {
    for (const s of Object.values(styles))
      for (const scope of ['caption', 'image'] as const) {
        const rules = s.versions[s.current].checklist.filter((r) => r.scope === scope)
        const text = checklistPromptText(s.key, s.current, scope)
        const lines = text.split('\n')
        expect(lines[0], s.key).toBe(CHECKLIST_PREAMBLE.replace('{label}', s.label))
        expect(lines.slice(1), s.key).toEqual(rules.map((r) => `- ${r.text}`))
      }
  })

  it('returns empty text for an unknown key, an unknown version and a scope with no rules', () => {
    expect(checklistPromptText('nope', 1, 'caption')).toBe('')
    expect(checklistPromptText('constructor', 1, 'caption')).toBe('')
    expect(checklistPromptText('general', 9, 'caption')).toBe('')
    const noImage: Record<string, PostStyle> = {
      ...styles,
      tip: {
        ...styles.tip,
        versions: {
          1: {
            ...styles.tip.versions[1],
            checklist: styles.tip.versions[1].checklist.filter((r) => r.scope === 'caption'),
          },
        },
      },
    }
    expect(checklistPromptText('tip', 1, 'image', noImage)).toBe('')
    expect(checklistPromptText('tip', 1, 'caption', noImage)).not.toBe('')
  })

  it('a retired style still renders (fixture dataset)', () => {
    const dataset: Record<string, PostStyle> = {
      ...styles,
      tip: { ...styles.tip, status: 'retired' },
    }
    expect(checklistPromptText('tip', 1, 'caption', dataset)).toContain('post style: Tip')
  })
})
