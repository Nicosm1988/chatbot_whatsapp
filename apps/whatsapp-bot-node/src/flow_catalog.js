function getFlowCatalog() {
  return {
    updatedAt: new Date().toISOString(),
    workflows: [
      {
        id: "wf_router",
        name: "Router de entrada",
        description: "Entrada del webhook, hidratacion de estado y enrutamiento de opciones principales.",
        canvas: { width: 1980, height: 520 },
        nodes: [
          { id: "in_webhook", title: "Webhook In", subtitle: "Meta messages[]", kind: "trigger", x: 70, y: 90, w: 220, h: 98 },
          { id: "in_hydrate", title: "Hydrate State", subtitle: "KV + fallback memoria", kind: "data", x: 360, y: 90, w: 220, h: 98 },
          { id: "in_normalize", title: "Normalize Input", subtitle: "text, button_id, media", kind: "code", x: 650, y: 90, w: 220, h: 98 },
          { id: "in_global", title: "Global Commands", subtitle: "CANCELAR / MENU / ASESOR", kind: "decision", x: 940, y: 90, w: 220, h: 98 },
          { id: "in_returning", title: "Returning Check", subtitle: "ultimo pedido disponible?", kind: "decision", x: 1230, y: 90, w: 220, h: 98 },
          { id: "in_menu", title: "Main Menu", subtitle: "hacer pedido / web / reclamos", kind: "ui", x: 1520, y: 90, w: 220, h: 98 },
          { id: "in_web", title: "Web / MercadoLibre", subtitle: "link + volver menu", kind: "side", x: 1520, y: 250, w: 220, h: 98 },
          { id: "in_support", title: "Consultas/Reclamos", subtitle: "derivacion humana", kind: "side", x: 1230, y: 250, w: 220, h: 98 },
          { id: "in_order", title: "Start Order Flow", subtitle: "entra a modalidad", kind: "next", x: 1810, y: 90, w: 220, h: 98 }
        ],
        edges: [
          { from: "in_webhook", to: "in_hydrate", label: "event" },
          { from: "in_hydrate", to: "in_normalize", label: "context" },
          { from: "in_normalize", to: "in_global", label: "parsed" },
          { from: "in_global", to: "in_menu", label: "sin comando" },
          { from: "in_global", to: "in_support", label: "asesor" },
          { from: "in_menu", to: "in_order", label: "hacer pedido" },
          { from: "in_menu", to: "in_web", label: "web/ml" },
          { from: "in_menu", to: "in_support", label: "reclamos" },
          { from: "in_web", to: "in_menu", label: "volver" },
          { from: "in_returning", to: "in_menu", label: "nuevo pedido" },
          { from: "in_returning", to: "in_order", label: "continuar datos previos" },
          { from: "in_menu", to: "in_returning", label: "saludo + historial" }
        ]
      },
      {
        id: "wf_order",
        name: "Flujo de pedido completo",
        description: "Todos los caminos del pedido: modalidad, recetas, loop de productos, pago y cierre.",
        canvas: { width: 2520, height: 860 },
        nodes: [
          { id: "o_mode", title: "Modalidad", subtitle: "envio / retiro", kind: "decision", x: 60, y: 110, w: 220, h: 98 },
          { id: "o_zone", title: "Zona envio", subtitle: "norte / caba / pilar", kind: "decision", x: 360, y: 40, w: 220, h: 98 },
          { id: "o_addr_pick", title: "Direccion guardada?", subtitle: "misma / otra", kind: "decision", x: 660, y: 40, w: 220, h: 98 },
          { id: "o_addr_input", title: "Direccion nueva", subtitle: "texto libre", kind: "input", x: 960, y: 40, w: 220, h: 98 },
          { id: "o_pickup", title: "Sucursal retiro", subtitle: "san isidro / martinez / caba", kind: "decision", x: 360, y: 220, w: 220, h: 98 },
          { id: "o_type", title: "Tipo pedido", subtitle: "particular / obra social", kind: "decision", x: 1260, y: 110, w: 220, h: 98 },
          { id: "o_rx", title: "Carga recetas", subtitle: "loop media + NO TENGO MAS", kind: "loop", x: 1560, y: 40, w: 220, h: 98 },
          { id: "o_cred", title: "Credencial", subtitle: "frente credencial", kind: "input", x: 1860, y: 40, w: 220, h: 98 },
          { id: "o_item_input", title: "Item input", subtitle: "producto por texto/media", kind: "input", x: 1560, y: 240, w: 220, h: 98 },
          { id: "o_item_decision", title: "Item decision", subtitle: "agregar / completo / cancelar", kind: "decision", x: 1860, y: 240, w: 220, h: 98 },
          { id: "o_handoff", title: "Handoff operador", subtitle: "sector envios", kind: "handoff", x: 2160, y: 240, w: 220, h: 98 },
          { id: "o_continue", title: "Desea continuar?", subtitle: "si / no", kind: "decision", x: 2160, y: 410, w: 220, h: 98 },
          { id: "o_quote", title: "Resumen cotizacion", subtitle: "total preliminar", kind: "process", x: 1860, y: 410, w: 220, h: 98 },
          { id: "o_add_more", title: "Agregar mas?", subtitle: "si -> loop, no -> pago", kind: "decision", x: 1560, y: 410, w: 220, h: 98 },
          { id: "o_pay", title: "Link pago", subtitle: "espera comprobante", kind: "payment", x: 1260, y: 410, w: 220, h: 98 },
          { id: "o_proof", title: "Comprobante", subtitle: "pdf/imagen", kind: "input", x: 960, y: 410, w: 220, h: 98 },
          { id: "o_close", title: "Pedido en preparacion", subtitle: "mensaje de entrega", kind: "process", x: 660, y: 410, w: 220, h: 98 },
          { id: "o_survey", title: "Encuesta", subtitle: "1 a 10", kind: "exit", x: 360, y: 410, w: 220, h: 98 },
          { id: "o_pause", title: "Pausa/cancel", subtitle: "vuelve a menu", kind: "exit", x: 60, y: 410, w: 220, h: 98 }
        ],
        edges: [
          { from: "o_mode", to: "o_zone", label: "envio" },
          { from: "o_mode", to: "o_pickup", label: "retiro" },
          { from: "o_zone", to: "o_addr_pick", label: "zona ok" },
          { from: "o_addr_pick", to: "o_type", label: "misma direccion" },
          { from: "o_addr_pick", to: "o_addr_input", label: "otra direccion" },
          { from: "o_addr_input", to: "o_type", label: "direccion ok" },
          { from: "o_pickup", to: "o_type", label: "sucursal ok" },
          { from: "o_type", to: "o_rx", label: "obra social" },
          { from: "o_type", to: "o_item_input", label: "particular" },
          { from: "o_rx", to: "o_rx", label: "agregar receta" },
          { from: "o_rx", to: "o_cred", label: "no tengo mas" },
          { from: "o_cred", to: "o_item_decision", label: "credencial ok" },
          { from: "o_item_input", to: "o_item_decision", label: "item cargado" },
          { from: "o_item_decision", to: "o_item_input", label: "agregar producto" },
          { from: "o_item_decision", to: "o_handoff", label: "pedido completo" },
          { from: "o_item_decision", to: "o_pause", label: "cancelar" },
          { from: "o_handoff", to: "o_continue", label: "operador responde" },
          { from: "o_continue", to: "o_quote", label: "si" },
          { from: "o_continue", to: "o_pause", label: "no" },
          { from: "o_quote", to: "o_add_more", label: "cotizacion enviada" },
          { from: "o_add_more", to: "o_item_input", label: "si" },
          { from: "o_add_more", to: "o_pay", label: "no" },
          { from: "o_pay", to: "o_proof", label: "espera comprobante" },
          { from: "o_proof", to: "o_close", label: "comprobante ok" },
          { from: "o_close", to: "o_survey", label: "pide puntuacion" },
          { from: "o_survey", to: "o_pause", label: "fin / menu" }
        ]
      },
      {
        id: "wf_global",
        name: "Comandos globales y resiliencia",
        description: "Caminos transversales: cancelacion, menu, derivacion humana y fallback.",
        canvas: { width: 1680, height: 520 },
        nodes: [
          { id: "g_any", title: "Any Step", subtitle: "usuario envia mensaje", kind: "trigger", x: 60, y: 140, w: 220, h: 98 },
          { id: "g_cancel", title: "CANCELAR", subtitle: "reset estado + menu", kind: "guard", x: 360, y: 40, w: 220, h: 98 },
          { id: "g_menu", title: "MENU", subtitle: "vuelve a opciones", kind: "guard", x: 360, y: 240, w: 220, h: 98 },
          { id: "g_human", title: "ASESOR", subtitle: "state = AGENT", kind: "guard", x: 660, y: 40, w: 220, h: 98 },
          { id: "g_fallback1", title: "Fallback #1", subtitle: "mensaje de correccion", kind: "process", x: 660, y: 240, w: 220, h: 98 },
          { id: "g_fallback2", title: "Fallback #2", subtitle: "ayuda + botones", kind: "process", x: 960, y: 240, w: 220, h: 98 },
          { id: "g_escalate", title: "Escala humana", subtitle: "3er fallback", kind: "handoff", x: 1260, y: 240, w: 220, h: 98 },
          { id: "g_kv", title: "Persistencia KV", subtitle: "save state por contacto", kind: "data", x: 960, y: 40, w: 220, h: 98 },
          { id: "g_stateless", title: "Recovery button_id", subtitle: "resume sin estado local", kind: "code", x: 1260, y: 40, w: 220, h: 98 }
        ],
        edges: [
          { from: "g_any", to: "g_cancel", label: "match cancelar" },
          { from: "g_any", to: "g_menu", label: "match menu" },
          { from: "g_any", to: "g_human", label: "match asesor" },
          { from: "g_any", to: "g_fallback1", label: "input invalido" },
          { from: "g_fallback1", to: "g_fallback2", label: "repite invalido" },
          { from: "g_fallback2", to: "g_escalate", label: "3er invalido" },
          { from: "g_any", to: "g_kv", label: "al cerrar turno" },
          { from: "g_kv", to: "g_stateless", label: "si falta sesion" },
          { from: "g_stateless", to: "g_any", label: "reanuda paso" }
        ]
      }
    ],
    futureFlows: [
      {
        id: "real_stock",
        title: "Stock en tiempo real",
        status: "Planned",
        detail: "Integrar ERP para validar disponibilidad y reemplazos por sucursal."
      },
      {
        id: "ops_console",
        title: "Consola operativa",
        status: "Planned",
        detail: "Vista de conversaciones en vivo con takeover del operador y etiquetas."
      },
      {
        id: "delivery_tracking",
        title: "Tracking de envio",
        status: "Backlog",
        detail: "Eventos de salida, en camino y entregado con notificaciones automaticas."
      },
      {
        id: "bi_dashboard",
        title: "Analytics comercial",
        status: "Backlog",
        detail: "Embudo por etapa, conversion a pago, tiempos de respuesta y NPS."
      }
    ],
    architecture: {
      runtime: "Node.js + Express + Meta Cloud API",
      stateModel: "State machine por contacto con persistencia KV + fallback in-memory",
      channels: ["WhatsApp Cloud API"],
      deployment: "Vercel",
      apiEndpoints: ["/", "/health", "/webhook", "/api/flows"]
    }
  };
}

module.exports = {
  getFlowCatalog
};
