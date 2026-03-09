# Neon Migration Notes

Last update: 2026-03-08

## Goal
Use Neon/PostgreSQL as primary audit database for conversations.

## Code changes
- New Postgres store: `src/conversation_audit_postgres_store.js`
- Legacy KV store kept: `src/conversation_audit_kv_store.js`
- Provider wrapper: `src/conversation_audit_store.js`
- SQL schema: `sql/audit_schema.sql`

## Provider selection
- `AUDIT_STORAGE_PROVIDER=postgres` -> force Neon/Postgres
- `AUDIT_STORAGE_PROVIDER=kv` -> legacy KV
- `auto` (default) -> postgres if `DATABASE_URL` exists, else KV

## Required env
- `DATABASE_URL`
- `AUDIT_STORAGE_PROVIDER=postgres` (recommended)
- `AUDIT_ALLOW_MEMORY_FALLBACK=false` in production

## Storage health endpoint
- `GET /api/system/storage`
- Must show:
  - `mode: "postgres"`
  - `persistentStorage: true`

## Existing data migration
A one-time export from KV and import to Postgres was executed to preserve historical records before switching provider.