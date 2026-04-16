function getFlowCatalog() {
  return {
    updatedAt: new Date().toISOString(),
    workflows: [
      {
        id: "wf_router",
        name: "Router entrada",
        description: "Recepcion, normalizacion y derivacion inicial del webhook.",
        canvas: { width: 1660, height: 520 },
        nodes: [
          {
            id: "router_webhook",
            title: "Webhook In",
            subtitle: "Evento entrante",
            explain: "Recibe el mensaje de WhatsApp y arma el contexto inicial.",
            kind: "trigger",
            x: 70,
            y: 120,
            w: 220,
            h: 98,
            botMessage: ""
          },
          {
            id: "router_state",
            title: "Hydrate State",
            subtitle: "Sesion + perfil",
            explain: "Recupera el estado del contacto desde KV o memoria.",
            kind: "data",
            x: 360,
            y: 120,
            w: 220,
            h: 98,
            botMessage: ""
          },
          {
            id: "router_parse",
            title: "Parse Input",
            subtitle: "texto, media, botones",
            explain: "Convierte el mensaje en un formato interno uniforme.",
            kind: "code",
            x: 650,
            y: 120,
            w: 220,
            h: 98,
            botMessage: ""
          },
          {
            id: "router_commands",
            title: "Global Commands",
            subtitle: "CANCELAR / MENU / ASESOR",
            explain: "Intercepta comandos transversales antes del flujo de negocio.",
            kind: "decision",
            x: 940,
            y: 120,
            w: 220,
            h: 98,
            botMessage: ""
          },
          {
            id: "router_menu",
            title: "Inicio visible",
            subtitle: "Delivery / Mostrador",
            explain: "Presenta la primera decision del cliente.",
            kind: "ui",
            x: 1230,
            y: 120,
            w: 220,
            h: 98,
            botMessage: "¿Cómo querés continuar?"
          },
          {
            id: "router_order_start",
            title: "Ingreso al flujo",
            subtitle: "pedido asistido",
            explain: "Pasa al workflow principal del chatbot.",
            kind: "next",
            x: 1520,
            y: 120,
            w: 220,
            h: 98,
            botMessage: ""
          }
        ],
        edges: [
          { id: "r1", from: "router_webhook", to: "router_state", label: "evento", routeKey: "", disabled: false },
          { id: "r2", from: "router_state", to: "router_parse", label: "estado", routeKey: "", disabled: false },
          { id: "r3", from: "router_parse", to: "router_commands", label: "input", routeKey: "", disabled: false },
          { id: "r4", from: "router_commands", to: "router_menu", label: "normal", routeKey: "", disabled: false },
          { id: "r5", from: "router_menu", to: "router_order_start", label: "continuar", routeKey: "", disabled: false }
        ]
      },
      {
        id: "wf_order",
        name: "Pedido chatbot",
        description: "Flujo de compra con busqueda de productos, carrito, captura de delivery y cierre asistido.",
        canvas: { width: 3260, height: 980 },
        nodes: [
          {
            id: "menu",
            title: "Inicio",
            subtitle: "Delivery / Mostrador",
            explain: "Primera decision del cliente apenas arranca el chat.",
            kind: "ui",
            x: 60,
            y: 110,
            w: 220,
            h: 98,
            botMessage: "¿Cómo querés continuar?"
          },
          {
            id: "service_type",
            title: "Tipo de atencion",
            subtitle: "Particular / Programa de sobrepeso y diabetes / OS",
            explain: "Abre la rama segun el tipo de necesidad.",
            kind: "decision",
            x: 360,
            y: 110,
            w: 220,
            h: 98,
            botMessage: "Elegí una opción."
          },
          {
            id: "receta_upload",
            title: "Recepcion receta",
            subtitle: "Foto o PDF",
            explain: "Recibe la receta para Mostrador u Obra Social y deriva a atencion humana.",
            kind: "input",
            x: 660,
            y: 40,
            w: 220,
            h: 98,
            botMessage: "Enviá tu receta."
          },
          {
            id: "particular_search_mode",
            title: "Historial o busqueda",
            subtitle: "recompra / droga / nombre",
            explain: "Si el celular ya tiene un pedido previo, primero ofrece recompra rapida; si no, el cliente define si busca por droga o por nombre comercial.",
            kind: "decision",
            x: 660,
            y: 180,
            w: 220,
            h: 98,
            botMessage: "¿Cómo querés buscar?"
          },
          {
            id: "particular_input",
            title: "Consulta particular",
            subtitle: "droga o producto",
            explain: "Recibe la droga o el nombre del producto y abre una lista real del sistema antes del lookup.",
            kind: "input",
            x: 960,
            y: 180,
            w: 220,
            h: 98,
            botMessage: "¿Qué necesitás?"
          },
          {
            id: "item_input",
            title: "Catalogo guiado",
            subtitle: "Documento -> marca -> presentacion",
            explain: "Guia al cliente con el documento oficial hasta identificar la presentacion.",
            kind: "input",
            x: 660,
            y: 320,
            w: 220,
            h: 98,
            botMessage: "Elegí el laboratorio."
          },
          {
            id: "recetario",
            title: "Recetario solidario",
            subtitle: "Si / No",
            explain: "Se pregunta una sola vez, despues de terminar de elegir todos los productos.",
            kind: "decision",
            x: 1680,
            y: 250,
            w: 220,
            h: 98,
            botMessage: "¿Estás adherido al Recetario Solidario?"
          },
          {
            id: "summary",
            title: "Revision item",
            subtitle: "Agregar mas o terminar",
            explain: "Revisa el producto elegido y permite seguir sumando items o pasar al cierre.",
            kind: "summary",
            x: 1320,
            y: 250,
            w: 220,
            h: 98,
            botMessage: "Resumen."
          },
          {
            id: "cart_input",
            title: "Suma otro producto",
            subtitle: "droga o nombre",
            explain: "Permite seguir sumando productos por droga o por nombre, manteniendo el modo elegido.",
            kind: "input",
            x: 2040,
            y: 250,
            w: 220,
            h: 98,
            botMessage: "¿Qué querés agregar?"
          },
          {
            id: "delivery_saved",
            title: "Direccion guardada",
            subtitle: "usar u otra",
            explain: "Si el celular ya tiene delivery guardado, ofrece reutilizarlo o cargar uno nuevo.",
            kind: "decision",
            x: 2400,
            y: 160,
            w: 220,
            h: 98,
            botMessage: "¿Querés usar la direccion guardada?"
          },
          {
            id: "delivery_data",
            title: "Datos delivery",
            subtitle: "nombre, mail, direccion",
            explain: "Captura nombre, apellido, mail, direccion, entre calles y barrio.",
            kind: "input",
            x: 2400,
            y: 360,
            w: 220,
            h: 98,
            botMessage: "Pasame los datos para el delivery."
          },
          {
            id: "checkout_close",
            title: "Resumen cierre",
            subtitle: "total + asesor",
            explain: "Entrega el resumen final del pedido y deriva a asesor para concretar la compra.",
            kind: "handoff",
            x: 2760,
            y: 250,
            w: 220,
            h: 98,
            botMessage: "Resumen final."
          }
        ],
        edges: [
          { id: "e_menu_delivery", from: "menu", to: "service_type", label: "delivery", routeKey: "menu_delivery", disabled: false },
          { id: "e_menu_counter", from: "menu", to: "receta_upload", label: "mostrador", routeKey: "menu_counter", disabled: false },
          { id: "e_service_os", from: "service_type", to: "receta_upload", label: "obra social", routeKey: "service_obra_social", disabled: false },
          { id: "e_service_particular", from: "service_type", to: "particular_search_mode", label: "particular", routeKey: "service_particular", disabled: false },
          { id: "e_particular_search_mode", from: "particular_search_mode", to: "particular_input", label: "buscar", routeKey: "", disabled: false },
          { id: "e_service_treatment", from: "service_type", to: "item_input", label: "programa de sobrepeso y diabetes", routeKey: "service_treatment", disabled: false },
          { id: "e_particular_lookup_ready", from: "particular_input", to: "summary", label: "lookup ok", routeKey: "lookup_ready", disabled: false },
          { id: "e_treatment_lookup_ready", from: "item_input", to: "summary", label: "lookup ok", routeKey: "lookup_ready", disabled: false },
          { id: "e_particular_lookup_no_stock", from: "particular_input", to: "summary", label: "sin stock", routeKey: "lookup_no_stock", disabled: false },
          { id: "e_treatment_lookup_no_stock", from: "item_input", to: "summary", label: "sin stock", routeKey: "lookup_no_stock", disabled: false },
          { id: "e_recetario_done", from: "recetario", to: "delivery_saved", label: "respuesta", routeKey: "recetario_done", disabled: false },
          { id: "e_summary_more", from: "summary", to: "cart_input", label: "agregar otro", routeKey: "summary_add_more", disabled: false },
          { id: "e_summary_finish", from: "summary", to: "recetario", label: "terminar", routeKey: "summary_finish", disabled: false },
          { id: "e_cart_lookup_ready", from: "cart_input", to: "summary", label: "lookup ok", routeKey: "lookup_ready", disabled: false },
          { id: "e_cart_lookup_no_stock", from: "cart_input", to: "summary", label: "sin stock", routeKey: "lookup_no_stock", disabled: false },
          { id: "e_saved_delivery_yes", from: "delivery_saved", to: "checkout_close", label: "usar guardada", routeKey: "delivery_saved_yes", disabled: false },
          { id: "e_saved_delivery_new", from: "delivery_saved", to: "delivery_data", label: "nueva", routeKey: "delivery_saved_new", disabled: false },
          { id: "e_delivery_data_done", from: "delivery_data", to: "checkout_close", label: "completo", routeKey: "delivery_data_done", disabled: false }
        ]
      },
      {
        id: "wf_global",
        name: "Comandos globales",
        description: "Comandos transversales y escalamiento por fallback.",
        canvas: { width: 1500, height: 520 },
        nodes: [
          {
            id: "global_any",
            title: "Any step",
            subtitle: "mensaje usuario",
            explain: "Representa cualquier estado del flujo.",
            kind: "trigger",
            x: 60,
            y: 160,
            w: 220,
            h: 98,
            botMessage: ""
          },
          {
            id: "global_cancel",
            title: "CANCELAR",
            subtitle: "reset + inicio",
            explain: "Cancela la conversacion y vuelve al primer menu.",
            kind: "guard",
            x: 360,
            y: 40,
            w: 220,
            h: 98,
            botMessage: "Pedido cancelado."
          },
          {
            id: "global_menu",
            title: "MENU",
            subtitle: "volver al inicio",
            explain: "Retorna a Delivery o Mostrador.",
            kind: "guard",
            x: 360,
            y: 250,
            w: 220,
            h: 98,
            botMessage: "¿Cómo querés continuar?"
          },
          {
            id: "global_human",
            title: "ASESOR",
            subtitle: "state agent",
            explain: "Deriva la conversacion al equipo humano.",
            kind: "guard",
            x: 680,
            y: 40,
            w: 220,
            h: 98,
            botMessage: "Te derivamos con un asesor."
          },
          {
            id: "global_fallback",
            title: "Escala asesor",
            subtitle: "3er fallback",
            explain: "Tras tres errores consecutivos, deriva a un asesor.",
            kind: "handoff",
            x: 680,
            y: 250,
            w: 220,
            h: 98,
            botMessage: "Te paso con un asesor para evitar demoras."
          }
        ],
        edges: [
          { id: "g1", from: "global_any", to: "global_cancel", label: "cancelar", routeKey: "", disabled: false },
          { id: "g2", from: "global_any", to: "global_menu", label: "menu", routeKey: "", disabled: false },
          { id: "g3", from: "global_any", to: "global_human", label: "asesor", routeKey: "", disabled: false },
          { id: "g4", from: "global_any", to: "global_fallback", label: "3 errores", routeKey: "", disabled: false }
        ]
      }
    ]
  };
}

module.exports = {
  getFlowCatalog
};
