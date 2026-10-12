import Anthropic from "@anthropic-ai/sdk"
import type { BriefInput, CaptionReply, CopyProvider } from "../../interfaces/CopyProvider"
import type { CaptionTarget } from "@/lib/channels"
import type { ResolvedModel } from "@/lib/models/resolve"
import { createMessage, textOf } from "@/lib/models/anthropicCall"
import { buildCaptionPrompt, CAPTION_MAX_TOKENS } from "@/lib/agent/prompts/caption"

export class AnthropicCopyProvider implements CopyProvider {
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async generateCaptions(
    brief: BriefInput,
    targets: readonly CaptionTarget[],
    model: ResolvedModel,
  ): Promise<CaptionReply> {
    const prompt = buildCaptionPrompt(brief, targets)

    // 008 FR-07: through the one SDK boundary. The reply is read by block type
    // (textOf), never content[0] — a thinking model's first block is not text.
    const response = await createMessage(
      this.client,
      {
        max_tokens: CAPTION_MAX_TOKENS,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      },
      model,
      { label: "copy" },
    )

    const text = textOf(response)
    if (!text) {
      throw new Error("Anthropic returned an empty response")
    }
    return { raw: text, modelId: model.arg }
  }
}
