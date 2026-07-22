# Project Memory - WhatsApp Bot Farmacia Delko

Last update: 2026-07-21

## Bot inicial / Bot completo and pharmacy-number readiness on 2026-07-21
- The project now exposes two business-facing operating modes while preserving the existing internal mode values for storage compatibility:
  - `Bot inicial` (`holding` internally)
  - `Bot completo` (`chatbot` internally)
- Bot inicial behavior:
  - sends one warm formal welcome per active conversation and recovers that state from the persistent audit after a process restart
  - stores the conversation in advisor-controlled state
  - applies the managed label `Aguardando ser atendido`
  - sends no repeated automatic replies while the customer waits
  - the first real pharmacy-side response, including media-only replies, changes the managed label to `Atendido` and keeps the bot silent
  - a later human closure still applies `Finalizado`; a new customer message after closure may start a fresh conversation
- The dashboard now names the modes in client language and renders:
  - `Aguardando ser atendido` in red
  - `Atendido` in green
- WhatsApp-native label names are created/synchronized automatically while unrelated labels are preserved. The exact native WhatsApp label colors require one manual setup in WhatsApp Business because the Web library has no stable public color-management API.
- Safe operator commands are supported only from the pharmacy number's self-chat:
  - `Activá el bot inicial`
  - `Activá el bot completo`
  - customer messages cannot switch the global mode
- The HTTP mode selector is write-enabled only from the loopback interface on the bot PC. Vercel, remote addresses and public dashboard views are read-only; the local panel must not be exposed through a public reverse proxy or tunnel.
- Active `agent_pending` audit records are now reused instead of opening a new conversation for each follow-up. Closed historical records cannot be accidentally re-labeled as attended.
- The user approved the Bot inicial welcome for the pharmacy pilot:
  - `👋 ¡Hola! Muchas gracias por comunicarte con Farmacia Delko.`
  - `Recibimos tu mensaje. En breve, una persona de nuestro equipo te atenderá por este medio.`
  - `💚 Gracias por tu paciencia.`
- Readiness conclusion:
  - automated code validation is green after the final safety review: `151 pass / 2 skip / 0 fail`
  - the release reconciles the Bot inicial work with the later VPN/new-machine handoff from `origin/main`
  - the first WhatsApp Web sync skips pending unread recovery by default, preventing historical unread chats from receiving a welcome when the pharmacy number is first linked
  - automatic polling and direct inbound events remain gated until that first baseline is fully established, closing the startup/QR race
  - later reconnects in the same process recover only recent pending messages, with a 300-second default window
  - Web mode fails closed to `holding` when no explicit mode is available; an unpersisted mode change is rejected and leaves the previous mode active
  - the Windows handoff includes `npm run lab:stop` so an existing watchdog cannot relaunch Node during an update
  - the real-send validation script now requires both an explicit authorized contact and `WHATSAPP_VALIDATE_ALLOW_REAL_SEND=CONFIRMO`; it must not be used for the Bot inicial smoke test
  - GitHub release validation runs tests only, and the normal production deploy updates Vercel without synchronizing Meta webhooks
  - Vercel and the documented runtime are pinned to Node `22.x`
  - compatible production dependency patches reduced the npm audit from 13 advisories to 5 without changing the pinned WhatsApp Web runtime; the remaining advisories are inherited through its legacy Puppeteer stack and require a separately validated runtime upgrade
  - the reconciled release was published to `origin/main` at commit `ba9d8fece86d9a5bb70d01a515d5d8d195686de8`
  - the stable Vercel production deployment is `Ready` at `https://whatsapp-bot-node-chatbot1.vercel.app`
  - the Linux workspace currently has no running Web runtime or controlled browser
  - the pharmacy number is not selected through a code variable; it becomes active when that WhatsApp Business account links the controlled Windows browser by QR
  - live go-live remains pending only on the pharmacy equipment: stop/update/restart the Windows runtime, persist Bot inicial, link the pharmacy account by QR, then validate one real inbound message, label transition and human response
  - Bot completo additionally needs a real Plex product/stock check because the current audit observed a live `403` and documentary fallback
- No Meta Cloud/WABA/button integration is required for this Web mode, but it still uses WhatsApp (a Meta service) through unofficial Web automation. The existing restriction/termination risk and owner acknowledgement requirement remain unchanged.

## WhatsApp Web text-menu operating decision on 2026-07-13
- The current implementation path is WhatsApp Web with visible letter choices (`A`, `B`, `C`, etc.); official Meta Cloud onboarding remains paused while the portfolio review is pending.
- Customers receive ordinary text menus and advance by typing the corresponding letter. Official interactive buttons are not required for this path.
- Runtime responsibility is split explicitly:
  - Vercel can continue serving the dashboards and persisted views
  - the WhatsApp Web transport must run on the pharmacy's Windows PC with the controlled Chrome/Edge session available
  - Vercel cannot host or replace that persistent browser session
- Web mode does not require the Meta Cloud access token, phone-number ID, WABA ID or webhook synchronization.
- The automatic inactivity check now runs inside the local Web process every five minutes; the scheduled GitHub call to the Vercel Cloud endpoint was disabled and retained only as a manual diagnostic workflow.
- Letter-menu hardening completed:
  - an externally sent inactivity prompt now replaces the previous menu mapping, so `A = Sí` and `B = No` are interpreted correctly
  - invalid text at the recipe-upload step no longer resets the retry counter forever
  - after three invalid recipe attempts, the bot hands the conversation to an advisor
  - runtime checkout tests no longer depend on a stale historical letter sequence
- Operational status at this checkpoint:
  - full automated suite: `127 pass / 2 skip / 0 fail`
  - focused Web suite: `71 pass / 2 skip / 0 fail`
  - no WhatsApp Web process or remote-debug browser is running on the current Linux workspace
  - activation and a real `Hola -> A` end-to-end check are still pending on the pharmacy's Windows PC
- Risk boundary:
  - `whatsapp-web.js` is not an officially authorized WhatsApp Business integration
  - it has no Meta support or SLA and carries a material risk of account restriction or termination
  - opt-in and avoiding outbound bulk messaging reduce spam exposure but do not make the transport official
  - before linking the pharmacy's main number, the owner must be informed; a non-critical secondary number is the recommended first pilot

## Meta Business restriction and official onboarding pause on 2026-07-13
- Confirmed the legitimate Business Portfolio `Farmacia Delko` exists and the current owner account has full control.
- Attempts to add the technical operator as a person failed before any invitation was created:
  - the operator email is linked to the intended Facebook profile
  - the operator profile status is good
  - two-factor authentication was enabled
  - a clean invitation used basic access, no temporary access and zero assigned assets
  - the `Requests` and `Sent` views contained no pending request
- Business Support Home exposed the actual platform blocker:
  - Meta restricted `Farmacia Delko` on 2026-07-13
  - the stated reason is suspected use or creation through automation that does not comply with Meta rules
  - the visible restriction disables creating/publishing ads and using/sharing audiences
- Official Meta/WhatsApp onboarding is paused until that restriction is reviewed and removed.
- Compliance guardrails for the recovery:
  - stop automated or scripted browser access to Meta account-management surfaces
  - do not create another portfolio or attempt to bypass the restriction
  - do not repeat person invitations while the restriction remains
  - the owner account was secured from a familiar device on 2026-07-13 after rotating the exposed password, enabling owner two-factor authentication and reviewing active sessions
  - any review request must be truthful and submitted from the owner's normal session after account security is restored
- Restriction review status:
  - a review was submitted on 2026-07-13
  - Meta's confirmation screen says the business remains restricted during review and shows an expected response window of up to four days
  - the operator submitted personal contact/identity evidence instead of the owner's identity evidence
  - this creates a possible identity mismatch because the operator invitation had not been accepted
  - no personal document numbers or images are stored in the project
  - do not upload more documents, submit another review or change business assets while the case is pending
  - if Meta requests clarification or rejects the review, respond truthfully and use the owner/business evidence Meta specifically requests
- After reinstatement, continue with a clean pharmacy-owned Meta app, WABA, pharmacy phone number and system-user token; do not reuse the rejected legacy lab WABA or test number.
- The production backend remains technically prepared for Meta Cloud API, but the final App Secret/signature enforcement and new pharmacy-owned Meta credentials are still pending.

## New-machine install hardening and VPN note on 2026-04-25
- Hardened the GitHub handoff so another Windows machine can detect pharmacy-network issues before booting the bot:
  - added connectivity checker:
    - `apps/whatsapp-bot-node/scripts/check_pharmacy_connectivity.ps1`
  - added npm shortcut:
    - `npm run lab:check-pharmacy`
- Refreshed the fresh-install docs so the hidden local prerequisites are explicit:
  - `README.md`
  - `docs/INSTALACION_EN_OTRA_MAQUINA.md`
  - `docs/CLIENT_RUNBOOK.md`
  - `docs/GUIA_GITHUB_Y_REPOSITORIO.md`
  - `apps/whatsapp-bot-node/.env.example`
- Locked the new-machine expectations more honestly:
  - `apps/whatsapp-bot-node/.env.local` is intentionally not committed to GitHub
  - the authenticated WhatsApp Web session is intentionally not committed to GitHub
  - a fresh machine may need a new QR link even if the repo was cloned correctly
- Added the current operator-network clue to the install/runbook docs:
  - if `http://delko.plex25center.com.ar:8081` does not respond from another machine, connect the vendor VPN first
  - the current operator clue points to `Radmin VPN`
- Live local validation completed:
  - `npm run lab:check-pharmacy`
  - result:
    - DNS OK
    - TCP OK
    - authenticated HTTP OK against `/wsplexcenter/sucursales`
- The three advisor-handoff runtime failures observed at that checkpoint were subsequently fixed; the current 2026-07-21 suite is green at `145 pass / 2 skip / 0 fail`.

## Power BI pharmacy API guide on 2026-04-16
- Added a dedicated Power BI handoff and modeling guide:
  - `docs/POWER_BI_FARMACIA.md`
- Locked the recommended BI source so future work does not drift back to the chatbot audit database:
  - Power BI for products, prices, stock and sales must come from the pharmacy software API
  - not from Neon/Postgres conversation storage
- Confirmed the live BI integration shape against the existing pharmacy credentials and code path:
  - API base host documented as `http://delko.plex25center.com.ar:8081`
  - auth mode documented as `Basic`
  - project integration implementation remains:
    - `apps/whatsapp-bot-node/src/pharmacy_system_lookup.js`
- Confirmed and documented the main endpoints currently useful for BI:
  - `sucursales`
  - `productos`
  - `stock`
  - `laboratorios`
  - `clientes`
  - `ventas`
- Confirmed and documented the response-shape details needed for modeling:
  - `ventas` currently returns `comprobantes`
  - `comprobantes` contains nested `lineas`, `medios_de_pago` and `recetas`
  - a live sample indicates `lineas.idproducto` matches `productos.codproducto`, but this still needs broader validation before treating it as permanently canonical
- Documented the required Power BI project format for repo-based collaboration:
  - container: `PBIP`
  - report: `PBIR`
  - semantic model: `TMDL`
- Documented the main operational caveat for the next BI step:
  - Windows path length can become a problem for PBIP in the current long local repo path
  - if Power BI fails to save cleanly, use a shorter clone path for the BI working copy

## GitHub documentation pack on 2026-04-15
- Added a proper GitHub-first documentation entrypoint at repo root:
  - `README.md`
- Added a dedicated reinstall and handoff guide for another Windows machine:
  - `docs/INSTALACION_EN_OTRA_MAQUINA.md`
- Added a repository map with canonical GitHub links and file ownership by area:
  - `docs/GUIA_GITHUB_Y_REPOSITORIO.md`
- Refreshed the operational docs that were stale for a fresh clone:
  - `docs/CLIENT_RUNBOOK.md`
  - `docs/NEON_MIGRATION.md`
- The new documentation now centralizes:
  - repo URL
  - clone URL
  - direct ZIP download URL
  - production URL
  - current scripts
  - install steps
  - storage notes
  - extension install path
  - canonical source artifacts at repo root
- Documentation scope was written against the current repo reality instead of older assumptions:
  - `apps/whatsapp-bot-node` is the runnable app root
  - `Node 22` is the documented standard because the GitHub workflow uses it
  - `/flows/client` is documented as a legacy redirect to `/flows`

## Programa de sobrepeso y diabetes UX lock on 2026-04-15
- Completed the requested checkout restriction for the guided treatment branch in `apps/whatsapp-bot-node/src/conversation_rules_v2.js`:
  - the visible branch name is now `Programa de sobrepeso y diabetes`
  - after reviewing a treatment product, the bot no longer offers `Agregar algo más`
  - the treatment summary now only allows:
    - `Terminar compra`
    - `Volver al menú anterior`
- Navigation was normalized across the guided menus without changing the business flow:
  - visible `Volver` was replaced by `Volver al menú anterior`
  - only one visible `Volver al inicio` remains
  - `Volver al inicio` now returns to the real root menu:
    - `Delivery`
    - `Mostrador`
  - the visible restart choice `Comenzar nuevamente desde el inicio` is no longer injected into the guided menus
- Propagated the client-facing rename through the surrounding surfaces:
  - `apps/whatsapp-bot-node/src/config.js`
  - `apps/whatsapp-bot-node/src/conversation_audit_tags.js`
  - `apps/whatsapp-bot-node/src/conversation_dashboard.js`
  - `apps/whatsapp-bot-node/src/flow_catalog.js`
  - `apps/whatsapp-bot-node/src/whatsapp_web_companion.js`
  - `apps/whatsapp-web-companion-extension/README.md`
- Validation completed for the requested scope:
  - `node --test apps/whatsapp-bot-node/src/conversation_rules.test.js`
  - `node --test apps/whatsapp-bot-node/src/conversation_audit_tags.test.js`
  - `node --test apps/whatsapp-bot-node/src/conversation_audit_inference.test.js`
  - `node --test apps/whatsapp-bot-node/src/whatsapp_web_companion.test.js`
  - `node --test apps/whatsapp-bot-node/src/whatsapp_web_native_labels.test.js`
- Validation caveat kept explicit:
  - `node --test apps/whatsapp-bot-node/src/index.runtime.test.js` still shows three advisor-handoff runtime failures that are not part of this UX change and need separate follow-up

## Pending-last-message recovery on 2026-04-14
- Investigated the WhatsApp Web outage gap reported by the user:
  - when the bot process/browser was offline, customers could still send messages to the number
  - once the bot came back, those pending messages were being ignored because the reconnect baseline seeded them as already seen
- Fix applied in `apps/whatsapp-bot-node/src/index.js` without changing the normal conversation logic:
  - reconnect/startup recovery now rescues the latest unread inbound message per logical chat before the baseline is refreshed
  - recovery groups `@lid`, `@c.us` and bare variants of the same phone as one contact
  - only the latest pending message per chat is replayed, not the whole backlog
  - historical startup recovery now explicitly allows that rescued message to be processed even if it predates the fresh process baseline
  - once the rescue runs, the remaining backlog is still marked as seen so the bot does not replay old history
- Added regression coverage in:
  - `apps/whatsapp-bot-node/src/index.runtime.test.js`
  - new coverage proves:
    - a historical inbound can be recovered explicitly after restart
    - recovery keeps only the latest pending message for the same logical contact
- Validation completed:
  - `node --test apps/whatsapp-bot-node/src/index.runtime.test.js`
  - `node --test apps/whatsapp-bot-node/src/conversation_rules.test.js`
- Practical outcome:
  - if the bot was offline and a customer wrote meanwhile, when the bot comes back online it now answers from that latest pending message as if it had just received it
  - normal live processing, menus and advisor/handoff logic remain unchanged

## GitHub inactivity workflow fix on 2026-04-14
- Root cause of the repeated GitHub email failures was confirmed:
  - the workflow `WhatsApp Bot Inactivity Check` was healthy
  - production `GET /api/cron/inactivity` returned `500`
  - exact body:
    - `audit_storage_unavailable:Your project has exceeded the data transfer quota. Upgrade your plan to increase limits.`
- Fix applied in `apps/whatsapp-bot-node/src/index.js`:
  - inactivity cron now treats `audit_storage_unavailable` as a safe operational skip
  - instead of `500`, it returns:
    - `200`
    - `{ ok: true, skipped: true, reason: "audit_storage_unavailable", ... }`
  - this prevents scheduled GitHub Actions from failing and spamming email when persistent audit storage is temporarily degraded
- Added regression coverage in:
  - `apps/whatsapp-bot-node/src/index.runtime.test.js`
- Workflow visibility improved in:
  - `.github/workflows/whatsapp-bot-inactivity-check.yml`
  - the job now echoes the endpoint response body on success
- Live production validation completed:
  - manual authenticated call to `https://whatsapp-bot-node-chatbot1.vercel.app/api/cron/inactivity` now returns `200 OK`
  - manual workflow dispatch run `24379311149` completed with `success`

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
- `/api/companion/conversations` -> sanitized operational feed for the WhatsApp Web companion extension
- `/api/system/ready` -> runtime readiness for WhatsApp, persistent storage and Plex Center lookup

## WhatsApp transport modes
- The repo now supports two explicit WhatsApp transports:
  - `cloud` -> Meta Cloud API with webhook verification and signature hardening
  - `web` -> `whatsapp-web.js` with a linked WhatsApp Business session and text-based fallback menus
- Current local validation mode:
  - `WHATSAPP_TRANSPORT=web`
  - linked through a dedicated test chip / old phone
  - interactive choices are sent as text menus with bold letters and the customer answers with `A`, `B`, `C`, etc.
- Current local bootstrapping status for `web` mode:
  - `whatsapp-web.js` pinned to `1.32.0` for the lab flow
  - custom `inject()` monkey patch removed in favor of a minimal retry around unstable execution contexts
  - local runtime detection no longer mistakes `.env` `VERCEL=1` for a real Vercel serverless runtime
  - local Express server now boots correctly on `localhost:3000`
  - `LocalAuth` session storage lives outside the repo to avoid broken Chromium profiles:
    - `C:\Users\Taligent\AppData\Local\DelkoBot\wwebjs-auth`
  - preferred urgent path now uses a remote-debug Chrome instead of launching the bot's own browser session:
    - `WHATSAPP_WEB_BROWSER_URL=http://127.0.0.1:9222`
    - launcher script:
      - `apps/whatsapp-bot-node/scripts/start_whatsapp_remote_browser.ps1`
      - now opens `about:blank` so `whatsapp-web.js` owns the only WhatsApp Web tab
    - clean restart script:
      - `apps/whatsapp-bot-node/scripts/restart_whatsapp_lab.ps1`
    - QR page:
      - `http://localhost:3000/whatsapp-qr`
  - current working local auth lab session names:
    - `farmacia-prueba-2`
    - `farmacia-prueba-3`
  - important operating rule:
    - if the remote Chrome / WhatsApp Web tab used by the bot is closed, inbound automation stops even if the Node process is still alive
    - recovery path is `apps/whatsapp-bot-node/scripts/restart_whatsapp_lab.ps1`
  - new local stability safeguards:
    - `.env.local` is now loaded from the app root instead of depending on the shell working directory
    - `/api/system/ready` now exposes `authMode`, `browserUrlConfigured`, `authenticated` and `fullyReady`
    - the duplicate `WhatsApp está abierto en otra ventana / Usar aquí` conflict was eliminated by launching the remote browser blank first
    - `connected_browser` initialization now accepts WhatsApp Web socket state `CONNECTED` as stable, so restarts can reattach to an already logged-in page
    - inbound web handling no longer depends only on `whatsapp-web.js` realtime events:
      - `index.js` now also polls WhatsApp Web's internal store for recent inbound messages
      - this covers cases where the session is authenticated but `message` events stay silent after reconnects
    - web contact normalization now preserves `@lid` identities instead of assuming every sender is `@c.us`
    - if WhatsApp Web is already synced before `wwebjs` attaches, the client now triggers the post-sync path manually
    - if that manual post-sync hits partial listener incompatibilities, the session is still accepted as usable as long as `Store` and `WWebJS` are present
    - transport sends now force `sendSeen: false` in web mode to avoid `markedUnread` crashes on current WhatsApp Web builds
    - local-only debug helpers now exist in `index.js` for urgent lab validation:
      - `POST /api/dev/whatsapp/send-test`
      - `POST /api/dev/whatsapp/backfill-unread`
      - `POST /api/dev/whatsapp/simulate-inbound`
    - latency/reliability hardening added on 2026-04-12:
      - bot mode plus runtime workflow config are prewarmed on startup, authentication and ready
      - inbound/outbound audit persistence is detached from the user-visible reply path in local web mode
      - local web mode now uses aggressive caches and short timeout guards for state, workflow and bot-mode reads
      - Plex/generic lookup failures now open a short cooldown circuit so repeated upstream errors no longer add multi-second waits to the chat
      - even when the native WhatsApp Web bridge is healthy, a slower backup poll still runs to recover missed real inbound messages without duplicating replies
      - the bridge now seeds existing recent inbound message IDs before attaching, so reconnects do not replay backlog from the lab chat as if they were fresh customer messages
      - near-simultaneous duplicate inbound texts for the same contact are suppressed inside a short time window to avoid repeated replies when WhatsApp Web emits the same intent twice
      - local dev lab now includes `POST /api/dev/whatsapp/reset-contact-state` to clear the contact state of the test phone and restart the flow cleanly
    - chat UX hardening added on 2026-04-12:
      - web fallback menus now render options as `*A)*`, `*B)*`, `*C)*`
      - every fallback menu closes with `*Respondé con la letra de la opción.*`
      - prompt-choice memory maps typed letters back to real internal option IDs
      - contextual `Volver al inicio` is available across the guided menus and returns to the real root menu:
        - `Delivery`
        - `Mostrador`
      - guided back navigation now renders as `Volver al menú anterior`
      - invalid menu replies now resend the current menu in the same turn with gentler copy for low-tech / older users
      - duplicate inbound suppression state now lives in-memory explicitly via `recentInboundFingerprints`
      - KV hydration no longer prefers a same-millisecond local session when `LOCAL_STATE_HYDRATE_GRACE_MS=0`
    - measured local latency after the hardening:
      - first cold conversational turn after restart: ~657 ms
      - warm turns: ~18-52 ms
      - direct real outbound validation: ~324 ms
    - live Plex credentials from the official docs were wired into `apps/whatsapp-bot-node/.env.local` for the local web lab
    - after restart, local `/api/system/ready` now reports:
      - `pharmacyLookup.ready=true`
      - `mode=plex_center_api`
      - `branches=[\"1\"]`
    - live functional validation against Plex succeeded locally:
      - `searchProductOptions(\"Actron 600\")` returned real API-backed options
      - selected live lookup resolved `ACTRON 600 RAPIDA ACCION caps.gelat.blanda x 10`
      - stock note returned: `Stock: 6 cajas.`
  - current lab state after cleanup:
    - `authMode=connected_browser`
    - `sessionAuthenticated=true`
    - `sessionReady=true`
    - `MENU` now reopens the actual root flow, so the first typed letter advances correctly after `MENU`
    - after the final summary, `MENU` now resumes the bot cleanly instead of leaving the customer trapped in advisor-review mode
    - advisor-review auto-notices now use a cooldown and no longer spam in loops
    - a short coarse duplicate-suppression window now prevents one repeated WhatsApp Web event from cascading through multiple menu steps
    - the remote-debug Chrome launcher now auto-loads the local companion extension
    - the companion prefers the local backend first and refreshes faster in the lab
    - the backend now injects safe inline label names directly into WhatsApp Web:
      - in the chat header
      - in the left conversation list
    - direct DOM validation confirmed visible inline names for `Delivery` and `Programa de sobrepeso y diabetes`
    - if a human advisor writes a closure phrase such as `cerrada`, `cerrado`, `finalizada`, `concluida`, etc., the bot now:
      - closes the pending human-handoff state
      - removes the waiting-advisor status
      - sends one warm farewell automatically
    - runtime root-cause hardening added later on 2026-04-12:
      - the WhatsApp Web inbound queue now uses the bare logical contact id as its canonical queue key, so `@lid`, `@c.us` and bare variants of the same phone no longer split reset checkpoints, watermarks or generations
      - manual advisor intervention is now recognized across all contact-id variants (`@lid`, `@c.us`, bare), so once the pharmacy writes manually the bot stays silent for that chat
      - after the checkout summary, customer follow-ups still receive the patience message only until a human advisor intervenes
      - after a human advisor takes control, customer replies no longer trigger the patience auto-reply
      - human closure phrases such as `cerrada`, `finalizada` or `terminada` now:
        - close the advisor hold
        - send the warm farewell automatically
        - apply the native WhatsApp label `Finalizado`
      - if the customer writes again after that finalization, the bot resumes from the normal start flow
      - the web sender now tolerates partial `whatsapp-web.js` send responses by generating a fallback outbound message id instead of failing the human-close path
      - when `MENU`, `Hola`, `Volver al inicio` or `Comenzar nuevamente desde el inicio` arrives, the runtime now clears inbound tracking for every variant of that contact before starting the new flow
      - reset checkpoints now ignore only strictly older timestamps, so a real follow-up like `A` sent in the same second as `MENU` is no longer dropped
      - backlog pruning now also collapses mixed-variant batches, so stale address/product prompts from the same phone no longer reappear after a fresh `MENU` / `Hola`
    - live validation after the queue fix:
      - `Nico 2` root flow was reset and replayed cleanly in the live browser
      - the left chat list rendered `Delivery | Programa obesidad y diabetes` inline for `Nico 2`
      - native labels on the real chat were confirmed as `Delivery` + `Programa obesidad y diabetes`
      - advisor closure simulation with `Damos por cerrada la operación.` returned `handled=true` and sent the warm farewell
    - current automated validation status:
      - full suite: `104/104` passing
    - validated locally against the real test chat:
      - backend test send to `199303830229137@lid` succeeded
      - simulated inbound `Menu` produced outbound `¿Cómo querés continuar?`
      - simulated inbound `1` advanced the conversation to `service_type` with outbound `Elegí una opción.`
    - runtime self-healing and operator-proofing added later on 2026-04-12:
      - if the actual Puppeteer page or remote browser closes, the runtime now drops out of `ready/authenticated` instead of pretending the bot is still alive
      - startup seeding of processed inbound message IDs now uses a fixed process-start watermark, so real customer messages sent during a slow restart are no longer swallowed as historical backlog
      - native-label bootstrap now retries after recoverable startup failures instead of giving up forever
      - `apps/whatsapp-bot-node/scripts/restart_whatsapp_lab.ps1` now relaunches the browser inline and avoids opening an extra nested PowerShell window
      - new watchdog script:
        - `apps/whatsapp-bot-node/scripts/run_whatsapp_bot_forever.ps1`
        - keeps Chrome remote + Node alive and restarts the stack automatically if health/readiness fail repeatedly
      - optional Windows startup installer:
        - `apps/whatsapp-bot-node/scripts/install_whatsapp_bot_startup.ps1`
        - registers a scheduled task so the pharmacy team does not have to understand Node or remember to relaunch the bot after login
      - silent launcher and operator shortcut now exist:
        - `apps/whatsapp-bot-node/scripts/start_whatsapp_bot_silent.ps1`
        - `apps/whatsapp-bot-node/scripts/install_whatsapp_bot_desktop_shortcut.ps1`
      - local fallback installation is already active through the Startup folder because Scheduled Task registration returned access denied
      - the visible Node terminal is no longer required when the bot is started via the silent launcher/watchdog path
- Current repo rule:
  - keep both transports available in code
  - prefer `connected_browser` for urgent local validation when WhatsApp Web's native QR page is unstable
  - keep `local_auth` as fallback for isolated sessions
  - do not mix Cloud-only env requirements into Web mode
  - keep runtime readiness honest about which transport is active
  - in `web` mode, optimize visible copy for older adults:
    - short prompts
    - letter-based choices
    - clear retry guidance
  - for browser-debugging in this lab, the local Codex environment now also has the curated market skill `playwright-interactive` installed

## WhatsApp Web companion overlay
- To keep operations inside WhatsApp Web without forcing a separate CRM, the stack now includes a Chromium/Edge extension overlay.
- Extension folder:
  - `apps/whatsapp-web-companion-extension`
- Companion install/runbook:
  - `docs/WHATSAPP_WEB_COMPANION.md`
- Current behavior:
  - reads `/api/companion/conversations`
  - shows a floating operational panel inside WhatsApp Web
  - renders visible inline label names on detected chat rows and in the open-chat header
  - filters by `Delivery`, `Mostrador`, `Particular`, `Programa de sobrepeso y diabetes`, `Obra social` and `Prueba`
- Local lab status:
  - the browser launcher now auto-loads the companion extension
  - the extension prefers `http://localhost:3000` first and refreshes faster
  - because the extension content script still proved flaky on current WhatsApp Web builds, the backend now also injects the same inline label names directly into the connected browser page
  - the direct injection path is the current reliable source of truth for visible label names in local web mode
- Important scope:
  - this overlay does not write native Meta inbox labels
  - the extension itself is presentation-only, while the local bot transport uses the unofficial `whatsapp-web.js` session

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
8. Production requires persistent storage for audit history (no memory fallback by default).
9. Plex Center API is the primary source for product, price and stock lookup when configured; the official local document remains the honest fallback.
10. The first visible menu must open with `Delivery` and `Mostrador`.
11. `Mostrador` must skip intermediate options and go straight to receta upload plus short human handoff.
12. After `Delivery`, the operational chatbot must branch into:
- `Particular`
- `Vacunas`
- `Obra Social`
13. `Obra Social` must request the receta and close with a short professional handoff message.
14. The visible `Vacunas` branch must stay guided from the official document:
- laboratorio
- marca
- presentacion
15. `Particular` must first ask how the customer wants to search:
- `Buscar por droga`
- `Buscar por nombre`
Then it should search in the live system and only continue after the customer chooses a concrete option.
16. Every guided step must offer a contextual `Volver` option.
17. `MENU` must reopen options without greeting again.
18. Open bot conversations must manage inactivity with a two-step follow-up:
- after 15 minutes of silence, ask if the person is still there
- if there is no reply after another 15 minutes, close the conversation politely and invite the user to write again
19. Any prompt with interactive choices must be sent as a single WhatsApp interactive message.
20. `Volver` must live inside the same options set, never in a separate follow-up card.
21. User-facing copy must stay linguistically polished in rioplatense Spanish.
22. Use WhatsApp buttons for up to 3 options and switch to list menus only when the platform limit is exceeded.
23. In serverless execution, the chatbot session must prefer the newest persisted KV state over any older in-memory copy from a warm instance.
24. Lookup outcomes that still offer an action (`Volver`, `Recetario Solidario`, `Confirmar`) must stay inside a single interactive card, never as text plus a second message.
25. `Particular` must never auto-select a Plex product from free text:
- first show the options found in the system
- then let the customer choose manually
- always include rewrite and advisor escape hatches
26. Product orders must support a multi-item cart:
- after each selected product, ask whether to add more or finish
- let the user keep writing products until the order is complete
27. Delivery orders must capture and persist reusable customer delivery data by WhatsApp number:
- first name
- last name
- email
- address
- cross streets
- neighborhood
28. If the same phone comes back later, the bot must offer the saved delivery address before asking for a new one.
29. `Recetario Solidario` must be asked once per order, only after the customer finishes choosing products.
30. Outbound WhatsApp copy must be sanitized before sending so mojibake such as `RevisÃ¡` or `SÃ­` never reaches the customer.
31. New delivery data should be requested in a single message block by default, while still tolerating one-by-one replies if the customer answers that way.
32. Any live Plex product with a valid price must show at least the base `Particular` discount scenarios, even if it is not mapped in the temporary local catalog.
33. The final checkout summary must be detailed enough for a human advisor to resume and invoice directly:
- product by product
- stock
- live price
- discount amounts by payment modality
- totals
- payment forms
- delivery/contact data when applicable
34. Currency formatting in visible WhatsApp copy must use plain safe characters only; avoid Unicode spacing that Meta clients may render as `�`.
35. Delivery data capture should stay simple and senior-friendly:
- first ask `nombre + apellido + mail` in one message
- then ask `direcci?n + entre calles + barrio` in another
- allow the customer to write it in a natural free-form way instead of forcing a template
36. The guided treatment branch must be client-safe:
- visible name `Programa de sobrepeso y diabetes`
- no `Agregar algo m?s` after treatment product review
- only `Terminar compra`, `Volver al men? anterior` and one `Volver al inicio` back to `Delivery / Mostrador`
37. In flows that require a receta (`Mostrador`, `Obra Social`), if the customer writes text instead of sending media, the bot must insist on the receta and stay in that same step until photo/PDF or `Volver`.
38. Returning customers in `Particular` must be offered quick reorder from their last products before starting a new search.
39. Customer history persistence must retain reusable delivery data plus detailed last-product metadata for quick reorder.
40. Unresolved stock should be shown as `A pedido`; true `sin stock` cases should preserve same-drug alternatives for the advisor and final handoff.
41. Plex stock must use the updated vendor pagination contract:
- `paginanro` for page number
- `paginacant` for stock page size
- if Plex still fails on higher pages, keep the customer-facing state as `A pedido` instead of surfacing technical errors
42. If a delivery free-form block is incomplete, the next short reply must fill only the missing field without overwriting the address data already captured.
43. Customer-entered names and addresses must preserve their original accents in the final checkout summary; mojibake repair must never corrupt valid user text.
44. The conversation board must expose simple client-facing labels and filters for:
- `Delivery` / `Mostrador`
- `Particular` / `Obra social` / `Programa de sobrepeso y diabetes`
- optional `Prueba`
while keeping technical audit tags only as an internal detail.
45. After the customer chooses a service category, the next bot message must start with that branch label inside the chat itself so the pharmacy can identify the case at a glance from the WhatsApp thread.
46. To make segmentation visible inside WhatsApp Web without moving the team to another inbox, use a Chromium/Edge companion extension connected to our own backend instead of promising native Meta labels.
47. The codebase must support transport switching explicitly:
- `cloud` for Meta Cloud API
- `web` for the current `whatsapp-web.js` lab/operational validation path
48. In `web` mode, visible choices must degrade gracefully to lettered text menus so the customer can answer by typing `A`, `B`, `C`, etc.
49. In `web` mode, the inactivity scheduler must run in the same local Windows process that owns the connected browser; Vercel and GitHub Actions cannot dispatch through that local session.

## Chatbot behavior constraints
- Keep chat coherent, no unintended restart to greeting after valid choices.
- Handle media uploads robustly and keep state.
- Avoid exposing internal flow IDs to client-facing UI.
- For open bot conversations, send an inactivity prompt after 15 minutes of silence.
- If there is still no answer 15 minutes later, close the conversation politely and ask the user to write again if needed.
- In Web mode, run the inactivity check locally every 5 minutes in the same process that owns the connected browser.
- Keep prompt and options in the same interactive message whenever choices are shown.
- Avoid duplicated prompts such as one text line plus another card repeating the same instruction.
- Use polished rioplatense Spanish across prompts, fallbacks and handoffs.
- Use buttons when there are up to 3 options and switch to list-style menus only when more options are needed.
- In `Particular`, if the same phone already has recent products, offer quick reorder before forcing a fresh search.
- In `Particular`, generic category/brand searches must rely on whole-word textual matches to avoid false positives such as `Dove -> ENDOVENOSA`.
- In `Particular`, the live search should still tolerate small typos in generic queries when the intent is obvious, such as `shamppo -> shampoo`, without reintroducing unrelated false positives.
- On serverless requests, hydrate the conversation from the freshest available persisted state to avoid regressions caused by warm instances with stale memory.
- Keep lookup, recetario and summary outcomes in one interactive card whenever the user can act from that step.

- Open with `Delivery` / `Mostrador`.
- Keep the text very short and operational.
- `Mostrador`: receta -> mensaje corto de atencion por mostrador.
- `Obra Social`: receta -> mensaje corto de continuidad por asesor.
- If a receta is required and the customer writes a product or any plain text, insist with `receta en foto o PDF` instead of falling through to a generic misunderstanding.
- For both `Vacunas` and `Particular`, resolve products and price through Plex Center API when configured using only `Farmacia Delko 1`.
- If Plex Center is unavailable, fall back honestly to the official document without inventing live stock.
- Show all presentations directly without `Mas opciones`.
- After each lookup, first review the item and let the customer choose `Agregar algo mas` or `Terminar compra`.
- Ask `Recetario Solidario` only once, after `Terminar compra`, before delivery data or the final summary.

## Temporary official catalog source
- Official temporary source file: `docs/PRODUCTOS_Y_DESCUENTOS.md`
- Original client file received: `Productos y Descuentos.docx`
- Runtime catalog module: `apps/whatsapp-bot-node/src/product_discount_catalog.js`
- Lookup adapter module: `apps/whatsapp-bot-node/src/pharmacy_system_lookup.js`
- Current role of the document source:
  - official fallback when live API is unavailable
  - reference pricing for documentary examples and recetario summaries
- Current temporary operational flow:
  - `Delivery / Mostrador`
  - `Mostrador`: receta -> atencion humana por mostrador
  - `Delivery`: `Particular / Vacunas / Obra Social`
  - `Obra Social`: receta -> validacion humana
  - `Particular`: historial/recompra rapida opcional -> modo de busqueda (`droga / nombre`) -> texto libre -> opciones del sistema -> seleccion manual -> lookup stock/precio -> revisar item -> agregar mas o terminar -> recetario final -> delivery/resumen final
  - `Vacunas`: laboratorio -> marca -> presentacion -> lookup stock/precio -> revisar item -> agregar mas o terminar -> recetario final -> delivery/resumen final
  - `Volver` disponible en cada paso guiado

## Plex Center API integration
- Remote API base URL is configured through env and uses the `wsplexcenter` path.
- Authentication is `Basic Auth`.
- Product endpoint used by the bot:
  - `GET /wsplexcenter/productos`
- Drug endpoint available in Plex Center:
  - `GET /wsplexcenter/drogas`
- Stock endpoint used by the bot:
  - `GET /wsplexcenter/stock`
- Current live lookup strategy:
  - after `Particular`, the bot first asks `Buscar por droga` or `Buscar por nombre`
  - search product options in Plex Center by query/title
  - search by drug through a generated local snapshot built from live Plex catalog data plus the `/drogas` master endpoint
  - support generic categories and brands like `shampoo`, `Dove` or `Rexona`
  - tolerate small typos in generic searches such as `shamppo` when Plex results stay textually aligned
  - filter matches by whole token / prefix rules to avoid substring false positives
  - consult stock only after the customer chooses one specific option from `Farmacia Delko 1`
  - show `Producto`, `Stock` and `Precio`
  - if the customer already bought products before, offer a quick reorder list before the search-mode selector
  - calculate the visible discount scenarios from the live list price returned by Plex Center
  - if a Plex product is not mapped in the temporary local catalog, still calculate the base `Particular` scenarios from the live price
  - if Plex confirms `sin stock`, preserve same-drug alternatives for customer review and advisor follow-up
  - if API fails, keep the document fallback
  - local drug-search snapshot file:
    - `apps/whatsapp-bot-node/src/plex_drug_search_snapshot.json`
  - local drug-search refresh script:
    - `apps/whatsapp-bot-node/scripts/generate_plex_drug_snapshot.js`
- Current production status:
  - Vercel production env already includes the Plex Center credentials and branch scope
  - the public alias `https://whatsapp-bot-node-chatbot1.vercel.app` is deployed and reporting `ready: true`
  - Meta webhook verification and callback sync are validated against the production alias
  - outbound interactive lists are now preserved in audit detail with their real options, so live technical traces no longer hide service menus as empty
- Current observed limitation from remote validation:
  - Plex Center product and price lookup is responding correctly
  - stock endpoint is currently repeating page `1` during remote validation, so some products may remain as `stock sin confirmacion` until Galbop corrects pagination behavior
- Required env vars for live lookup:
  - `PHARMACY_SYSTEM_API_BASE_URL`
  - `PHARMACY_SYSTEM_API_USERNAME`
  - `PHARMACY_SYSTEM_API_PASSWORD`
  - `PHARMACY_SYSTEM_API_BRANCH_IDS`

## Webhook signature hardening
- Production webhook signature validation now runs through `apps/whatsapp-bot-node/src/webhook_security.js`.
- Runtime readiness exposes webhook hardening status at `/api/system/ready` with:
  - `secure`
  - `security.webhookSignatureHardened`
  - `security.webhookSignatureMode`
- Current production status:
  - hardened code is deployed
  - invalid signatures return `401`
  - request body size is explicitly limited for the webhook endpoint
  - deploy validation warns when signature enforcement is not fully active
- Current remaining blocker:
  - `WHATSAPP_APP_SECRET` is still missing in production, so webhook signature mode remains `not_configured` and `secure` is still `false`
- Required env vars for enforced mode:
  - `WHATSAPP_APP_SECRET`
  - `WHATSAPP_ENFORCE_SIGNATURE=true`

## Data and persistence model
- Conversation audit is stored via Upstash KV when env vars exist:
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- Fallback: in-memory map (dev only, non-persistent).
- Current default provider supports PostgreSQL/Neon when `DATABASE_URL` is available.
- Provider selection:
  - `AUDIT_STORAGE_PROVIDER=postgres` forces Neon/Postgres.
  - `AUDIT_STORAGE_PROVIDER=kv` keeps legacy KV mode.
  - `auto` chooses Postgres when configured, otherwise KV.

## Pending strategic backlog (high level)
- Resolve the Plex stock pagination issue with Galbop so production can confirm stock on every product without falling back to `A pedido`.
  Update: the visible customer copy is now `A pedido`, but the pagination defect is still the same external blocker.
- Load `WHATSAPP_APP_SECRET` in production so webhook signature validation moves from deployed-but-not-enforced to fully enforced.
- Meta official account go-live checklist.
- Add a read-only auth token for `/api/companion/conversations` before rolling the extension out beyond internal pharmacy machines.
- Decide whether to privately distribute the extension through Edge Add-ons or keep it as an internal unpacked install.
- Role-based access for editor vs client-only viewers.
- SLA dashboard for human handoff queues.
- Campaign export layer (segments from conversation outcomes).

## Latest production validation
- Iterative live runs were completed against the production webhook and audit trail.
- Validated end-to-end:
  - `Delivery -> Particular -> lookup -> recetario -> confirmacion -> handoff`
  - `Delivery -> Vacunas -> laboratorio -> marca -> presentacion -> recetario -> confirmacion -> handoff`
  - `Mostrador -> receta -> handoff`
  - `Delivery -> Obra Social -> receta -> handoff`
- The apparent `service_type` menu bug turned out to be an audit serialization issue, not a customer-facing routing error.
- Webhook hardening validation completed with automated tests and production deploy checks:
  - valid signature flow covered in tests
  - invalid or missing signatures return rejection when enforcement is active
  - production readiness currently reports the webhook as deployed but not yet fully hardened because the Meta App Secret is still pending
- Lookup copy for unresolved live stock was refined in production:
  - `Stock: pendiente de validacion por API` was removed
  - the bot now says `Stock: A pedido`
  - the extra line `Precio validado por Plex Center` was removed from the customer-facing message
- A controlled live run for `DUTIDE 1 mg jer. prell. x 4` confirmed the new visible copy in production.
- Business scope was narrowed by owner confirmation:
  - production lookup must use only `Delko 1`
  - `Delko 2` is no longer part of the operational stock check
- The visible commercial output is now aligned to `Delko 1` end to end:
  - lookup card shows product, stock, list price and discount block
  - summary card keeps the same `Delko 1` pricing structure
  - discount values are calculated from the live Plex list price instead of static documentary examples
- `Particular` now includes typo-tolerant confirmation before the lookup when the product name is similar but not exact:
  - the bot asks `¿Quisiste decir ...?`
  - the user can answer `Sí`, `No` or `Volver a escribir`
- A 10-iteration production validation pass was completed after this change, covering:
  - main menu
  - delivery submenu
  - exact lookup in `Particular`
  - similarity confirmation in `Particular`
  - rejection and rewrite in `Particular`
  - guided `Vacunas` lookup
  - `Vacunas` summary
  - `Obra Social`
  - `Mostrador`
- Live stock validation now has both classes of evidence:
  - unresolved cases still show `A pedido`
  - resolved cases from Plex Center were confirmed live through the bot, including:
    - `ACTRON 600 RAPIDA ACCION caps.gelat.blanda x 10` -> `Stock: disponible` / `Stock Delko 1: 9 cajas`
    - `ACTRON caps.gelat.blanda x 10` -> `sin stock`
- Current `Particular` search model in production:
  - no longer auto-selects a Plex product from free text
  - opens a live selectable list before the stock/price lookup
  - supports generic categories and brands like `shampoo`, `Dove` and `Rexona`
  - filters by whole-token/prefix rules to avoid substring false positives such as `Dove -> ENDOVENOSA`
  - always includes `Volver a escribir`, `Contactar asesor` and `Volver`
- Current checkout model in production:
  - after each product, the bot asks whether to add more products or finish the purchase
  - the order can accumulate multiple products in the same conversation
  - `Recetario Solidario` is now asked once, only after the customer presses `Terminar compra`
  - delivery data is now requested in two simple text blocks:
    - nombre + apellido + mail
    - dirección + entre calles + barrio
  - both delivery blocks accept natural free-form text instead of a forced template
  - final customer summary shows:
    - products with stock and live price
    - visible discount options per product
    - list-price total
    - visible discount totals
    - payment forms
  - delivery mode captures reusable contact/address data and stores it by WhatsApp number
  - returning delivery users are offered their saved address before entering a new one
  - advisor-facing handoff summary now includes enough operational detail to continue and invoice:
    - product by product
    - importes por modalidad de pago
    - totales
    - datos de delivery
- Drug-search release on 2026-04-08:
  - `Particular` now asks `Buscar por droga` or `Buscar por nombre` before the free-text step
  - `Buscar por droga` uses a generated Plex snapshot so the bot does not need to crawl all 45 product pages during the live chat
  - the production flow catalog was updated so the visible map now includes the new `Modo de busqueda` step
  - the Plex drug snapshot was generated from live credentials and currently indexes:
    - `3893` drogas
    - `44345` productos
    - `2166` grupos con productos
  - automated coverage now passes at `56/56`
  - production was redeployed and `/health` plus `/api/system/ready` remained green after the release
- Additional live validation after the selectable-list refactor confirmed:
  - `un shampoo` opens a paginated list of shampoo products from Plex
  - `Dove` returns Dove-family options and no longer leaks `ENDOVENOSA`
  - `Rexona` stays in option-selection mode and no longer jumps directly to a summary
  - `zzq producto inexistente` offers rewrite or advisor instead of a misleading product match
  - `ACTRON 600 RAPIDA ACCION caps.gelat.blanda x 10` still returns `disponible` with `Stock Delko 1: 9 cajas`
  - `MOUNJARO 5 mg/0.6 mLx1 KwikPen` now returns confirmed stock after the updated Plex pagination contract
  - `Mostrador`, `Obra Social` and `Vacunas` remain stable after the `Particular` rework
- Checkout was reworked end to end and validated locally plus in production:
  - item review now offers `Agregar algo mas`, `Terminar compra` and `Volver`
  - delivery orders can now accumulate more than one product before closing
  - final summary now includes multiple products, total list price, discount totals and payment forms
  - live production run on the QA contact validated:
    - `Delivery -> Particular -> Mounjaro -> No -> Agregar algo mas -> DUTIDE -> No -> Terminar compra`
    - delivery data capture for name, apellido, mail, direccion, entre calles y barrio
    - final handoff summary with 2 products and aggregated totals
  - second live production run on the same QA contact validated saved-address reuse:
    - after `Terminar compra`, the bot offered the previously saved address
    - options shown: `Usar esta direccion`, `Otra direccion`, `Volver`
- Checkout and visible-copy hardening update on 2026-04-08:
  - moved `Recetario Solidario` from the per-item review to the end of the cart
  - added a global outbound sanitization layer so prompts and buttons stop leaking mojibake in production
  - redeployed production after the change and revalidated readiness plus automated coverage
- Pricing/detail hardening update on 2026-04-08:
  - generic Plex products such as shampoo or jabon now inherit the base `Particular` pricing scenarios from the live price even without a local catalog mapping
  - item review now shows discount options for those general products
  - final summary now leaves a richer operational breakdown for the advisor:
    - product detail
    - live price
    - discount amounts by modality
    - order totals
    - payment forms
    - delivery/contact data
  - automated coverage now validates both the generic-product discount math and the richer final summary
- Search-tolerance update on 2026-04-08:
  - the Plex option search now tolerates small typos in generic category queries
  - example covered in tests: `un shamppo` now resolves to shampoo options instead of falling into `No encontré opciones claras`
  - the tolerance stays constrained with strong token anchors to avoid reviving false positives such as `Dove -> ENDOVENOSA`

- Customer-memory and reorder update on 2026-04-08:
  - `Particular` now offers a quick reorder list with the latest products saved for that WhatsApp number
  - the customer can tap a previous product and the bot revalidates it live against Plex before adding it to the cart
  - the persisted `lastOrder` profile now stores detailed item metadata instead of only product titles
  - unresolved stock now uses the customer-facing copy `A pedido`
  - true `sin stock` results now preserve alternatives of the same drug in the item review and advisor handoff
  - the visible flow map was adjusted so lookup leads to item review before the final `Recetario Solidario`
  - automated coverage passed at `58/58`

## Currency-format hardening update on 2026-04-08
- customer-facing amounts now render as plain `$ 27.017,76` instead of relying on Unicode non-breaking spaces from `Intl currency`
- the outbound sanitizer also replaces additional invisible spacing characters to avoid WhatsApp rendering them as `�`

## Delivery UX simplification update on 2026-04-08
- delivery no longer asks for all fields in a copied template block
- the bot now asks:
  - first `nombre + apellido + mail`
  - then `dirección + entre calles + barrio`
- both prompts accept natural free-form text, including comma-separated or multi-line replies
- saved-address reuse remains active for returning delivery users

## Recipe-step hardening update on 2026-04-08
- `Mostrador` and `Obra Social` now insist on the receta whenever the customer sends plain text instead of media
- the bot stays in the same recipe-upload step and keeps the `Volver` option visible
- this avoids ambiguous replies such as `No te entendí bien` when the real blocker is still the missing receta

## Plex stock adapter update on 2026-04-09
- Galbop confirmed that stock pagination must use:
  - `paginanro` for the page number
  - `paginacant` for the number of products per page
- Updated `apps/whatsapp-bot-node/src/pharmacy_system_lookup.js` to use that contract and added `PHARMACY_SYSTEM_API_STOCKS_PER_PAGE` to `.env.example`
- Automated coverage now validates:
  - `/wsplexcenter/stock?sucursal=1&paginanro=X&paginacant=Y`
  - successful stock resolution when the product only appears on a later page
  - customer-facing fallback copy staying on `A pedido` when Plex returns a visible system error
- Local live validation against the real Plex credentials confirmed:
  - page `1`, `2` and `5` now return their own content instead of repeating page `1`
  - `MOUNJARO 5 mg/0.6 mLx1 KwikPen` now returns `Stock: 20 cajas.`
  - `DUTIDE 1 mg jer. prell. x 4` now returns `Stock: sin stock.`
  - `ACTRON 600 RAPIDA ACCION caps.gelat.blanda x 10` still returns confirmed stock
- Residual external issue still observed in Plex:
  - stock pages `7` to `10` currently answer `403 Forbidden`
  - products that live beyond the accessible page range, such as `CLOB-X SHAMPOO 0.05% shamp.x 125 ml`, still need to stay as `A pedido` until the provider fixes those higher pages

## Delivery capture parsing fix on 2026-04-09
- Fixed the free-form delivery parser so a follow-up answer with only the missing field no longer overwrites the address already captured.
- Confirmed case:
  - first message: `Coronel Díaz, CABA, entre Soler y Paraguay`
  - bot asks only for missing `barrio`
  - second message: `Recoleta`
  - final summary now preserves:
    - `Coronel Díaz, CABA`
    - `Entre calles: Soler y Paraguay`
    - `Barrio: Recoleta`
- Added automated coverage in `apps/whatsapp-bot-node/src/conversation_rules.test.js` for the exact two-step address completion path.

## Unicode summary hardening on 2026-04-09
- Fixed the final checkout summary so customer-entered names and addresses keep valid accents such as:
  - `Nicolás`
  - `Díaz`
- Root cause:
  - the file still had some old mojibake literals in the active summary functions
  - the outbound sanitizer was trying to repair the whole string and could corrupt already-valid user text mixed into the same message
- The active end-of-file summary functions were overridden with clean Unicode literals, and the text sanitizer now repairs only mojibake fragments instead of re-decoding the full string.
- Automated coverage now verifies the delivery summary with explicit Unicode input using escaped characters to avoid editor/terminal encoding ambiguity.

## Conversation audit labels and filters on 2026-04-09
- Added `apps/whatsapp-bot-node/src/conversation_audit_tags.js` to centralize:
  - friendly label normalization
  - customer-facing tag mapping
  - summary generation from conversation context
- Conversation audit stores now auto-attach simple visible tags from the persisted context while preserving the existing technical tags:
  - `delivery`
  - `mostrador`
  - `particular`
  - `obra_social`
  - `programa_obesidad_y_diabetes`
  - `test_run`
- In the audit/dashboard layer, the operational branch still uses `Vacunas` in the chatbot flow, but conversations are now grouped for the client as `Programa obesidad y diabetes`.
- `/api/conversations` now accepts comma-separated `tag` filters with AND semantics, so operations can combine filters such as:
  - `delivery + particular`
  - `mostrador + prueba`
- `/conversations` now shows:
  - a `Delivery / Mostrador` filter
  - a `Programa / Tipo` filter
  - visible friendly tag chips in cards and detail
  - non-technical labels instead of raw tag ids
- Validation status after the release:
  - `npm test` passed `65/65`
  - production was redeployed successfully
  - production `/conversations` serves the new filters
  - production `/api/conversations?tag=delivery,particular` responded `200`

## Service-category chat labels on 2026-04-09
- The visible service menu under `Delivery` no longer exposes `Vacunas` as the customer-facing title.
- Because WhatsApp interactive list rows have tight title space, the menu row now shows:
  - title: `Programa obesidad`
  - description: `y diabetes`
- Immediately after the user chooses that branch, the next bot prompt now starts with the full label inside the chat:
  - `Programa obesidad y diabetes.`
- The same in-chat labeling rule now applies to:
  - `Particular`
  - `Obra social`
  - `Mostrador`
- This was added specifically so the pharmacy can identify the branch directly from the open WhatsApp conversation, even before opening the audit board.

## WhatsApp Web companion release on 2026-04-09
- Added `apps/whatsapp-bot-node/src/whatsapp_web_companion.js` to expose a sanitized operational feed for browser overlays.
- Added the production API `/api/companion/conversations`.
- Added the unpacked extension in `apps/whatsapp-web-companion-extension` with:
  - `manifest.json`
  - `background.js`
  - `content.js`
  - `styles.css`
  - popup/options pages
- The extension overlays:
  - a floating filter panel inside `https://web.whatsapp.com`
  - visible chips on detected chat rows
  - category/mode segmentation without leaving WhatsApp Web
- Production validation after deploy:
  - `npm test` passed `68/68`
  - `npm run deploy:prod` completed successfully
  - `https://whatsapp-bot-node-chatbot1.vercel.app/api/companion/conversations?limit=5` returned `200`
  - the payload exposed sanitized conversations, filter groups and operational counts
- Chosen architecture:
  - keep both WhatsApp transports available in code (`cloud` and `web`)
  - avoid unsupported native-label promises
  - keep the pharmacy team inside WhatsApp Web with segmentation visible on screen
  - validate the current easier implementation path with a dedicated `web` transport test phone before deciding the definitive client rollout

## Conversation board live-fix on 2026-04-09
- The `/conversations` page had a frontend syntax error inside the embedded script, which left the board stuck at `Cargando...` even though production APIs and database were healthy.
- Fixed the broken quoted strings in the timeline copy and added an automated render test:
  - `apps/whatsapp-bot-node/src/conversation_dashboard.test.js`
- Added automatic refresh to the board so operations no longer need to click `Actualizar` manually:
  - current poll interval: `12s`
- Production validation after redeploy:
  - Playwright confirmed `100` conversation cards rendered
  - first conversation detail loaded correctly
  - status now reaches `Detalle actualizado`

## Historical tag inference on 2026-04-09
- A PostgreSQL persistence bug was causing `mode`, `orderType`, `summary` and friendly tags to be lost from the main conversation row during `flow_transition` saves, even though the event log still contained the correct session data.
- Fixed the root cause in:
  - `apps/whatsapp-bot-node/src/conversation_audit_postgres_store.js`
- Added a new inference helper:
  - `apps/whatsapp-bot-node/src/conversation_audit_inference.js`
- Current behavior:
  - new conversations preserve tags correctly at write time
  - old conversations are reclassified from their saved `flow_transition` events at read time
  - `/api/conversations` tag filters now work against the inferred historical labels too
- Production validation after redeploy:
  - `GET /api/conversations?tag=programa_obesidad_y_diabetes` returned matching cases
  - the conversation board now visually shows chips such as:
    - `Delivery`
    - `Programa obesidad y diabetes`

## Conversation tag emphasis on 2026-04-09
- The client conversation board now renders operational tags above the customer name instead of leaving them as secondary metadata.
- Tags now use color by meaning for fast visual triage:
  - `Delivery`
  - `Mostrador`
  - `Particular`
  - `Programa obesidad y diabetes`
  - `Obra social`
  - `Prueba`
- The same stronger visual hierarchy was mirrored in the WhatsApp Web companion extension so both operational surfaces stay consistent.
- Production validation after redeploy:
  - the filtered board showed `20` cards for `Programa obesidad y diabetes`
  - the first card rendered prominent chips above the customer name
  - the detail summary also rendered the same prominent chips

## WhatsApp-like conversation view on 2026-04-09
- The `/conversations` detail panel no longer renders audit-event cards with labels such as `Mensaje del cliente`, `Respuesta del sistema` or `Avance del caso`.
- It now renders a WhatsApp-style transcript:
  - customer messages on the right
  - pharmacy/bot messages on the left
  - WhatsApp-like option blocks for buttons and lists
  - minimal centered notes only for meaningful system moments such as human handoff or auto-close
- The header of the conversation now behaves like a WhatsApp Web chat header:
  - contact initials
  - contact name
  - phone number
  - simple status chip
  - visible operational tags
- Important operating consequence:
  - even without access to the pharmacy WhatsApp Web session or the companion extension installed there, the Vercel board now acts as a clear client-facing simulation of how the conversation looked in chat

## MCP integrations configured
- **Vercel MCP**: `https://mcp.vercel.com` (HTTP/OAuth) — manage deployments, env vars, logs
- **Neon MCP**: `https://mcp.neon.tech/mcp` (HTTP/OAuth) — run SQL, manage DB schema, inspect tables
- Registered in: `C:\Users\Taligent\.claude.json` under project `ChatBot Whatsapp`
- First use per session requires OAuth browser authorization
- To reinstall: `claude mcp add --transport http vercel https://mcp.vercel.com` / `claude mcp add --transport http neon https://mcp.neon.tech/mcp`

## Commercial proposal system
- Added a dedicated skills pack under `skills/whatsapp-commercial-proposal-*`.
- Added proposal artifacts under `proposals/`.
- Commercial workflow now supports end-to-end generation: discovery -> pricing -> ROI -> implementation -> risk -> writing -> negotiation.

## Linguistic QA skill
- Added `skills/whatsapp-chatbot-linguistic/` to standardize visible chatbot copy:
  - rioplatense Spanish
  - prompt + options in one card
  - `Volver` inside the same option set
  - fallback and handoff copy review

## Recovery and stability check on 2026-04-10
- A local/production outage was detected after a partial workspace sync:
  - multiple runtime modules required by `src/index.js` were missing from `apps/whatsapp-bot-node/src`
  - production alias returned `FUNCTION_INVOCATION_FAILED` on `/health`, `/api/system/ready` and `/api/conversations`
- Root cause confirmed:
  - critical source files were present in `stash@{0}` as untracked payload and had not been restored to the working tree
- Recovery actions completed:
  - restored missing runtime modules, tests and companion assets from `stash@{0}^3`
  - restored supporting scripts (`deploy_and_sync_webhook.js`, `generate_plex_drug_snapshot.js`, `sync_webhook_node.js`)
  - patched `deploy_and_sync_webhook.js` to deploy from monorepo root when the Vercel project root is `apps/whatsapp-bot-node` (avoids duplicated path failures on Windows)
  - restored operational source docs (`API_OnzeCenter_Documentacion*.pdf`, Postman collection, discount docx)
  - reran automated suite successfully: `72/72`
  - redeployed production and reassigned alias:
    - `https://whatsapp-bot-node-chatbot1.vercel.app`
  - revalidated live endpoints:
    - `/health` -> `200` / `ready: true`
    - `/api/system/ready` -> `200` / `ok: true`
    - `/api/conversations` -> `200` with conversation payload
    - `/api/companion/conversations` -> `200` with filter groups and counts
- Remaining external/security items:
  - Meta webhook sync script currently fails because the configured access token is expired (`OAuthException 190 / subcode 463`)
  - Webhook signature hardening is still in `not_configured` mode until `WHATSAPP_APP_SECRET` is loaded in production

## WhatsApp Web Coexistence Update on 2026-04-11
- Completed transition from Meta Cloud API webhooks to local whatsapp-web.js execution for WhatsApp Web coexistence.
- Replaced interactive WhatsApp Buttons and Lists with text-based fallback menus due to Meta Web protocol limitations.
- Implemented numerical text matching across conversation rule parsers allowing users to type '1', '2', etc. to navigate menus.
- Resolved duplicate parsing function hoist issues, ensuring numerical shortcuts work uniformly across 'mode', 'service type', and 'particular option' selectors.
- Generated whatsapp_button_emulation_research.md detailing the structural reasons behind Meta's deprecation of interactive messages in Web protocols and viable alternatives.

## UX hardening and WhatsApp Web stability on 2026-04-12
- Refined the WhatsApp Web menu UX for older/non-technical users:
  - menu options are now rendered as bold letters (`*A)*`, `*B)*`, etc.)
  - the visible instruction now consistently says `*Respondé con la letra de la opción.*`
  - business flows keep `Volver` plus `Volver al inicio`
  - added a new global restart action:
    - `Comenzar nuevamente desde el inicio`
    - this returns to the initial greeting, not just the service-type menu
- Fixed delivery data capture:
  - free-form delivery prompts now use clean rioplatense Spanish without mojibake
  - three-line address replies now close correctly:
    - line 1: dirección
    - line 2: entre calles
    - line 3+: barrio
  - contact state reset now also clears the saved in-memory profile for that contact during lab resets
- Improved final summary formatting for WhatsApp:
  - section headers are rendered as bold headings plus a separator line
  - delivery email is now formatted as plain visible text without triggering a clickable mail link
  - summary copy was normalized to clean Spanish (`Revisá`, `¿Querés...?`, `Sí`, etc.)
- Added an outbound anti-duplicate guard in `webTextClient.js` so WhatsApp Web does not emit the same outbound text multiple times within a very short window during reconnect/poller edge cases.
- Validation completed after these changes:
  - automated suite green: `82/82`
  - local lab restarted successfully
  - `/health` -> `ok: true`
  - `/api/system/ready` -> `ok: true`
  - WhatsApp Web session remained authenticated with:
    - `transport: web`
    - `authMode: connected_browser`
    - `sessionReady: true`
  - dashboard/API still show accumulated operational tags such as:
    - `Delivery`
    - `Programa obesidad y diabetes`
    - both together on the same conversation when the path requires it

## Native WhatsApp Business labels on 2026-04-12
- Replaced the broken inline overlay approach as the primary tagging mechanism.
- Why:
  - the previous injected chips sat on top of the left chat list
  - that made the UI feel pasted-on and could interfere with opening chats
- New stable approach:
  - use native WhatsApp Business labels on the real chat through `whatsapp-web.js`
  - keep the visual overlay disabled by default
- Implementation:
  - added `apps/whatsapp-bot-node/src/whatsapp_web_native_labels.js`
  - `index.js` now synchronizes native labels after each conversational step in `web` mode
  - current managed native labels are:
    - `Delivery`
    - `Mostrador`
    - `Particular`
    - `Programa obesidad y diabetes`
    - `Obra social`
    - `Prueba`
  - added dev endpoints:
    - `GET /api/dev/whatsapp/native-labels/status`
    - `POST /api/dev/whatsapp/native-labels/bootstrap`
  - `whatsapp_web_overlay_sync.js` now supports cleanup and the overlay is not started unless explicitly enabled
- Live validation completed:
  - native labels were created in the connected WhatsApp Business Web lab
  - the test chat `Nico 2` ended with native labels:
    - `Delivery`
    - `Programa obesidad y diabetes`
  - native label counters in WhatsApp Business updated correctly:
    - `Delivery` -> `1`
    - `Programa obesidad y diabetes` -> `1`
  - the old visual overlay was confirmed removed from the DOM (`overlayCount: 0`)
- Important product note:
  - native WhatsApp Business labels are real operational labels for filtering and organization
  - they are not the same thing as custom colored pills rendered inline in every left-row chat item
  - if inline row chips are ever needed again, they must be rebuilt as a non-invasive enhancement and not as the source of truth

## Native label-name inline refinement on 2026-04-12
- Kept native WhatsApp Business labels as the source of truth for chat segmentation.
- Reworked the visual enhancement so label names no longer float as detached pills over the chat list.
- Current live behavior in WhatsApp Web:
  - the real native label icon remains the anchor
  - the label names are rendered inline next to that native icon area
  - the chat row remains clickable
- Disabled companion row-chip painting as an operational source and kept the companion focused on:
  - panel filters
  - operational list
  - conversation visibility
- Hardened duplicate-letter handling across consecutive guided menus:
  - inbound deduplication now fingerprints the active prompt/menu
  - repeating `A` in two different steps is valid and no longer gets suppressed
- Live validation completed:
  - old detached row pills removed from the DOM
  - inline label name text visible in the real chat row:
    - `Delivery · Programa obesidad y diabetes`
  - click over the visible label-name area still opens/selects the chat
  - fresh Recetario Solidario prompt now renders cleanly:
    - `Antes de cerrar el pedido, ¿Estás adherido al Recetario Solidario?`


## Exclusive tags, grouped options and advisor-wait label on 2026-04-12
- Fixed mutually exclusive operational tags so incompatible paths no longer accumulate in the same chat summary.
- Delivery/counter path is now exclusive:
  - `Delivery` replaces `Mostrador`
  - `Mostrador` replaces `Delivery`
- Order-type path is now exclusive:
  - `Particular`
  - `Programa obesidad y diabetes`
  - `Obra social`
- Added the new native WhatsApp Business operational label:
  - `Esperando a ser atendido por asesor`
- Human-handoff outcomes now synchronize that native label automatically in web mode.
- Refined grouped fallback lists for older-adult readability:
  - visible section headers:
    - `*Opciones*`
    - `*Productos*`
    - `*Ayuda*`
  - product rows render bold
  - navigation/help rows remain plain
- Normalized human-escalation copy in grouped product lists to:
  - `Contactar asesor. El producto no esta`
- Revalidated the active visible copy for mojibake-sensitive prompts:
  - `Encontre estas opciones...`
  - `Elegi la correcta.`
  - `?Est?s adherido al Recetario Solidario?`
- Automated validation after these fixes:
  - `90/90` passing

## Silent startup and desktop shortcut on 2026-04-12
- Added a silent launcher script for non-technical operators:
  - `apps/whatsapp-bot-node/scripts/start_whatsapp_bot_silent.ps1`
- Added a desktop-shortcut installer:
  - `apps/whatsapp-bot-node/scripts/install_whatsapp_bot_desktop_shortcut.ps1`
- Added package scripts:
  - `npm run lab:start-silent`
  - `npm run lab:install-shortcut`
- Startup installation now has a no-admin fallback:
  - if Windows Scheduled Task registration is denied, the installer drops a shortcut in the current user's Startup folder
- Current local operator-ready state:
  - desktop shortcut created: `Farmacia Delko Bot.lnk`
  - Startup shortcut created: `Farmacia Delko Bot Watchdog.lnk`
  - watchdog process running hidden in background
  - `/health` and `/api/system/ready` both green after relaunch

## Runtime queue root-fix and operator restart hardening on 2026-04-13
- Fixed the real root cause behind the chaotic `MENU` / `Hola` behavior in WhatsApp Web runtime:
  - reset messages now invalidate inbound processing generations monotonically instead of deleting and reusing generation `1`
  - this prevents older in-flight tasks from surviving a new reset and emitting stale prompts afterwards
- Unified runtime reset detection with the conversation layer:
  - the runtime now treats these as hard resets too:
    - `inicio`
    - `opciones`
    - `comenzar nuevamente`
    - `comenzar de nuevo`
    - `reiniciar`
    - `reinicio`
    - `buen día`
    - `buenas tardes`
    - `buenas noches`
- Added direct runtime tests in:
  - `apps/whatsapp-bot-node/src/index.runtime.test.js`
  - coverage now proves:
    - invalidating a contact does not recycle old generations
    - reset checkpoints still preserve the current reset message
- Hardened the companion visual layer:
  - the browser launcher now loads the companion extension by default unless explicitly disabled
  - the extension avoids painting duplicate left-row/header labels when backend inline labels already exist
- Reinstalled local operator automation:
  - desktop shortcut refreshed
  - Startup watchdog shortcut refreshed
  - silent launcher re-run successfully
- Current local operational truth after this pass:
  - code/runtime fixes validated by automated tests (`106/106`)
  - local bot stack is running in background
  - the connected-browser WhatsApp Web lab is authenticated again
  - local `/health` -> `ok:true`
  - local `/api/system/ready` -> `ok:true`

## Final advisor handoff and closure logic on 2026-04-13
- The final checkout summary handoff now stays under advisor control until the human finishes the case.
- New behavior after the summary line:
  - `En breve un asesor se va a comunicar por este medio para terminar la compra.`
- If the same customer writes again before the advisor intervenes, the bot now answers only:
  - `Te pedimos paciencia, por favor, en breve un asesor se va a comunicar por este medio para terminar la compra.`
- Once a human advisor writes manually from the pharmacy side:
  - the bot stops auto-replying in that chat
  - the conversation remains under manual advisor control
- When the advisor later writes a closure phrase containing words such as:
  - `finalizado`
  - `finalizada`
  - `terminado`
  - `terminada`
  - `cerrado`
  - `cerrada`
  - including phrases such as `Damos por cerrada la operación`
  the bot now:
  - sends one warm closing farewell:
    - `Muchas gracias por confiar en Farmacia Delko. Fue un gusto acompañarte. Cuando necesites algo, escribinos de nuevo por este medio; vamos a estar encantados de ayudarte. Te esperamos pronto.`
  - removes the pending-advisor hold
  - marks the conversation with the native WhatsApp Business label:
    - `Finalizado`
- If that same customer writes again later, the bot resumes the normal automated flow from the start.
- Root technical fix:
  - runtime and conversation reset logic now clear all known contact variants together (`@lid`, `@c.us`, bare id)
  - pending advisor state is now modeled explicitly with:
    - `waitingAdvisor`
    - `advisorHandoffReason`
    - `manualAdvisorIntervened`
    - `finalized`
- Validation after this pass:
  - full suite: `108 pass / 2 skip / 0 fail`
  - local runtime:
    - `/health` -> `ok:true`
    - `/api/system/ready` -> `ok:true`
    - `transport=web`
    - `authMode=connected_browser`
    - `authenticated=true`
    - `sessionReady=true`

## Connected-browser launcher hardening on 2026-04-13
- Investigated the live failure reported around `20:26` in the WhatsApp Web lab:
  - the backend was healthy, but the operator-visible launcher path could leave the browser hidden/minimized
  - in that state, double-clicking the desktop shortcut looked like a no-op
  - the bot could remain authenticated while the user was not looking at the actual controlled WhatsApp Web window
- Hardened the connected-browser operational scripts:
  - `apps/whatsapp-bot-node/scripts/start_whatsapp_remote_browser.ps1`
    - now restores/focuses the existing controlled browser window instead of silently exiting
    - no longer launches the browser minimized
    - adds anti-background-throttling Chrome flags:
      - `--disable-backgrounding-occluded-windows`
      - `--disable-renderer-backgrounding`
      - `--disable-background-timer-throttling`
      - `--disable-features=CalculateNativeWinOcclusion`
  - `apps/whatsapp-bot-node/scripts/start_whatsapp_bot_silent.ps1`
    - when the watchdog is already healthy, double-click now still restores the operational browser window
    - when starting a new hidden watchdog, it also opens/restores the controlled browser immediately afterward
- Live local validation after the patch:
  - `npm test` -> `113 pass / 2 skip / 0 fail`
  - local `/health` -> `ok:true`
  - local `/api/system/ready` -> `ok:true`
  - remote browser page inventory confirmed the controlled WhatsApp page is present
  - inline row label names were visible again in the controlled browser:
    - `Delivery | Esperando a ser atendido por asesor`
    - `Delivery | Programa obesidad y diabetes`
- Current operator-facing behavior:
  - double-clicking `Farmacia Delko Bot.lnk` should now either:
    - start the hidden watchdog and open the controlled browser, or
    - if already running, bring back the correct browser window instead of seeming to do nothing

## Connected-browser stale-page recovery on 2026-04-13
- Fixed the remaining root cause behind false WhatsApp Web outages:
  - a stale observed page could close later and mark the whole runtime as `browser_page_closed`
  - this made the bot look dead even while a healthy WhatsApp Business tab was still alive in the remote browser
- Hardened `apps/whatsapp-bot-node/src/whatsappClient.js`:
  - page/browser close observers now ignore stale references that are no longer the active operational page/browser
  - connected-browser mode now recovers by:
    - preferring `client.pupBrowser` when still connected
    - reconnecting with `puppeteer.connect(...)` when needed
    - re-selecting the operational WhatsApp Web tab from the live browser
  - runtime auth/ready flags are rebuilt from the recovered page instead of trusting dead references
- Live validation after restart:
  - `/health` -> `ok:true`
  - `/api/system/ready` -> `ok:true`
  - WhatsApp runtime:
    - `transport=web`
    - `authMode=connected_browser`
    - `authenticated=true`
    - `sessionReady=true`
    - `disconnectReason=""`
- Additional product confirmation:
  - the real customer path `Delivery -> Particular` is already aligned with the requested business rule:
    - it hands the conversation to a human advisor immediately
    - the bot marks the chat as waiting for advisor
  - the automated Particular lookup flow still exists only as an internal helper/test path for lab validation and should not be treated as the live customer path
- Validation after this pass:
  - `npm test` -> `114 pass / 2 skip / 0 fail`

## Concurrent chat hardening on 2026-04-13 (late)
- Investigated the real production-like failure where:
  - one customer (`Mamá`) stopped receiving replies after `Delivery -> Particular`
  - another chat (`Nico 2`) kept advancing in parallel
  - the bot looked "alive" globally even though one contact queue was stuck
- Root cause confirmed:
  - the connected-browser runtime could keep a single contact blocked when one outbound send path hung
  - the previous watchdog only looked at coarse readiness/session health and therefore could miss a per-contact freeze
  - the active local process also had to be restarted to pick the new operational liveness route
- Runtime hardening applied in `apps/whatsapp-bot-node/src/index.js`:
  - new operational endpoint:
    - `/api/system/liveness`
  - inbound queue liveness now tracks:
    - active per-contact queues
    - stuck queue age
    - last inbound received/processed
    - last outbound sent
    - recent runtime timeout/error
  - outbound sends now use:
    - per-recipient attempt timeout
    - retry across WhatsApp id variants of the same contact (`@lid`, `@c.us`, bare)
    - reconnect/reconcile before the next candidate if one variant times out or the browser context glitches
- Launcher/watchdog hardening:
  - `apps/whatsapp-bot-node/scripts/start_whatsapp_bot_silent.ps1`
    - now checks liveness, not only coarse health/readiness
  - `apps/whatsapp-bot-node/scripts/run_whatsapp_bot_forever.ps1`
    - now restarts the stack when liveness fails, even if the session still looks authenticated
    - also collapses duplicate `node src/index.js` processes defensively
  - desktop shortcut and Startup-folder watchdog shortcut were reinstalled after the fix
- Validation after the concurrent-chat fix:
  - `node --test src/index.runtime.test.js` -> all pass
  - `node --test src/conversation_rules.test.js` -> all pass
  - local runtime after restart:
    - `/health` -> `ok:true`
    - `/api/system/ready` -> `ok:true`
    - `/api/system/liveness` -> `ok:true`
- Important operating rule kept explicit:
  - `Delivery -> Particular` remains a direct human-handoff path in the live customer experience
  - the stability fix was applied underneath that flow without changing the business behavior

## Advisor handoff variant-resolution fix on 2026-04-14
- Investigated a confusing post-checkout transcript where:
  - the customer should keep receiving the patience notice until a human advisor writes manually
  - a later manual closure phrase from the pharmacy side was not always restoring the bot cleanly
- Root cause confirmed in `apps/whatsapp-bot-node/src/index.js`:
  - after the final summary, the chat correctly moved to `idle + waitingAdvisor=true`
  - but advisor intervention / closure resolution still preferred `state !== idle`
  - so some `@lid` / `@c.us` variants could miss the real managed state and skip the manual-intervention or closure path
- Fix applied:
  - added `hasManagedRuntimeConversationState(...)`
  - `resolveConversationContactId(...)` now treats `waitingAdvisor` and `manualAdvisorIntervened` as active managed state
  - `handleAdvisorHumanOutgoingMessage(...)` now accepts post-checkout waiting chats even if they are technically idle
  - `handleAdvisorClosureCandidate(...)` now accepts the idle checkout-hold state too, so phrases like `Damos por finalizada la operación` work reliably when written from the pharmacy side
- Validation after this pass:
  - `node --test src/index.runtime.test.js` -> `15/15`
  - `node --test src/conversation_rules.test.js` -> `41 pass / 2 skip / 0 fail`
  - local runtime restarted successfully
  - `/health` -> `ok:true`
  - `/api/system/ready` -> `ok:true`
- Important behavioral clarification kept explicit:
  - if the pharmacy side writes manually first, the bot must stay silent after that until the advisor closes the case
  - the patience auto-reply only applies while the chat is still waiting for the first human intervention
