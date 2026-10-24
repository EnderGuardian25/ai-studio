// Look fixture images (change 028 T3, spec FR-08). Rasterized through the
// production renderer like 009's (heroFixtures.ts), so the pixels the sampler
// reads are real Chromium output. SYNTHETIC: these prove the check
// discriminates, not that a look works on real model images.
import { ASPECT_DIMENSIONS } from '@/lib/aspectRatio'
import { archetypes, contractAt, mapRegionToImage, type ArchetypeMap, type Rect } from '@/lib/designData'
import { CALM, IMAGE_PX, STRIPES, raster } from './heroFixtures'
import { INTENDED_BACKDROP, type FixtureSpec } from './lookFixtureTable'

const clamp = (v: number) => Math.min(100, Math.max(0, v))
// Grow (or, with a negative amount, shrink) a canvas-percent rect by `by`
// points on each side. One point is 1% of the canvas on that axis.
function pad(r: Rect, by: number): Rect {
  const x0 = clamp(r.x - by)
  const y0 = clamp(r.y - by)
  const x1 = clamp(r.x + r.w + by)
  const y1 = clamp(r.y + r.h + by)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const BACKDROP_CSS: Record<'dark' | 'light', string> = {
  dark: CALM,
  light: 'background:#f2f2f2',
}
// The wrong flat grey for each backdrop's text tone: mid grey for light text,
// dark grey for dark text.
const CONTRAST_CSS: Record<'dark' | 'light', string> = {
  dark: 'background:#808080',
  light: 'background:#333333',
}

// A data: URL of the fixture image.
export async function lookFixture(spec: FixtureSpec, source: ArchetypeMap = archetypes): Promise<string> {
  const contract = contractAt(spec.key, spec.version, spec.size, source)
  if (!contract) throw new Error(`no contract for ${spec.id}`)
  const canvas = ASPECT_DIMENSIONS[spec.size]
  const img = IMAGE_PX[spec.size]
  const backdrop = INTENDED_BACKDROP[spec.key] ?? 'dark'
  const texts = contract.regions.filter((r) => r.purpose === 'text')

  // A positioned div in css px (the page is the image at half size).
  const box = (rect: Rect, css: string): string => {
    const m = mapRegionToImage(rect, { w: canvas.width, h: canvas.height }, img)
    if (!m) return ''
    const { x, y, w, h } = m.px
    return `<div style="position:absolute;left:${x / 2}px;top:${y / 2}px;width:${w / 2}px;height:${h / 2}px;${css}"></div>`
  }

  let inner = ''
  for (const r of texts) inner += box(pad(r.rect, 1), BACKDROP_CSS[backdrop])
  if (spec.kind === 'busy') {
    inner += box(pad(texts[texts.length - 1].rect, -1), `background:${STRIPES}`)
  } else if (spec.kind === 'contrast') {
    inner += box(pad(texts[0].rect, 1), CONTRAST_CSS[backdrop])
  }
  return raster(spec.size, `background:${STRIPES}`, inner)
}
