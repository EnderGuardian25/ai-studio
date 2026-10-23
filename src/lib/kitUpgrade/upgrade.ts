// The core of POST /api/admin/brandkits/[id]/prompts/upgrade (007 FR-05, FR-06,
// FR-10, FR-11, FR-17). The route loads the kit and checks the base version;
// this module takes the kit as an argument, so it imports no kit loader. One
// model call, no retry. The model proposes wording only: quote, kind, entry key
// and provenance come from the detector and the dataset (validateProposals).
import { z } from 'zod'
import {
  buildRoleList,
  detectVagueDesign,
  getEntry,
  validateProposals,
  type AuthoringEntry,
  type Candidate,
  type Edit,
  type Rejection,
  type RoleKit,
} from '@/lib/designData/authoring'
import { extractFencedJson } from '@/lib/agent/fencedBlock'
import { pipelineMode } from '@/lib/agent/config'
import { resolveAssistantModel, runBriefingModel } from '@/lib/campaign/briefingAssistant'
import { modelCallFor, recordModelCall } from '@/lib/models/modelCalls'
import type { ResolvedModel } from '@/lib/models/resolve'
import { MOCK_AI, buildMockKitUpgradeReply } from '@/lib/testHooks'
import { buildUpgradePrompt, type UpgradePrompt } from './prompt'

const MAX_TOKENS = 2048
const RAW_LOG_CHARS = 2000

const replySchema = z.array(z.object({ candidateId: z.string(), replacement: z.string() }))

export type UpgradeResult =
  | { status: 'edits'; edits: Edit[]; rejected: Rejection[]; candidates: number }
  | {
      status: 'none'
      reason: 'no-candidates' | 'model-proposed-none' | 'all-rejected'
      rejected: Rejection[]
      candidates: number
    }
  | { status: 'parse-failed'; reason: 'missing' | 'invalid-json' | 'schema' }

export type CallModel = (prompt: UpgradePrompt, model: ResolvedModel) => Promise<string>

export interface RunKitUpgradeInput {
  kit: RoleKit & { id: string }
  text: string
  teamId: string
  userId: string | null
  /** Injected in unit tests; the default is the shared assistant text call. */
  callModel?: CallModel
}

const defaultCall =
  (teamId: string): CallModel =>
  (prompt, model) =>
    runBriefingModel(prompt.system, [{ role: 'user', content: prompt.user }], teamId, model, {
      maxTokens: MAX_TOKENS,
      label: 'kit-upgrade',
    })

function logCall(
  input: RunKitUpgradeInput,
  candidates: Candidate[],
  edits: number,
  rejected: number,
): void {
  const entries = [...new Set(candidates.map((c) => c.entryKey))].join(',')
  console.log(
    `[kit-upgrade] team=${input.teamId} kit=${input.kit.id} candidates=${candidates.length} edits=${edits} rejected=${rejected} entries=${entries}`,
  )
}

export async function runKitUpgrade(input: RunKitUpgradeInput): Promise<UpgradeResult> {
  const { candidates } = detectVagueDesign(input.text)
  if (candidates.length === 0) {
    logCall(input, candidates, 0, 0)
    return { status: 'none', reason: 'no-candidates', rejected: [], candidates: 0 }
  }

  const model = await resolveAssistantModel('ASSISTANT_BRANDKIT', input.teamId, input.userId)

  let reply: string
  if (MOCK_AI) {
    recordModelCall(modelCallFor(model, pipelineMode(), 'kit-upgrade'))
    reply = buildMockKitUpgradeReply(
      candidates.map((c) => ({
        id: c.id,
        mockReplacement: getEntry(c.entryKey)?.mockReplacement ?? '',
      })),
      input.text,
    )
  } else {
    const pairs = candidates.flatMap((candidate) => {
      const entry: AuthoringEntry | undefined = getEntry(candidate.entryKey)
      return entry ? [{ candidate, entry }] : []
    })
    const prompt = buildUpgradePrompt({
      candidates: pairs,
      roles: buildRoleList(input.kit),
      text: input.text,
    })
    reply = await (input.callModel ?? defaultCall(input.teamId))(prompt, model)
  }

  const parsed = extractFencedJson(reply, 'kitedits', replySchema)
  if (!parsed.ok) {
    const raw = reply.slice(0, RAW_LOG_CHARS).replace(/\r\n|\r|\n/g, '\\n')
    console.log(
      `[kit-upgrade] parse-failed team=${input.teamId} kit=${input.kit.id} reason=${parsed.reason} reply=${raw}`,
    )
    return { status: 'parse-failed', reason: parsed.reason }
  }

  const { edits, rejected } = validateProposals(candidates, parsed.data, input.kit, input.text)
  logCall(input, candidates, edits.length, rejected.length)

  if (edits.length > 0) {
    return { status: 'edits', edits, rejected, candidates: candidates.length }
  }
  return {
    status: 'none',
    reason: parsed.data.length === 0 ? 'model-proposed-none' : 'all-rejected',
    rejected,
    candidates: candidates.length,
  }
}
