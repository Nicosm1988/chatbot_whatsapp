#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

required_vars=(
  META_API_VERSION
  WHATSAPP_ACCESS_TOKEN
  WHATSAPP_PHONE_NUMBER_ID
  WHATSAPP_WEBHOOK_VERIFY_TOKEN
  WHATSAPP_BUSINESS_ACCOUNT_ID
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required env var: $var_name" >&2
    exit 1
  fi
done

vercel_cmd=(npx vercel)
if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  vercel_cmd+=("--token" "$VERCEL_TOKEN")
fi
if [[ -n "${VERCEL_SCOPE:-}" ]]; then
  vercel_cmd+=("--scope" "$VERCEL_SCOPE")
fi

echo "1) Deploying to Vercel production..."
deploy_output="$("${vercel_cmd[@]}" --prod --yes)"
printf "%s\n" "$deploy_output"

base_url="${WEBHOOK_BASE_URL:-}"
if [[ -z "$base_url" ]]; then
  base_url="$(printf "%s\n" "$deploy_output" | sed -n 's/^Aliased: \(https:\/\/[^ ]*\).*/\1/p' | tail -n1)"
fi

if [[ -z "$base_url" ]]; then
  echo "Could not resolve base URL from deployment output." >&2
  exit 1
fi

echo "2) Checking service health at $base_url/health ..."
health_body="$(mktemp)"
health_code="$(curl -sS -m 15 -o "$health_body" -w "%{http_code}" "$base_url/health")"
cat "$health_body"
echo
echo "HTTP:$health_code"
if [[ "$health_code" != "200" ]]; then
  echo "Health check failed." >&2
  exit 1
fi

echo "3) Validating webhook verification endpoint..."
verify_body="$(mktemp)"
verify_code="$(curl -sS -m 15 -G -o "$verify_body" -w "%{http_code}" \
  "$base_url/webhook" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=${WHATSAPP_WEBHOOK_VERIFY_TOKEN}" \
  --data-urlencode "hub.challenge=12345")"
cat "$verify_body"
echo
echo "HTTP:$verify_code"
if [[ "$verify_code" != "200" ]]; then
  echo "Webhook verify endpoint failed." >&2
  exit 1
fi

echo "4) Syncing Meta callback URL..."
sync_response="$(curl -sS -X POST \
  "https://graph.facebook.com/${META_API_VERSION}/${WHATSAPP_BUSINESS_ACCOUNT_ID}/subscribed_apps" \
  -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}" \
  -d "subscribed_fields=messages" \
  --data-urlencode "override_callback_uri=${base_url}/webhook" \
  --data-urlencode "verify_token=${WHATSAPP_WEBHOOK_VERIFY_TOKEN}")"
echo "$sync_response"
if ! printf "%s" "$sync_response" | rg -q '"success"\s*:\s*true'; then
  echo "Meta callback sync failed." >&2
  exit 1
fi

echo "5) Reading callback URL currently configured in Meta..."
callback_config="$(curl -sS -G \
  "https://graph.facebook.com/${META_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}" \
  -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}" \
  --data-urlencode "fields=webhook_configuration")"
echo "$callback_config"
echo
callback_config_unescaped="$(printf "%s" "$callback_config" | sed 's#\\/#/#g')"
if [[ "$callback_config_unescaped" != *"${base_url}/webhook"* ]]; then
  echo "Meta webhook configuration does not match expected base URL." >&2
  exit 1
fi

echo "Done. Fixed webhook base URL: $base_url"
