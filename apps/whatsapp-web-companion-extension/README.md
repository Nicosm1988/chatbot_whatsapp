# WhatsApp Web Companion

Extensión Chromium/Edge para superponer etiquetas y filtros operativos del bot directamente sobre `https://web.whatsapp.com`.

## Qué hace

- Lee el endpoint `/api/companion/conversations` del backend del bot.
- Muestra un panel flotante dentro de WhatsApp Web.
- Superpone chips sobre las conversaciones visibles cuando puede matchearlas por nombre o teléfono.
- Permite filtrar por:
  - Delivery
  - Mostrador
  - Particular
  - Programa de sobrepeso y diabetes
  - Obra social
  - Pruebas

## Cómo cargarla en Edge o Chrome

1. Abrí `edge://extensions` o `chrome://extensions`.
2. Activá `Modo desarrollador`.
3. Elegí `Cargar descomprimida`.
4. Seleccioná esta carpeta:
   - `apps/whatsapp-web-companion-extension`
5. Abrí `https://web.whatsapp.com`.

## Configuración

Desde el popup de la extensión podés abrir la configuración y ajustar:

- URL del backend
- token de solo lectura, si más adelante lo agregamos
- intervalo de refresco

Por default apunta a:

- `https://whatsapp-bot-node-chatbot1.vercel.app`

## Nota operativa

No escribe etiquetas nativas de Meta dentro del inbox oficial. Lo que hace es superponer una capa visual sobre WhatsApp Web usando la categorización real de nuestro bot.
