# AGENTS Instructions

## Session bootstrap
At the start of every new chat in this repo, read:
1. `docs/PROJECT_MEMORY.md`
2. `persistence/context_snapshot.json`
3. `persistence/session_history.md`

Use those files as the canonical continuity source for what was built, decisions already made, and pending items.

## Continuity update rule
When a major change is completed, update all three files above in the same commit.

## UX rule for client board
Client-facing dashboards must stay non-technical:
- do not expose JSON
- do not expose internal IDs unless explicitly requested
- keep language simple and operational
