import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    port: int
    meta_api_version: str
    whatsapp_access_token: str
    whatsapp_phone_number_id: str
    whatsapp_webhook_verify_token: str
    whatsapp_app_secret: str



def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


SETTINGS = Settings(
    port=int(os.getenv("PORT", "8000")),
    meta_api_version=os.getenv("META_API_VERSION", "v22.0"),
    whatsapp_access_token=_require_env("WHATSAPP_ACCESS_TOKEN"),
    whatsapp_phone_number_id=_require_env("WHATSAPP_PHONE_NUMBER_ID"),
    whatsapp_webhook_verify_token=_require_env("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    whatsapp_app_secret=os.getenv("WHATSAPP_APP_SECRET", ""),
)
