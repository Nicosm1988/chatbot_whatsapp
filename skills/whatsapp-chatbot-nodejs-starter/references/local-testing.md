# Local Testing (Node.js)

## 1. Ejecutar app local

```bash
npm install
npm run dev
```

Por defecto expone `http://localhost:3000`.

## 2. Exponer webhook con ngrok

```bash
ngrok http 3000
```

Usar URL HTTPS de ngrok + `/webhook` en Meta.

## 3. Configurar webhook en Meta

- Callback URL: `https://<ngrok-id>.ngrok.io/webhook`
- Verify token: valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Suscribir eventos de mensajes.

## 4. Probar handshake

Abrir en navegador:

```text
https://<ngrok-id>.ngrok.io/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123
```

Debe devolver `123`.

## 5. Probar mensaje real

Enviar mensaje desde numero de prueba al numero de WhatsApp habilitado.

Esperado:
- `POST /webhook` recibe evento.
- La app envia respuesta por Cloud API.
- Se imprime log de procesamiento sin errores.

## 6. Problemas frecuentes

- Verify token incorrecto.
- Token de acceso vencido.
- Phone number ID incorrecto.
- URL de ngrok cambiada y no actualizada en Meta.
