// Pure stack check, no I/O. `checkStack(env)` returns a list of refusals; an
// empty list means the env points at this clone's own stack. It exists so a
// migrate, seed or test-database command can never reach another clone's
// Postgres or MinIO that publishes the old default ports (change 032, FR-08).
export const COMPANY_PG_PORTS = [5432, 5433]
export const COMPANY_MINIO_PORTS = [9000, 9010]
export const COMPANY_PROJECT = 'designer'
export const COMPANY_DB_PREFIX = 'bistec_studio'
export const DEFAULT_POSTGRES_HOST_PORT = 5442
export const DEFAULT_MINIO_HOST_PORT = 9100

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]']
const DEFAULT_PORTS = { 'postgresql:': 5432, 'postgres:': 5432, 'http:': 80, 'https:': 443 }

function parse(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    const port = url.port ? Number(url.port) : (DEFAULT_PORTS[url.protocol] ?? null)
    return {
      // A `postgresql:` URL is not a special scheme, so URL keeps the host's case.
      local: LOCAL_HOSTS.includes(url.hostname.toLowerCase()),
      port,
      db: url.pathname.replace(/^\//, ''),
    }
  } catch {
    return null
  }
}

function portOf(value, fallback) {
  const n = Number(value)
  return value && Number.isInteger(n) ? n : fallback
}

export function checkStack(env) {
  const refusals = []

  if ((env.COMPOSE_PROJECT_NAME ?? '').trim() === COMPANY_PROJECT) {
    refusals.push(`COMPOSE_PROJECT_NAME is "${COMPANY_PROJECT}", the other clone's stack. Use the fork's own (ai-studio).`)
  }

  const db = parse(env.DATABASE_URL)
  if (!env.DATABASE_URL) {
    refusals.push('DATABASE_URL is not set.')
  } else if (!db) {
    refusals.push('DATABASE_URL is not a valid URL.')
  } else {
    if (db.local && COMPANY_PG_PORTS.includes(db.port)) {
      refusals.push(`DATABASE_URL points at local port ${db.port}, which is the other clone's Postgres. The fork's is ${DEFAULT_POSTGRES_HOST_PORT}.`)
    }
    if (db.db.startsWith(COMPANY_DB_PREFIX)) {
      refusals.push(`DATABASE_URL names database "${db.db}": names starting with "${COMPANY_DB_PREFIX}" belong to the other clone. The fork uses ai_studio*.`)
    }
    const expected = portOf(env.POSTGRES_HOST_PORT, DEFAULT_POSTGRES_HOST_PORT)
    if (db.local && db.port !== expected) {
      refusals.push(`DATABASE_URL port ${db.port} differs from POSTGRES_HOST_PORT (${expected}).`)
    }
  }

  for (const name of ['MINIO_ENDPOINT', 'MINIO_PUBLIC_ENDPOINT']) {
    const m = parse(env[name])
    if (m && m.local && COMPANY_MINIO_PORTS.includes(m.port)) {
      refusals.push(`${name} points at local port ${m.port}, which is the other clone's MinIO. The fork's is ${DEFAULT_MINIO_HOST_PORT}.`)
    }
  }
  const minio = parse(env.MINIO_ENDPOINT)
  if (minio && minio.local) {
    const expected = portOf(env.MINIO_HOST_PORT, DEFAULT_MINIO_HOST_PORT)
    if (minio.port !== expected) {
      refusals.push(`MINIO_ENDPOINT port ${minio.port} differs from MINIO_HOST_PORT (${expected}).`)
    }
  }

  return refusals
}
