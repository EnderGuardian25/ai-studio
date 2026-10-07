"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Input, Button } from "@/components/ui"
import { Logo } from "@/components/Logo"

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    // Legacy escape hatch: an email address still signs in via the email flow
    // (covers accounts predating the username switch).
    const { error: authError } = username.includes("@")
      ? await authClient.signIn.email({ email: username, password })
      : await authClient.signIn.username({ username, password })

    if (authError) {
      setError(authError.message ?? "Invalid credentials")
      setLoading(false)
      return
    }

    router.push("/")
    router.refresh()
  }

  // Folio (DESIGN_SYSTEM.md §2, §6): no box, structure from type and rules.
  // The "Studio" wordmark at display size, a muted line, then a 2 px --fg rule
  // opening the form.
  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas text-fg font-text px-4 py-12">
      <div className="w-full max-w-sm">
        <Logo size="2xl" />
        <p className="mt-3 text-ui-sm text-fg-muted">Sign in to continue</p>
        <form onSubmit={handleSubmit} className="mt-8 pt-6 border-t-2 border-fg space-y-4">
          <Input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && (
            <p className="text-ui-sm text-status-failed">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  )
}
