# WhatsApp Web Companion

## Objetivo

Mantener la operación dentro de WhatsApp Web sin obligar a la farmacia a trabajar con un CRM separado, pero sin depender de APIs no oficiales de WhatsApp para modificar el inbox nativo.

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
- No depende de librerías no oficiales que automaticen WhatsApp Web

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
