import { describe, expect, it } from 'vitest'
import { checkStack } from '../../scripts/lib/stackPreflight.mjs'

const ok = {
  COMPOSE_PROJECT_NAME: 'ai-studio',
  POSTGRES_HOST_PORT: '5442',
  MINIO_HOST_PORT: '9100',
  DATABASE_URL: 'postgresql://bistec:bistec@localhost:5442/ai_studio',
  MINIO_ENDPOINT: 'http://localhost:9100',
  MINIO_PUBLIC_ENDPOINT: 'http://localhost:9100',
}
const check = (over: Record<string, string>) => checkStack({ ...ok, ...over }) as string[]

describe('checkStack', () => {
  it('accepts the .env.example defaults', () => {
    expect(check({})).toEqual([])
  })
  it('accepts the defaults with the port variables unset', () => {
    expect(
      checkStack({ DATABASE_URL: ok.DATABASE_URL, MINIO_ENDPOINT: ok.MINIO_ENDPOINT }),
    ).toEqual([])
  })
  it('accepts a non-local host (the container network)', () => {
    expect(
      check({
        DATABASE_URL: 'postgresql://bistec:bistec@postgres:5432/ai_studio',
        MINIO_ENDPOINT: 'http://minio:9000',
        MINIO_PUBLIC_ENDPOINT: 'http://minio:9000',
      }),
    ).toEqual([])
  })
  it('refuses COMPOSE_PROJECT_NAME=designer', () => {
    expect(check({ COMPOSE_PROJECT_NAME: 'designer' }).join('\n')).toMatch(/COMPOSE_PROJECT_NAME/)
  })
  it.each(['5432', '5433'])('refuses a local DATABASE_URL on port %s', (port) => {
    const r = check({ DATABASE_URL: `postgresql://u:p@localhost:${port}/ai_studio` })
    expect(r.join('\n')).toMatch(new RegExp(`local port ${port}`))
  })
  it('refuses a bistec_studio database name', () => {
    const r = check({ DATABASE_URL: 'postgresql://u:p@localhost:5442/bistec_studio_test' })
    expect(r.join('\n')).toMatch(/bistec_studio_test/)
  })
  it.each(['9000', '9010'])('refuses MinIO on local port %s', (port) => {
    expect(check({ MINIO_ENDPOINT: `http://localhost:${port}` }).join('\n')).toMatch(
      new RegExp(`MINIO_ENDPOINT points at local port ${port}`),
    )
    expect(check({ MINIO_PUBLIC_ENDPOINT: `http://127.0.0.1:${port}` }).join('\n')).toMatch(
      /MINIO_PUBLIC_ENDPOINT/,
    )
  })
  it('refuses a DATABASE_URL port that differs from POSTGRES_HOST_PORT', () => {
    const r = check({ DATABASE_URL: 'postgresql://u:p@localhost:5443/ai_studio' })
    expect(r.join('\n')).toMatch(/differs from POSTGRES_HOST_PORT/)
  })
  it('refuses a MINIO_ENDPOINT port that differs from MINIO_HOST_PORT', () => {
    const r = check({ MINIO_ENDPOINT: 'http://localhost:9111', MINIO_PUBLIC_ENDPOINT: 'http://localhost:9111' })
    expect(r.join('\n')).toMatch(/differs from MINIO_HOST_PORT/)
  })
  it('refuses a missing DATABASE_URL', () => {
    expect(checkStack({}) as string[]).toContain('DATABASE_URL is not set.')
  })
  it('refuses a malformed DATABASE_URL', () => {
    expect(check({ DATABASE_URL: 'not a url' })).toContain('DATABASE_URL is not a valid URL.')
  })
  it.each(['LOCALHOST', '127.0.0.1', '[::1]'])('treats %s as local', (host) => {
    const r = check({ DATABASE_URL: `postgresql://u:p@${host}:5432/ai_studio` })
    expect(r.join('\n')).toMatch(/local port 5432/)
  })
  it('reads a URL with no port as the default Postgres port', () => {
    const r = check({ DATABASE_URL: 'postgresql://u:p@localhost/ai_studio' })
    expect(r.join('\n')).toMatch(/local port 5432/)
  })
})
