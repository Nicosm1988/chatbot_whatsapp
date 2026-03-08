# Client Runbook - Farmacia Delko

Last update: 2026-03-08

## 1) Daily use URLs
- Control center: `/`
- Editable flow studio: `/flows`
- Client flow map: `/flows/client`
- Conversation history: `/conversations`

## 2) Operator workflow
1. Open `/`.
2. Use **Editor de Flujos (n8n)** to adjust nodes/paths/messages.
3. Click `Guardar` in editor.
4. Validate with a controlled WhatsApp test run.
5. Check `/conversations?tag=test_run` for traceability.

## 3) Mandatory environment variables
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `BUSINESS_DISPLAY_NAME=Farmacia Delko`
- `KV_REST_API_URL` (for persistent audit)
- `KV_REST_API_TOKEN` (for persistent audit)

## 4) Production checks before client handoff
1. `/health` returns 200.
2. Send test text, interactive click, image/PDF and confirm logs in `/conversations`.
3. Confirm no client page displays JSON or internal IDs.
4. Confirm editor can drag nodes, connect nodes, remove/restore edges, zoom and fit.
5. Confirm flow edits affect runtime chatbot behavior.

## 5) Incident quick actions
- If webhook fails signature: check `WHATSAPP_APP_SECRET` mismatch.
- If messages fail send: validate recipient format and Meta test recipient whitelist.
- If history not persistent: verify Upstash KV env vars.
- If flow map seems stale: open `/flows`, save once, refresh `/flows/client`.
