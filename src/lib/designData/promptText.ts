// Prompt wording generated from the dataset (009 design.md section 8), so the
// words and the check can never disagree about where a region is. Pure.
import type { Contract, Rect, SizeContract, TextTone } from './composition'

export const PRECEDENCE_LINE =
  "When an image style is chosen, its layout contract below outranks any layout instruction in the brand voice prompt or the campaign briefing. The brand's colours, fonts, logo and wording rules still apply."

const pct = (n: number) => `${Number(n.toFixed(1))}%`

// A rect in words. Order matters: full frame, left, right, top, bottom, else
// the generic form.
export function describeRegion(r: Rect): string {
  if (r.x === 0 && r.y === 0 && r.w === 100 && r.h === 100) return 'the whole frame'
  if (r.x === 0 && r.h === 100) return `the left ${pct(r.w)} of the frame, full height`
  if (r.x + r.w === 100 && r.h === 100) return `the right ${pct(r.w)} of the frame, full height`
  if (r.y === 0 && r.w === 100) return `the top ${pct(r.h)} of the frame, full width`
  if (r.y + r.h === 100 && r.w === 100) return `the bottom ${pct(r.h)} of the frame, full width`
  return `the area from ${pct(r.x)} to ${pct(r.x + r.w)} across and ${pct(r.y)} to ${pct(r.y + r.h)} down`
}

const px = (percent: number, total: number) => Math.round((percent * total) / 100)

// The same rect in canvas pixels: "x 0 to 486, y 0 to 1350".
export function describeRegionPx(r: Rect, canvas: { width: number; height: number }): string {
  return `x ${px(r.x, canvas.width)} to ${px(r.x + r.w, canvas.width)}, y ${px(r.y, canvas.height)} to ${px(r.y + r.h, canvas.height)}`
}

// The area the text sits on: a dark calm area for light text, and the reverse.
const calmArea = (tone: TextTone) =>
  tone === 'light' ? 'an empty, calm, dark area' : 'an empty, calm, light area'

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// The image prompt's contract lines: the subject, then one sentence per region.
export function imageContractText(contract: Contract, size: SizeContract): string {
  const lines = [`Subject: ${size.subject}.`]
  for (const region of size.regions) {
    const where = capitalise(describeRegion(region.rect))
    lines.push(
      region.purpose === 'text'
        ? `${where} must be ${calmArea(contract.textTone)} with no detail.`
        : `${where} must be kept clear of the subject and of detail.`,
    )
  }
  return lines.join('\n')
}

// The design prompt's hero block (the image was KEPT): the cover-fit
// instruction, the text regions in percent and in canvas pixels, the tone and
// the no-scrim rule. The caller appends PRECEDENCE_LINE beside it.
export function designContractText(
  contract: Contract,
  size: SizeContract,
  canvas: { width: number; height: number },
  imageUrl: string,
): string {
  const text = size.regions.filter((r) => r.purpose === 'text')
  const tone = contract.textTone === 'light' ? 'white' : 'near-black #111111'
  return [
    `Background image: ${imageUrl}`,
    'Paint it as the full-canvas background with `background-size: cover; background-position: center`.',
    'Headline, body text and the logo go only inside these regions:',
    ...text.map(
      (r) =>
        `- ${describeRegion(r.rect)} (${describeRegionPx(r.rect, canvas)})${r.use ? `: ${r.use}` : ''}`,
    ),
    `Text colour: ${tone}.`,
    'No scrim or overlay: that is for the classic style only.',
  ].join('\n')
}

// The refine prompt's contract sentence, from the stamped version's regions.
export function refineContractText(opts: {
  label: string
  version: number
  size: SizeContract
}): string {
  const text = opts.size.regions
    .filter((r) => r.purpose === 'text')
    .map((r) => describeRegion(r.rect) + (r.use ? ` (${r.use})` : ''))
  const clear = opts.size.regions
    .filter((r) => r.purpose === 'clear')
    .map((r) => describeRegion(r.rect))
  let out = `This post uses the ${opts.label} layout (contract v${opts.version}). Keep headline, body text and the logo inside: ${text.join('; ')}.`
  if (clear.length > 0) out += ` Keep these regions of the background clear: ${clear.join('; ')}.`
  return out
}
