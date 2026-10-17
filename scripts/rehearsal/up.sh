#!/usr/bin/env bash
# Full local rehearsal against a fresh fork of Metis Andromeda: deploy, register the house agents, and
# run the engine and the web app on it. Nothing here touches mainnet. Undo with scripts/rehearsal/down.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."
REH="${REHEARSAL_DIR:-/tmp/called-rehearsal}"
mkdir -p "$REH"
"$(dirname "$0")/down.sh" --keep-deployments >/dev/null 2>&1 || true

cat > "$REH/env" <<ENV
export CALLED_REHEARSAL=1
export NEXT_PUBLIC_SITE_URL=http://localhost:3456
export NEXT_PUBLIC_CALLED_RPC_URL=http://127.0.0.1:8545
export NEXT_PUBLIC_CALLED_RPC_ONLY=1
export CALLED_DB_PATH=$REH/called.db
export CALLED_CHART_DIR=$REH/charts
export NEXT_TELEMETRY_DISABLED=1
ENV
source "$REH/env"
rm -f "$CALLED_DB_PATH" "$CALLED_DB_PATH-wal" "$CALLED_DB_PATH-shm"

anvil --fork-url 'https://andromeda.metis.io/?owner=1088' --port 8545 --silent > "$REH/anvil.log" 2>&1 &
for _ in $(seq 1 30); do cast chain-id --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1 && break; sleep 1; done

# macOS ships bash 3.2, where `source <(...)` silently reads nothing, so eval instead.
eval "$(grep -E '^CALLED_(DEPLOYER|RUNNER)_(ADDRESS|KEY)=' .env.local | sed 's/^/export /')"
for a in "$CALLED_DEPLOYER_ADDRESS" "$CALLED_RUNNER_ADDRESS"; do
  cast rpc anvil_setBalance "$a" 0x8AC7230489E80000 --rpc-url http://127.0.0.1:8545 >/dev/null
done

mkdir -p contracts/deployments/fork
(cd contracts && RUNNER="$CALLED_RUNNER_ADDRESS" TREASURY="${TREASURY:-0xDF70f6E8e656E5bb714fF0E8CA176d76F26890e3}" \
  DEPLOY_OUT=./deployments/fork/1088.json forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
  --private-key "$CALLED_DEPLOYER_KEY" --broadcast --legacy --slow >/dev/null)
rm -rf contracts/broadcast/Deploy.s.sol/1088 contracts/cache/Deploy.s.sol/1088
node scripts/deployments.mjs contracts/deployments/fork
npx tsx scripts/register-house-agents.ts

npx tsx engine/main.ts > "$REH/engine.log" 2>&1 &
npx next dev -p 3456 > "$REH/web.log" 2>&1 &
for _ in $(seq 1 90); do curl -sf http://localhost:3456/api/stats >/dev/null && break; sleep 2; done
echo "Rehearsal up: http://localhost:3456  (env: source $REH/env)"
