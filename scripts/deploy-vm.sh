#!/usr/bin/env bash
# Ship Presage to the VM without a downtime window: sync the code (never secrets), install, build into
# .next-new while the live site keeps serving .next, swap, restart, verify.
#   scripts/deploy-vm.sh            web only
#   scripts/deploy-vm.sh --engine   web and engine
# Contains no secrets; the key path is the operator's. Never touches the other apps on the VM.
set -euo pipefail
KEY="${PRESAGE_VM_KEY:-$HOME/.ssh/sage-vm.key}"
VM="${PRESAGE_VM:-ubuntu@80.225.209.190}"
R=/home/ubuntu/presage
NODE=/home/ubuntu/.nvm/versions/node/v22.23.2/bin
SITE="${PRESAGE_PUBLIC_URL:-https://presage.80.225.209.190.sslip.io}"
S() { ssh -n -o StrictHostKeyChecking=no -i "$KEY" "$VM" "$@"; }
cd "$(dirname "$0")/.."

echo "== sync"
rsync -az --delete -e "ssh -o StrictHostKeyChecking=no -i $KEY" \
  --exclude node_modules --exclude .next --exclude '.next-*' --exclude var --exclude '.env*' --exclude .git \
  --exclude contracts/lib --exclude contracts/out --exclude contracts/cache --exclude contracts/broadcast \
  ./ "$VM:$R/"

echo "== install"
S "cd $R && export PATH=$NODE:\$PATH && npm ci --no-audit --no-fund 2>&1 | tail -1"

echo "== build into .next-new (the live site keeps .next)"
S "cd $R && export PATH=$NODE:\$PATH && rm -rf .next-new && NEXT_DIST_DIR=.next-new npx next build 2>&1 | tail -2 && test -f .next-new/BUILD_ID" \
  || { echo "BUILD FAILED, live site untouched"; exit 6; }

echo "== swap and restart"
APPS=presage-web
[ "${1:-}" = "--engine" ] && APPS=presage-web,presage-engine
S "cd $R && rm -rf .next-prev && { [ -d .next ] && mv .next .next-prev || true; } && mv .next-new .next && pm2 startOrReload ecosystem.config.cjs --only $APPS --update-env >/dev/null && pm2 save >/dev/null && rm -rf .next-prev"
sleep 6

echo "== verify"
for p in / /oracle /agents /build /record /api/stats; do printf "%-12s → " "$p"; curl -s -o /dev/null -w "%{http_code}\n" --max-time 30 "$SITE$p"; done
S "pm2 jlist | node -e 'let d=\"\";process.stdin.on(\"data\",c=>d+=c).on(\"end\",()=>{for(const p of JSON.parse(d).filter(p=>p.name.startsWith(\"presage\")))console.log(p.name,p.pm2_env.status,\"restarts\",p.pm2_env.restart_time)})'"
