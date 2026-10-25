// The brief wizard's post-style state (027 FR-07). Pure and client-safe. The
// wizard keeps the user's own choices (the style, a tone they picked, an image
// style they picked) and asks `resolvePostStyle` for everything else, so the
// style -> tone / image style mapping lives in one place and a touched field is
// never overwritten.
import type { AspectRatio } from '@prisma/client'
import { resolvePostStyle, getStyle } from '@/lib/postStyles'
import { imageStyleOptions, type ArchetypeMap } from '@/lib/designData'

export const DEFAULT_POST_STYLE = 'general'

export interface WizardStyleInput {
  /** The chosen style key (may be a stale or unknown key; it falls to General). */
  postStyle: string
  campaign: { defaultPostStyle?: string | null; defaultTone?: string | null } | null
  designMode: 'TEMPLATE' | 'GENERATE'
  aspectRatio: AspectRatio
  /** The user's own tone and whether they changed it. */
  tone: string
  toneTouched: boolean
  /** The user's own image style and whether they changed it. */
  imageStyle: string
  imageStyleTouched: boolean
}

export interface WizardStyleView {
  postStyle: string
  goal: string
  tone: string
  imageStyle: string
  /** True when the image style shown is the style's own default, not the user's pick. */
  imageStyleFromStyle: boolean
  /** True when the tone shown is not the user's pick. */
  toneFromStyle: boolean
}

/** A stored or campaign key that is not in the dataset opens as General. */
export function knownStyleKey(key: string | null | undefined): string {
  return typeof key === 'string' && key.trim() && getStyle(key.trim()) ? key.trim() : DEFAULT_POST_STYLE
}

/** The style a campaign selects: its default if it resolves, else General. */
export function campaignStyleKey(campaign: { defaultPostStyle?: string | null } | null | undefined): string {
  return knownStyleKey(campaign?.defaultPostStyle)
}

export function resolveWizardStyle(i: WizardStyleInput): WizardStyleView {
  const key = knownStyleKey(i.postStyle)
  const r = resolvePostStyle({
    style: key,
    campaign: i.campaign,
    explicit: {
      tone: i.toneTouched ? i.tone : undefined,
      imageStyle: i.imageStyleTouched ? i.imageStyle : undefined,
    },
    path: i.designMode === 'TEMPLATE' ? 'A' : 'B',
    aspectRatio: i.aspectRatio,
    surface: 'wizard',
    // 025: the wizard cannot take a screenshot yet (T7), so a look that needs one is classic.
    hasCompositeSource: false,
  })
  if (!r.ok) {
    // knownStyleKey makes this unreachable; fail soft rather than throw in render.
    return {
      postStyle: DEFAULT_POST_STYLE,
      goal: 'awareness',
      tone: i.tone,
      imageStyle: 'classic',
      imageStyleFromStyle: false,
      toneFromStyle: false,
    }
  }
  return {
    postStyle: r.key,
    goal: r.goal,
    tone: r.tone,
    imageStyle: r.imageStyle,
    imageStyleFromStyle: !i.imageStyleTouched && r.imageStyle !== 'classic',
    toneFromStyle: !i.toneTouched,
  }
}

/** What POST /api/briefs gets: the style always, tone and image style only when touched. */
export function styleRequestFields(i: WizardStyleInput): {
  postStyle: string
  tone?: string
  imageStyle?: string
} {
  const out: { postStyle: string; tone?: string; imageStyle?: string } = {
    postStyle: knownStyleKey(i.postStyle),
  }
  if (i.toneTouched) out.tone = i.tone
  // A touched look is sent even when it is classic (the user chose it over the
  // style's default). Template briefs never carry one.
  if (i.imageStyleTouched && i.designMode === 'GENERATE') out.imageStyle = i.imageStyle
  return out
}

export interface StoredWizardStyle {
  postStyle?: string
  tone: string
  imageStyle?: string
}

/**
 * A resumed payload back to the wizard's own state. A stored tone or image style
 * counts as touched only if it differs from what the resolver would give, so a
 * resumed brief with untouched fields keeps following the style.
 */
export function resumeWizardStyle(
  stored: StoredWizardStyle,
  ctx: Pick<WizardStyleInput, 'campaign' | 'designMode' | 'aspectRatio'>,
): { postStyle: string; toneTouched: boolean; imageStyleTouched: boolean; imageStyle: string } {
  const postStyle = knownStyleKey(stored.postStyle)
  const base = resolveWizardStyle({
    ...ctx,
    postStyle,
    tone: stored.tone,
    toneTouched: false,
    imageStyle: 'classic',
    imageStyleTouched: false,
  })
  // An absent stored image style is classic (the autosave leaves classic out).
  const storedImage = stored.imageStyle ?? 'classic'
  return {
    postStyle,
    toneTouched: stored.tone !== base.tone,
    imageStyleTouched: storedImage !== base.imageStyle,
    imageStyle: storedImage,
  }
}

/**
 * The image style to keep after a size change: the current pick if the new size
 * supports it, else classic (and the pick is dropped, untouched).
 */
export function styleAfterSizeChange(
  imageStyle: string,
  size: AspectRatio,
  looks?: ArchetypeMap,
): { imageStyle: string; reset: boolean } {
  const supported = imageStyleOptions(size, looks).find((o) => o.key === imageStyle)?.supported
  return supported ? { imageStyle, reset: false } : { imageStyle: 'classic', reset: true }
}
