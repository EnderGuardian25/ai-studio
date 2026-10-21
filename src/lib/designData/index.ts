// The design-data module. `designData` is the one object 007 extends with its
// own sections (typography, kit rules) beside `composition`; neither section
// knows the other's contents. Pure and client-safe (see composition.ts).
import { archetypes } from './composition'

export const designData = { composition: { archetypes } } as const

export * from './composition'
export * from './regions'
export * from './evaluate'
export * from './layout'
export * from './plan'
export * from './stamp'
export * from './promptText'
