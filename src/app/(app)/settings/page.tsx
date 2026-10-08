'use client'

import { ClaudeTokenCard } from '@/components/settings/ClaudeTokenCard'
import { OpenAiKeyCard } from '@/components/settings/OpenAiKeyCard'
import { ChangePasswordCard } from '@/components/settings/ChangePasswordCard'
import { PageHead } from '@/components/team/folio'

// Self-service user settings: personal Claude/OpenAI credential connections
// plus account security. Team-wide settings (shared providers, channels,
// team Claude token, API keys) live at /team instead — this page is strictly
// per-user.
export default function SettingsPage() {
  return (
    <div className="max-w-3xl">
      <PageHead eyebrow="Account" title="Settings" lead="Your account and generation preferences." />

      <div className="flex flex-col gap-12">
        <ClaudeTokenCard numeral="i." />
        <OpenAiKeyCard numeral="ii." />
        <ChangePasswordCard numeral="iii." />
      </div>
    </div>
  )
}
