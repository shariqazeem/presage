#!/usr/bin/env bash
# Deploy Called to Metis Andromeda and verify it, in one go:
#   preflight → deploy → verify on Blockscout → archive the record → lib/deployments.ts → house agents
# Run from your own machine; the deployer key never leaves .env.local.
#   scripts/deploy-contracts.sh
set -euo pipefail
cd "$(dirname "$0")/.."
RPC='https://andromeda.metis.io/?owner=1088'
EXPLORER_API='https://andromeda-explorer.metis.io/api/'
TREASURY="${TREASURY:-0xDF70f6E8e656E5bb714fF0E8CA176d76F26890e3}"
eval "$(grep -E '^CALLED_(DEPLOYER|RUNNER)_(ADDRESS|KEY)=' .env.local | sed 's/^/export /')"

echo "== preflight"
[ "$(cast chain-id --rpc-url "$RPC")" = "1088" ] || { echo "RPC is not Andromeda"; exit 1; }
[ -f contracts/deployments/1088.json ] && { echo "contracts/deployments/1088.json exists: already deployed"; exit 1; }
DB=$(cast balance "$CALLED_DEPLOYER_ADDRESS" --rpc-url "$RPC"); RB=$(cast balance "$CALLED_RUNNER_ADDRESS" --rpc-url "$RPC")
echo "deployer $CALLED_DEPLOYER_ADDRESS $(cast from-wei "$DB") METIS"
echo "runner   $CALLED_RUNNER_ADDRESS $(cast from-wei "$RB") METIS"
[ "$DB" -ge 150000000000000000 ] || { echo "Deployer needs at least 0.15 METIS"; exit 1; }
[ "$RB" -ge 500000000000000000 ] || { echo "Runner needs at least 0.5 METIS"; exit 1; }
echo "treasury $TREASURY"

echo "== deploy"
(cd contracts && RUNNER="$CALLED_RUNNER_ADDRESS" TREASURY="$TREASURY" forge script script/Deploy.s.sol \
  --rpc-url "$RPC" --private-key "$CALLED_DEPLOYER_KEY" --broadcast --legacy --slow 2>&1 | grep -E "Called|COMPLETE|Error|error")
cp contracts/broadcast/Deploy.s.sol/1088/run-latest.json contracts/deployments/1088-broadcast.json
node scripts/deployments.mjs

AGENTS=$(node -e 'console.log(require("./contracts/deployments/1088.json").agents)')
CALLS=$(node -e 'console.log(require("./contracts/deployments/1088.json").calls)')
MARKET=$(node -e 'console.log(require("./contracts/deployments/1088.json").market)')

echo "== verify on Blockscout"
cd contracts
forge verify-contract "$AGENTS" src/CalledAgents.sol:CalledAgents --verifier blockscout --verifier-url "$EXPLORER_API" \
  --constructor-args "$(cast abi-encode 'c(address)' 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)" --watch 2>&1 | tail -1 || true
forge verify-contract "$CALLS" src/CalledLedger.sol:CalledLedger --verifier blockscout --verifier-url "$EXPLORER_API" \
  --constructor-args "$(cast abi-encode 'c(address,address)' "$CALLED_DEPLOYER_ADDRESS" "$AGENTS")" --watch 2>&1 | tail -1 || true
forge verify-contract "$MARKET" src/CalledMarket.sol:CalledMarket --verifier blockscout --verifier-url "$EXPLORER_API" \
  --constructor-args "$(cast abi-encode 'c(address,address,address,address,address,uint256,address)' "$CALLED_DEPLOYER_ADDRESS" "$AGENTS" "$CALLS" 0xD4a5Bb03B5D66d9bf81507379302Ac2C2DFDFa6D 0x58218ea7422255EBE94e56b504035a784b7AA204 90000 "$TREASURY")" --watch 2>&1 | tail -1 || true
cd ..

echo "== house agents"
NEXT_PUBLIC_SITE_URL="${CALLED_PUBLIC_URL:-https://called.80.225.209.190.sslip.io}" npx tsx scripts/register-house-agents.ts

echo
echo "CalledAgents $AGENTS"
echo "CalledLedger  $CALLS"
echo "CalledMarket $MARKET"
echo "Next: commit contracts/deployments and lib/deployments.ts, then scripts/deploy-vm.sh --engine"
