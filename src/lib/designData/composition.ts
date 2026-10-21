// The design-data module's composition section: the archetype records.
//
// One idea (009 design.md section 1): the layout contract is data, and every
// reader (the image prompt, the design prompt, the pixel check, the layout
// observation, the refine prompt and the stamp) reads this one copy. Nothing a
// model returns can supply or move a region (NFR-02).
//
// Pure and client-safe: no prisma, minio, env, fs or puppeteer import (a guard
// test enforces it). `AspectRatio` is a type-only import, as in aspectRatio.ts.
import type { AspectRatio } from '@prisma/client'

export type TextTone = 'light' | 'dark'
// 'composite' arrives with Phase 2 as a new literal here: no schema change.
export type Purpose = 'text' | 'clear'
export type ArchetypeKey = 'product-showcase' | 'editorial-split'

// Canvas percent, 0 to 100.
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface Region {
  rect: Rect
  purpose: Purpose
  minAreaPct: number
}
export interface SizeContract {
  // What the image model is asked to draw at this size (the image prompt).
  // Per size, because a stacked PORTRAIT layout puts the subject elsewhere.
  subject: string
  regions: readonly Region[]
}
export interface Contract {
  role: 'hero'
  textTone: TextTone
  // An archetype declares only the sizes it supports.
  sizes: Partial<Record<AspectRatio, SizeContract>>
}
export interface Archetype {
  key: ArchetypeKey
  label: string
  summary: string
  status: 'active' | 'retired'
  current: number
  // Immutable: deep-frozen at module load. A change adds versions[n+1] and
  // moves `current`; an existing version is never edited.
  versions: Readonly<Record<number, Contract>>
}
export type ArchetypeMap = Readonly<Record<string, Archetype>>

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v)
  }
  return value
}

const textRegion = (x: number, y: number, w: number, h: number): Region => ({
  rect: { x, y, w, h },
  purpose: 'text',
  minAreaPct: 20,
})

// Both archetypes are dark-area, light-text at version 1; a light-area variant
// is a later contract version. STORY is absent from both (unsupported). The
// PORTRAIT rows are stacked layouts written on their own, not scaled copies.
export const archetypes: ArchetypeMap = deepFreeze({
  'product-showcase': {
    key: 'product-showcase',
    label: 'Product showcase',
    summary: 'A device or object as the hero, text on a calm dark area beside it.',
    status: 'active',
    current: 1,
    versions: {
      1: {
        role: 'hero',
        textTone: 'light',
        sizes: {
          SQUARE: {
            subject: 'a device or object as the hero subject in the right 55%, lit with depth',
            regions: [textRegion(0, 0, 45, 100)],
          },
          PORTRAIT: {
            subject: 'the same subject in the lower 62%',
            regions: [textRegion(0, 0, 100, 38)],
          },
        },
      },
    },
  },
  'editorial-split': {
    key: 'editorial-split',
    label: 'Editorial split',
    summary: 'A photographic scene on one side, fading softly into a flat area for the text.',
    status: 'active',
    current: 1,
    versions: {
      1: {
        role: 'hero',
        textTone: 'light',
        sizes: {
          SQUARE: {
            subject:
              'a photographic scene confined to the right 40%, fading softly into the flat area across the 50 to 60% strip',
            regions: [textRegion(0, 0, 50, 100)],
          },
          PORTRAIT: {
            subject: 'a photographic scene confined to the bottom 40%, fading across the 50 to 60% strip',
            regions: [textRegion(0, 0, 100, 50)],
          },
        },
      },
    },
  },
} satisfies Record<ArchetypeKey, Archetype>)

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

// A key that is in the dataset, retired or not. Null for anything else
// (including 'classic', which has no entry, and prototype names).
export function getArchetype(key: string, source: ArchetypeMap = archetypes): Archetype | null {
  return has(source, key) ? source[key] : null
}

export function isActiveKey(key: string, source: ArchetypeMap = archetypes): boolean {
  return getArchetype(key, source)?.status === 'active'
}

// The exact immutable contract for a stamped (key, version, size), for any key
// including a retired one. Null when any part does not resolve.
export function contractAt(
  key: string,
  version: number,
  size: AspectRatio,
  source: ArchetypeMap = archetypes
): SizeContract | null {
  const archetype = getArchetype(key, source)
  if (!archetype || !has(archetype.versions, String(version))) return null
  const sizes = archetype.versions[version].sizes
  return has(sizes, size) ? (sizes[size] ?? null) : null
}

// The whole versioned contract (the tone lives on it), or null.
export function contractVersionOf(
  key: string,
  version: number,
  source: ArchetypeMap = archetypes
): Contract | null {
  const archetype = getArchetype(key, source)
  return archetype && has(archetype.versions, String(version)) ? archetype.versions[version] : null
}

export const FALLBACK_STYLE_LABEL = 'that image style'

// The archetype's label (a retired key still has one), else a neutral phrase.
export function styleLabel(key: string, source: ArchetypeMap = archetypes): string {
  return getArchetype(key, source)?.label ?? FALLBACK_STYLE_LABEL
}

export interface ImageStyleOption {
  key: string
  label: string
  summary: string
}

// The wizard's picker source: classic first, then the active archetypes only.
export const IMAGE_STYLES: readonly ImageStyleOption[] = deepFreeze([
  { key: 'classic', label: 'Classic', summary: 'The standard post design.' },
  ...Object.values(archetypes)
    .filter((a) => a.status === 'active')
    .map((a) => ({ key: a.key, label: a.label, summary: a.summary })),
])

// Each style with whether the chosen size supports it (classic always does).
export function imageStyleOptions(
  aspectRatio: AspectRatio,
  source: ArchetypeMap = archetypes
): Array<ImageStyleOption & { supported: boolean }> {
  return IMAGE_STYLES.map((s) => {
    const current = getArchetype(s.key, source)?.current ?? 0
    return { ...s, supported: s.key === 'classic' || contractAt(s.key, current, aspectRatio, source) !== null }
  })
}
