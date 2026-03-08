# Project Memory - WhatsApp Bot Farmacia Delko

Last update: 2026-03-08

## Product goal
Build a production WhatsApp chatbot for **Farmacia Delko** with:
- n8n-like visual flow editor (drag nodes, connect, remove/restore lines, zoom, fit)
- client-facing dashboard in Vercel (non-technical, friendly)
- conversation audit trail for operations and campaign intelligence

## Current production surfaces
- `/` -> central control board (dark mode)
- `/flows` -> full editable n8n-like studio (drag, zoom, connect)
- `/flows/client` -> client-safe visual map (read-only)
- `/conversations` -> client-friendly conversation timeline (no JSON)
- `/api/flows` -> load/save flow catalog
- `/api/conversations` + detail + summary -> audit data APIs

## Core decisions already taken
1. Brand name fixed to **Farmacia Delko**.
2. Flow visualization for client must hide technical payloads/JSON.
3. Keep two flow views:
- Editable studio for operations (`/flows`)
- Simplified map for client (`/flows/client`)
4. Conversation history must be centralized in the same Vercel board.
5. Test runs must be visible in the dashboard (`tag=test_run`).
6. `Mapa para Cliente` should not appear in the main control center navigation.
7. Conversation APIs must fail fast on storage connectivity issues (no infinite loading state).

## Chatbot behavior constraints
- Keep chat coherent, no unintended restart to greeting after valid choices.
- Handle media uploads robustly (recetas/credenciales) and keep state.
- If no receta was uploaded, do not accept `No tengo mas` as completion.
- Avoid exposing internal flow IDs to client-facing UI.

## Data and persistence model
- Conversation audit is stored via Upstash KV when env vars exist:
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- Fallback: in-memory map (dev only, non-persistent).

## Pending strategic backlog (high level)
- Meta official account go-live checklist and webhook hardening.
- Role-based access for editor vs client-only viewers.
- SLA dashboard for human handoff queues.
- Campaign export layer (segments from conversation outcomes).

## Commercial proposal system
- Added a dedicated skills pack under `skills/whatsapp-commercial-proposal-*`.
- Added proposal artifacts under `proposals/`.
- Commercial workflow now supports end-to-end generation: discovery -> pricing -> ROI -> implementation -> risk -> writing -> negotiation.
