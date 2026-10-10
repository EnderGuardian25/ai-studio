// CLI entry for the per-channel caption backfill (012 FR-04, design §8).
//
//   node dist/scripts/backfill-captions.js     docker-entrypoint.sh, after migrate deploy
//   npm run captions:backfill                  by hand (tsx)
//   npm run captions:report                    print the REVIEW list, write nothing
//
// Exits non-zero only on a top-level failure (the database unreachable, the
// lock query failing); per-draft errors are counted in the summary instead.
// Under the entrypoint's `set -e`, a non-zero exit fails the deploy loudly.

import { PrismaClient } from '@prisma/client'
import { runCaptionBackfill } from '@/lib/captions/backfill'

// pg_advisory_lock belongs to the database session that took it. With a pool,
// the unlock could go out on another connection and leave the lock held, so
// the backfill runs on a client with exactly one connection.
function singleConnectionUrl(): string {
  const raw = process.env.DATABASE_URL
  if (!raw) throw new Error('DATABASE_URL is not set')
  const url = new URL(raw)
  url.searchParams.set('connection_limit', '1')
  return url.toString()
}

async function main() {
  const db = new PrismaClient({ datasourceUrl: singleConnectionUrl() })
  try {
    await runCaptionBackfill({ report: process.argv.includes('--report'), db })
  } finally {
    await db.$disconnect()
  }
}

main().catch((err) => {
  console.error('[captions] backfill failed:', err)
  process.exit(1)
})
