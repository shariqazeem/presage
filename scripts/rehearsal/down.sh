#!/usr/bin/env bash
# Stop the rehearsal and point lib/deployments.ts back at the real deployments.
cd "$(dirname "$0")/../.."
pkill -f "engine/main.ts" 2>/dev/null || true
pkill -f "next dev -p 3456" 2>/dev/null || true
pkill -f "anvil --fork-url" 2>/dev/null || true
rm -rf contracts/broadcast/Deploy.s.sol/1088 contracts/cache/Deploy.s.sol/1088
if [ "${1:-}" != "--keep-deployments" ]; then node scripts/deployments.mjs; fi
echo "Rehearsal down"
