import { spawn } from "child_process"
import { env } from "@/lib/env"
import { currentClaudeAuth } from "@/lib/agent/claudeAuth"

// Resolve the Claude Code CLI binary (005 FR-17). An explicit CLAUDE_CLI_PATH
// runs directly. On Windows a bare `claude` goes through the shell, so cmd.exe
// resolves it via PATHEXT to either the npm shim (`claude.cmd`) or the winget /
// native installer's `claude.exe` — the old hard-coded `claude.cmd` missed the
// latter. Elsewhere `claude` runs directly. Pure + exported for AC-25.
export function claudeCommand(
  platform: NodeJS.Platform = process.platform,
  cliPath: string | undefined = env.CLAUDE_CLI_PATH,
): { cmd: string; shell: boolean } {
  if (cliPath) return { cmd: cliPath, shell: false }
  if (platform === "win32") return { cmd: "claude", shell: true }
  return { cmd: "claude", shell: false }
}

// The child env is an ALLOWLIST (005 FR-10, NFR-01), never a copy of
// process.env: a denylist misses the next secret someone adds to `.env`, an
// allowlist fails safe. Nothing else reaches the CLI — no DATABASE_URL,
// TOKEN_ENCRYPTION_KEY, MINIO_*, BETTER_AUTH_*, *_SECRET / *_KEY, and never
// ANTHROPIC_* (the CLI prefers ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN over
// CLAUDE_CODE_OAUTH_TOKEN, so a stray one would exit 1 or bill the API).
// HOME matters: the CLI writes config/cache under ~/.claude* (Dockerfile sets a
// writable HOME for the runner user).
const CHILD_ENV_ALWAYS = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "TZ",
  "TMPDIR",
  "NODE_EXTRA_CA_CERTS",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
]
const CHILD_ENV_WIN32 = ["USERPROFILE", "APPDATA", "LOCALAPPDATA", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP"]

type EnvMap = Record<string, string | undefined>

// Pure + exported for AC-14. Win32 env names are case-insensitive (`Path` is
// `PATH`), so there names match case-insensitively and keep the parent's
// original casing; on POSIX they match exactly. The OAuth token is set last,
// so a stale parent value can never win.
export function buildChildEnv(
  parentEnv: EnvMap,
  platform: NodeJS.Platform,
  token: string,
): EnvMap {
  const win32 = platform === "win32"
  const allowed = win32 ? [...CHILD_ENV_ALWAYS, ...CHILD_ENV_WIN32] : CHILD_ENV_ALWAYS
  const wanted = new Set(win32 ? allowed.map((k) => k.toUpperCase()) : allowed)
  const child: EnvMap = {}
  for (const [key, value] of Object.entries(parentEnv)) {
    if (value === undefined) continue
    if (wanted.has(win32 ? key.toUpperCase() : key)) child[key] = value
  }
  child.CLAUDE_CODE_OAUTH_TOKEN = token
  return child
}

// `--tools ""` (005 FR-08): an empty built-in tool list, so no CLI child can
// call a tool whatever a prompt injection asks for. With shell:false the empty
// string is its own argv element. With shell:true (win32) Node joins argv with
// spaces and does NO quoting, so a bare "" would vanish from the command line —
// pass the literal two characters `""` so cmd.exe hands claude an empty arg.
function emptyArg(shell: boolean): string {
  return shell ? '""' : ""
}

// Model the spawned `claude -p` runs under. Precedence:
//   1. CLAUDE_CLI_MODEL env — a GLOBAL override across every `claude -p` call
//      (handy for testing all stages on one model).
//   2. the per-call `model` passed by the caller — this is where the per-path
//      split lives (Path A design → "haiku", Path B design → "sonnet"; see the
//      design call sites), matching the API path (runDesignAgent).
//   3. fallback "haiku" for calls that pass no model (e.g. copy).
// Accepts a CLI alias ("sonnet"/"opus"/"haiku") or a full model id. A value of
// "default" (from either source) omits --model and uses the account default
// (the costly Opus tier) — the reason we never want that implicitly.
function claudeModelArgs(explicitModel?: string, pinned = false): string[] {
  // A pinned call (the refine add-verifier, change 004 FR-14b) runs on exactly
  // the model it names: the global override must not route it elsewhere.
  if (pinned && explicitModel?.trim()) return ["--model", explicitModel.trim()]
  const override = (env.CLAUDE_CLI_MODEL ?? "").trim()
  const model = override || (explicitModel ?? "haiku").trim()
  if (!model || model.toLowerCase() === "default") return []
  return ["--model", model]
}

export interface ClaudeCliOptions {
  timeoutMs?: number
  maxBuffer?: number
  // Short tag for log lines so concurrent/sequential CLI calls are distinguishable
  // (e.g. "copy", "design:pathB"). Purely diagnostic.
  label?: string
  // Per-call model (CLI alias or full id). Path A design passes "haiku", Path B
  // "sonnet". Overridden by CLAUDE_CLI_MODEL when that env var is set.
  model?: string
  // When true, `model` is used verbatim and CLAUDE_CLI_MODEL does NOT override
  // it. Only for calls whose model is a fixed policy rather than a preference —
  // the refine add-verifier is pinned to Haiku (change 004 FR-14b).
  pinModel?: boolean
  // There is deliberately NO tools option (005 FR-08): every spawn passes
  // `--tools ""`, so no caller can opt a headless run — which executes with the
  // server's privileges — back into a tool without a reviewed code change.
  // Explicit OAuth token override: bypasses the per-user ALS auth context AND
  // the retry-once-with-shared behaviour. Used only by validateClaudeToken()
  // (userToken.ts) to test a candidate token — normal call sites never set it.
  authToken?: string
}

// Non-zero-exit CLI failure with the raw process output attached, so callers
// (isClaudeAuthFailure) can classify it. Timeout/ENOENT/buffer-limit failures
// stay plain Errors — they say nothing about the token's validity.
export class ClaudeCliError extends Error {
  constructor(
    message: string,
    public exitCode: number | null,
    public stderr: string,
    public stdout: string,
  ) {
    super(message)
    this.name = "ClaudeCliError"
  }
}

// Does this error mean the OAuth token was rejected (expired/revoked/garbage)?
// Pure + exported for unit tests. Deliberately conservative: only non-zero-exit
// ClaudeCliErrors whose output matches a known auth-failure phrasing — anything
// else (timeouts, prompt-size, buffer, generic exit 1) must NOT invalidate a
// stored token or trigger the shared-credential retry.
const AUTH_FAILURE_RE =
  /oauth token (is )?(invalid|expired|revoked)|invalid api key|please run \/login|authentication[_ ]?error|not (logged in|authenticated)|\b401\b/i
export function isClaudeAuthFailure(err: unknown): boolean {
  if (!(err instanceof ClaudeCliError)) return false
  if (err.exitCode === 0) return false
  return AUTH_FAILURE_RE.test(`${err.stderr}\n${err.stdout}`)
}

// Dev-mode diagnostics. CLI mode is a local dev convenience, so log by default;
// set CLAUDE_CLI_DEBUG=0 to silence. Logs spawn details, a liveness heartbeat,
// streamed stderr, and the final outcome with elapsed time — so a timeout is
// debuggable instead of opaque.
const CLI_DEBUG = env.CLAUDE_CLI_DEBUG !== "0"
function cliLog(label: string, msg: string) {
  if (CLI_DEBUG) console.log(`[claudeCli${label ? ":" + label : ""}] ${msg}`)
}

// Kill the entire spawned process TREE. On Windows the CLI runs via a `cmd.exe`
// shell (`claude` resolved via PATHEXT), so child.kill() only signals the shell — the underlying
// `claude` (node) process keeps running to completion and KEEPS BURNING CREDITS
// after we've already timed out. taskkill /T tears down the whole tree; on POSIX
// a SIGKILL to the child suffices.
function killTree(child: ReturnType<typeof spawn>, label: string) {
  if (!child.pid) {
    child.kill("SIGKILL")
    return
  }
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true })
    } catch (e) {
      cliLog(label, `taskkill failed, falling back to child.kill(): ${(e as Error).message}`)
      child.kill("SIGKILL")
    }
  } else {
    child.kill("SIGKILL")
  }
}

// Runs the local Claude Code CLI headlessly and returns stdout. Used in CLI mode
// (DESIGN_PROVIDER=cli) to drive copy + design generation through the local
// Claude session instead of the Anthropic API — no API key required.
//
// The prompt is piped via STDIN (not argv): design prompts routinely exceed the
// Windows command-line length limit (~8191 chars under cmd.exe), which would
// silently truncate an argv-passed prompt. STDIN also avoids all shell quoting.
// Conservative input ceiling. The model's context is ~200k tokens; past roughly
// this many characters a single-shot CLI prompt fails opaquely (exit 1). Guard so
// callers get an actionable message instead — e.g. an oversized brand template.
// It measures the stdin payload (spawnClaude), whatever the input mode.
const MAX_PROMPT_CHARS = 600_000

export async function runClaudeCli(prompt: string, opts: ClaudeCliOptions = {}): Promise<string> {
  return withAuthRetry(opts, (token) => runClaudeCliOnce(prompt, opts, token))
}

// The personal → team auth-retry wrapper, shared by both entry points (text
// mode and stream-json mode). `attempt` runs one spawn under the
// token it is handed (undefined ⇒ spawnClaude reads the ALS context, and with
// none throws the no-credential error).
async function withAuthRetry<T>(
  opts: Pick<ClaudeCliOptions, "authToken" | "label">,
  attempt: (token: string | undefined) => Promise<T>,
): Promise<T> {
  // Token-validation path: run once with the candidate token, never retry.
  if (opts.authToken) return attempt(opts.authToken)

  // Per-user/team auth (set at the route entry via withClaudeAuth — see
  // claudeAuth.ts for the ALS design note). Absent context ⇒ the spawn core
  // itself throws the no-credential error below — there is no further tier.
  const auth = currentClaudeAuth()
  if (!auth) return attempt(undefined)

  try {
    return await attempt(auth.token)
  } catch (err) {
    if (!isClaudeAuthFailure(err)) throw err
    // The primary token was rejected (expired/revoked). Mark it invalid so the
    // owner is prompted to reconnect, then fall back ONE tier (personal → team)
    // so this call can still complete. One retry only; a second failure surfaces.
    cliLog(
      opts.label ?? "",
      `auth failure for ${auth.userId ? `user ${auth.userId}` : `team ${auth.teamId}`} — marking credential invalid, trying the next tier`,
    )
    await auth.onAuthFailure().catch((e: unknown) => {
      cliLog(opts.label ?? "", `failed to mark credential invalid: ${(e as Error).message}`)
    })
    const fallback = auth.resolveFallback ? await auth.resolveFallback() : null
    if (!fallback) throw err
    try {
      return await attempt(fallback.token)
    } catch (err2) {
      if (isClaudeAuthFailure(err2)) {
        await fallback.onAuthFailure().catch((e: unknown) => {
          cliLog(opts.label ?? "", `failed to mark team credential invalid: ${(e as Error).message}`)
        })
      }
      throw err2
    }
  }
}

// One text-mode attempt: the prompt is the whole stdin payload.
export async function runClaudeCliOnce(
  prompt: string,
  opts: ClaudeCliOptions,
  tokenOverride: string | undefined,
): Promise<string> {
  const command = claudeCommand()
  // --strict-mcp-config + no --mcp-config => load ZERO MCP servers. Without it the
  // spawned CLI inherits the developer's full Claude Code config (Canva, Google
  // Drive, Atlassian, … connectors), adding startup latency, bloating the prompt
  // context with dozens of unused tool definitions, and raising token cost — none
  // of which a single-shot HTML/copy generation needs. `--tools ""` removes every
  // built-in tool too (FR-08), so the run is pure text in, text out.
  const args = [
    "-p",
    "--strict-mcp-config",
    "--tools",
    emptyArg(command.shell),
    ...claudeModelArgs(opts.model, opts.pinModel),
  ]
  return spawnClaude(args, prompt, { ...opts, command, tokenOverride })
}

// ─── stream-json mode (005 FR-09) ────────────────────────────────────────────
//
// The only way to hand a headless `claude -p` an image with no tool and no
// file: one stream-json user message on stdin whose content holds base64 image
// blocks beside the text. Contract, per Anthropic's docs and verified locally
// against CLI 2.1.287 (see .specclaw/changes/005-…/reports/T5.md):
//   https://code.claude.com/docs/en/cli-reference   (--input-format / --output-format
//                                                    stream-json; stream-json output
//                                                    needs --verbose under -p)
//   https://code.claude.com/docs/en/headless        ("The last line of the stream is a
//                                                    `result` message"; a failure inside
//                                                    the run, e.g. missing auth, is
//                                                    printed as the result on stdout)
//   https://code.claude.com/docs/en/agent-sdk/typescript  (SDKUserMessage, SDKResultMessage)
// Input: one line `{"type":"user","message":{"role":"user","content":[...]}}`.
// Output: NDJSON — system/init, hook and retry events, one or more `assistant`
// messages, then a terminal `{"type":"result","subtype":"success",
// "is_error":false,"result":"<text>",…}`. A rejected token arrives as exit 1
// with a `result` event of subtype "success" but is_error true, its text
// "Failed to authenticate. API Error: 401 …", and `api_error_status: 401` —
// nothing on stderr. The schema can drift between CLI versions, which is why
// the container pins one (FR-11).

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }

export async function runClaudeCliStreamJson(content: ContentBlock[], opts: ClaudeCliOptions = {}): Promise<string> {
  return withAuthRetry(opts, (token) => runClaudeCliStreamJsonOnce(content, opts, token))
}

async function runClaudeCliStreamJsonOnce(
  content: ContentBlock[],
  opts: ClaudeCliOptions,
  tokenOverride: string | undefined,
): Promise<string> {
  const command = claudeCommand()
  const args = [
    "-p",
    "--strict-mcp-config",
    "--tools",
    emptyArg(command.shell),
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    ...claudeModelArgs(opts.model, opts.pinModel),
  ]
  // Exactly one user message, then stdin ends — the CLI answers it and exits.
  // The 600k guard in spawnClaude measures this whole serialized line, so the
  // base64 images count against it, not only the text.
  const line = JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n"
  return spawnClaude(args, line, {
    ...opts,
    command,
    tokenOverride,
    finalize: finalizeStreamJson,
    tooLargeHint: "With images attached this usually means the reference images are too big — use smaller images.",
  })
}

interface StreamJsonResultEvent {
  type: "result"
  subtype?: string
  is_error?: boolean
  result?: unknown
  errors?: unknown
  api_error_status?: number | null
}

export interface ParsedStreamJson {
  // The LAST `result` event — the terminal one. Assistant messages before it
  // never count, however many there are.
  result: StreamJsonResultEvent | null
  // Text blocks of the assistant messages and any non-JSON lines: kept only
  // to explain a failure, never returned as an answer.
  assistantText: string[]
  nonJson: string[]
}

// Pure + exported. Parses the whole buffered stdout at close, so a line split
// across `data` chunks is reassembled before it is parsed; a final line with
// no trailing newline still parses.
export function parseStreamJson(stdout: string): ParsedStreamJson {
  const parsed: ParsedStreamJson = { result: null, assistantText: [], nonJson: [] }
  for (const raw of stdout.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    let ev: unknown
    try {
      ev = JSON.parse(line)
    } catch {
      parsed.nonJson.push(line)
      continue
    }
    if (!ev || typeof ev !== "object") continue
    const e = ev as { type?: unknown; message?: { content?: unknown } }
    if (e.type === "result") parsed.result = ev as StreamJsonResultEvent
    else if (e.type === "assistant" && Array.isArray(e.message?.content)) {
      for (const b of e.message.content as Array<{ type?: unknown; text?: unknown }>) {
        if (b?.type === "text" && typeof b.text === "string") parsed.assistantText.push(b.text)
      }
    }
  }
  return parsed
}

// Turns a finished stream-json run into its answer or a ClaudeCliError.
//
// The error's `stdout` is a short DIAGNOSTIC — the result / error text, the
// API status, assistant text and any non-JSON lines — never the raw NDJSON:
// the raw stream is full of numbers (durations, token counts) and base64
// signatures, any of which could contain `401` and make isClaudeAuthFailure
// mark a good token invalid. A run that exited 0 yet reported an error gets
// exitCode null rather than 0, so the classifier still reads its text (it
// treats exit 0 as "not an auth failure").
function finalizeStreamJson({ code, stdout, stderr }: SpawnResult): string {
  const { result, assistantText, nonJson } = parseStreamJson(stdout)
  const errorCode = code === 0 ? null : code
  const diagnostic = (parts: unknown[]) =>
    parts
      .flat()
      .filter((p) => p !== undefined && p !== null && p !== "")
      .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
      .join("\n")

  if (!result) {
    throw new ClaudeCliError(
      `Claude CLI stream-json run ended with no result event (exit code ${code}): ${stderr.trim().slice(0, 500)}`,
      errorCode,
      stderr,
      diagnostic([assistantText, nonJson]),
    )
  }
  const text = typeof result.result === "string" ? result.result : ""
  if (result.is_error || result.subtype !== "success") {
    throw new ClaudeCliError(
      `Claude CLI reported an error (subtype=${result.subtype ?? "none"}, exit code ${code}): ${(text || diagnostic([result.errors])).slice(0, 500)}`,
      errorCode,
      stderr,
      diagnostic([
        text,
        result.errors,
        result.api_error_status != null ? `api_error_status: ${result.api_error_status}` : undefined,
        nonJson,
      ]),
    )
  }
  return text.trim()
}

interface SpawnResult {
  code: number | null
  stdout: string
  stderr: string
}

// Text mode: a non-zero exit is a ClaudeCliError carrying the raw output;
// otherwise stdout IS the answer.
function finalizeText({ code, stdout, stderr }: SpawnResult): string {
  if (code !== 0) {
    throw new ClaudeCliError(`Claude CLI exited with code ${code}: ${stderr.trim().slice(0, 500)}`, code, stderr, stdout)
  }
  return stdout.trim()
}

interface SpawnClaudeOptions extends Pick<ClaudeCliOptions, "timeoutMs" | "maxBuffer" | "label"> {
  command: { cmd: string; shell: boolean }
  tokenOverride: string | undefined
  // How a finished run (any exit code) becomes the answer or an error. The
  // input mode owns this; everything before it is shared.
  finalize?: (r: SpawnResult) => string
  // The second sentence of the 600k-guard error, naming the likely cause.
  tooLargeHint?: string
}

// The one spawn core: the size guard, the credential, the allowlisted child
// env, the timeout / kill-tree / buffer limit, logging and the error mapping.
// Every input mode goes through here, so none of it can drift between modes.
async function spawnClaude(args: string[], stdinPayload: string, opts: SpawnClaudeOptions): Promise<string> {
  const {
    command,
    tokenOverride,
    timeoutMs = 180_000,
    maxBuffer = 16 * 1024 * 1024,
    label = "",
    finalize = finalizeText,
    tooLargeHint = "This usually means the brand template is too big — use a smaller template or Path B.",
  } = opts
  const { cmd, shell } = command

  if (stdinPayload.length > MAX_PROMPT_CHARS) {
    throw new Error(
      `Prompt too large for CLI mode (${stdinPayload.length} chars > ${MAX_PROMPT_CHARS}). ` +
        tooLargeHint,
    )
  }

  // CLI-mode auth is REQUIRED — there is no env/dev-session fallback tier.
  // Order of preference:
  //   1. tokenOverride — the acting user's personal token, or the team token
  //      passed in by withAuthRetry after a personal-token auth failure, or a
  //      candidate token under validation (opts.authToken).
  //   2. currentClaudeAuth()?.token — the ALS auth context set by
  //      withClaudeAuth (userToken.ts), read directly when no override was
  //      passed in (the no-auth-context path in withAuthRetry above).
  // Neither present ⇒ no credential exists for this call (no personal token
  // and no team token) — throw rather than spawn silently unauthenticated.
  // The token travels via env, never argv (argv would leak through `shell: true`
  // on win32 and process listings).
  const oauthToken = tokenOverride ?? currentClaudeAuth()?.token
  if (!oauthToken) {
    throw new ClaudeCliError(
      "No Claude credential available — connect a personal token in Settings or set the team token in Team Settings",
      null,
      "",
      "",
    )
  }
  const childEnv = buildChildEnv(process.env, process.platform, oauthToken)

  const modelIdx = args.indexOf("--model")
  const resolvedModel = modelIdx >= 0 ? args[modelIdx + 1] : "(account default)"
  const startedAt = Date.now()
  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`

  cliLog(
    label,
    `spawn ${cmd} ${args.join(" ")} · model=${resolvedModel} · stdin=${stdinPayload.length} chars · timeout=${timeoutMs}ms`,
  )

  return new Promise<string>((resolve, reject) => {
    // The cast only drops Next's required NODE_ENV: the child deliberately has none.
    const child = spawn(cmd, args, { shell, windowsHide: true, env: childEnv as NodeJS.ProcessEnv })

    let stdout = ""
    let stderr = ""
    let settled = false
    let sawOutput = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearInterval(heartbeat)
      fn()
    }

    const timer = setTimeout(() => {
      // Tear down the whole process tree, not just the shell — otherwise `claude`
      // keeps running (and billing) after we've returned a timeout error.
      cliLog(label, `TIMEOUT after ${elapsed()} (limit ${timeoutMs}ms) — killing process tree (pid ${child.pid}). stderr so far: ${stderr.trim().slice(-300) || "(none)"}`)
      killTree(child, label)
      finish(() => reject(new Error(`Claude CLI timed out after ${timeoutMs}ms`)))
    }, timeoutMs)

    // Periodic liveness ping so a long/stuck run is visible instead of silent.
    const heartbeat = setInterval(() => {
      cliLog(label, `still running ${elapsed()} · stdout=${stdout.length}B stderr=${stderr.length}B${sawOutput ? "" : " (no output yet)"}`)
    }, 20_000)

    child.stdout.on("data", (d: Buffer) => {
      if (!sawOutput) {
        sawOutput = true
        cliLog(label, `first stdout byte at ${elapsed()}`)
      }
      stdout += d.toString()
      if (stdout.length > maxBuffer) {
        cliLog(label, `output exceeded buffer (${maxBuffer}B) at ${elapsed()} — killing process tree`)
        killTree(child, label)
        finish(() => reject(new Error("Claude CLI output exceeded buffer limit")))
      }
    })
    child.stderr.on("data", (d: Buffer) => {
      const chunk = d.toString()
      stderr += chunk
      // Surface CLI diagnostics live (auth prompts, trust dialogs, errors) — these
      // are the usual cause of an otherwise-silent hang/timeout.
      cliLog(label, `stderr: ${chunk.trim().slice(0, 300)}`)
    })

    child.on("error", (err: NodeJS.ErrnoException) => {
      finish(() =>
        reject(
          err.code === "ENOENT"
            ? new Error("Claude CLI not found on PATH. Install Claude Code or set CLAUDE_CLI_PATH.")
            : new Error(`Claude CLI failed: ${err.message}`),
        ),
      )
    })

    child.on("close", (code: number | null) => {
      finish(() => {
        if (code !== 0) cliLog(label, `exited code=${code} at ${elapsed()}`)
        try {
          const answer = finalize({ code, stdout, stderr })
          cliLog(label, `done at ${elapsed()} · ${answer.length} chars`)
          resolve(answer)
        } catch (err) {
          if (code === 0) cliLog(label, `exited 0 but failed at ${elapsed()}: ${(err as Error).message.slice(0, 300)}`)
          reject(err)
        }
      })
    })

    child.stdin.on("error", () => {
      /* ignore EPIPE if the child exits before stdin is fully written */
    })
    child.stdin.write(stdinPayload)
    child.stdin.end()
  })
}

// Claude sometimes wraps output in markdown fences despite instructions.
// Strip a single enclosing ``` ... ``` block (optionally language-tagged).
export function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const m = trimmed.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```$/)
  return m ? m[1].trim() : trimmed
}
