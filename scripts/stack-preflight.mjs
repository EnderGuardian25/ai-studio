// Refuses to continue when the env points at another clone's Docker stack.
// Usage: node scripts/stack-preflight.mjs [--stack-env <path>]   (default .env)
// Not --env-file: Node takes that as its own option even after the script path
// and exits 9 when the file is missing.
// The file is read if it exists, and process.env wins over it (so CI's env
// applies). No skip flag, no CI bypass. Prints key names and refusals only,
// never a value of the env file.
import { existsSync, readFileSync } from 'node:fs'
import { checkStack } from './lib/stackPreflight.mjs'

function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

const i = process.argv.indexOf('--stack-env')
const file = i > -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env'
const refusals = checkStack({ ...loadEnvFile(file), ...process.env })

if (refusals.length) {
  for (const r of refusals) console.error(`stack-preflight: REFUSED (${file}): ${r}`)
  process.exit(1)
}
console.log(`stack-preflight: ok (${file})`)
