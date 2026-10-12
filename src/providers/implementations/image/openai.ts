import OpenAI from "openai"
import type { ImageProvider } from "../../interfaces/ImageProvider"
import { IMAGE_GENERATION_TIMEOUT_MS } from "../../imageCapabilities"

export class OpenAIImageProvider implements ImageProvider {
  readonly providerName = "openai" as const
  private client: OpenAI

  constructor(apiKey: string, private model = "gpt-image-2") {
    // Bounded (008 FR-12): the SDK default is a 10-minute timeout with 2
    // retries, which no action budget could absorb. One attempt, 120 s.
    this.client = new OpenAI({ apiKey, timeout: IMAGE_GENERATION_TIMEOUT_MS, maxRetries: 0 })
  }

  async generateImage(prompt: string, _brandKitId?: string, size?: string): Promise<{ url: string }> {
    const response = await this.client.images.generate({
      model: this.model,
      prompt,
      n: 1,
      // gpt-image sizes: 1024x1024, 1536x1024, 1024x1536. The design layer
      // cover-crops, so an exact post-ratio match isn't required.
      size: (size ?? "1024x1024") as "1024x1024",
    })

    const b64 = response.data?.[0]?.b64_json
    if (!b64) {
      throw new Error(
        `OpenAI image generation returned no b64_json for model "${this.model}"`
      )
    }

    return { url: `data:image/png;base64,${b64}` }
  }
}
