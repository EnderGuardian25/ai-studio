// The carrier for an action's analytics fields (006 design "Draft actions").
// A plain mutable object the route creates, passes to startDraftAction and
// closes over in its `work`; no ambient state. (The token-usage accumulator is
// a later wave and lives beside this type.)
import type { EventPayloadInput } from './catalogue'

export type DraftActionPayload = EventPayloadInput<'draft_action.settled'>

export interface ActionTrace {
  /** Epoch ms; startDraftAction sets it at entry. */
  startedAt: number
  /** Set by the refine conflict sink so the settle reports `conflict`. */
  outcome?: 'conflict'
  fields: Partial<DraftActionPayload>
}

export function newActionTrace(): ActionTrace {
  return { startedAt: Date.now(), fields: {} }
}
