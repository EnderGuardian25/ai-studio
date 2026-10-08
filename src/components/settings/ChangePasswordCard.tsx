'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { BLOCK, SectionHead } from '@/components/team/folio'
import { authClient } from '@/lib/auth-client'

// Self-service password change. better-auth's base client always exposes
// `changePassword` (a core emailAndPassword endpoint, independent of any
// plugin) — it returns `{ data, error }` rather than throwing, mirroring the
// login page's authClient.signIn usage. `revokeOtherSessions: true` signs out
// every other device the moment the new password is set, matching the
// deactivation flow's "sessions revoked" precedent elsewhere in the app.
const MIN_LENGTH = 8

export function ChangePasswordCard({ numeral }: { numeral?: string }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (newPassword.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match')
      return
    }

    setSaving(true)
    try {
      const { error: authError } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      })
      if (authError) {
        setError(authError.message ?? 'Failed to change password')
        return
      }
      toast.success('Password changed — other devices have been signed out')
      reset()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <SectionHead numeral={numeral} title="Password" />

      <div className={`${BLOCK} flex flex-col gap-5`}>
        <p className="text-ui-sm text-fg-muted">
          Change your sign-in password. Other devices are signed out immediately.
        </p>

        <form onSubmit={submit} className="flex max-w-sm flex-col gap-3">
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            required
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            minLength={MIN_LENGTH}
            required
            placeholder={`At least ${MIN_LENGTH} characters`}
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            minLength={MIN_LENGTH}
            required
          />
          {error && <p className="text-ui-xs text-status-failed">{error}</p>}
          <div>
            {/* The page's one accent primary (§8.2). */}
            <Button type="submit" disabled={saving || !currentPassword || !newPassword || !confirmPassword}>
              {saving ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </form>
      </div>
    </section>
  )
}
