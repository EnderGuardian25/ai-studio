// Change 028 T3 — the look fixtures against real Chromium (MOCK_PUPPETEER off;
// see vitest.render.config.ts). AC-07. Every current contract has a pass, a
// busy and a contrast image; the pixel check must call each correctly.
import { describe, expect, it } from 'vitest'
import { MOCK_PUPPETEER } from '@/lib/testHooks'
import { ASPECT_DIMENSIONS } from '@/lib/aspectRatio'
import { sampleRegionLuminance } from '@/lib/renderer/puppeteer'
import { contractAt, contractVersionOf, evaluateRegions } from '@/lib/designData'
import { LOOK_FIXTURES } from './lookFixtureTable'
import { lookFixture } from './lookFixtures'

describe('the look fixtures run in real Chromium', () => {
  it('runs with MOCK_PUPPETEER off', () => {
    expect(MOCK_PUPPETEER).toBe(false)
  })
})

describe.each(LOOK_FIXTURES)('look fixture $id $kind', (spec) => {
  it('gets the verdict the check should give', async () => {
    const regions = contractAt(spec.key, spec.version, spec.size)!.regions
    const tone = contractVersionOf(spec.key, spec.version)!.textTone
    const samples = await sampleRegionLuminance(await lookFixture(spec), regions, ASPECT_DIMENSIONS[spec.size])
    const verdict = evaluateRegions(samples, regions, tone)
    if (spec.kind === 'pass') {
      expect(verdict).toEqual({ ok: true })
    } else if (spec.kind === 'busy') {
      const lastText = regions.filter((r) => r.purpose === 'text').pop()
      expect(verdict).toMatchObject({ ok: false, reason: 'busy', region: lastText })
    } else if (spec.kind === 'screen') {
      const composite = regions.find((r) => r.purpose === 'composite')
      expect(verdict).toMatchObject({ ok: false, reason: 'composite-not-blank', region: composite })
    } else {
      expect(verdict).toMatchObject({ ok: false, reason: 'contrast', region: regions[0] })
    }
  })
})
