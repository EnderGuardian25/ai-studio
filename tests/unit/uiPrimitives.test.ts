import { describe, it, expect } from 'vitest'
import { createElement as h, type ComponentProps, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageHead, PageTitle } from '@/components/ui/PageHead'
import { SectionHead } from '@/components/ui/SectionHead'
import { Notice } from '@/components/ui/Notice'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { StatusChip } from '@/components/ui/StatusChip'
import { ModelPicker } from '@/components/ui/ModelPicker'
import { Select } from '@/components/ui/Select'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MODELS_QUERY_KEY } from '@/lib/hooks/useModels'
import { CATALOGUE, USER_SURFACES, isEligible, modelTier } from '@/lib/models/catalogue'
import type { ModelsView } from '@/lib/api-types'
import {
  EYEBROW,
  NOTICE,
  PAGE_LEAD,
  PAGE_TITLE,
  SECTION_HEAD,
  SUB_HEAD,
} from '@/components/ui/folio'

// AC-01 (014 FR-01, FR-03): the shared primitives render the elements, levels
// and attributes the screens rely on. Plain createElement, so this stays a
// .test.ts file with no JSX.

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length
// renderToStaticMarkup escapes the quotes inside class values (the opsz settings).
const attr = (s: string) => s.replace(/'/g, '&#x27;')

describe('PageHead', () => {
  it('renders one h1, with the eyebrow, lead and actions when given', () => {
    const html = renderToStaticMarkup(
      h(PageHead, {
        eyebrow: 'Overview',
        title: 'Dashboard',
        lead: 'The lead.',
        actions: h('button', null, 'New'),
        className: 'mb-8',
      }),
    )
    expect(count(html, /<h1\b/g)).toBe(1)
    expect(html).toContain(`<div class="${EYEBROW}">Overview</div>`)
    expect(html).toContain(`<h1 class="mt-2 ${attr(PAGE_TITLE)}">Dashboard</h1>`)
    expect(html).toContain(`<p class="${PAGE_LEAD}">The lead.</p>`)
    expect(html).toContain(
      '<div class="flex flex-wrap items-center gap-2"><button>New</button></div>',
    )
    expect(html).toMatch(
      /^<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">/,
    )
  })

  it('adds actionsClassName to the actions wrapper (the library search opt-in)', () => {
    const html = renderToStaticMarkup(
      h(PageHead, { title: 'Library', actions: h('input', null), actionsClassName: 'min-w-0' }),
    )
    expect(html).toContain('<div class="flex flex-wrap items-center gap-2 min-w-0"><input/></div>')
  })

  it('renders only the h1 when there is no eyebrow, lead or actions, and adds no margin', () => {
    const html = renderToStaticMarkup(h(PageHead, { title: 'Library' }))
    expect(count(html, /<h1\b/g)).toBe(1)
    expect(html).toContain(`<h1 class="${attr(PAGE_TITLE)}">Library</h1>`)
    expect(html).not.toContain('<p')
    expect(html).not.toContain(EYEBROW)
    expect(html).not.toMatch(/\bm[bt]-\d/)
  })
})

describe('PageTitle', () => {
  it('renders an h1 in the page-title style plus the caller classes', () => {
    const html = renderToStaticMarkup(
      h(PageTitle, { className: 'mb-10 break-words', children: 'Campaign' }),
    )
    expect(html).toBe(`<h1 class="${attr(PAGE_TITLE)} mb-10 break-words">Campaign</h1>`)
  })
})

describe('SectionHead', () => {
  it('renders an h2 by default, the numeral aria-hidden, and the id on the heading', () => {
    const html = renderToStaticMarkup(
      h(SectionHead, {
        title: 'Copy',
        numeral: '01',
        id: 'copy-head',
        className: 'mb-3',
        children: 'Saved',
      }),
    )
    expect(html).toContain(`<h2 id="copy-head" class="${attr(SECTION_HEAD)}">Copy</h2>`)
    expect(html).not.toContain('<h3')
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*">01<\/span>/)
    expect(html).toMatch(/^<div class="flex flex-wrap items-baseline gap-x-3\.5 gap-y-2 mb-3">/)
    expect(html).toContain(
      '<div class="ml-auto flex flex-wrap items-center justify-end gap-x-3.5 gap-y-1 text-ui-xs">Saved</div>',
    )
  })

  it('renders an h3 in the sub-head style with level={3}, and no numeral or tail when not given', () => {
    const html = renderToStaticMarkup(h(SectionHead, { title: 'Colours', level: 3 }))
    expect(html).toBe(
      `<div class="flex flex-wrap items-baseline gap-x-3.5 gap-y-2"><h3 class="${SUB_HEAD}">Colours</h3></div>`,
    )
  })
})

describe('Notice', () => {
  it('renders no role unless one is passed', () => {
    const html = renderToStaticMarkup(h(Notice, { tone: 'info', children: 'Heads up' }))
    expect(html).not.toContain('role=')
    expect(html).toBe(`<div class="${NOTICE} bg-accent/10 text-accent">Heads up</div>`)
  })

  it('passes role, data-* and aria-* through', () => {
    const props: ComponentProps<typeof Notice> & Record<`data-${string}`, string> = {
      tone: 'warning',
      role: 'status',
      'data-testid': 'background-notice',
      'data-reason': 'no-provider',
      'aria-live': 'polite',
      className: 'mt-4',
      children: 'Skipped',
    }
    const html = renderToStaticMarkup(h(Notice, props))
    expect(html).toContain('role="status"')
    expect(html).toContain('data-testid="background-notice"')
    expect(html).toContain('data-reason="no-provider"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain(`class="${NOTICE} bg-status-scheduled/10 text-status-scheduled mt-4"`)
  })

  it('maps each tone to its colours; neutral drops the currentColor ring for a --line one', () => {
    const error = renderToStaticMarkup(h(Notice, { tone: 'error', role: 'alert', children: 'x' }))
    expect(error).toContain('bg-status-failed/10 text-status-failed')
    expect(error).toContain('role="alert"')
    const neutral = renderToStaticMarkup(h(Notice, { tone: 'neutral', children: 'x' }))
    expect(neutral).toContain('bg-surface text-fg shadow-[inset_0_0_0_1px_rgb(var(--line))]')
    expect(neutral).not.toContain('currentColor')
  })

  it('lays out an icon and a flexible body in a row', () => {
    const html = renderToStaticMarkup(
      h(Notice, { tone: 'warning', icon: h('svg', { 'aria-hidden': true }), children: 'Body' }),
    )
    expect(html).toContain('flex items-start gap-2')
    expect(html).toContain('<svg aria-hidden="true"></svg><div class="min-w-0 flex-1">Body</div>')
  })
})

describe('FieldLabel', () => {
  it('renders a <label for> with htmlFor, in the eyebrow style plus block', () => {
    const html = renderToStaticMarkup(
      h(FieldLabel, { htmlFor: 'topic', className: 'mb-2.5', children: 'Topic' }),
    )
    expect(html).toBe(`<label for="topic" class="${EYEBROW} block mb-2.5">Topic</label>`)
  })

  it('renders a <span> with as="span", keeping the id', () => {
    const html = renderToStaticMarkup(
      h(FieldLabel, { as: 'span', id: 'size-label', children: 'Size' }),
    )
    expect(html).toBe(`<span id="size-label" class="${EYEBROW} block">Size</span>`)
  })
})

describe('StatusChip', () => {
  const BASE =
    'inline-flex items-center h-[22px] px-2 rounded-ui-sm flex-shrink-0 whitespace-nowrap font-text text-ui-2xs font-semibold uppercase tracking-[0.14em] shadow-[inset_0_0_0_1px_currentColor]'

  // createElement reads only the last overload (the status one); JSX resolves
  // both. So the tone case names its own signature, which tsc checks against
  // StatusChip's overloads.
  const ToneChip: (props: { tone: 'published'; children: string }) => ReactElement = StatusChip

  it('renders the children text in the tone classes', () => {
    const html = renderToStaticMarkup(h(ToneChip, { tone: 'published', children: 'Connected' }))
    expect(html).toBe(
      `<span class="${BASE} bg-status-published/10 text-status-published">Connected</span>`,
    )
  })

  it('keeps the status path: its label and colours, plus the two no-wrap utilities', () => {
    const html = renderToStaticMarkup(h(StatusChip, { status: 'unfinished', className: 'x' }))
    expect(html).toBe(
      `<span class="${BASE} bg-status-scheduled/10 text-status-scheduled x">Unfinished</span>`,
    )
  })
})

// 008 FR-18, FR-22: the shared model picker. The models view is seeded into
// the React Query cache under the key useModels() reads, so the real component
// renders with no fetch. Its rules are pickerState.ts's (modelPicker.test.ts).
describe('ModelPicker', () => {
  const view = (over: Partial<ModelsView> = {}): ModelsView => ({
    catalogue: CATALOGUE.map((e) => ({
      key: e.key,
      displayName: e.displayName,
      tier: modelTier(e),
      speed: e.speed,
      surfaces: USER_SURFACES.filter((s) => isEligible(e, s)),
      personalTokenGated: e.personalTokenGated,
    })),
    allowed: ['HAIKU', 'SONNET', 'OPUS'],
    defaults: {},
    gateOn: false,
    mode: 'api',
    credential: 'n/a',
    envDefault: null,
    captionProviderIsClaude: true,
    ...over,
  })
  const render = (
    props: Partial<ComponentProps<typeof ModelPicker>>,
    models: ModelsView | null = view(),
  ) => {
    const client = new QueryClient()
    if (models) client.setQueryData(MODELS_QUERY_KEY, models)
    return renderToStaticMarkup(
      h(
        QueryClientProvider,
        { client },
        h(ModelPicker, { surface: 'CAPTION', value: undefined, onChange: () => {}, ...props }),
      ),
    )
  }

  it('names the select by its FieldLabel and describes it by the hint line', () => {
    const html = render({ id: 'li-model', label: 'LinkedIn caption model' })
    expect(html).toContain(
      `<label for="li-model" class="${EYEBROW} block">LinkedIn caption model</label>`,
    )
    expect(html).toMatch(/<select id="li-model" [^>]*aria-describedby="li-model-hint"/)
    expect(html).toContain(
      '<div id="li-model-hint" class="font-text text-ui-xs text-fg-muted"><p>Default</p></div>',
    )
    expect(count(html, /<option /g)).toBe(3)
    expect(html).toContain('<option value="HAIKU" selected="">Haiku 4.5 · $ (fast)</option>')
  })

  it('defaults the accessible name to "Model", and pre-selects from the stamp', () => {
    const html = render({ id: 'm', context: { stamp: 'claude-sonnet-5-5' } })
    expect(html).toContain(`<label for="m" class="${EYEBROW} block">Model</label>`)
    expect(html).toContain('<option value="SONNET" selected="">')
    expect(html).toContain('<p>Same model as the current caption</p>')
  })

  it('shows the user pick, and drops the pre-selection hint once there is one (A5)', () => {
    const html = render({ id: 'm', value: 'OPUS' })
    expect(html).toContain('<option value="OPUS" selected="">')
    expect(html).not.toContain('<p>Default</p>')
    expect(html).not.toContain('aria-describedby')
  })

  it('is disabled while an action is pending', () => {
    expect(render({ id: 'm', disabled: true })).toMatch(/<select id="m" [^>]*disabled=""/)
  })

  it('shows one model as plain text, with no select', () => {
    const html = render({ id: 'm' }, view({ allowed: ['HAIKU'] }))
    expect(html).not.toContain('<select')
    expect(html).toContain('<p class="font-text text-ui-sm text-fg">Model: Haiku 4.5</p>')
  })

  it('renders nothing for CAPTION when the caption provider is not Claude, or before the view loads', () => {
    expect(render({}, view({ captionProviderIsClaude: false }))).toBe('')
    expect(render({ captionProviderIsClaude: false })).toBe('')
    expect(render({}, null)).toBe('')
    expect(render({ surface: 'REFINE' }, view({ captionProviderIsClaude: false }))).toContain(
      '<select',
    )
  })

  it('shows the team-token notice as a status in CLI mode on the team token for Opus (FR-22)', () => {
    const cliTeam = view({ mode: 'cli', credential: 'team' })
    const html = render({ surface: 'REFINE', value: 'OPUS' }, cliTeam)
    expect(html).toContain('role="status"')
    expect(html).toContain('This run uses your team&#x27;s Claude allowance.')
    expect(render({ surface: 'REFINE', value: 'SONNET' }, cliTeam)).not.toContain('role="status"')
  })

  it('with the switch on, leaves Opus out and names Settings in the hint (FR-22)', () => {
    const html = render(
      { surface: 'REFINE' },
      view({ mode: 'cli', credential: 'team', gateOn: true }),
    )
    expect(html).not.toContain('value="OPUS"')
    expect(html).toContain(
      '<p>Opus requires a personal Claude token on this team — connect one in Settings</p>',
    )
  })

  it('announces a refused pick: the error joins aria-describedby beside the hint, and the select is invalid', () => {
    const html = render({ id: 'm', note: 'Reset.', error: "Opus 5.5 isn't allowed on this team" })
    expect(html).toContain('<p>Reset.</p>')
    expect(html).toMatch(
      /<select id="m" [^>]*aria-describedby="m-hint m-error" aria-invalid="true"/,
    )
    expect(html).toContain(
      '<p id="m-error" class="font-text text-ui-xs text-status-failed">Opus 5.5 isn&#x27;t allowed on this team</p>',
    )
  })

  it('with no error, the select is neither invalid nor described by an error', () => {
    const html = render({ id: 'm' })
    expect(html).not.toContain('aria-invalid')
    expect(html).not.toContain('m-error')
  })

  it('shows the pre-selection, not a pick that is no longer offered', () => {
    const html = render(
      { id: 'm', surface: 'REFINE', value: 'OPUS' },
      view({ allowed: ['HAIKU', 'SONNET'] }),
    )
    expect(html).not.toContain('value="OPUS"')
    expect(html).toContain('<option value="SONNET" selected="">')
  })
})

// The Select primitive, for the additive error wiring above (008 T14 review NOTE 2).
describe('Select', () => {
  it('describes the select by its error and marks it invalid, keeping the caller describedby', () => {
    const html = renderToStaticMarkup(
      h(Select, { id: 's', label: 'L', options: [], error: 'Bad', 'aria-describedby': 'help' }),
    )
    expect(html).toMatch(/<select id="s" [^>]*aria-describedby="help s-error" aria-invalid="true"/)
    expect(html).toContain(
      '<p id="s-error" class="font-text text-ui-xs text-status-failed">Bad</p>',
    )
  })

  it('without an error renders as before: no aria-invalid, the caller describedby only', () => {
    const plain = renderToStaticMarkup(h(Select, { id: 's', label: 'L', options: [] }))
    expect(plain).not.toContain('aria-invalid')
    expect(plain).not.toContain('aria-describedby')
    const described = renderToStaticMarkup(
      h(Select, { id: 's', label: 'L', options: [], 'aria-describedby': 'help' }),
    )
    expect(described).toMatch(/aria-describedby="help"/)
  })
})
