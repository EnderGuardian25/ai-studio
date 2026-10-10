import { describe, it, expect, vi } from 'vitest'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildPathBSystemPrompt, buildPathBUserMessage } from '@/lib/agent/prompts/pathB'
import { buildPathASystemPrompt, buildPathAUserMessage } from '@/lib/agent/prompts/pathA'
import {
  buildCaptionPrompt,
  buildCopyPrompt,
  CAPTION_MAX_TOKENS,
  CAPTION_PROMPT_VERSION,
} from '@/lib/agent/prompts/caption'
import { placeholderNote, SCRIPT_SUPPORT_NOTE, PROMPT_VERSION } from '@/lib/agent/prompts/shared'

const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Bistec',
  colors: ['#0f2d4e', '#ff5a1f'],
  fonts: [{ name: 'Inter', url: 'https://fonts.example.com/inter.woff2' }],
  logoUrl: 'https://cdn.example.com/logo.svg',
  logos: [{ label: 'Primary logo', url: 'https://cdn.example.com/logo.svg', primary: true }],
  voicePrompt: 'Warm, confident, human.',
  source: 'system',
}

describe('buildPathBSystemPrompt', () => {
  it('is pure — same input, same output', () => {
    const opts = { kit, mode: 'api' as const, width: 1080, height: 1080 }
    expect(buildPathBSystemPrompt(opts)).toBe(buildPathBSystemPrompt(opts))
  })

  it('api mode instructs the tool-use loop (renderHtml)', () => {
    const prompt = buildPathBSystemPrompt({ kit, mode: 'api', width: 1080, height: 1350 })
    expect(prompt).toContain('renderHtml(html, 1080, 1350)')
    expect(prompt).not.toContain('NO tools')
  })

  it('cli mode is single-shot: no tools + DOCTYPE protocol', () => {
    const prompt = buildPathBSystemPrompt({ kit, mode: 'cli', width: 1080, height: 1080 })
    expect(prompt).toContain('NO tools')
    expect(prompt).toContain('<!DOCTYPE html>')
    expect(prompt).not.toContain('renderHtml')
  })

  it('embeds the brand kit context and canvas size', () => {
    const prompt = buildPathBSystemPrompt({ kit, mode: 'cli', width: 1080, height: 1350 })
    expect(prompt).toContain('#0f2d4e')
    expect(prompt).toContain('Inter')
    expect(prompt).toContain('https://cdn.example.com/logo.svg')
    expect(prompt).toContain('1080×1350')
  })

  it('filters data: URIs out of the brand reference image list', () => {
    const prompt = buildPathBSystemPrompt({
      kit,
      mode: 'cli',
      width: 1080,
      height: 1080,
      artifactUrls: [
        'https://cdn.example.com/ref-1.png',
        `data:image/png;base64,${'A'.repeat(1000)}`,
        'https://cdn.example.com/ref-2.png',
      ],
    })
    expect(prompt).toContain('Brand reference images: https://cdn.example.com/ref-1.png, https://cdn.example.com/ref-2.png')
    expect(prompt).not.toContain('data:')
  })

  it('omits the reference-image line entirely when only data: URIs remain', () => {
    const prompt = buildPathBSystemPrompt({
      kit,
      mode: 'cli',
      width: 1080,
      height: 1080,
      artifactUrls: ['data:image/png;base64,AAAA'],
    })
    expect(prompt).not.toContain('Brand reference images')
    expect(prompt).not.toContain('data:')
  })

  it('includes the style-reference template line only when provided', () => {
    const withRef = buildPathBSystemPrompt({
      kit,
      mode: 'cli',
      width: 1080,
      height: 1080,
      referenceTemplateHtml: '<div>__INLINE_ASSET_0__</div>',
    })
    expect(withRef).toContain('Style reference')
    const withoutRef = buildPathBSystemPrompt({ kit, mode: 'cli', width: 1080, height: 1080 })
    expect(withoutRef).not.toContain('Style reference')
  })
})

describe('buildPathBUserMessage', () => {
  const base = {
    topic: 'Product launch',
    description: 'Big day',
    goal: 'Awareness',
    tone: 'Excited',
    channels: ['INSTAGRAM', 'LINKEDIN'],
    copyText: 'We are live!',
    width: 1080,
    height: 1080,
  }

  it('api mode ends with a renderHtml call instruction', () => {
    const msg = buildPathBUserMessage({ ...base, mode: 'api' })
    expect(msg).toContain('Call renderHtml(html, 1080, 1080)')
  })

  it('cli mode asks for the HTML document instead', () => {
    const msg = buildPathBUserMessage({ ...base, mode: 'cli' })
    expect(msg).toContain('Output the complete HTML document.')
    expect(msg).not.toContain('renderHtml')
  })
})

describe('buildPathASystemPrompt — placeholderNote wiring', () => {
  it('mentions inline-asset placeholders only when hasInlineAssets', () => {
    const withAssets = buildPathASystemPrompt({
      kit,
      mode: 'cli',
      width: 1080,
      height: 1080,
      hasInlineAssets: true,
    })
    expect(withAssets).toContain('__INLINE_ASSET_0__')

    const withoutAssets = buildPathASystemPrompt({
      kit,
      mode: 'cli',
      width: 1080,
      height: 1080,
      hasInlineAssets: false,
    })
    expect(withoutAssets).not.toContain('__INLINE_ASSET_0__')
  })

  it('placeholderNote itself is empty when there are no inline assets', () => {
    expect(placeholderNote(false)).toBe('')
    expect(placeholderNote(true)).toContain('__INLINE_ASSET_0__')
  })
})

describe('buildPathAUserMessage', () => {
  const base = {
    slimTemplate: '<div class="card">{{TITLE}}</div>',
    copyText: 'Hello world',
    width: 1080,
    height: 1350,
  }

  it('embeds the template and copy; mode selects the final step', () => {
    const api = buildPathAUserMessage({ ...base, mode: 'api' })
    expect(api).toContain('<div class="card">{{TITLE}}</div>')
    expect(api).toContain('Hello world')
    expect(api).toContain('renderHtml(html, 1080, 1350)')

    const cli = buildPathAUserMessage({ ...base, mode: 'cli' })
    expect(cli).toContain('Output the complete filled HTML document.')
    expect(cli).not.toContain('renderHtml')
  })

  it('includes the user image note only when a URL is provided', () => {
    const withImg = buildPathAUserMessage({
      ...base,
      mode: 'cli',
      additionalImageUrl: 'https://cdn.example.com/photo.jpg',
    })
    expect(withImg).toContain('https://cdn.example.com/photo.jpg')
    const withoutImg = buildPathAUserMessage({ ...base, mode: 'cli' })
    expect(withoutImg).not.toContain('User-provided image URL')
  })
})

describe('SCRIPT_SUPPORT_NOTE — no-emoji guidance', () => {
  it('instructs the design agent to use covered symbols, never emoji, in the design only', () => {
    expect(SCRIPT_SUPPORT_NOTE).toContain('never emoji')
    expect(SCRIPT_SUPPORT_NOTE).toContain('In the rendered design')
    expect(SCRIPT_SUPPORT_NOTE).toContain('captions are unaffected')
  })

  it('carves emoji out of the exact-reproduction rule so the two rules cannot conflict', () => {
    // The exact-reproduction rule (protects Sinhala and other scripts) must not
    // fight the no-emoji-in-design rule: emoji get an explicit, narrow exception.
    expect(SCRIPT_SUPPORT_NOTE).toContain('The only exception is emoji')
    expect(SCRIPT_SUPPORT_NOTE).toContain('does NOT contradict the exact-reproduction rule')
    expect(SCRIPT_SUPPORT_NOTE).toContain('leave those emoji out of the rendered design')
    expect(SCRIPT_SUPPORT_NOTE).toContain('the caption text keeps the copy\'s original emoji unchanged')
  })

  it('bumps PROMPT_VERSION alongside the note change', () => {
    // 2026-10-01.1: the CLI refine prompt gained SCRIPT_SUPPORT_NOTE (final F1 / I-3).
    // 2026-10-01.2: VERIFIER_SYSTEM no longer paraphrases class criteria (final F1b / M-1).
    expect(PROMPT_VERSION).toBe('2026-10-01.2')
  })
})

describe('buildCopyPrompt (deprecated wrapper, removed in 012 T5)', () => {
  const brief = {
    topic: 'Hiring push',
    description: 'We are growing',
    goal: 'Applications',
    tone: 'Friendly',
    channels: ['INSTAGRAM', 'LINKEDIN'],
  }

  it('is pure and embeds the brief fields', () => {
    expect(buildCopyPrompt(brief)).toEqual(buildCopyPrompt(brief))
    const { system, user } = buildCopyPrompt(brief)
    expect(system).toContain('INSTAGRAM, LINKEDIN')
    expect(user).toContain('Hiring push')
    expect(user).toContain('Friendly')
  })

  it('uses the brand name and voice when provided, generic fallback otherwise', () => {
    const branded = buildCopyPrompt({ ...brief, brandName: 'Bistec', brandVoice: 'Bold voice.' })
    expect(branded.system).toContain('copywriter for Bistec')
    expect(branded.system).toContain('Bold voice.')

    const generic = buildCopyPrompt(brief)
    expect(generic.system).toContain('copywriter for the brand')
    expect(generic.system).not.toContain('Brand voice guidelines')
  })
})

describe('buildCaptionPrompt (012 FR-07)', () => {
  const brief = {
    topic: 'Hiring push',
    description: 'We are growing',
    goal: 'Applications',
    tone: 'Friendly',
    channels: ['INSTAGRAM', 'LINKEDIN'],
  }
  const ALL = ['HEADLINE', 'INSTAGRAM', 'LINKEDIN', 'WHATSAPP'] as const

  it('is pure and embeds the brief fields', () => {
    expect(buildCaptionPrompt(brief, ALL)).toEqual(buildCaptionPrompt(brief, ALL))
    const { user } = buildCaptionPrompt(brief, ALL)
    expect(user).toContain('Topic: Hiring push')
    expect(user).toContain('Description: We are growing')
    expect(user).toContain('Goal: Applications')
    expect(user).toContain('Tone: Friendly')
  })

  it('takes the length guidance from the registry: hard limits and the WhatsApp soft guide', () => {
    const { user } = buildCaptionPrompt(brief, ALL)
    expect(user).toContain('"instagram" (Instagram): Hook in the first line.')
    expect(user).toContain('At most 2,200 characters.')
    expect(user).toContain('"linkedin" (LinkedIn): Professional and longer-form.')
    expect(user).toContain('At most 3,000 characters.')
    expect(user).toContain('"whatsapp" (WhatsApp): Short and direct.')
    expect(user).toContain('Aim for at most 1,000 characters.')
    expect(user).toContain(
      '"headline": the short line printed on the post image: one line, at most 100 characters, no hashtags, no emoji, no markdown.'
    )
  })

  it('lists bullets headline first, then channels in registry order, whatever the target order', () => {
    const { user } = buildCaptionPrompt(brief, ['WHATSAPP', 'INSTAGRAM', 'HEADLINE', 'LINKEDIN'])
    const at = (k: string) => user.indexOf(`- "${k}"`)
    expect(at('headline')).toBeGreaterThan(-1)
    expect(at('headline')).toBeLessThan(at('instagram'))
    expect(at('instagram')).toBeLessThan(at('linkedin'))
    expect(at('linkedin')).toBeLessThan(at('whatsapp'))
  })

  it('names exactly the requested keys in the output protocol and asks for nothing else', () => {
    const all = buildCaptionPrompt(brief, ALL).user
    expect(all).toContain(
      'Reply with exactly one JSON object whose keys are exactly "headline", "instagram", "linkedin", "whatsapp", each a string. No other keys. Escape newlines as \\n.'
    )
    expect(all).toContain('nothing else')

    const one = buildCaptionPrompt(brief, ['LINKEDIN']).user
    expect(one).toContain('whose keys are exactly "linkedin", each a string.')
    expect(one).not.toContain('"instagram"')
    expect(one).not.toContain('"whatsapp"')
    expect(one).not.toContain('"headline"')
  })

  it('writes all three captions whatever brief.channels says (A5)', () => {
    const { user } = buildCaptionPrompt({ ...brief, channels: ['INSTAGRAM'] }, ALL)
    expect(user).toContain('"linkedin"')
    expect(user).toContain('"whatsapp"')
  })

  it('keeps the brand, voice and campaign briefing in the system prompt', () => {
    const { system } = buildCaptionPrompt(
      { ...brief, brandName: 'Bistec', brandVoice: 'Bold voice.', campaignBriefing: 'IRP context.' },
      ALL
    )
    expect(system).toContain('copywriter for Bistec')
    expect(system).toContain('Bold voice.')
    expect(system).toContain('Campaign briefing (applies to every post in this campaign):\nIRP context.')
    expect(system.indexOf('Bold voice.')).toBeLessThan(system.indexOf('IRP context.'))

    const generic = buildCaptionPrompt(brief, ALL).system
    expect(generic).toContain('copywriter for the brand')
    expect(generic).not.toContain('Brand voice guidelines')
    expect(generic).not.toContain('Campaign briefing')
  })

  it('exports the caption prompt version and the token budget', () => {
    expect(CAPTION_PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/)
    expect(CAPTION_MAX_TOKENS).toBe(8192)
  })

  it('a test registry with a changed limit changes the prompt text (AC-01)', async () => {
    vi.resetModules()
    vi.doMock('@/lib/channels', async (importOriginal) => {
      const real = await importOriginal<typeof import('@/lib/channels')>()
      return {
        ...real,
        CAPTION_CHANNELS: real.CAPTION_CHANNELS.map((s) =>
          s.channel === 'INSTAGRAM' ? { ...s, hardLimit: 1234 } : s.channel === 'WHATSAPP' ? { ...s, softLimit: 777 } : s
        ),
      }
    })
    try {
      const { buildCaptionPrompt: build } = await import('@/lib/agent/prompts/caption')
      const { user } = build(brief, ALL)
      expect(user).toContain('At most 1,234 characters.')
      expect(user).not.toContain('2,200')
      expect(user).toContain('Aim for at most 777 characters.')
      expect(user).not.toContain('1,000')
      expect(user).toContain('At most 3,000 characters.')
    } finally {
      vi.doUnmock('@/lib/channels')
      vi.resetModules()
    }
  })
})
