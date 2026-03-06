const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 20000;

const STATE_IDLE = "idle";
const STATE_STOCK = "stock";
const STATE_RECETA = "receta";
const STATE_TURNOS = "turnos";
const STATE_AGENT = "agent";

const STEP_STOCK_MEDICATION = "stock_medication";
const STEP_STOCK_PRESENTATION = "stock_presentation";
const STEP_STOCK_QUANTITY = "stock_quantity";
const STEP_STOCK_MODE = "stock_mode";
const STEP_STOCK_BRANCH = "stock_branch";
const STEP_STOCK_ZONE = "stock_zone";
const STEP_STOCK_SCHEDULE = "stock_schedule";
const STEP_STOCK_CONFIRM = "stock_confirm";

const STEP_RECETA_FILE = "receta_file";
const STEP_RECETA_NAME = "receta_name";
const STEP_RECETA_DNI = "receta_dni";
const STEP_RECETA_COVERAGE = "receta_coverage";
const STEP_RECETA_MODE = "receta_mode";
const STEP_RECETA_BRANCH = "receta_branch";
const STEP_RECETA_ADDRESS = "receta_address";
const STEP_RECETA_SCHEDULE = "receta_schedule";
const STEP_RECETA_CONTACT = "receta_contact";
const STEP_RECETA_CONTACT_OTHER = "receta_contact_other";
const STEP_RECETA_CONFIRM = "receta_confirm";

const STEP_TURNO_SERVICE = "turno_service";
const STEP_TURNO_BRANCH = "turno_branch";
const STEP_TURNO_DATE = "turno_date";
const STEP_TURNO_DATE_CUSTOM = "turno_date_custom";
const STEP_TURNO_SLOT = "turno_slot";
const STEP_TURNO_NAME = "turno_name";
const STEP_TURNO_DETAIL = "turno_detail";
const STEP_TURNO_CONTACT = "turno_contact";
const STEP_TURNO_CONTACT_OTHER = "turno_contact_other";
const STEP_TURNO_CONFIRM = "turno_confirm";

const sessions = new Map();
const optedOutContacts = new Set();

async function nextBotReply({ contactId, inboundText, inboundMessage }) {
  if (!contactId) {
    throw new Error("contactId is required");
  }

  cleanupExpiredSessions();
  const session = getSession(contactId);
  const input = buildInboundContext(inboundText, inboundMessage);

  touchSession(contactId, session);

  if (isOptOutCommand(input.normalized)) {
    optedOutContacts.add(contactId);
    resetSessionState(session);
    return {
      actions: [
        {
          type: "text",
          text: "Tu chat quedo pausado. No te enviaremos mensajes fuera de tus consultas. Para reactivarlo escribi *ALTA*."
        }
      ]
    };
  }

  if (isOptInCommand(input.normalized)) {
    optedOutContacts.delete(contactId);
    resetSessionState(session);
    return { actions: getWelcomeActions(session, true) };
  }

  if (optedOutContacts.has(contactId)) {
    return {
      actions: [
        {
          type: "text",
          text: "Tu chat esta en pausa por solicitud de baja. Escribi *ALTA* para reactivarlo."
        }
      ]
    };
  }

  if (looksLikeEmergency(input.normalized)) {
    session.state = STATE_AGENT;
    session.step = null;
    session.fallbackCount = 0;
    return {
      actions: [
        {
          type: "text",
          text: "Si es una urgencia medica, llama al servicio de emergencias de tu zona ahora mismo. No reemplazamos atencion de emergencia por chat."
        },
        {
          type: "text",
          text: "Si queres, te derivo con un farmacéutico para seguimiento cuando sea seguro hacerlo."
        }
      ]
    };
  }

  if (isCancelCommand(input.normalized)) {
    resetSessionState(session);
    return {
      actions: [
        { type: "text", text: "Listo, reinicie la conversacion actual." },
        ...getWelcomeActions(session)
      ]
    };
  }

  if (isHumanCommand(input.normalized)) {
    session.state = STATE_AGENT;
    session.step = null;
    session.fallbackCount = 0;
    return {
      actions: [
        {
          type: "text",
          text: "Te paso con un asesor humano. Ya dejamos el contexto de esta conversacion para que no tengas que repetir todo."
        }
      ]
    };
  }

  if (isMenuCommand(input.normalized)) {
    resetSessionState(session);
    return { actions: getWelcomeActions(session) };
  }

  const explicitIntent = detectIntent(input);
  if (explicitIntent && shouldSwitchIntent(session.state, explicitIntent)) {
    return startIntentFlow(session, explicitIntent, true);
  }

  switch (session.state) {
    case STATE_IDLE:
      return handleIdleState(session, input);
    case STATE_STOCK:
      return handleStockState(session, input);
    case STATE_RECETA:
      return handleRecetaState(session, input, contactId);
    case STATE_TURNOS:
      return handleTurnosState(session, input, contactId);
    case STATE_AGENT:
      return handleAgentState(session, input);
    default:
      resetSessionState(session);
      return { actions: getWelcomeActions(session) };
  }
}

function handleIdleState(session, input) {
  const intent = detectIntent(input);
  if (intent) {
    return startIntentFlow(session, intent, false);
  }

  if (asksForBranches(input.normalized)) {
    session.fallbackCount = 0;
    return {
      actions: [
        {
          type: "text",
          text: "Sucursales y horarios:\n- Centro: Av. Siempreviva 123 (8 a 22)\n- Norte: Belgrano 456 (24 hs)\n- Sur: San Martin 789 (9 a 20)\n\nSi queres, te muestro nuevamente el menu."
        },
        getWelcomeMenu()
      ]
    };
  }

  if (isGreeting(input.normalized)) {
    session.fallbackCount = 0;
    return { actions: getWelcomeActions(session) };
  }

  return buildStepFallback(session, {
    level1: "Puedo ayudarte con *Consultar Stock*, *Enviar Receta* y *Sacar un Turno*.",
    level2Text: "Te guio con opciones concretas. Elegi una de estas tres y avanzamos:",
    level2Interactive: getWelcomeMenu()
  });
}

function handleStockState(session, input) {
  switch (session.step) {
    case STEP_STOCK_MEDICATION:
      if (!input.hasMedia && !hasUsableText(input.text)) {
        return buildStepFallback(session, {
          level1: "Necesito el nombre del medicamento para continuar.",
          level2Text: "Ejemplo valido: *Ibuprofeno 400 mg*. Tambien podes mandar foto de la caja."
        });
      }

      session.data.medicamento = input.hasMedia
        ? "Foto de caja adjunta"
        : sanitizeField(input.text, 80);
      moveToStep(session, STEP_STOCK_PRESENTATION);
      return {
        actions: [
          {
            type: "text",
            text: "Perfecto. Ahora indicame presentacion o dosis (ej: 400 mg x 20). Si no la sabes, escribi *NO SE*."
          }
        ]
      };

    case STEP_STOCK_PRESENTATION:
      if (!hasUsableText(input.text)) {
        return buildStepFallback(session, {
          level1: "Necesito presentacion o dosis para evitar confusiones.",
          level2Text: "Ejemplo: *500 mg x 30*. Si no la tenes, escribi *NO SE*."
        });
      }

      session.data.presentacion = input.normalized === "no se" ? "No especificada" : sanitizeField(input.text, 80);
      moveToStep(session, STEP_STOCK_QUANTITY);
      return {
        actions: [
          {
            type: "text",
            text: "¿Cuantas unidades necesitas? Escribi solo un numero (ej: 1, 2, 3)."
          }
        ]
      };

    case STEP_STOCK_QUANTITY: {
      const quantity = parseQuantity(input.normalized);
      if (!quantity) {
        return buildStepFallback(session, {
          level1: "Necesito una cantidad numerica (entre 1 y 99).",
          level2Text: "Escribi solo un numero. Ejemplo: *2*."
        });
      }

      session.data.cantidad = quantity;
      moveToStep(session, STEP_STOCK_MODE);
      return {
        actions: [
          buildInteractive(
            "¿Como queres continuar con esta consulta?",
            [
              { id: "stock_mode_pickup", title: "Retiro sucursal" },
              { id: "stock_mode_delivery", title: "Envio domicilio" },
              { id: "stock_mode_price", title: "Solo precio" }
            ]
          )
        ]
      };
    }

    case STEP_STOCK_MODE: {
      const mode = parseStockMode(input);
      if (!mode) {
        return buildStepFallback(session, {
          level1: "Necesito que elijas una modalidad: retiro, envio o solo precio.",
          level2Text: "Elegi una opcion con los botones para seguir.",
          level2Interactive: buildInteractive(
            "Selecciona modalidad:",
            [
              { id: "stock_mode_pickup", title: "Retiro sucursal" },
              { id: "stock_mode_delivery", title: "Envio domicilio" },
              { id: "stock_mode_price", title: "Solo precio" }
            ]
          )
        });
      }

      session.data.modalidad = mode;
      if (mode === "Retiro en sucursal") {
        moveToStep(session, STEP_STOCK_BRANCH);
        return {
          actions: [
            buildInteractive("Elegi sucursal para retiro:", [
              { id: "stock_branch_centro", title: "Centro" },
              { id: "stock_branch_norte", title: "Norte 24hs" },
              { id: "stock_branch_sur", title: "Sur" }
            ])
          ]
        };
      }

      if (mode === "Envio a domicilio") {
        moveToStep(session, STEP_STOCK_ZONE);
        return {
          actions: [
            {
              type: "text",
              text: "Indica barrio o localidad para validar cobertura de envio."
            }
          ]
        };
      }

      moveToStep(session, STEP_STOCK_SCHEDULE);
      return {
        actions: [
          {
            type: "text",
            text: "¿En que franja horaria te conviene recibir la confirmacion? (ej: hoy por la tarde)"
          }
        ]
      };
    }

    case STEP_STOCK_BRANCH: {
      const branch = parseBranch(input, "stock");
      if (!branch) {
        return buildStepFallback(session, {
          level1: "Necesito que elijas la sucursal de retiro.",
          level2Text: "Elegi *Centro*, *Norte 24hs* o *Sur*.",
          level2Interactive: buildInteractive("Selecciona sucursal:", [
            { id: "stock_branch_centro", title: "Centro" },
            { id: "stock_branch_norte", title: "Norte 24hs" },
            { id: "stock_branch_sur", title: "Sur" }
          ])
        });
      }

      session.data.sucursal = branch;
      moveToStep(session, STEP_STOCK_SCHEDULE);
      return {
        actions: [
          {
            type: "text",
            text: "¿Que horario te sirve para pasar por la sucursal?"
          }
        ]
      };
    }

    case STEP_STOCK_ZONE:
      if (!hasUsableText(input.text) || input.text.trim().length < 3) {
        return buildStepFallback(session, {
          level1: "Necesito barrio o localidad para validar envio.",
          level2Text: "Ejemplo: *Palermo* o *San Isidro*."
        });
      }

      session.data.zona = sanitizeField(input.text, 80);
      moveToStep(session, STEP_STOCK_SCHEDULE);
      return {
        actions: [
          {
            type: "text",
            text: "¿En que horario te conviene recibir la confirmacion?"
          }
        ]
      };

    case STEP_STOCK_SCHEDULE:
      if (!hasUsableText(input.text) || input.text.trim().length < 3) {
        return buildStepFallback(session, {
          level1: "Necesito una referencia horaria para coordinar.",
          level2Text: "Ejemplo: *hoy 18 a 20* o *mañana por la mañana*."
        });
      }

      session.data.horario = sanitizeField(input.text, 80);
      moveToStep(session, STEP_STOCK_CONFIRM);
      return {
        actions: [
          {
            type: "text",
            text: `${buildStockSummary(session.data)}\n\n¿Confirmas para registrarlo?`
          },
          buildInteractive("Confirma la gestion:", [
            { id: "stock_confirm_yes", title: "Confirmar" },
            { id: "stock_confirm_restart", title: "Reiniciar" },
            { id: "stock_confirm_agent", title: "Hablar asesor" }
          ])
        ]
      };

    case STEP_STOCK_CONFIRM: {
      const decision = parseConfirmAction(input, "stock");
      if (!decision) {
        return buildStepFallback(session, {
          level1: "Responde *Confirmar*, *Reiniciar* o *Hablar asesor*.",
          level2Text: "Usa los botones para cerrar esta gestion.",
          level2Interactive: buildInteractive("Elegi una opcion:", [
            { id: "stock_confirm_yes", title: "Confirmar" },
            { id: "stock_confirm_restart", title: "Reiniciar" },
            { id: "stock_confirm_agent", title: "Hablar asesor" }
          ])
        });
      }

      if (decision === "restart") {
        return startStockFlow(session, true);
      }

      if (decision === "agent") {
        session.state = STATE_AGENT;
        session.step = null;
        session.fallbackCount = 0;
        return {
          actions: [
            {
              type: "text",
              text: `Te derivo con un asesor para cerrar la consulta de stock.\n${buildStockSummary(session.data)}`
            }
          ]
        };
      }

      const ticket = buildTicket("STK");
      resetSessionState(session);
      return {
        actions: [
          {
            type: "text",
            text: `Solicitud de stock registrada: *${ticket}*.\nUn asesor te responde por este chat con disponibilidad/precio final y alternativas si no hubiera stock.`
          },
          getWelcomeMenu()
        ]
      };
    }

    default:
      return startStockFlow(session, true);
  }
}

function handleRecetaState(session, input, contactId) {
  switch (session.step) {
    case STEP_RECETA_FILE:
      if (!input.hasMedia) {
        return buildStepFallback(session, {
          level1: "Para validar receta necesito una foto o PDF legible.",
          level2Text: "Envia la receta completa (diagnostico, firma y sello visibles)."
        });
      }

      session.data.tipoArchivo = input.messageType === "document" ? "PDF/Documento" : "Imagen";
      moveToStep(session, STEP_RECETA_NAME);
      return {
        actions: [
          {
            type: "text",
            text: "Receta recibida. Ahora decime nombre y apellido del paciente."
          }
        ]
      };

    case STEP_RECETA_NAME:
      if (!isValidPersonName(input.text)) {
        return buildStepFallback(session, {
          level1: "Necesito nombre y apellido para identificar la receta.",
          level2Text: "Ejemplo: *Juan Perez*."
        });
      }

      session.data.paciente = sanitizeField(input.text, 80);
      moveToStep(session, STEP_RECETA_DNI);
      return {
        actions: [
          {
            type: "text",
            text: "Indica DNI del paciente (solo numeros)."
          }
        ]
      };

    case STEP_RECETA_DNI: {
      const dni = parseDni(input.normalized);
      if (!dni) {
        return buildStepFallback(session, {
          level1: "El DNI debe tener entre 7 y 8 digitos.",
          level2Text: "Ejemplo valido: *30123456*."
        });
      }

      session.data.dni = dni;
      moveToStep(session, STEP_RECETA_COVERAGE);
      return {
        actions: [
          {
            type: "text",
            text: "¿Tenes obra social/cobertura? Si no, escribi *Particular*."
          }
        ]
      };
    }

    case STEP_RECETA_COVERAGE:
      if (!hasUsableText(input.text)) {
        return buildStepFallback(session, {
          level1: "Necesito saber cobertura para preparar correctamente la validacion.",
          level2Text: "Escribi obra social o *Particular*."
        });
      }

      session.data.cobertura = sanitizeField(input.text, 80);
      moveToStep(session, STEP_RECETA_MODE);
      return {
        actions: [
          buildInteractive("¿Como queres recibir el pedido?", [
            { id: "receta_mode_pickup", title: "Retiro sucursal" },
            { id: "receta_mode_delivery", title: "Envio domicilio" },
            { id: "receta_mode_quote", title: "Solo validacion" }
          ])
        ]
      };

    case STEP_RECETA_MODE: {
      const mode = parseRecetaMode(input);
      if (!mode) {
        return buildStepFallback(session, {
          level1: "Elegi modalidad: retiro, envio o solo validacion.",
          level2Text: "Usa los botones para seguir.",
          level2Interactive: buildInteractive("Selecciona modalidad:", [
            { id: "receta_mode_pickup", title: "Retiro sucursal" },
            { id: "receta_mode_delivery", title: "Envio domicilio" },
            { id: "receta_mode_quote", title: "Solo validacion" }
          ])
        });
      }

      session.data.modalidad = mode;
      if (mode === "Retiro en sucursal") {
        moveToStep(session, STEP_RECETA_BRANCH);
        return {
          actions: [
            buildInteractive("Elegi sucursal para retiro:", [
              { id: "receta_branch_centro", title: "Centro" },
              { id: "receta_branch_norte", title: "Norte 24hs" },
              { id: "receta_branch_sur", title: "Sur" }
            ])
          ]
        };
      }

      if (mode === "Envio a domicilio") {
        moveToStep(session, STEP_RECETA_ADDRESS);
        return {
          actions: [
            {
              type: "text",
              text: "Indica direccion completa para el envio (calle, numero, piso/depto, localidad)."
            }
          ]
        };
      }

      moveToStep(session, STEP_RECETA_SCHEDULE);
      return {
        actions: [
          {
            type: "text",
            text: "¿En que horario te conviene que te contactemos con el resultado de validacion?"
          }
        ]
      };
    }

    case STEP_RECETA_BRANCH: {
      const branch = parseBranch(input, "receta");
      if (!branch) {
        return buildStepFallback(session, {
          level1: "Necesito que selecciones una sucursal.",
          level2Text: "Elegi *Centro*, *Norte 24hs* o *Sur*.",
          level2Interactive: buildInteractive("Selecciona sucursal:", [
            { id: "receta_branch_centro", title: "Centro" },
            { id: "receta_branch_norte", title: "Norte 24hs" },
            { id: "receta_branch_sur", title: "Sur" }
          ])
        });
      }

      session.data.sucursal = branch;
      moveToStep(session, STEP_RECETA_SCHEDULE);
      return {
        actions: [
          {
            type: "text",
            text: "¿En que horario pensas retirar?"
          }
        ]
      };
    }

    case STEP_RECETA_ADDRESS:
      if (!hasUsableText(input.text) || input.text.trim().length < 8) {
        return buildStepFallback(session, {
          level1: "Necesito una direccion completa para envio.",
          level2Text: "Inclui calle, numero y localidad para evitar rechazos."
        });
      }

      session.data.direccion = sanitizeField(input.text, 120);
      moveToStep(session, STEP_RECETA_SCHEDULE);
      return {
        actions: [
          {
            type: "text",
            text: "¿En que horario te conviene recibir el envio o la confirmacion?"
          }
        ]
      };

    case STEP_RECETA_SCHEDULE:
      if (!hasUsableText(input.text) || input.text.trim().length < 3) {
        return buildStepFallback(session, {
          level1: "Necesito una referencia horaria para coordinar.",
          level2Text: "Ejemplo: *hoy de 18 a 20* o *mañana por la mañana*."
        });
      }

      session.data.horario = sanitizeField(input.text, 80);
      moveToStep(session, STEP_RECETA_CONTACT);
      return {
        actions: [
          buildInteractive("¿Con que numero te contactamos?", [
            { id: "receta_contact_whatsapp", title: "Usar este numero" },
            { id: "receta_contact_other", title: "Otro numero" },
            { id: "receta_contact_agent", title: "Hablar asesor" }
          ])
        ]
      };

    case STEP_RECETA_CONTACT: {
      const contactAction = parseRecetaContactChoice(input);
      if (!contactAction) {
        return buildStepFallback(session, {
          level1: "Elegi un numero de contacto para seguir.",
          level2Text: "Podes usar este WhatsApp o informar otro numero.",
          level2Interactive: buildInteractive("Selecciona contacto:", [
            { id: "receta_contact_whatsapp", title: "Usar este numero" },
            { id: "receta_contact_other", title: "Otro numero" },
            { id: "receta_contact_agent", title: "Hablar asesor" }
          ])
        });
      }

      if (contactAction === "agent") {
        session.state = STATE_AGENT;
        session.step = null;
        session.fallbackCount = 0;
        return {
          actions: [
            {
              type: "text",
              text: `Te derivo con un asesor para continuar la validacion de receta.\n${buildRecetaSummary(session.data)}`
            }
          ]
        };
      }

      if (contactAction === "other") {
        moveToStep(session, STEP_RECETA_CONTACT_OTHER);
        return {
          actions: [
            {
              type: "text",
              text: "Escribi el numero de contacto alternativo (solo digitos, con codigo de area)."
            }
          ]
        };
      }

      session.data.contacto = formatContactPhone(contactId);
      moveToStep(session, STEP_RECETA_CONFIRM);
      return {
        actions: [
          { type: "text", text: `${buildRecetaSummary(session.data)}\n\n¿Confirmas para registrarla?` },
          buildInteractive("Confirma la gestion:", [
            { id: "receta_confirm_yes", title: "Confirmar" },
            { id: "receta_confirm_restart", title: "Reiniciar" },
            { id: "receta_confirm_agent", title: "Hablar asesor" }
          ])
        ]
      };
    }

    case STEP_RECETA_CONTACT_OTHER: {
      const phone = parsePhone(input.normalized);
      if (!phone) {
        return buildStepFallback(session, {
          level1: "El numero debe tener entre 8 y 15 digitos.",
          level2Text: "Ejemplo valido: *5491123456789*."
        });
      }

      session.data.contacto = phone;
      moveToStep(session, STEP_RECETA_CONFIRM);
      return {
        actions: [
          { type: "text", text: `${buildRecetaSummary(session.data)}\n\n¿Confirmas para registrarla?` },
          buildInteractive("Confirma la gestion:", [
            { id: "receta_confirm_yes", title: "Confirmar" },
            { id: "receta_confirm_restart", title: "Reiniciar" },
            { id: "receta_confirm_agent", title: "Hablar asesor" }
          ])
        ]
      };
    }

    case STEP_RECETA_CONFIRM: {
      const decision = parseConfirmAction(input, "receta");
      if (!decision) {
        return buildStepFallback(session, {
          level1: "Responde *Confirmar*, *Reiniciar* o *Hablar asesor*.",
          level2Text: "Usa los botones para cerrar esta gestion.",
          level2Interactive: buildInteractive("Elegi una opcion:", [
            { id: "receta_confirm_yes", title: "Confirmar" },
            { id: "receta_confirm_restart", title: "Reiniciar" },
            { id: "receta_confirm_agent", title: "Hablar asesor" }
          ])
        });
      }

      if (decision === "restart") {
        return startRecetaFlow(session, true);
      }

      if (decision === "agent") {
        session.state = STATE_AGENT;
        session.step = null;
        session.fallbackCount = 0;
        return {
          actions: [
            {
              type: "text",
              text: `Te derivo con un asesor para la receta.\n${buildRecetaSummary(session.data)}`
            }
          ]
        };
      }

      const ticket = buildTicket("RCT");
      resetSessionState(session);
      return {
        actions: [
          {
            type: "text",
            text: `Solicitud de receta registrada: *${ticket}*.\nValidaremos datos y te confirmaremos disponibilidad/importe por este chat. No te automediques y espera confirmacion profesional.`
          },
          getWelcomeMenu()
        ]
      };
    }

    default:
      return startRecetaFlow(session, true);
  }
}

function handleTurnosState(session, input, contactId) {
  switch (session.step) {
    case STEP_TURNO_SERVICE: {
      const service = parseTurnoService(input);
      if (!service) {
        return buildStepFallback(session, {
          level1: "Necesito que elijas un servicio de turno.",
          level2Text: "Elegi *Vacunacion*, *Toma presion* o *Asesoramiento*.",
          level2Interactive: buildInteractive("Selecciona servicio:", [
            { id: "turno_service_vacuna", title: "Vacunacion" },
            { id: "turno_service_presion", title: "Toma presion" },
            { id: "turno_service_asesoria", title: "Asesoramiento" }
          ])
        });
      }

      session.data.servicio = service;
      moveToStep(session, STEP_TURNO_BRANCH);
      return {
        actions: [
          buildInteractive("Elegi sucursal para el turno:", [
            { id: "turno_branch_centro", title: "Centro" },
            { id: "turno_branch_norte", title: "Norte 24hs" },
            { id: "turno_branch_sur", title: "Sur" }
          ])
        ]
      };
    }

    case STEP_TURNO_BRANCH: {
      const branch = parseBranch(input, "turno");
      if (!branch) {
        return buildStepFallback(session, {
          level1: "Necesito una sucursal para reservar.",
          level2Text: "Elegi *Centro*, *Norte 24hs* o *Sur*.",
          level2Interactive: buildInteractive("Selecciona sucursal:", [
            { id: "turno_branch_centro", title: "Centro" },
            { id: "turno_branch_norte", title: "Norte 24hs" },
            { id: "turno_branch_sur", title: "Sur" }
          ])
        });
      }

      session.data.sucursal = branch;
      moveToStep(session, STEP_TURNO_DATE);
      return {
        actions: [
          buildInteractive("¿Para que dia queres el turno?", [
            { id: "turno_date_hoy", title: "Hoy" },
            { id: "turno_date_manana", title: "Manana" },
            { id: "turno_date_otra", title: "Otra fecha" }
          ])
        ]
      };
    }

    case STEP_TURNO_DATE: {
      const dateChoice = parseTurnoDateChoice(input);
      if (!dateChoice) {
        return buildStepFallback(session, {
          level1: "Necesito dia del turno para seguir.",
          level2Text: "Elegi *Hoy*, *Manana* u *Otra fecha*.",
          level2Interactive: buildInteractive("Selecciona fecha:", [
            { id: "turno_date_hoy", title: "Hoy" },
            { id: "turno_date_manana", title: "Manana" },
            { id: "turno_date_otra", title: "Otra fecha" }
          ])
        });
      }

      if (dateChoice === "other") {
        moveToStep(session, STEP_TURNO_DATE_CUSTOM);
        return {
          actions: [
            {
              type: "text",
              text: "Indica la fecha con formato DD/MM o DD/MM/AAAA."
            }
          ]
        };
      }

      session.data.fecha = dateChoice === "today" ? "Hoy" : "Mañana";
      moveToStep(session, STEP_TURNO_SLOT);
      return {
        actions: [
          buildInteractive("¿En que franja horaria preferis?", [
            { id: "turno_slot_manana", title: "Manana" },
            { id: "turno_slot_tarde", title: "Tarde" },
            { id: "turno_slot_noche", title: "Noche" }
          ])
        ]
      };
    }

    case STEP_TURNO_DATE_CUSTOM: {
      const customDate = normalizeDateInput(input.text);
      if (!customDate) {
        return buildStepFallback(session, {
          level1: "No pude validar la fecha.",
          level2Text: "Usa formato *DD/MM* o *DD/MM/AAAA*. Ejemplo: 21/03."
        });
      }

      session.data.fecha = customDate;
      moveToStep(session, STEP_TURNO_SLOT);
      return {
        actions: [
          buildInteractive("¿En que franja horaria preferis?", [
            { id: "turno_slot_manana", title: "Manana" },
            { id: "turno_slot_tarde", title: "Tarde" },
            { id: "turno_slot_noche", title: "Noche" }
          ])
        ]
      };
    }

    case STEP_TURNO_SLOT: {
      const slot = parseTurnoSlot(input);
      if (!slot) {
        return buildStepFallback(session, {
          level1: "Necesito la franja horaria para reservar.",
          level2Text: "Elegi *Manana*, *Tarde* o *Noche*.",
          level2Interactive: buildInteractive("Selecciona franja horaria:", [
            { id: "turno_slot_manana", title: "Manana" },
            { id: "turno_slot_tarde", title: "Tarde" },
            { id: "turno_slot_noche", title: "Noche" }
          ])
        });
      }

      session.data.franja = slot;
      moveToStep(session, STEP_TURNO_NAME);
      return {
        actions: [
          {
            type: "text",
            text: "Decime nombre y apellido de la persona que asistira al turno."
          }
        ]
      };
    }

    case STEP_TURNO_NAME:
      if (!isValidPersonName(input.text)) {
        return buildStepFallback(session, {
          level1: "Necesito nombre y apellido para la reserva.",
          level2Text: "Ejemplo: *Maria Gomez*."
        });
      }

      session.data.paciente = sanitizeField(input.text, 80);
      moveToStep(session, STEP_TURNO_DETAIL);
      return {
        actions: [
          {
            type: "text",
            text: getTurnoDetailPrompt(session.data.servicio)
          }
        ]
      };

    case STEP_TURNO_DETAIL:
      if (!hasUsableText(input.text) || input.text.trim().length < 3) {
        return buildStepFallback(session, {
          level1: "Necesito un breve detalle para preparar el turno.",
          level2Text: "Contalo en una frase corta para avanzar."
        });
      }

      session.data.detalle = sanitizeField(input.text, 140);
      moveToStep(session, STEP_TURNO_CONTACT);
      return {
        actions: [
          buildInteractive("¿Con que numero te confirmamos el turno?", [
            { id: "turno_contact_whatsapp", title: "Usar este numero" },
            { id: "turno_contact_other", title: "Otro numero" },
            { id: "turno_contact_agent", title: "Hablar asesor" }
          ])
        ]
      };

    case STEP_TURNO_CONTACT: {
      const choice = parseTurnoContactChoice(input);
      if (!choice) {
        return buildStepFallback(session, {
          level1: "Necesito un numero de contacto para confirmar el turno.",
          level2Text: "Podes usar este WhatsApp o informar otro numero.",
          level2Interactive: buildInteractive("Selecciona contacto:", [
            { id: "turno_contact_whatsapp", title: "Usar este numero" },
            { id: "turno_contact_other", title: "Otro numero" },
            { id: "turno_contact_agent", title: "Hablar asesor" }
          ])
        });
      }

      if (choice === "agent") {
        session.state = STATE_AGENT;
        session.step = null;
        session.fallbackCount = 0;
        return {
          actions: [
            {
              type: "text",
              text: `Te derivo con un asesor para cerrar el turno.\n${buildTurnoSummary(session.data)}`
            }
          ]
        };
      }

      if (choice === "other") {
        moveToStep(session, STEP_TURNO_CONTACT_OTHER);
        return {
          actions: [
            {
              type: "text",
              text: "Escribi numero alternativo (solo digitos, con codigo de area)."
            }
          ]
        };
      }

      session.data.contacto = formatContactPhone(contactId);
      moveToStep(session, STEP_TURNO_CONFIRM);
      return {
        actions: [
          { type: "text", text: `${buildTurnoSummary(session.data)}\n\n¿Confirmas para reservar?` },
          buildInteractive("Confirma la reserva:", [
            { id: "turno_confirm_yes", title: "Confirmar" },
            { id: "turno_confirm_restart", title: "Reiniciar" },
            { id: "turno_confirm_agent", title: "Hablar asesor" }
          ])
        ]
      };
    }

    case STEP_TURNO_CONTACT_OTHER: {
      const phone = parsePhone(input.normalized);
      if (!phone) {
        return buildStepFallback(session, {
          level1: "El numero debe tener entre 8 y 15 digitos.",
          level2Text: "Ejemplo valido: *5491123456789*."
        });
      }

      session.data.contacto = phone;
      moveToStep(session, STEP_TURNO_CONFIRM);
      return {
        actions: [
          { type: "text", text: `${buildTurnoSummary(session.data)}\n\n¿Confirmas para reservar?` },
          buildInteractive("Confirma la reserva:", [
            { id: "turno_confirm_yes", title: "Confirmar" },
            { id: "turno_confirm_restart", title: "Reiniciar" },
            { id: "turno_confirm_agent", title: "Hablar asesor" }
          ])
        ]
      };
    }

    case STEP_TURNO_CONFIRM: {
      const decision = parseConfirmAction(input, "turno");
      if (!decision) {
        return buildStepFallback(session, {
          level1: "Responde *Confirmar*, *Reiniciar* o *Hablar asesor*.",
          level2Text: "Usa los botones para cerrar la reserva.",
          level2Interactive: buildInteractive("Elegi una opcion:", [
            { id: "turno_confirm_yes", title: "Confirmar" },
            { id: "turno_confirm_restart", title: "Reiniciar" },
            { id: "turno_confirm_agent", title: "Hablar asesor" }
          ])
        });
      }

      if (decision === "restart") {
        return startTurnosFlow(session, true);
      }

      if (decision === "agent") {
        session.state = STATE_AGENT;
        session.step = null;
        session.fallbackCount = 0;
        return {
          actions: [
            {
              type: "text",
              text: `Te derivo con un asesor para confirmar disponibilidad final del turno.\n${buildTurnoSummary(session.data)}`
            }
          ]
        };
      }

      const ticket = buildTicket("TRN");
      resetSessionState(session);
      return {
        actions: [
          {
            type: "text",
            text: `Turno pre-reservado: *${ticket}*.\nUn operador confirmara disponibilidad exacta por este chat. Recorda llevar DNI y, si aplica, orden medica/receta.`
          },
          getWelcomeMenu()
        ]
      };
    }

    default:
      return startTurnosFlow(session, true);
  }
}

function handleAgentState(session, input) {
  if (isMenuCommand(input.normalized)) {
    resetSessionState(session);
    return { actions: getWelcomeActions(session) };
  }

  return {
    actions: [
      {
        type: "text",
        text: "Tu caso sigue derivado a un asesor humano. Si queres volver al menu automatico, escribi *MENU*."
      }
    ]
  };
}

function startIntentFlow(session, intent, switched) {
  if (intent === "stock") {
    return startStockFlow(session, switched);
  }
  if (intent === "receta") {
    return startRecetaFlow(session, switched);
  }
  return startTurnosFlow(session, switched);
}

function startStockFlow(session, switched) {
  session.state = STATE_STOCK;
  session.data = {};
  moveToStep(session, STEP_STOCK_MEDICATION);

  const intro = switched
    ? "Perfecto, cambiamos al flujo de *Consultar Stock*."
    : "Perfecto, vamos con *Consultar Stock*.";

  return {
    actions: [
      {
        type: "text",
        text: `${intro}\nDecime el nombre del medicamento. Si preferis, podes mandar foto de la caja.`
      }
    ]
  };
}

function startRecetaFlow(session, switched) {
  session.state = STATE_RECETA;
  session.data = {};
  moveToStep(session, STEP_RECETA_FILE);

  const intro = switched
    ? "Perfecto, cambiamos al flujo de *Enviar Receta*."
    : "Perfecto, vamos con *Enviar Receta*.";

  return {
    actions: [
      {
        type: "text",
        text: `${intro}\nEnvia foto o PDF legible de la receta (firma y sello visibles).`
      }
    ]
  };
}

function startTurnosFlow(session, switched) {
  session.state = STATE_TURNOS;
  session.data = {};
  moveToStep(session, STEP_TURNO_SERVICE);

  const intro = switched
    ? "Perfecto, cambiamos al flujo de *Sacar un Turno*."
    : "Perfecto, vamos con *Sacar un Turno*.";

  return {
    actions: [
      { type: "text", text: intro },
      buildInteractive("¿Para que servicio queres turno?", [
        { id: "turno_service_vacuna", title: "Vacunacion" },
        { id: "turno_service_presion", title: "Toma presion" },
        { id: "turno_service_asesoria", title: "Asesoramiento" }
      ])
    ]
  };
}

function shouldSwitchIntent(currentState, intent) {
  if (currentState === STATE_IDLE) {
    return false;
  }
  if (currentState === STATE_STOCK && intent === "stock") {
    return false;
  }
  if (currentState === STATE_RECETA && intent === "receta") {
    return false;
  }
  return !(currentState === STATE_TURNOS && intent === "turnos");
}

function buildInboundContext(inboundText, inboundMessage) {
  const buttonId =
    inboundMessage?.interactive?.button_reply?.id ||
    inboundMessage?.button?.payload ||
    "";

  const textFromMessage =
    inboundMessage?.text?.body ||
    inboundMessage?.button?.text ||
    inboundMessage?.interactive?.button_reply?.title ||
    inboundMessage?.interactive?.list_reply?.title ||
    inboundMessage?.document?.caption ||
    inboundMessage?.image?.caption ||
    "";

  const text = sanitizeField(inboundText || textFromMessage || "", 400);
  const normalized = normalizeInput(text);
  const messageType = inboundMessage?.type || (text ? "text" : "unknown");
  const hasMedia = messageType === "image" || messageType === "document";

  return {
    text,
    normalized,
    buttonId,
    messageType,
    hasMedia
  };
}

function detectIntent(input) {
  if (input.buttonId === "btn_stock") {
    return "stock";
  }
  if (input.buttonId === "btn_receta") {
    return "receta";
  }
  if (input.buttonId === "btn_turnos") {
    return "turnos";
  }

  if (input.normalized.includes("stock") || input.normalized.includes("medicamento") || input.normalized.includes("precio")) {
    return "stock";
  }
  if (input.normalized.includes("receta")) {
    return "receta";
  }
  if (input.normalized.includes("turno") || input.normalized.includes("vacuna") || input.normalized.includes("presion")) {
    return "turnos";
  }

  return null;
}

function asksForBranches(normalized) {
  return normalized.includes("sucursal") || normalized.includes("horario") || normalized.includes("direccion");
}

function parseStockMode(input) {
  if (input.buttonId === "stock_mode_pickup" || input.normalized.includes("retiro")) {
    return "Retiro en sucursal";
  }
  if (input.buttonId === "stock_mode_delivery" || input.normalized.includes("envio") || input.normalized.includes("domicilio")) {
    return "Envio a domicilio";
  }
  if (input.buttonId === "stock_mode_price" || input.normalized.includes("solo precio") || input.normalized === "precio") {
    return "Solo consulta de precio";
  }
  return null;
}

function parseRecetaMode(input) {
  if (input.buttonId === "receta_mode_pickup" || input.normalized.includes("retiro")) {
    return "Retiro en sucursal";
  }
  if (input.buttonId === "receta_mode_delivery" || input.normalized.includes("envio") || input.normalized.includes("domicilio")) {
    return "Envio a domicilio";
  }
  if (input.buttonId === "receta_mode_quote" || input.normalized.includes("solo validacion") || input.normalized.includes("validacion")) {
    return "Solo validacion";
  }
  return null;
}

function parseRecetaContactChoice(input) {
  if (input.buttonId === "receta_contact_whatsapp" || input.normalized.includes("este numero")) {
    return "whatsapp";
  }
  if (input.buttonId === "receta_contact_other" || input.normalized.includes("otro numero")) {
    return "other";
  }
  if (input.buttonId === "receta_contact_agent" || input.normalized.includes("asesor")) {
    return "agent";
  }
  return null;
}

function parseTurnoService(input) {
  if (input.buttonId === "turno_service_vacuna" || input.normalized.includes("vacuna")) {
    return "Vacunacion";
  }
  if (input.buttonId === "turno_service_presion" || input.normalized.includes("presion")) {
    return "Toma de presion";
  }
  if (input.buttonId === "turno_service_asesoria" || input.normalized.includes("asesor")) {
    return "Asesoramiento farmaceutico";
  }
  return null;
}

function parseTurnoDateChoice(input) {
  if (input.buttonId === "turno_date_hoy" || input.normalized === "hoy") {
    return "today";
  }
  if (input.buttonId === "turno_date_manana" || input.normalized === "manana" || input.normalized === "mañana") {
    return "tomorrow";
  }
  if (input.buttonId === "turno_date_otra" || input.normalized.includes("otra fecha")) {
    return "other";
  }
  return null;
}

function parseTurnoSlot(input) {
  if (input.buttonId === "turno_slot_manana" || input.normalized.includes("manana") || input.normalized.includes("mañana")) {
    return "Mañana";
  }
  if (input.buttonId === "turno_slot_tarde" || input.normalized.includes("tarde")) {
    return "Tarde";
  }
  if (input.buttonId === "turno_slot_noche" || input.normalized.includes("noche")) {
    return "Noche";
  }
  return null;
}

function parseTurnoContactChoice(input) {
  if (input.buttonId === "turno_contact_whatsapp" || input.normalized.includes("este numero")) {
    return "whatsapp";
  }
  if (input.buttonId === "turno_contact_other" || input.normalized.includes("otro numero")) {
    return "other";
  }
  if (input.buttonId === "turno_contact_agent" || input.normalized.includes("asesor")) {
    return "agent";
  }
  return null;
}

function parseBranch(input, prefix) {
  if (input.buttonId === `${prefix}_branch_centro` || input.normalized.includes("centro")) {
    return "Centro";
  }
  if (input.buttonId === `${prefix}_branch_norte` || input.normalized.includes("norte")) {
    return "Norte 24hs";
  }
  if (input.buttonId === `${prefix}_branch_sur` || input.normalized.includes("sur")) {
    return "Sur";
  }
  return null;
}

function parseConfirmAction(input, prefix) {
  if (input.buttonId === `${prefix}_confirm_yes` || ["confirmar", "si", "ok", "confirmo"].includes(input.normalized)) {
    return "confirm";
  }
  if (input.buttonId === `${prefix}_confirm_restart` || input.normalized.includes("reiniciar") || input.normalized.includes("editar")) {
    return "restart";
  }
  if (input.buttonId === `${prefix}_confirm_agent` || input.normalized.includes("asesor")) {
    return "agent";
  }
  return null;
}

function buildStepFallback(session, { level1, level2Text, level2Interactive }) {
  session.fallbackCount = (session.fallbackCount || 0) + 1;

  if (session.fallbackCount === 1) {
    return {
      actions: [{ type: "text", text: `No te entendi bien. ${level1}` }]
    };
  }

  if (session.fallbackCount === 2) {
    const actions = [{ type: "text", text: level2Text || level1 }];
    if (level2Interactive) {
      actions.push(level2Interactive);
    }
    return { actions };
  }

  session.state = STATE_AGENT;
  session.step = null;
  session.fallbackCount = 0;
  return {
    actions: [
      {
        type: "text",
        text: "Para evitar mas demoras, te paso con un asesor humano y comparto el contexto cargado hasta ahora."
      }
    ]
  };
}

function getWelcomeActions(session, includeNotice = false) {
  const actions = [];
  const shouldSendNotice = includeNotice || !session.privacyNoticeSent;
  if (shouldSendNotice) {
    actions.push({
      type: "text",
      text: "Aviso de privacidad: usaremos solo los datos necesarios para gestionar esta consulta. Podes pausar mensajes escribiendo *BAJA*."
    });
    session.privacyNoticeSent = true;
  }

  actions.push(getWelcomeMenu());
  session.fallbackCount = 0;
  return actions;
}

function getWelcomeMenu() {
  return buildInteractive(
    "¡Hola! Bienvenido a *Farmacias Modelo*. ¿En que te ayudamos hoy?\n\nElegi una opcion:",
    [
      { id: "btn_stock", title: "📦 Consultar Stock" },
      { id: "btn_receta", title: "📝 Enviar Receta" },
      { id: "btn_turnos", title: "📅 Sacar un Turno" }
    ]
  );
}

function buildInteractive(text, buttons) {
  return {
    type: "interactive",
    text,
    buttons
  };
}

function moveToStep(session, step) {
  session.step = step;
  session.fallbackCount = 0;
}

function resetSessionState(session) {
  session.state = STATE_IDLE;
  session.step = null;
  session.data = {};
  session.fallbackCount = 0;
}

function getSession(contactId) {
  const existing = sessions.get(contactId);
  if (existing) {
    return existing;
  }

  const fresh = {
    state: STATE_IDLE,
    step: null,
    data: {},
    fallbackCount: 0,
    privacyNoticeSent: false,
    updatedAt: Date.now()
  };

  sessions.set(contactId, fresh);
  trimSessions();
  return fresh;
}

function touchSession(contactId, session) {
  session.updatedAt = Date.now();
  sessions.set(contactId, session);
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [contactId, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(contactId);
    }
  }
}

function trimSessions() {
  if (sessions.size <= MAX_SESSIONS) {
    return;
  }

  const amountToDelete = sessions.size - MAX_SESSIONS;
  let removed = 0;
  for (const contactId of sessions.keys()) {
    sessions.delete(contactId);
    removed += 1;
    if (removed >= amountToDelete) {
      break;
    }
  }
}

function normalizeInput(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hasUsableText(text) {
  return typeof text === "string" && text.trim().length > 0;
}

function sanitizeField(value, maxLen) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function parseQuantity(normalized) {
  const match = String(normalized || "").match(/\d{1,2}/);
  if (!match) {
    return null;
  }
  const value = Number(match[0]);
  if (!Number.isInteger(value) || value < 1 || value > 99) {
    return null;
  }
  return value;
}

function parseDni(normalized) {
  const digits = String(normalized || "").replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 8) {
    return null;
  }
  return digits;
}

function parsePhone(normalized) {
  const digits = String(normalized || "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }
  return digits;
}

function isValidPersonName(value) {
  if (!hasUsableText(value)) {
    return false;
  }

  const cleaned = sanitizeField(value, 80);
  if (cleaned.length < 5 || cleaned.length > 80) {
    return false;
  }

  return /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s'.-]+$/.test(cleaned);
}

function normalizeDateInput(value) {
  if (!hasUsableText(value)) {
    return null;
  }

  const match = sanitizeField(value, 20).match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] ? Number(match[3]) : null;

  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }

  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  if (!year) {
    return `${dd}/${mm}`;
  }

  return `${dd}/${mm}/${String(year).padStart(4, "20").slice(-4)}`;
}

function formatContactPhone(contactId) {
  const digits = String(contactId || "").replace(/\D/g, "");
  if (!digits) {
    return "No informado";
  }
  return `+${digits}`;
}

function buildTicket(prefix) {
  return `${prefix}-${String(Date.now()).slice(-6)}`;
}

function buildStockSummary(data) {
  const lines = [
    "*Resumen de stock*",
    `- Medicamento: ${data.medicamento || "No informado"}`,
    `- Presentacion: ${data.presentacion || "No informada"}`,
    `- Cantidad: ${data.cantidad || "No informada"}`,
    `- Modalidad: ${data.modalidad || "No informada"}`
  ];

  if (data.sucursal) {
    lines.push(`- Sucursal: ${data.sucursal}`);
  }
  if (data.zona) {
    lines.push(`- Zona: ${data.zona}`);
  }
  lines.push(`- Horario sugerido: ${data.horario || "No informado"}`);
  return lines.join("\n");
}

function buildRecetaSummary(data) {
  const lines = [
    "*Resumen de receta*",
    `- Archivo recibido: ${data.tipoArchivo || "No"}`,
    `- Paciente: ${data.paciente || "No informado"}`,
    `- DNI: ${maskSensitiveNumber(data.dni)}`,
    `- Cobertura: ${data.cobertura || "No informada"}`,
    `- Modalidad: ${data.modalidad || "No informada"}`
  ];

  if (data.sucursal) {
    lines.push(`- Sucursal: ${data.sucursal}`);
  }
  if (data.direccion) {
    lines.push(`- Direccion: ${data.direccion}`);
  }
  lines.push(`- Horario: ${data.horario || "No informado"}`);
  lines.push(`- Contacto: ${data.contacto || "No informado"}`);
  return lines.join("\n");
}

function buildTurnoSummary(data) {
  return [
    "*Resumen de turno*",
    `- Servicio: ${data.servicio || "No informado"}`,
    `- Sucursal: ${data.sucursal || "No informada"}`,
    `- Fecha: ${data.fecha || "No informada"}`,
    `- Franja: ${data.franja || "No informada"}`,
    `- Paciente: ${data.paciente || "No informado"}`,
    `- Detalle: ${data.detalle || "No informado"}`,
    `- Contacto: ${data.contacto || "No informado"}`
  ].join("\n");
}

function maskSensitiveNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) {
    return "No informado";
  }
  if (digits.length <= 3) {
    return `${digits[0]}**`;
  }
  return `${digits.slice(0, 2)}***${digits.slice(-1)}`;
}

function getTurnoDetailPrompt(service) {
  if (service === "Vacunacion") {
    return "¿Que vacuna necesitas y si contas con orden medica?";
  }
  if (service === "Toma de presion") {
    return "¿Es control de rutina o tenes algun sintoma puntual?";
  }
  return "Contame brevemente el motivo de la consulta para preparar el asesoramiento.";
}

function isGreeting(normalized) {
  return ["hola", "buenas", "buen dia", "buenas tardes", "buenas noches"].includes(normalized);
}

function isCancelCommand(normalized) {
  return ["cancelar", "salir", "reiniciar", "reset"].includes(normalized);
}

function isMenuCommand(normalized) {
  return ["menu", "inicio", "volver", "opciones"].includes(normalized);
}

function isHumanCommand(normalized) {
  return normalized.includes("agente") || normalized.includes("humano") || normalized.includes("asesor");
}

function isOptOutCommand(normalized) {
  return normalized === "baja" || normalized === "stop" || normalized === "desuscribirme";
}

function isOptInCommand(normalized) {
  return normalized === "alta" || normalized === "start" || normalized === "reactivar";
}

function looksLikeEmergency(normalized) {
  return (
    normalized.includes("emergencia") ||
    normalized.includes("urgencia") ||
    normalized.includes("convulsion") ||
    normalized.includes("dificultad para respirar") ||
    normalized.includes("dolor de pecho")
  );
}

function resetSessions() {
  sessions.clear();
  optedOutContacts.clear();
}

module.exports = {
  nextBotReply,
  _private: {
    resetSessions,
    normalizeInput
  }
};
