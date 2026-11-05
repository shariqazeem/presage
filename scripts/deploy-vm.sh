#!/usr/bin/env bash
# Ship ParallaxPay to the VM without a downtime window: sync the code (never secrets), install, build into
# .next-new while the live site keeps serving .next, swap, restart, verify.
#   scripts/deploy-vm.sh            the web app and the NEAR agent
#   scripts/deploy-vm.sh --engine   also restart the old Metis engine
#   scripts/deploy-vm.sh --web      only the web app (the agent keeps running)
# Contains no secrets; the key path is the operator's. Never touches the other apps on the VM.
set -euo pipefail
KEY="${PARALLAXPAY_VM_KEY:-$HOME/.ssh/sage-vm.key}"
VM="${PARALLAXPAY_VM:-ubuntu@80.225.209.190}"
R=/home/ubuntu/parallaxpay
NODE=/home/ubuntu/.nvm/versions/node/v22.23.2/bin
SITE="${PARALLAXPAY_PUBLIC_URL:-https://parallaxpay.80.225.209.190.sslip.io}"
S() { ssh -n -o StrictHostKeyChecking=no -i "$KEY" "$VM" "$@"; }
cd "$(dirname "$0")/.."

echo "== sync"
# lib/deployments.ts is generated on the VM from contracts/deployments, so a local rehearsal (which
# points that file at a fork) can never reach production. The fork's own record is never shipped.
rsync -az --delete -e "ssh -o StrictHostKeyChecking=no -i $KEY" \
  --exclude node_modules --exclude .next --exclude '.next-*' --exclude var --exclude '.env*' --exclude .git \
  --exclude contracts/lib --exclude contracts/out --exclude contracts/cache --exclude contracts/broadcast \
  --exclude contracts/deployments/fork --exclude lib/deployments.ts --exclude near/vault/target \
  ./ "$VM:$R/"
S "cd $R && export PATH=$NODE:\$PATH && node scripts/deployments.mjs"

echo "== install"
S "cd $R && export PATH=$NODE:\$PATH && npm ci --no-audit --no-fund 2>&1 | tail -1"

echo "== build into .next-new (the live site keeps .next)"
# The live build's type stubs point at the pages it was built from; a page deleted since would fail the
# new build's type check, so they go first (the running server never reads them).
S "cd $R && export PATH=$NODE:\$PATH && rm -rf .next-new .next/types && NEXT_DIST_DIR=.next-new npx next build 2>&1 | tail -2 && test -f .next-new/BUILD_ID" \
  || { echo "BUILD FAILED, live site untouched"; exit 6; }

echo "== swap and restart"
APPS=parallaxpay-web,parallaxpay-near
[ "${1:-}" = "--engine" ] && APPS=parallaxpay-web,parallaxpay-near,parallaxpay-engine
# A web-only change leaves the agent running, so it keeps its candle caches and its place in the scan.
[ "${1:-}" = "--web" ] && APPS=parallaxpay-web
S "cd $R && rm -rf .next-prev && { [ -d .next ] && mv .next .next-prev || true; } && mv .next-new .next && pm2 startOrReload ecosystem.config.cjs --only $APPS --update-env >/dev/null && pm2 save >/dev/null && rm -rf .next-prev"
sleep 6

echo "== verify"
for p in / /desk /start /record /how-it-trades /fund /api/near/agent /api/health; do printf "%-16s → " "$p"; curl -s -o /dev/null -w "%{http_code}\n" --max-time 30 "$SITE$p"; done
S "pm2 jlist | node -e 'let d=\"\";process.stdin.on(\"data\",c=>d+=c).on(\"end\",()=>{for(const p of JSON.parse(d).filter(p=>p.name.startsWith(\"parallaxpay\")))console.log(p.name,p.pm2_env.status,\"restarts\",p.pm2_env.restart_time)})'"
