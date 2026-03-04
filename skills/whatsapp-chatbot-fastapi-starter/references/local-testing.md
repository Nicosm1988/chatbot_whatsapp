# Local Testing (FastAPI)

## 1. Ejecutar app local

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 2. Exponer webhook con ngrok

```bash
ngrok http 8000
```

Configurar en Meta: `https://<ngrok-id>.ngrok.io/webhook`

## 3. Configurar verify token

Debe coincidir con `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

## 4. Probar handshake

```text
https://<ngrok-id>.ngrok.io/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123
```

Debe devolver `123`.

## 5. Probar mensaje real

Enviar un mensaje desde el numero de prueba.

Esperado:
- Evento recibido por `POST /webhook`.
- Respuesta enviada por Cloud API.
- Logs sin excepciones.

## 6. Problemas frecuentes

- Error 401 por firma invalida (`WHATSAPP_APP_SECRET` mal configurado).
- Error 401/403 de Meta por token vencido.
- Phone number ID incorrecto.
- URL ngrok expirada.
