#!/usr/bin/env bash
# 033 full gate (from 032's). Usage: bash .specclaw/changes/033-folio-fidelity-pass/tools/gate.sh <logdir>
# Env: CAPTURE=1 also writes the reference screenshots (ref-shots.mjs) and a full
# capture set into ${CAPTURE_OUT:-ui-captures/033}. Run it in the background; read <logdir>/summary.txt.
# Needs Docker Desktop up and the ai-studio stack (docker compose up -d postgres minio).
set -u
cd "$(git rev-parse --show-toplevel)"
L="$1"; mkdir -p "$L"
step() { local name="$1"; shift; echo "== $name start $(date +%T)" >> "$L/summary.txt"; "$@" > "$L/$name.log" 2>&1; local rc=$?; echo "== $name exit=$rc $(date +%T)" >> "$L/summary.txt"; return $rc; }
kill_repo_node() {
  powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*ai-studio*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1
}

step tsc npx tsc --noEmit
step lint npm run lint
step unit npm run test:unit
step render npm run test:render
step upgrade npm run test:upgrade
step folio node scripts/check-folio-restore.mjs
# 033 T1 adds these two; they are skipped until the script exists.
if [ -f scripts/check-ui-invariants.mjs ]; then
  step invariants node scripts/check-ui-invariants.mjs
  step coverage node scripts/check-ui-invariants.mjs --coverage
fi

kill_repo_node; rm -rf .next
step e2edb npm run test:e2e:db -- --reset
npm run test:e2e:serve > "$L/serve.log" 2>&1 &
for i in $(seq 1 120); do curl -s -o /dev/null http://localhost:3001/login && break; sleep 2; done
echo "== server up after ${i} tries $(date +%T)" >> "$L/summary.txt"
step e2e npm run test:e2e:mock
echo "MOCK_EXIT=$?" >> "$L/summary.txt"
if [ -n "${CAPTURE:-}" ]; then
  node --input-type=module < "$(dirname "$0")/ref-shots.mjs" > "$L/refshots.log" 2>&1; echo "== refshots exit=$?" >> "$L/summary.txt"
  node scripts/capture-ui.mjs --out "${CAPTURE_OUT:-ui-captures/033}" > "$L/capture.log" 2>&1; echo "== capture exit=$?" >> "$L/summary.txt"
fi
kill_repo_node; sleep 2; rm -rf .next
step build npm run build
rm -rf .next
git checkout -- next-env.d.ts 2>/dev/null
echo "== GATE DONE $(date +%T)" >> "$L/summary.txt"
