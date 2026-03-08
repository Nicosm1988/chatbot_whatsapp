function getFlowCatalog() {
  return {
    updatedAt: new Date().toISOString(),
    currentFlow: {
      name: "Flujo farmacia - Operativo",
      version: "2026.03",
      nodes: [
        {
          id: "welcome",
          title: "Bienvenida y cliente recurrente",
          kind: "entry",
          detail: "Saludo inicial. Si existe ultimo pedido, ofrece Continuar o Nuevo pedido."
        },
        {
          id: "main_menu",
          title: "Menu principal",
          kind: "menu",
          detail: "Hacer pedido / Web-MercadoLibre / Consultas-Reclamos."
        },
        {
          id: "mode",
          title: "Modalidad",
          kind: "decision",
          detail: "Envio o Retiro en tienda."
        },
        {
          id: "logistics",
          title: "Logistica",
          kind: "process",
          detail: "Envio: zona y direccion. Retiro: sucursal."
        },
        {
          id: "order_type",
          title: "Tipo de pedido",
          kind: "decision",
          detail: "Particular u Obra social/Prepaga."
        },
        {
          id: "rx",
          title: "Recetas y credencial",
          kind: "process",
          detail: "Carga en loop de recetas y luego foto de credencial."
        },
        {
          id: "items",
          title: "Carga de items",
          kind: "loop",
          detail: "Agregar producto / Pedido completo / Cancelar."
        },
        {
          id: "handoff",
          title: "Handoff humano",
          kind: "handoff",
          detail: "Pasa a operador para cotizacion final."
        },
        {
          id: "payment",
          title: "Pago y comprobante",
          kind: "payment",
          detail: "Link de pago y validacion de comprobante."
        },
        {
          id: "close",
          title: "Cierre y encuesta",
          kind: "exit",
          detail: "Pedido en preparacion + encuesta del 1 al 10."
        }
      ],
      transitions: [
        { from: "welcome", to: "main_menu", label: "nuevo pedido" },
        { from: "welcome", to: "order_type", label: "continuar datos previos" },
        { from: "main_menu", to: "mode", label: "hacer pedido" },
        { from: "mode", to: "logistics", label: "envio/retiro" },
        { from: "logistics", to: "order_type", label: "datos completados" },
        { from: "order_type", to: "rx", label: "obra social" },
        { from: "order_type", to: "items", label: "particular" },
        { from: "rx", to: "items", label: "ok credencial" },
        { from: "items", to: "items", label: "agregar producto" },
        { from: "items", to: "handoff", label: "pedido completo" },
        { from: "handoff", to: "payment", label: "cotizacion confirmada" },
        { from: "payment", to: "close", label: "comprobante recibido" }
      ]
    },
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
      stateModel: "Maquina de estados por contacto (en memoria)",
      channels: ["WhatsApp Cloud API"],
      deployment: "Vercel",
      apiEndpoints: ["/", "/health", "/webhook", "/api/flows"]
    }
  };
}

module.exports = {
  getFlowCatalog
};
