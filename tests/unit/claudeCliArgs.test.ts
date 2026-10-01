// 005 T4 — the one CLI spawn core (FR-08 text mode, FR-10, FR-17).
//
//   AC-13  every text-mode call site spawns with `--tools` + an empty value and
//          never `--allowedTools`; on win32 the empty value survives the
//          shell's argv join.
//   AC-14  the child env is exactly the FR-10 allowlist plus the OAuth token —
//          no server secret ever reaches the child.
//   AC-25  the command + shell choice per platform and CLAUDE_CLI_PATH.
//
// Driven through the REAL runClaudeCli (and the real call wrappers where they
// are cheap to reach) with a scripted fake `spawn`, so the assertions are on
// the argv / env that would reach the `claude` binary.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  spawnCalls: [] as Array<{
    cmd: string
    args: string[]
    shell: boolean
    env: NodeJS.ProcessEnv
    stdin: string
  }>,
  // Reply every fake child prints; tests that need a specific shape set it.
  stdout: 'ok',
}))

vi.mock('child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    spawn: vi.fn((cmd: string, args: string[], opts: { shell: boolean; env: NodeJS.ProcessEnv }) => {
      const call = { cmd, args, shell: opts.shell, env: opts.env, stdin: '' }
      h.spawnCalls.push(call)
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: vi.fn((s: string) => (call.stdin += s)), end: vi.fn(), on: vi.fn() },
        pid: 4242,
        kill: vi.fn(),
      })
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from(h.stdout))
        child.emit('close', 0)
      })
      return child
    }),
  }
})

// CLI mode for the wrappers that branch on it (briefing, token-validate).
vi.mock('@/lib/agent/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/config')>()),
  isCliMode: () => true,
}))
// runDesignAgentCli renders + uploads after the CLI call — not under test here.
vi.mock('@/lib/renderer/puppeteer', () => ({ renderHtmlToPng: vi.fn(async () => Buffer.from('png')) }))
vi.mock('@/lib/storage/minio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/minio')>()),
  uploadObject: vi.fn(async () => {}),
}))

// env.ts snapshots process.env at module load — settle it BEFORE importing.
process.env.CLAUDE_CLI_DEBUG = '0'
delete process.env.CLAUDE_CLI_MODEL
delete process.env.CLAUDE_CLI_PATH

const { runClaudeCli, buildChildEnv, claudeCommand } = await import('@/lib/agent/claudeCli')
const { runWithClaudeAuth } = await import('@/lib/agent/claudeAuth')
const { ClaudeCliCopyProvider } = await import('@/providers/implementations/copy/claude-cli')
const { runDesignAgentCli, runDesignAgentCliRefine } = await import('@/lib/agent/designAgentCli')
const { runBriefingModel } = await import('@/lib/campaign/briefingAssistant')
const { validateClaudeToken } = await import('@/lib/agent/userToken')
const { modelFor, modelForBackground } = await import('@/lib/agent/config')
const { VERIFIER_MODEL } = await import('@/lib/drafts/refineVerify')

type ClaudeCliOptions = import('@/lib/agent/claudeCli').ClaudeCliOptions
type ClaudeCliAuth = import('@/lib/agent/claudeAuth').ClaudeCliAuth

// A fake value — never a real credential.
const TOKEN = 'sk-ant-oat01-FAKE-unit-test-token'
const auth: ClaudeCliAuth = { token: TOKEN, userId: 'user-1', teamId: 'team-1', onAuthFailure: async () => {} }
const inAuth = <T>(fn: () => Promise<T>) => runWithClaudeAuth(auth, fn)

const realPlatform = process.platform
function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}

beforeEach(() => {
  h.spawnCalls.length = 0
  h.stdout = 'ok'
})
afterEach(() => setPlatform(realPlatform))

// The spawned argv must open `-p --strict-mcp-config --tools <EMPTY>` and
// carry no --allowedTools anywhere.
function expectNoTools(args: string[], empty: string) {
  expect(args.slice(0, 4)).toEqual(['-p', '--strict-mcp-config', '--tools', empty])
  expect(args).not.toContain('--allowedTools')
  expect(args).not.toContain('--allowed-tools')
}

describe('AC-13: every text-mode call site spawns with --tools "" and never --allowedTools', () => {
  // The option objects each call site passes today (copied from the source,
  // so a new option on a site shows up here as a diff). Vision is listed with
  // its interim T4 options: no allowedTools (T5 moves it to stream-json).
  const sites: Array<[string, ClaudeCliOptions]> = [
    ['copy', { timeoutMs: 120_000, label: 'copy' }],
    ['design', { timeoutMs: 300_000, label: 'design', model: 'sonnet' }],
    ['refine', { timeoutMs: 300_000, label: 'refine', model: 'sonnet' }],
    ['verifier', { label: 'verify', model: VERIFIER_MODEL.cli, pinModel: true, timeoutMs: 60_000 }],
    ['background', { label: 'background', model: modelForBackground('cli'), timeoutMs: 90_000 }],
    ['briefing', { timeoutMs: 180_000, label: 'briefing', model: modelFor('B', 'cli') }],
    ['token-validate', { model: 'haiku', timeoutMs: 60_000, label: 'token-validate', authToken: TOKEN }],
    ['vision', { timeoutMs: 180_000, label: 'vision', model: modelFor('B', 'cli') }],
  ]

  it.each(sites)('%s (option table, POSIX)', async (_site, opts) => {
    setPlatform('linux')
    await inAuth(() => runClaudeCli('prompt', opts))
    expect(h.spawnCalls).toHaveLength(1)
    expectNoTools(h.spawnCalls[0].args, '')
  })

  it.each(sites)('%s (option table, win32 — the empty value survives the shell join)', async (_site, opts) => {
    setPlatform('win32')
    await inAuth(() => runClaudeCli('prompt', opts))
    const call = h.spawnCalls[0]
    expect(call.shell).toBe(true)
    expectNoTools(call.args, '""')
    // Node joins argv with spaces under shell:true and does no quoting, so
    // this is the command line cmd.exe actually parses.
    expect([call.cmd, ...call.args].join(' ')).toContain(' --tools "" ')
  })

  it('an allowedTools smuggled past the type is ignored — the option no longer exists', async () => {
    setPlatform('linux')
    // @ts-expect-error allowedTools was removed from ClaudeCliOptions (FR-08)
    await inAuth(() => runClaudeCli('prompt', { allowedTools: ['Read'] }))
    expectNoTools(h.spawnCalls[0].args, '')
    expect(h.spawnCalls[0].args).not.toContain('Read')
  })

  describe('through the real call wrappers', () => {
    beforeEach(() => setPlatform('linux'))

    it('copy — ClaudeCliCopyProvider.generateCopy', async () => {
      await inAuth(() =>
        new ClaudeCliCopyProvider().generateCopy({
          topic: 't',
          description: 'd',
          goal: 'g',
          tone: 'friendly',
          channels: ['INSTAGRAM'],
        }),
      )
      expectNoTools(h.spawnCalls[0].args, '')
    })

    it('design — runDesignAgentCli', async () => {
      h.stdout = '<!doctype html><html><body>x</body></html>'
      await inAuth(() => runDesignAgentCli({ systemPrompt: 's', userMessage: 'u', briefId: 'b1', model: 'sonnet' }))
      expectNoTools(h.spawnCalls[0].args, '')
    })

    it('refine — runDesignAgentCliRefine', async () => {
      await inAuth(() => runDesignAgentCliRefine({ systemPrompt: 's', userMessage: 'u', model: 'sonnet' }))
      expectNoTools(h.spawnCalls[0].args, '')
    })

    it('briefing — runBriefingModel', async () => {
      await inAuth(() => runBriefingModel('system', [{ role: 'user', content: 'hi' }], 'team-1'))
      expectNoTools(h.spawnCalls[0].args, '')
    })

    it('token-validate — validateClaudeToken', async () => {
      await expect(validateClaudeToken(TOKEN)).resolves.toEqual({ ok: true })
      expectNoTools(h.spawnCalls[0].args, '')
    })
  })
})

describe('AC-14: buildChildEnv is exactly the FR-10 allowlist plus the token', () => {
  const SECRETS = {
    DATABASE_URL: 'postgres://u:p@db/x',
    TOKEN_ENCRYPTION_KEY: 'k',
    MINIO_SECRET_KEY: 'm',
    MINIO_ACCESS_KEY: 'a',
    BETTER_AUTH_SECRET: 'b',
    ANTHROPIC_API_KEY: 'sk-ant-api-x',
    ANTHROPIC_AUTH_TOKEN: 'sk-ant-x',
    FOO_SECRET: 'f',
    OPENAI_API_KEY: 'o',
    // A stale parent token must be replaced, never inherited.
    CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-STALE-parent',
  }
  const ALWAYS = {
    PATH: '/usr/bin',
    HOME: '/home/nextjs',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'C.UTF-8',
    TZ: 'UTC',
    TMPDIR: '/tmp',
    NODE_EXTRA_CA_CERTS: '/certs/ca.pem',
    HTTP_PROXY: 'http://proxy:3128',
    HTTPS_PROXY: 'http://proxy:3128',
    NO_PROXY: 'localhost',
    http_proxy: 'http://proxy:3128',
    https_proxy: 'http://proxy:3128',
    no_proxy: 'localhost',
  }
  const WIN32_ONLY = {
    USERPROFILE: 'C:\\Users\\dev',
    APPDATA: 'C:\\Users\\dev\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local',
    SystemRoot: 'C:\\WINDOWS',
    ComSpec: 'C:\\WINDOWS\\system32\\cmd.exe',
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    TEMP: 'C:\\Temp',
    TMP: 'C:\\Temp',
  }

  it('POSIX: the always-list plus the token; win32-only names and every secret are absent', () => {
    const child = buildChildEnv({ ...ALWAYS, ...WIN32_ONLY, ...SECRETS, NODE_ENV: 'production' }, 'linux', TOKEN)
    expect(child).toEqual({ ...ALWAYS, CLAUDE_CODE_OAUTH_TOKEN: TOKEN })
  })

  it('POSIX: names are matched case-sensitively (Path is not PATH)', () => {
    const child = buildChildEnv({ Path: '/x', path: '/y', Home: '/h' }, 'linux', TOKEN)
    expect(child).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: TOKEN })
  })

  it('win32: the always-list plus the win32 list plus the token; every secret is absent', () => {
    const child = buildChildEnv({ ...ALWAYS, ...WIN32_ONLY, ...SECRETS, windir: 'C:\\WINDOWS' }, 'win32', TOKEN)
    expect(child).toEqual({ ...ALWAYS, ...WIN32_ONLY, CLAUDE_CODE_OAUTH_TOKEN: TOKEN })
  })

  it('win32: keys match case-insensitively and keep their original casing', () => {
    const parent = {
      Path: 'C:\\Windows',
      SYSTEMROOT: 'C:\\WINDOWS',
      comspec: 'C:\\WINDOWS\\system32\\cmd.exe',
      PathExt: '.EXE',
      Temp: 'C:\\Temp',
      UserProfile: 'C:\\Users\\dev',
      database_url: 'postgres://x',
      Anthropic_Api_Key: 'sk-ant-api-x',
      claude_code_oauth_token: 'sk-ant-oat01-STALE-parent',
    }
    const child = buildChildEnv(parent, 'win32', TOKEN)
    expect(child).toEqual({
      Path: 'C:\\Windows',
      SYSTEMROOT: 'C:\\WINDOWS',
      comspec: 'C:\\WINDOWS\\system32\\cmd.exe',
      PathExt: '.EXE',
      Temp: 'C:\\Temp',
      UserProfile: 'C:\\Users\\dev',
      CLAUDE_CODE_OAUTH_TOKEN: TOKEN,
    })
  })

  it('skips undefined parent values', () => {
    expect(buildChildEnv({ PATH: undefined, HOME: '/h' }, 'linux', TOKEN)).toEqual({
      HOME: '/h',
      CLAUDE_CODE_OAUTH_TOKEN: TOKEN,
    })
  })

  it.each(['linux', 'win32'] as const)('the real spawn (%s) gets the allowlisted env, not process.env', async (platform) => {
    const saved = { ...process.env }
    Object.assign(process.env, SECRETS)
    try {
      setPlatform(platform)
      await inAuth(() => runClaudeCli('prompt'))
      const childEnv = h.spawnCalls[0].env
      expect(childEnv).toEqual(buildChildEnv(process.env, platform, TOKEN))
      expect(childEnv.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN)
      for (const k of Object.keys(SECRETS)) {
        if (k === 'CLAUDE_CODE_OAUTH_TOKEN') continue
        expect(Object.keys(childEnv).map((x) => x.toUpperCase())).not.toContain(k)
      }
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
      Object.assign(process.env, saved)
    }
  })
})

describe('AC-25: claudeCommand per platform and CLAUDE_CLI_PATH', () => {
  it('win32 with no CLAUDE_CLI_PATH → `claude` through the shell (PATHEXT finds .exe or .cmd)', () => {
    expect(claudeCommand('win32', undefined)).toEqual({ cmd: 'claude', shell: true })
  })

  it('POSIX with no CLAUDE_CLI_PATH → `claude`, no shell', () => {
    expect(claudeCommand('linux', undefined)).toEqual({ cmd: 'claude', shell: false })
    expect(claudeCommand('darwin', undefined)).toEqual({ cmd: 'claude', shell: false })
  })

  it('CLAUDE_CLI_PATH set → that path, no shell, on every platform', () => {
    expect(claudeCommand('win32', 'C:\\tools\\claude.exe')).toEqual({ cmd: 'C:\\tools\\claude.exe', shell: false })
    expect(claudeCommand('linux', '/opt/claude')).toEqual({ cmd: '/opt/claude', shell: false })
  })

  it('a POSIX spawn passes the bare empty argument (no shell, so no quotes)', async () => {
    // claudeCommand is the single source the spawn uses; with shell:false the
    // empty argv element reaches the binary intact.
    setPlatform('linux')
    await inAuth(() => runClaudeCli('prompt'))
    expect(h.spawnCalls[0]).toMatchObject({ cmd: 'claude', shell: false })
    expectNoTools(h.spawnCalls[0].args, '')
  })
})

describe('the 600k guard measures the stdin payload', () => {
  it('the payload written to stdin is the prompt, and an oversized one never spawns', async () => {
    setPlatform('linux')
    await inAuth(() => runClaudeCli('hello prompt'))
    expect(h.spawnCalls[0].stdin).toBe('hello prompt')
    h.spawnCalls.length = 0
    await expect(inAuth(() => runClaudeCli('x'.repeat(600_001)))).rejects.toThrow('Prompt too large')
    expect(h.spawnCalls).toHaveLength(0)
  })
})
