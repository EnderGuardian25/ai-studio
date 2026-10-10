import Anthropic from "@anthropic-ai/sdk"
import type { BriefInput, CopyProvider } from "../../interfaces/CopyProvider"
import type { CaptionTarget } from "@/lib/channels"
import { buildCaptionPrompt, CAPTION_MAX_TOKENS } from "@/lib/agent/prompts/caption"

export class AnthropicCopyProvider implements CopyProvider {
  private client: Anthropic

  constructor(apiKey: string, private model = "claude-haiku-4-5-20251001") {
    this.client = new Anthropic({ apiKey })
  }

  async generateCaptions(brief: BriefInput, targets: readonly CaptionTarget[]): Promise<string> {
    const prompt = buildCaptionPrompt(brief, targets)

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: CAPTION_MAX_TOKENS,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    })

    const block = response.content[0]
    if (!block || block.type !== "text") {
      throw new Error("Anthropic returned an empty response")
    }
    return block.text
  }
}
