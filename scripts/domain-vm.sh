#!/usr/bin/env bash
# Put ParallaxPay on its own domain: an nginx site and a Let's Encrypt certificate on the VM, www sent to
# the bare domain, the old sslip link sent to the new one (every path), and the app rebuilt with its new
# public URL. Run it once the domain's A records (@ and www) point at the VM.
#   scripts/domain-vm.sh parallaxpay.ai
# Touches only ParallaxPay's own nginx sites, and checks the whole nginx config before every reload, so the
# other apps on the VM keep serving.
set -euo pipefail
DOMAIN="${1:?usage: scripts/domain-vm.sh <domain>}"
KEY="${PARALLAXPAY_VM_KEY:-$HOME/.ssh/sage-vm.key}"
VM="${PARALLAXPAY_VM:-ubuntu@80.225.209.190}"
IP="${VM#*@}"
OLD=parallaxpay.80.225.209.190.sslip.io
S() { ssh -o StrictHostKeyChecking=no -i "$KEY" "$VM" "$@"; }
cd "$(dirname "$0")/.."

echo "== DNS"
for h in "$DOMAIN" "www.$DOMAIN"; do
  got=$(dig +short A "$h" @1.1.1.1 | tail -1)
  [ "$got" = "$IP" ] || { echo "$h points at '${got:-nothing}', not $IP. Set its A record and run this again."; exit 3; }
  echo "$h → $got"
done

echo "== nginx site for $DOMAIN"
# The www block redirects inside `location /`, so the certificate's challenge (an exact-match location
# certbot adds) still reaches it.
S "sudo tee /etc/nginx/sites-available/parallaxpay-domain >/dev/null" <<EOF
# ParallaxPay on its own domain: reverse proxy to the pm2 \`parallaxpay-web\` app on :3500.
server {
    server_name $DOMAIN;
    listen 80;
    listen [::]:80;
    client_max_body_size 4m;
    location / {
        proxy_pass http://127.0.0.1:3500;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}

server {
    server_name www.$DOMAIN;
    listen 80;
    listen [::]:80;
    location / {
        return 301 https://$DOMAIN\$request_uri;
    }
}
EOF
S "sudo ln -sf /etc/nginx/sites-available/parallaxpay-domain /etc/nginx/sites-enabled/parallaxpay-domain && sudo nginx -t 2>&1 | tail -1 && sudo systemctl reload nginx"

echo "== certificate"
S "sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --redirect 2>&1 | tail -4"
S "sudo nginx -t 2>&1 | tail -1 && sudo systemctl reload nginx"

echo "== the old link sends every path to $DOMAIN"
S "sudo cp -n /etc/nginx/sites-available/parallaxpay /etc/nginx/sites-available/parallaxpay.bak-sslip"
S "sudo tee /etc/nginx/sites-available/parallaxpay >/dev/null" <<EOF
# ParallaxPay's old link. The app lives at https://$DOMAIN; every path here is sent there.
server {
    server_name $OLD;
    location / {
        return 301 https://$DOMAIN\$request_uri;
    }

    listen [::]:443 ssl; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/$OLD/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/$OLD/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if (\$host = $OLD) {
        return 301 https://\$host\$request_uri;
    } # managed by Certbot

    server_name $OLD;
    listen 80;
    listen [::]:80;
    return 404; # managed by Certbot
}
EOF
S "sudo nginx -t 2>&1 | tail -1 && sudo systemctl reload nginx" || {
  echo "nginx refused the new config: putting the old site back"
  S "sudo cp /etc/nginx/sites-available/parallaxpay.bak-sslip /etc/nginx/sites-available/parallaxpay && sudo nginx -t && sudo systemctl reload nginx"
  exit 5
}

echo "== the app's public URL, then a rebuild"
S "sed -i 's#^NEXT_PUBLIC_SITE_URL=.*#NEXT_PUBLIC_SITE_URL=https://$DOMAIN#' /home/ubuntu/parallaxpay/.env.local && grep -c '^NEXT_PUBLIC_SITE_URL=https://$DOMAIN' /home/ubuntu/parallaxpay/.env.local"
PARALLAXPAY_PUBLIC_URL="https://$DOMAIN" bash scripts/deploy-vm.sh --web

echo "== check"
for u in "https://$DOMAIN/" "https://www.$DOMAIN/desk" "https://$OLD/board" "http://$DOMAIN/"; do
  printf "%-50s → " "$u"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" --max-time 20 "$u"
done
