# WhatsApp Web Companion

## Objetivo

Mantener la operación dentro de WhatsApp Web sin obligar a la farmacia a trabajar con un CRM separado. La extensión sólo presenta información operativa; no modifica el inbox mediante una API propia.

## Enfoque elegido

Se incorporó una extensión Chromium/Edge que:

- se conecta al backend del bot
- consume una vista amigable de conversaciones
- dibuja filtros y chips operativos sobre WhatsApp Web
- permite segmentar por modalidad y categoría sin salir de la pantalla de WhatsApp

## Componentes incorporados

### Backend

Nuevo endpoint:

- `/api/companion/conversations`

Entrega:

- resumen operativo
- conversaciones saneadas para consumo de la extensión
- etiquetas visibles ya traducidas a lenguaje simple
- grupos de filtros con contadores

### Frontend de extensión

Carpeta:

- `apps/whatsapp-web-companion-extension`

Archivos principales:

- `manifest.json`
- `background.js`
- `content.js`
- `styles.css`
- `options.html`
- `options.js`
- `popup.html`
- `popup.js`

## Qué resuelve

- Filtros dentro de la experiencia de WhatsApp Web
- Chips visibles sobre conversaciones detectadas
- Panel flotante con búsqueda y segmentación
- Estado operativo sin exponer JSON ni IDs internos del sistema

## Qué no hace todavía

- No escribe etiquetas nativas del inbox oficial de WhatsApp
- No reemplaza el layout original de Meta
- La extensión, por sí sola, no automatiza el envío de mensajes

## Alcance y riesgo del bot

La extensión companion y el transporte del bot son componentes distintos. El bot local sí usa `whatsapp-web.js` para leer y enviar mensajes desde la sesión vinculada. Ese transporte no es una integración oficial autorizada por WhatsApp, no tiene soporte ni SLA de Meta y puede ocasionar restricciones sobre la cuenta asociada al número. El modo oficial sigue siendo WhatsApp Business Platform/Cloud API.

## Instalación rápida

1. Abrir `edge://extensions` o `chrome://extensions`
2. Activar `Modo desarrollador`
3. Elegir `Cargar descomprimida`
4. Seleccionar `apps/whatsapp-web-companion-extension`
5. Abrir `https://web.whatsapp.com`
6. Verificar que la extensión tome el backend productivo

## Próximas mejoras sugeridas

- sumar token de solo lectura para el endpoint companion
- agregar acción rápida para enfocar un chat desde el panel
- mostrar badge compacto en el header del chat abierto
- publicar la extensión en un canal privado de Edge Add-ons si la farmacia la va a usar en varias máquinas
