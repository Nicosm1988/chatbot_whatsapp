# Session History Log

## 2026-03-08
- Defined target chatbot logic based on WhatsApp screenshot flow.
- Corrected brand naming to **Farmacia Delko**.
- Added central Vercel board to visualize flows and operations.
- Added conversation audit system and client timeline views.
- Removed raw technical payloads/JSON from client-facing dashboards.
- Split flow visualization into:
  - editable n8n-like studio (`/flows`)
  - client-safe map (`/flows/client`)
- Restored editing/moving capability by exposing editor again in central board.
- Applied dark mode across central board, conversation board, and client map.
- Added persistent project memory files in `docs/` and `persistence/`.
- Removed `Mapa para Cliente` from main client board navigation.
- Hardened conversation connectivity with API/KV timeouts, retries and fallback cache to avoid infinite `Cargando`.
- Optimized audit reads for conversations/summary/detail with batched loading.
- Aligned left-side counters with active board context (`Casos` vs `Registro de Pruebas`) to avoid count/list mismatch.
- Created a full commercial proposal skills pack with 8 new skills and agents:
  - orchestrator
  - discovery
  - packaging/pricing
  - ROI
  - implementation
  - risk/governance
  - proposal writer
  - negotiation/closing
- Added `proposals/Farmacia_Delko_Propuesta_Comercial_v1.md` as initial client-facing commercial proposal draft.
- Enforced production-safe audit behavior:
  - if persistent storage is not configured, conversation APIs return `audit_storage_unavailable` (503)
  - memory fallback is disabled by default in production
  - dashboard surfaces explicit storage status instead of inconsistent counts

## Maintenance rule
After every major product change, update:
1. `docs/PROJECT_MEMORY.md`
2. `persistence/context_snapshot.json`
3. this `persistence/session_history.md`
