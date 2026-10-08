'use client'

import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, ToggleLeft, ToggleRight, Star, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Panel'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { QueryError } from '@/components/ui/QueryError'
import { TeamClaudeTokenCard } from '@/components/team/TeamClaudeTokenCard'
import { ApiKeysCard } from '@/components/team/ApiKeysCard'
import {
  BLOCK,
  FOCUS,
  GateNotice,
  GROUP_HEAD,
  ICON,
  ICON_BUTTON,
  ICON_SM,
  PageHead,
  ROW,
  SectionHead,
  SMALL_CAPS,
  StatusWord,
  SUB_HEAD,
  TAG,
  WARN_NOTICE,
} from '@/components/team/folio'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { pickServingImageProvider } from '@/providers/imageCapabilities'
import type { AdminProvider as Provider, ProviderSlot, ChannelStatus, ChannelMap } from '@/lib/api-types'

// Team settings: AI providers + social channels (moved here from the old
// /admin/settings tab page — the routes are team-scoped, and every setting
// here now applies to the whole team, so it belongs beside the team's Claude
// token and API keys rather than under /admin). Gated on isTeamAdmin, not
// app-role admin: a team's own admin manages it regardless of app role.

// lucide-react 1.x removed brand icons — inline equivalents (stroke style
// matches lucide so they sit naturally beside the other icons).
function InstagramIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

function LinkedinIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectProvider(key: string): { name: string; label: string } | null {
  if (key.startsWith('sk-ant-')) return { name: 'anthropic', label: 'Claude (Anthropic)' }
  if (key.startsWith('sk-')) return { name: 'openai', label: 'GPT (OpenAI)' }
  if (key.startsWith('AIza')) return { name: 'gemini', label: 'Gemini (Google)' }
  return null
}

const DETECTED_NAMES: Record<string, string> = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' }

function maskKey(prefix: string) {
  return `${prefix}••••••••`
}

// ─── Register Provider Form ───────────────────────────────────────────────────

function RegisterForm({ onSuccess, allowCopySlot }: { onSuccess: () => void; allowCopySlot: boolean }) {
  const [apiKey, setApiKey] = useState('')
  // In CLI mode there is no COPY slot to choose — copy runs on the Claude OAuth
  // chain, so IMAGE is the only registrable slot and the toggle is hidden.
  const [slot, setSlot] = useState<ProviderSlot>(allowCopySlot ? 'COPY' : 'IMAGE')
  const [providerName, setProviderName] = useState('')
  const [label, setLabel] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const detected = detectProvider(apiKey)
  const isUnknown = apiKey.length > 4 && !detected

  async function register() {
    setError('')
    setLoading(true)
    try {
      const body: Record<string, unknown> = { apiKey, slot }
      if (isUnknown) { body.providerName = providerName; body.label = label }
      await apiFetch('/api/admin/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setApiKey(''); setProviderName(''); setLabel('')
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Panel className="space-y-4 p-5">
      <h3 className={SUB_HEAD}>Register new provider</h3>

      <div className="space-y-3">
        <div className="relative">
          <Input
            className="pr-11"
            type={showKey ? 'text' : 'password'}
            placeholder={allowCopySlot ? 'API key (sk-ant-…, sk-…, or AIza… Gemini for images)' : 'Image API key (sk-… OpenAI or AIza… Gemini)'}
            value={apiKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowKey(v => !v)}
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
            aria-pressed={showKey}
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 ${ICON_BUTTON} hover:text-fg ${FOCUS}`}
          >
            {showKey ? <EyeOff {...ICON} /> : <Eye {...ICON} />}
          </button>
        </div>

        {detected && (
          <p className="text-ui-xs font-medium text-fg">
            ✓ {DETECTED_NAMES[detected.name]} detected
            {detected.name === 'gemini' && ' — image generation only'}
          </p>
        )}
        {isUnknown && (
          <div className="space-y-2">
            <p className="text-ui-xs text-fg-muted">Unknown key format — enter provider details</p>
            <Input
              placeholder="Provider name (e.g. groq)"
              value={providerName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProviderName(e.target.value)}
            />
            <Input
              placeholder="Display label (e.g. Llama 3 (Groq))"
              value={label}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
            />
          </div>
        )}

        {allowCopySlot ? (
          <SegmentedToggle
            options={[
              { value: 'COPY', label: 'COPY' },
              { value: 'IMAGE', label: 'IMAGE' },
            ]}
            value={slot}
            onChange={v => setSlot(v as ProviderSlot)}
          />
        ) : (
          <p className="text-ui-xs text-fg-muted">
            Registered for <span className="font-semibold">image generation</span> (an OpenAI or Gemini
            key) — the only key this team needs. Copy is generated by Claude on the OAuth chain.
          </p>
        )}

        {error && <p className="text-ui-xs text-status-failed">{error}</p>}

        {/* The view's one accent primary, shown only while this form is open. */}
        <Button variant="primary" size="sm" onClick={register} disabled={loading || !apiKey}>
          {loading ? 'Validating…' : 'Register'}
        </Button>
      </div>
    </Panel>
  )
}

// ─── Provider Card ────────────────────────────────────────────────────────────

function ProviderCard({ provider, onRefresh }: { provider: Provider; onRefresh: () => void }) {
  const [confirming, setConfirming] = useState(false)
  // The server refuses to default a disabled IMAGE row (005 FR-03), so don't offer it.
  const starBlocked = provider.slot === 'IMAGE' && !provider.isEnabled

  async function toggle(field: 'isEnabled' | 'isDefault', value: boolean) {
    try {
      await apiFetch(`/api/admin/providers/${provider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  async function remove() {
    try {
      await apiFetch(`/api/admin/providers/${provider.id}`, { method: 'DELETE' })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  return (
    // A ruled row (§6): the label, its slot tag and the Default mark, the
    // masked key beneath; quiet icon controls on the right (§8.16).
    <li className={`${ROW} flex items-start gap-4`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-ui-base font-medium text-fg" title={provider.label}>{provider.label}</span>
          <span className={TAG}>{provider.slot}</span>
          {provider.isDefault && (
            <span className={`flex items-center gap-1 ${SMALL_CAPS} text-accent`}>
              <Star {...ICON_SM} fill="currentColor" aria-hidden /> Default
            </span>
          )}
        </div>
        <p className="mt-1 font-mono text-ui-xs text-fg-muted">
          {maskKey(provider.keyPrefix)}
        </p>
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => toggle('isEnabled', !provider.isEnabled)}
          aria-pressed={provider.isEnabled}
          aria-label={`Enable ${provider.label}`}
          className={`${ICON_BUTTON} ${provider.isEnabled ? 'text-accent' : 'hover:text-fg'} ${FOCUS}`}
          title={provider.isEnabled ? 'Disable' : 'Enable'}
        >
          {provider.isEnabled
            ? <ToggleRight size={20} strokeWidth={1.4} />
            : <ToggleLeft size={20} strokeWidth={1.4} />}
        </button>
        <button
          type="button"
          onClick={() => toggle('isDefault', true)}
          aria-pressed={provider.isDefault}
          aria-label={`Set ${provider.label} as default`}
          disabled={starBlocked}
          className={`${ICON_BUTTON} ${provider.isDefault ? 'text-accent' : 'enabled:hover:text-fg'} ${FOCUS}`}
          title={starBlocked ? 'Enable this provider before making it the default' : 'Set as default'}
        >
          <Star {...ICON} fill={provider.isDefault ? 'currentColor' : 'none'} />
        </button>
        {confirming ? (
          <div className="flex gap-1">
            <Button variant="danger" size="sm" onClick={remove}>Confirm</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${provider.label}`}
            className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
          >
            <Trash2 {...ICON} />
          </button>
        )}
      </div>
    </li>
  )
}

// ─── Channel Row ──────────────────────────────────────────────────────────────

function ChannelRow({
  channel,
  status,
  label,
  tokenPlaceholder,
  metadataPlaceholder,
  icon,
  onRefresh,
}: {
  channel: 'INSTAGRAM' | 'LINKEDIN'
  status: ChannelStatus
  label: string
  tokenPlaceholder: string
  metadataPlaceholder: string
  icon: React.ReactNode
  onRefresh: () => void
}) {
  const [token, setToken] = useState('')
  const [metadata, setMetadata] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    setLoading(true)
    try {
      await apiFetch('/api/team/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, token, metadata }),
      })
      setToken(''); setMetadata('')
      onRefresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally { setLoading(false) }
  }

  async function revoke() {
    try {
      await apiFetch(`/api/team/channels/${channel}`, { method: 'DELETE' })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  return (
    <li className={`${ROW} space-y-3 py-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-fg-muted">{icon}</span>
          <span className="text-ui-base font-medium text-fg">{label}</span>
        </div>
        {status.connected
          ? <StatusWord tone="published">Connected</StatusWord>
          : <StatusWord tone="draft">Not connected</StatusWord>}
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Input
            className="pr-11"
            type={showToken ? 'text' : 'password'}
            placeholder={tokenPlaceholder}
            value={token}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowToken(v => !v)}
            aria-label={showToken ? 'Hide access token' : 'Show access token'}
            aria-pressed={showToken}
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 ${ICON_BUTTON} hover:text-fg ${FOCUS}`}
          >
            {showToken ? <EyeOff {...ICON} /> : <Eye {...ICON} />}
          </button>
        </div>
        <Input
          placeholder={metadataPlaceholder}
          value={metadata}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMetadata(e.target.value)}
        />
      </div>

      {error && <p className="text-ui-xs text-status-failed">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button variant="ink" size="sm" onClick={save} disabled={loading || !token || !metadata}>
          {loading ? 'Saving…' : 'Save'}
        </Button>
        {status.connected && (
          <Button variant="secondary" size="sm" onClick={revoke}>Revoke</Button>
        )}
      </div>
    </li>
  )
}

// FR-05: say plainly which IMAGE row serves teammates who have no personal
// OpenAI key. The rule is pickServingImageProvider's, the same one the resolver
// uses, so this text can't disagree with what generation actually does.
function ImageDefaultState({ rows, onRefresh }: { rows: Provider[]; onRefresh: () => void }) {
  const serving = pickServingImageProvider(rows)
  const [busy, setBusy] = useState(false)

  async function makeDefault(id: string) {
    setBusy(true)
    try {
      await apiFetch(`/api/admin/providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(false) }
  }

  if (!serving) {
    return (
      <div data-testid="image-default-state" data-state="none" role="status" className={WARN_NOTICE}>
        <p className="font-semibold">No image provider</p>
        <p className="mt-1 text-ui-xs text-fg">
          Teammates without a personal OpenAI key get no AI backgrounds.
        </p>
      </div>
    )
  }
  if (serving.isDefault) {
    return (
      <p data-testid="image-default-state" data-state="default" className="text-ui-xs text-fg-muted">
        Teammates without a personal OpenAI key use this provider.
      </p>
    )
  }
  return (
    <div data-testid="image-default-state" data-state="fallback" role="status" className={`${WARN_NOTICE} flex flex-wrap items-center gap-3`}>
      <p className="min-w-0 flex-1 text-ui-xs text-fg">
        No default set — teammates are using <span className="font-semibold">{serving.label}</span> (the oldest enabled image provider).
      </p>
      <Button variant="secondary" size="sm" onClick={() => makeDefault(serving.id)} disabled={busy}>
        Make default
      </Button>
    </div>
  )
}

// ─── Section: AI Providers ─────────────────────────────────────────────────────

function ProvidersSection() {
  const queryClient = useQueryClient()
  const [showRegister, setShowRegister] = useState(false)
  // CLI mode resolves copy through `claude -p` on the OAuth chain (personal token
  // → team token), so a COPY provider is not just optional but meaningless there:
  // offering the slot invited teams to register a key that would never be used.
  // API mode still genuinely needs one, so the slot survives when cliMode is off.
  const { cliMode } = useCurrentUser()

  const providersQuery = useQuery({
    queryKey: ['admin-providers'],
    queryFn: () => apiFetch<Provider[]>('/api/admin/providers'),
  })
  const providers = providersQuery.data ?? []

  function invalidateProviders() {
    return queryClient.invalidateQueries({ queryKey: ['admin-providers'] })
  }

  const providersBySlot = (slot: ProviderSlot) => providers.filter(p => p.slot === slot)

  if (providersQuery.isLoading) {
    return <p className="text-ui-sm text-fg-muted">Loading…</p>
  }
  if (providersQuery.isError) {
    return <QueryError error={providersQuery.error} onRetry={() => providersQuery.refetch()} />
  }

  // In CLI mode COPY is dropped from the UI — but only when the team has no COPY
  // rows. A team that registered one earlier (or carries the legacy `cli`
  // placeholder) must still be able to see and delete it, so an existing row keeps
  // its section rather than becoming invisible and unmanageable.
  const copyRows = providersBySlot('COPY')
  const visibleSlots: ProviderSlot[] =
    cliMode && copyRows.length === 0 ? ['IMAGE'] : ['COPY', 'IMAGE']

  return (
    <div className="space-y-6">
      {cliMode && (
        <p className="text-ui-sm text-fg-muted">
          This server runs Claude in CLI mode, so copy is generated on the Claude OAuth chain — a
          member&apos;s personal token, falling back to the team token. No copy provider is needed;
          the only key this team needs is an <span className="font-semibold">image</span> key for
          AI backgrounds.
        </p>
      )}

      {visibleSlots.map(slot => (
        <div key={slot} className="space-y-3">
          <h3 className={GROUP_HEAD}>
            {slot === 'COPY' ? 'Copy (text generation)' : 'Image generation'}
          </h3>
          {slot === 'COPY' && cliMode && (
            <p className="text-ui-xs italic text-fg-muted">
              Not used in CLI mode — safe to delete.
            </p>
          )}
          {slot === 'IMAGE' && <ImageDefaultState rows={providersBySlot('IMAGE')} onRefresh={invalidateProviders} />}
          {providersBySlot(slot).length === 0 && (
            <p className="text-ui-sm italic text-fg-muted">No providers registered for {slot}</p>
          )}
          {providersBySlot(slot).length > 0 && (
            <ul className="border-t border-line-subtle">
              {providersBySlot(slot).map(p => (
                <ProviderCard key={p.id} provider={p} onRefresh={invalidateProviders} />
              ))}
            </ul>
          )}
        </div>
      ))}

      {showRegister ? (
        <RegisterForm
          allowCopySlot={!cliMode}
          onSuccess={() => { setShowRegister(false); invalidateProviders() }}
        />
      ) : (
        <Button variant="secondary" onClick={() => setShowRegister(true)}>
          <Plus {...ICON} /> {cliMode ? 'Register image key' : 'Register Provider'}
        </Button>
      )}
    </div>
  )
}

// ─── Section: Social Channels ───────────────────────────────────────────────────

function ChannelsSection() {
  const queryClient = useQueryClient()

  const channelsQuery = useQuery({
    queryKey: ['team-channels'],
    queryFn: () => apiFetch<ChannelMap>('/api/team/channels'),
  })
  const channels = channelsQuery.data ?? { INSTAGRAM: { connected: false }, LINKEDIN: { connected: false } }

  function invalidateChannels() {
    return queryClient.invalidateQueries({ queryKey: ['team-channels'] })
  }

  if (channelsQuery.isLoading) {
    return <p className="text-ui-sm text-fg-muted">Loading…</p>
  }
  if (channelsQuery.isError) {
    return <QueryError error={channelsQuery.error} onRetry={() => channelsQuery.refetch()} />
  }

  return (
    <ul className="border-t border-line-subtle">
      <ChannelRow
        channel="INSTAGRAM"
        status={channels.INSTAGRAM}
        label="Instagram"
        tokenPlaceholder="Access token"
        metadataPlaceholder="Business Account ID"
        icon={<InstagramIcon size={15} />}
        onRefresh={invalidateChannels}
      />
      <ChannelRow
        channel="LINKEDIN"
        status={channels.LINKEDIN}
        label="LinkedIn"
        tokenPlaceholder="Access token"
        metadataPlaceholder="Organization ID"
        icon={<LinkedinIcon size={15} />}
        onRefresh={invalidateChannels}
      />
    </ul>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamSettingsPage() {
  const { isTeamAdmin, isLoading } = useCurrentUser()

  if (isLoading) return null

  if (!isTeamAdmin) {
    return (
      <GateNotice title="Requires team admin">
        Team settings are limited to this team&apos;s administrators.
      </GateNotice>
    )
  }

  return (
    <div className="max-w-3xl">
      <PageHead
        eyebrow="Admin"
        title="Team settings"
        lead="Providers, channels, and credentials shared by everyone on this team."
      />

      <div className="flex flex-col gap-12">
        <section>
          <SectionHead numeral="i." title="AI Providers" />
          <div className={BLOCK}>
            <ProvidersSection />
          </div>
        </section>

        <section>
          <SectionHead numeral="ii." title="Social Channels" />
          <div className={BLOCK}>
            <ChannelsSection />
          </div>
        </section>

        <TeamClaudeTokenCard numeral="iii." />

        <ApiKeysCard numeral="iv." />
      </div>
    </div>
  )
}
