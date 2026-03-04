import httpx

from app.settings import SETTINGS


async def send_text_message(to: str, text: str) -> dict:
    url = (
        f"https://graph.facebook.com/{SETTINGS.meta_api_version}"
        f"/{SETTINGS.whatsapp_phone_number_id}/messages"
    )

    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }

    headers = {
        "Authorization": f"Bearer {SETTINGS.whatsapp_access_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()
