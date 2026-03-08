function getFlowCatalog() {
  return {
    updatedAt: new Date().toISOString(),
    workflows: [
      {
        id: "wf_router",
        name: "Router entrada",
        description: "Recepcion del webhook, normalizacion y derivacion inicial.",
        canvas: { width: 1720, height: 520 },
        nodes: [
          {
            id: "router_webhook",
            title: "Webhook In",
            subtitle: "Evento entrante de WhatsApp",
            explain: "Recibe el mensaje de WhatsApp y prepara el contexto inicial para procesarlo.",
            kind: "trigger",
            x: 70,
            y: 100,
            w: 220,
            h: 98,
            botMessage: ""
          },
          {
            id: "router_state",
            title: "Hydrate State",
            subtitle: "Sesión + perfil",
            explain: "Recupera estado del contacto desde KV o memoria para continuar conversación.",
            kind: "data",
            x: 360,
            y: 100,
            w: 220,
            h: 98,
            botMessage: ""
          },
          {
            id: "router_parse",
            title: "Parse Input",
            subtitle: "texto, media, button_id",
            explain: "Convierte el mensaje en un formato interno uniforme.",
            kind: "code",
            x: 650,
            y: 100,
            w: 220,
            h: 98,
            botMessage: ""
          },
          {
            id: "router_commands",
            title: "Global Commands",
            subtitle: "CANCELAR / MENU / ASESOR",
            explain: "Intercepta comandos globales antes de cualquier flujo de negocio.",
            kind: "decision",
            x: 940,
            y: 100,
            w: 220,
            h: 98,
            botMessage: ""
          },
          {
            id: "router_menu",
            title: "Main Menu",
            subtitle: "Pedido / Web / Reclamos",
            explain: "Muestra opciones principales para arrancar o derivar.",
            kind: "ui",
            x: 1230,
            y: 100,
            w: 220,
            h: 98,
            botMessage: "Selecciona una opcion:"
          },
          {
            id: "router_support",
            title: "Derivacion humana",
            subtitle: "Consultas y reclamos",
            explain: "Pasa el caso a asesor humano cuando corresponde.",
            kind: "handoff",
            x: 1230,
            y: 260,
            w: 220,
            h: 98,
            botMessage: "Te derivo al sector de consultas y reclamos."
          },
          {
            id: "router_order_start",
            title: "Inicio flujo pedido",
            subtitle: "entra a modalidad",
            explain: "Transfiere al workflow principal de pedido.",
            kind: "next",
            x: 1520,
            y: 100,
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
          { id: "r5", from: "router_commands", to: "router_support", label: "asesor", routeKey: "", disabled: false },
          { id: "r6", from: "router_menu", to: "router_order_start", label: "hacer pedido", routeKey: "", disabled: false },
          { id: "r7", from: "router_menu", to: "router_support", label: "reclamos", routeKey: "", disabled: false },
          { id: "r8", from: "router_support", to: "router_menu", label: "volver", routeKey: "", disabled: false }
        ]
      },
      {
        id: "wf_order",
        name: "Pedido chatbot",
        description: "Flujo principal del bot que sí impacta en comportamiento real.",
        canvas: { width: 2460, height: 930 },
        nodes: [
          {
            id: "menu",
            title: "Menu principal",
            subtitle: "Opciones iniciales",
            explain: "Presenta Hacer pedido, Web/MercadoLibre y Consultas/Reclamos.",
            kind: "ui",
            x: 60,
            y: 90,
            w: 220,
            h: 98,
            botMessage: "Selecciona una opcion:"
          },
          {
            id: "returning",
            title: "Cliente recurrente",
            subtitle: "Continuar o nuevo",
            explain: "Si hay pedido previo, ofrece continuar con datos guardados o iniciar uno nuevo.",
            kind: "decision",
            x: 60,
            y: 270,
            w: 220,
            h: 98,
            botMessage: "Selecciona una opcion:"
          },
          {
            id: "mode",
            title: "Modalidad",
            subtitle: "Envio o retiro",
            explain: "Pregunta al cliente si quiere envío o retiro por sucursal.",
            kind: "decision",
            x: 360,
            y: 90,
            w: 220,
            h: 98,
            botMessage: "Selecciona modalidad o escribi CANCELAR."
          },
          {
            id: "zone",
            title: "Zona de envio",
            subtitle: "Norte/CABA/Pilar",
            explain: "Solicita la zona para continuar con la logística de envío.",
            kind: "decision",
            x: 660,
            y: 40,
            w: 220,
            h: 98,
            botMessage: "Perfecto. Ahora selecciona la zona de envio."
          },
          {
            id: "address_decision",
            title: "Direccion guardada?",
            subtitle: "Misma u otra",
            explain: "Si existe dirección previa, pregunta si se reutiliza.",
            kind: "decision",
            x: 960,
            y: 40,
            w: 220,
            h: 98,
            botMessage: "Queremos enviar tu pedido a {address}? Elige una opcion."
          },
          {
            id: "address_input",
            title: "Direccion nueva",
            subtitle: "Carga texto libre",
            explain: "Pide dirección completa cuando no se reutiliza la guardada.",
            kind: "input",
            x: 1260,
            y: 40,
            w: 220,
            h: 98,
            botMessage: "Envia direccion completa para el envio."
          },
          {
            id: "pickup_branch",
            title: "Sucursal retiro",
            subtitle: "San Isidro/Martinez/CABA",
            explain: "Permite elegir sucursal para retiro en tienda.",
            kind: "decision",
            x: 660,
            y: 250,
            w: 220,
            h: 98,
            botMessage: "Selecciona sucursal:"
          },
          {
            id: "order_type",
            title: "Tipo de pedido",
            subtitle: "Particular u obra social",
            explain: "Define si pasa por carga de recetas y credencial o no.",
            kind: "decision",
            x: 1560,
            y: 90,
            w: 220,
            h: 98,
            botMessage: "Selecciona tipo:"
          },
          {
            id: "receta_upload",
            title: "Carga recetas",
            subtitle: "Fotos/PDF + No tengo mas",
            explain: "Recibe recetas en loop hasta finalizar con botón de cierre.",
            kind: "loop",
            x: 1860,
            y: 40,
            w: 220,
            h: 98,
            botMessage: "Envia fotos/links/PDF de recetas. Al terminar toca NO TENGO MAS."
          },
          {
            id: "credential_upload",
            title: "Credencial",
            subtitle: "Frente credencial",
            explain: "Solicita foto de credencial para pedidos con cobertura.",
            kind: "input",
            x: 2160,
            y: 40,
            w: 220,
            h: 98,
            botMessage: "Ahora envia la foto del frente de la credencial."
          },
          {
            id: "item_input",
            title: "Producto",
            subtitle: "Texto o media",
            explain: "Carga un item del pedido.",
            kind: "input",
            x: 1860,
            y: 260,
            w: 220,
            h: 98,
            botMessage: "Envia el primer producto que necesitas (texto, foto o PDF)."
          },
          {
            id: "item_decision",
            title: "Decision items",
            subtitle: "Agregar/Completo/Cancelar",
            explain: "Permite continuar cargando o cerrar el pedido.",
            kind: "decision",
            x: 2160,
            y: 260,
            w: 220,
            h: 98,
            botMessage: "Selecciona una opcion:"
          },
          {
            id: "agent_continue",
            title: "Confirma continuar",
            subtitle: "si/no",
            explain: "Tras handoff, confirma si el cliente sigue con pedido.",
            kind: "decision",
            x: 2160,
            y: 430,
            w: 220,
            h: 98,
            botMessage: "Deseas continuar con tu pedido?"
          },
          {
            id: "agent_add_more",
            title: "Agregar mas?",
            subtitle: "si/no",
            explain: "Tras resumen, define si vuelve a cargar items o avanza al pago.",
            kind: "decision",
            x: 1860,
            y: 430,
            w: 220,
            h: 98,
            botMessage: "Queres agregar algo mas?"
          },
          {
            id: "payment_proof",
            title: "Comprobante pago",
            subtitle: "espera media",
            explain: "Comparte link de pago y pide comprobante.",
            kind: "payment",
            x: 1560,
            y: 430,
            w: 220,
            h: 98,
            botMessage: "Aguardo comprobante de pago (imagen o PDF)."
          },
          {
            id: "survey",
            title: "Encuesta final",
            subtitle: "1 a 10",
            explain: "Solicita puntuación de atención y cierra ciclo.",
            kind: "exit",
            x: 1260,
            y: 430,
            w: 220,
            h: 98,
            botMessage: "Tu opinion es importante. Del 1 al 10, como fue nuestra atencion?"
          }
        ],
        edges: [
          { id: "e_menu_make_order", from: "menu", to: "mode", label: "hacer pedido", routeKey: "menu_make_order", disabled: false },
          { id: "e_return_continue", from: "returning", to: "order_type", label: "continuar", routeKey: "return_continue", disabled: false },
          { id: "e_return_new", from: "returning", to: "menu", label: "nuevo pedido", routeKey: "return_new", disabled: false },
          { id: "e_mode_delivery", from: "mode", to: "zone", label: "envio", routeKey: "mode_delivery", disabled: false },
          { id: "e_mode_pickup", from: "mode", to: "pickup_branch", label: "retiro", routeKey: "mode_pickup", disabled: false },
          { id: "e_zone_saved", from: "zone", to: "address_decision", label: "hay direccion", routeKey: "zone_saved_address", disabled: false },
          { id: "e_zone_new", from: "zone", to: "address_input", label: "sin direccion", routeKey: "zone_need_address", disabled: false },
          { id: "e_addr_same", from: "address_decision", to: "order_type", label: "misma", routeKey: "address_use_saved", disabled: false },
          { id: "e_addr_other", from: "address_decision", to: "address_input", label: "otra", routeKey: "address_other", disabled: false },
          { id: "e_addr_done", from: "address_input", to: "order_type", label: "direccion ok", routeKey: "address_done", disabled: false },
          { id: "e_pickup_done", from: "pickup_branch", to: "order_type", label: "sucursal ok", routeKey: "pickup_done", disabled: false },
          { id: "e_type_os", from: "order_type", to: "receta_upload", label: "obra social", routeKey: "order_type_os", disabled: false },
          { id: "e_type_particular", from: "order_type", to: "item_input", label: "particular", routeKey: "order_type_particular", disabled: false },
          { id: "e_receta_done", from: "receta_upload", to: "credential_upload", label: "no tengo mas", routeKey: "receta_done", disabled: false },
          { id: "e_credential_done", from: "credential_upload", to: "item_decision", label: "credencial ok", routeKey: "credential_done", disabled: false },
          { id: "e_item_input_done", from: "item_input", to: "item_decision", label: "item cargado", routeKey: "item_input_done", disabled: false },
          { id: "e_item_add", from: "item_decision", to: "item_input", label: "agregar", routeKey: "item_decision_add", disabled: false },
          { id: "e_item_done", from: "item_decision", to: "agent_continue", label: "pedido completo", routeKey: "item_decision_done", disabled: false },
          { id: "e_agent_continue_yes", from: "agent_continue", to: "agent_add_more", label: "si", routeKey: "agent_continue_yes", disabled: false },
          { id: "e_agent_continue_no", from: "agent_continue", to: "menu", label: "no", routeKey: "agent_continue_no", disabled: false },
          { id: "e_agent_more_yes", from: "agent_add_more", to: "item_input", label: "si", routeKey: "agent_add_more_yes", disabled: false },
          { id: "e_agent_more_no", from: "agent_add_more", to: "payment_proof", label: "no", routeKey: "agent_add_more_no", disabled: false },
          { id: "e_payment_done", from: "payment_proof", to: "survey", label: "comprobante ok", routeKey: "payment_done", disabled: false },
          { id: "e_survey_done", from: "survey", to: "menu", label: "fin", routeKey: "survey_done", disabled: false }
        ]
      },
      {
        id: "wf_global",
        name: "Comandos globales",
        description: "Comandos transversales y estrategias de fallback.",
        canvas: { width: 1580, height: 520 },
        nodes: [
          {
            id: "global_any",
            title: "Any step",
            subtitle: "mensaje usuario",
            explain: "Representa cualquier estado del flujo.",
            kind: "trigger",
            x: 60,
            y: 140,
            w: 220,
            h: 98,
            botMessage: ""
          },
          {
            id: "global_cancel",
            title: "CANCELAR",
            subtitle: "reset + menu",
            explain: "Cancela el pedido actual y vuelve al menú principal.",
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
            subtitle: "volver opciones",
            explain: "Retorna al menú de opciones.",
            kind: "guard",
            x: 360,
            y: 240,
            w: 220,
            h: 98,
            botMessage: "Selecciona una opcion:"
          },
          {
            id: "global_human",
            title: "ASESOR",
            subtitle: "state agent",
            explain: "Deriva conversación al equipo humano.",
            kind: "guard",
            x: 660,
            y: 40,
            w: 220,
            h: 98,
            botMessage: "Te derivo con un asesor."
          },
          {
            id: "global_f1",
            title: "Fallback 1",
            subtitle: "correccion simple",
            explain: "Primer mensaje cuando el input no es válido.",
            kind: "process",
            x: 660,
            y: 240,
            w: 220,
            h: 98,
            botMessage: "No te entendi bien."
          },
          {
            id: "global_f2",
            title: "Fallback 2",
            subtitle: "ayuda + boton",
            explain: "Segundo fallback con ayuda más concreta.",
            kind: "process",
            x: 960,
            y: 240,
            w: 220,
            h: 98,
            botMessage: "Te muestro opciones para seguir."
          },
          {
            id: "global_f3",
            title: "Escala asesor",
            subtitle: "3er fallback",
            explain: "Si insiste la invalidación, escala automáticamente.",
            kind: "handoff",
            x: 1260,
            y: 240,
            w: 220,
            h: 98,
            botMessage: "Te paso con asesor humano para evitar demoras."
          }
        ],
        edges: [
          { id: "g1", from: "global_any", to: "global_cancel", label: "cancelar", routeKey: "", disabled: false },
          { id: "g2", from: "global_any", to: "global_menu", label: "menu", routeKey: "", disabled: false },
          { id: "g3", from: "global_any", to: "global_human", label: "asesor", routeKey: "", disabled: false },
          { id: "g4", from: "global_any", to: "global_f1", label: "invalido", routeKey: "", disabled: false },
          { id: "g5", from: "global_f1", to: "global_f2", label: "repite", routeKey: "", disabled: false },
          { id: "g6", from: "global_f2", to: "global_f3", label: "3er error", routeKey: "", disabled: false }
        ]
      }
    ]
  };
}

module.exports = {
  getFlowCatalog
};
