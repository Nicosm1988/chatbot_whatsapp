import hashlib
import hmac
from collections.abc import Iterable

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from app.meta_client import send_text_message
from app.settings import SETTINGS

app = FastAPI(title="WhatsApp FastAPI Starter")
processed_message_ids: set[str] = set()


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(default="", alias="hub.mode"),
    hub_verify_token: str = Query(default="", alias="hub.verify_token"),
    hub_challenge: str = Query(default="", alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == SETTINGS.whatsapp_webhook_verify_token:
        return PlainTextResponse(content=hub_challenge, status_code=200)
    raise HTTPException(status_code=403, detail="verification failed")


@app.post("/webhook")
async def receive_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_hub_signature_256: str | None = Header(default=None),
):
    raw_body = await request.body()
    _validate_signature(raw_body, x_hub_signature_256)

    payload = await request.json()
    background_tasks.add_task(process_incoming_event, payload)

    return JSONResponse(content={"status": "accepted"}, status_code=200)


def _validate_signature(raw_body: bytes, signature_header: str | None) -> None:
    if not SETTINGS.whatsapp_app_secret:
        return

    if not signature_header:
        raise HTTPException(status_code=401, detail="missing signature")

    expected = "sha256=" + hmac.new(
        SETTINGS.whatsapp_app_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(signature_header, expected):
        raise HTTPException(status_code=401, detail="invalid signature")


async def process_incoming_event(payload: dict) -> None:
    for message in _extract_messages(payload):
        message_id = message.get("id")
        sender = message.get("from")

        if not message_id or not sender:
            continue

        if message_id in processed_message_ids:
            continue

        processed_message_ids.add(message_id)
        _trim_processed_ids(processed_message_ids, 10000)

        inbound_text = ((message.get("text") or {}).get("body") or "").strip()
        reply_text = build_reply_text(inbound_text)
        await send_text_message(sender, reply_text)



def _extract_messages(payload: dict) -> Iterable[dict]:
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            for message in (change.get("value", {}) or {}).get("messages", []):
                yield message



def build_reply_text(inbound_text: str) -> str:
    normalized = inbound_text.lower().strip()

    if not normalized:
        return "Recibi tu mensaje. Puedes contarme que necesitas?"

    if "agente" in normalized or "humano" in normalized:
        return "Te voy a derivar con un agente humano."

    return f'Recibi: "{inbound_text}". Este es un bot base para conectar intents reales.'



def _trim_processed_ids(store: set[str], max_size: int) -> None:
    if len(store) <= max_size:
        return

    extra = len(store) - max_size
    to_remove = list(store)[:extra]
    for item in to_remove:
        store.remove(item)
