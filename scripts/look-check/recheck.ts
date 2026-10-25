// 025 OP-025 recheck (Amendment A1): re-judge the saved probe renders with the SHIPPED check.
//
// Run through the runner, which spawns this with tsx:
//   node scripts/look-check/run-look-check.mjs --probe --recheck [--out <dir>]
// or directly:
//   npx tsx scripts/look-check/recheck.ts --out .specclaw/changes/025-hero-reference-images/look-check
//
// No network call and no image call: each render is decoded in the local Chromium (the sampler's
// page blocks every request but data: URLs) and judged by runHeroCheck, the same function the app
// runs. For every result in results.json that has a `render`, it writes
//   recheck: { styleKept, fallbackReason, rect }
// and it writes recheck.html next to results.json: each render with the detected rect drawn on it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dimensionsFor } from '@/lib/aspectRatio'
import { compositeRegionOf, coverFit, planComposition, type Rect } from '@/lib/designData'
import { runHeroCheck } from '@/lib/renderer/heroCheck'

interface ProbeResult {
  slot: string
  attempt: number
  render?: string | null
  styleKept?: boolean
  fallbackReason?: string | null
  recheck?: { styleKept: boolean; fallbackReason: string | null; rect: Rect | null }
  [k: string]: unknown
}

// The mock seams return a synthetic flat screen, which would pass every render: refuse to run.
if (process.env.MOCK_PUPPETEER === 'true' || process.env.MOCK_AI === 'true') {
  console.error('recheck refuses to run with MOCK_PUPPETEER or MOCK_AI set: unset them and use a plain shell')
  process.exit(2)
}

const argv = process.argv.slice(2)
const outIdx = argv.indexOf('--out')
const out = outIdx >= 0 ? argv[outIdx + 1] : '.specclaw/changes/025-hero-reference-images/look-check'
if (!out) {
  console.error('--out <dir> is required')
  process.exit(1)
}
const resultsPath = join(out, 'results.json')
if (!existsSync(resultsPath)) {
  console.error(`no results.json in ${out}`)
  process.exit(1)
}

// PNG width and height, from the IHDR chunk.
function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const box = (r: { l: number; t: number; w: number; h: number }, css: string, label = '') =>
  `<div style="position:absolute;left:${r.l}%;top:${r.t}%;width:${r.w}%;height:${r.h}%;${css}" title="${esc(label)}"></div>`

async function main() {
  const results: ProbeResult[] = JSON.parse(readFileSync(resultsPath, 'utf8'))
  const cards: string[] = []

  for (const r of results) {
    if (!r.render) continue
    const [key, sizeRaw] = r.slot.split(':')
    const size = sizeRaw as 'SQUARE' | 'PORTRAIT' | 'STORY'
    const plan = planComposition({ imageStyle: key, aspectRatio: size, hasCompositeSource: true })
    const file = join(out, 'renders', r.render)
    if (plan.kind !== 'hero' || !existsSync(file)) {
      console.log(`${r.slot}#${r.attempt}: skipped (${plan.kind !== 'hero' ? 'not a hero look' : 'render file missing'})`)
      continue
    }
    const bytes = readFileSync(file)
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`
    const logs: string[] = []
    const check = await runHeroCheck(dataUrl, plan, { log: (m) => logs.push(m) })
    const rect = check.ok ? (check.composites?.[0]?.rect ?? null) : null
    r.recheck = { styleKept: check.ok === true, fallbackReason: check.ok ? null : check.reason, rect }
    console.log(
      `${r.slot}#${r.attempt}: ${check.ok ? 'kept' : `fell back (${check.reason})`}` +
        (rect ? ` rect x ${rect.x}, y ${rect.y}, w ${rect.w}, h ${rect.h}` : '') +
        (logs.length ? ` [${logs.join('; ')}]` : ''),
    )

    // Draw on the image: canvas percent to image percent through the cover fit the check used.
    const canvas = dimensionsFor(size)
    const png = pngSize(bytes)
    let overlay = ''
    if (png) {
      const fit = coverFit({ w: canvas.width, h: canvas.height }, png)
      const toImg = (c: Rect) => ({
        l: ((c.x * canvas.width) / 100 - fit.offset.x) / fit.scaled.w * 100,
        t: ((c.y * canvas.height) / 100 - fit.offset.y) / fit.scaled.h * 100,
        w: ((c.w * canvas.width) / 100) / fit.scaled.w * 100,
        h: ((c.h * canvas.height) / 100) / fit.scaled.h * 100,
      })
      for (const reg of plan.sizeContract.regions) {
        if (reg.purpose === 'text') overlay += box(toImg(reg.rect), 'border:2px dotted #f5a623;box-sizing:border-box', 'text region')
      }
      const target = compositeRegionOf(plan.sizeContract)
      if (target) overlay += box(toImg(target.rect), 'border:2px dashed #4aa3ff;box-sizing:border-box', 'contract region (the target)')
      if (rect) overlay += box(toImg(rect), 'border:3px solid #ff2d55;box-sizing:border-box', 'detected screen')
    }
    cards.push(`<figure>
  <div class="img"><img src="renders/${esc(r.render)}" alt="${esc(r.slot)} attempt ${r.attempt}">${overlay}</div>
  <figcaption><b>${esc(r.slot)} #${r.attempt}</b><br>
  recheck: ${check.ok ? '<span class="ok">kept the look</span>' : `<span class="no">fell back: ${esc(check.reason)}</span>`}
  ${rect ? `<br>detected rect (canvas %): x ${rect.x}, y ${rect.y}, w ${rect.w}, h ${rect.h}` : ''}
  ${logs.length ? `<br><small>${esc(logs.join('; '))}</small>` : ''}
  <br><small>live response: styleKept ${esc(String(r.styleKept))}${r.fallbackReason ? `, ${esc(String(r.fallbackReason))}` : ''}</small></figcaption>
</figure>`)
  }

  writeFileSync(resultsPath, JSON.stringify(results, null, 2))
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>OP-025 recheck</title>
<style>
body{font:14px/1.4 system-ui,sans-serif;margin:16px;background:#111;color:#eee}
.grid{display:flex;flex-wrap:wrap;gap:20px}
figure{margin:0;width:420px}
.img{position:relative;line-height:0}
.img img{width:100%;display:block}
.ok{color:#4cd964}.no{color:#ff6b6b}
.key{margin-bottom:16px}
</style></head><body>
<h1>OP-025 recheck</h1>
<p class="key">Solid red: the screen the shipped detector found (where the screenshot would go).
Dashed blue: the contract region the prompt asked for. Dotted orange: the text band(s).
Give a verdict on each render that kept the look.</p>
<div class="grid">
${cards.join('\n')}
</div></body></html>`
  writeFileSync(join(out, 'recheck.html'), html)
  console.log(`wrote ${resultsPath} and ${join(out, 'recheck.html')}`)
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
