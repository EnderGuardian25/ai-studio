import type { BriefInput, CopyProvider } from "../../interfaces/CopyProvider"
import { runClaudeCli } from "@/lib/agent/claudeCli"
import type { CaptionTarget } from "@/lib/channels"
import { buildCaptionPrompt } from "@/lib/agent/prompts/caption"

// Copy provider backed by the local Claude Code CLI (`claude -p`). Activated in
// CLI mode (DESIGN_PROVIDER=cli) so captions can be generated without an API key.
export class ClaudeCliCopyProvider implements CopyProvider {
  async generateCaptions(brief: BriefInput, targets: readonly CaptionTarget[]): Promise<string> {
    const prompt = buildCaptionPrompt(brief, targets)

    const text = await runClaudeCli(`${prompt.system}\n\n${prompt.user}`, {
      timeoutMs: 120_000,
      label: "copy",
    })
    if (!text) throw new Error("Claude CLI returned an empty caption reply")
    return text
  }
}
