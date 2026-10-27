import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

// Change 034: accounts are created by a super admin only, so the HTTP route
// reaches better-auth only for these method + path pairs (exact pathname match).
// Everything else, sign-up included, answers 404. Add a path only on purpose.
// better-auth's `disableSignUp` is not used: it would also refuse the admin
// route's server-side `auth.api.signUpEmail`.
const ALLOWED_AUTH_ROUTES: ReadonlySet<string> = new Set([
  "POST /api/auth/sign-in/username",
  "POST /api/auth/sign-in/email",
  "POST /api/auth/sign-out",
  "POST /api/auth/change-password",
  "GET /api/auth/get-session",
])

const handler = toNextJsHandler(auth)

function guard(method: "GET" | "POST", run: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest): Promise<Response> => {
    const { pathname } = new URL(req.url)
    if (!ALLOWED_AUTH_ROUTES.has(`${method} ${pathname}`)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return run(req)
  }
}

export const GET = guard("GET", handler.GET)
export const POST = guard("POST", handler.POST)
