// The public surface of post styles (027). The raw `styles` record is NOT
// exported here: a guard test bans importing `postStyles/styles` outside this
// directory, so every reader goes through the resolver (T2).
export * from './types'
export { activeStyles, getStyle, isStyleKey, POST_STYLES_REVISION } from './styles'
