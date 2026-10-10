import OpenAI from "openai"
import type { BriefInput, CopyProvider } from "../../interfaces/CopyProvider"
import type { CaptionTarget } from "@/lib/channels"
import { buildCaptionPrompt, CAPTION_MAX_TOKENS } from "@/lib/agent/prompts/caption"

export class OpenAICopyProvider implements CopyProvider {
  private client: OpenAI

  constructor(apiKey: string, private model = "gpt-4o") {
    this.client = new OpenAI({ apiKey })
  }

  async generateCaptions(brief: BriefInput, targets: readonly CaptionTarget[]): Promise<string> {
    const prompt = buildCaptionPrompt(brief, targets)

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: CAPTION_MAX_TOKENS,
      temperature: 0.7,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error("OpenAI returned an empty response")
    }
    return content
  }
}
