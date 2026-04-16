# Neon Migration Notes

Last update: 2026-04-15

## Goal

Use Neon or any compatible PostgreSQL database as the primary persistent audit store for conversations.

## Current implementation

- Postgres store: `apps/whatsapp-bot-node/src/conversation_audit_postgres_store.js`
- Legacy KV store: `apps/whatsapp-bot-node/src/conversation_audit_kv_store.js`
- Provider wrapper: `apps/whatsapp-bot-node/src/conversation_audit_store.js`

Important:

- there is no separate SQL file that must be run manually
- the Postgres store creates its tables on demand with `CREATE TABLE IF NOT EXISTS`

## Provider selection

- `AUDIT_STORAGE_PROVIDER=postgres` -> force Postgres
- `AUDIT_STORAGE_PROVIDER=neon` -> alias of Postgres
- `AUDIT_STORAGE_PROVIDER=kv` -> force KV
- `AUDIT_STORAGE_PROVIDER=redis` -> alias of KV
- `AUDIT_STORAGE_PROVIDER=auto` -> use Postgres if `DATABASE_URL` exists, otherwise KV

## Required environment variables

- `DATABASE_URL`
- `AUDIT_STORAGE_PROVIDER=postgres`
- `AUDIT_ALLOW_MEMORY_FALLBACK=false` in production

Optional tuning:

- `AUDIT_DB_POOL_MAX`
- `AUDIT_DB_IDLE_TIMEOUT_MS`
- `AUDIT_DB_STATEMENT_TIMEOUT_MS`

## Quick setup

1. Create a Neon or PostgreSQL database.
2. Copy its connection string into `DATABASE_URL`.
3. Set:

```dotenv
AUDIT_STORAGE_PROVIDER=postgres
AUDIT_ALLOW_MEMORY_FALLBACK=false
```

4. Start the app.
5. Hit the storage endpoints.

## Endpoints to verify

- `GET /api/system/storage`
- `GET /api/system/ready`

Healthy expectations:

- storage provider should resolve to Postgres
- persistent storage should be available
- no recent DB read or write errors should remain active

## Notes

- local development can still use fallback behavior if configured that way
- production should not rely on in-memory fallback
- KV remains supported as a legacy or backup path, but Postgres is the preferred primary store
