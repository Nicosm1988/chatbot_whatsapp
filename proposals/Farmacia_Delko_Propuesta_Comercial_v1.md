# Propuesta Comercial - Farmacia Delko

Fecha: 2026-03-08
Estado: Borrador comercial v1

## 1. Resumen ejecutivo

Farmacia Delko ya cuenta con una base funcional de chatbot WhatsApp en produccion, con editor visual tipo n8n, tablero central en Vercel y registro de conversaciones.
La propuesta comercial de esta etapa apunta a transformar esa base en una operacion estable, escalable y medible para negocio.

Objetivo: aumentar conversion de pedidos, reducir carga operativa manual y mejorar trazabilidad de atencion.

## 2. Situacion actual

- Bot operativo con flujo de pedidos.
- Editor visual para mover nodos, conectar rutas y editar mensajes.
- Tablero central para operaciones y seguimiento.
- Registro de conversaciones para auditoria y analitica.

## 3. Propuesta de valor

La solucion propuesta combina:
- Automatizacion de atencion y toma de pedidos por WhatsApp.
- Control operativo en tiempo real para el cliente.
- Capacidad de mejora continua sin rehacer la arquitectura.
- Datos estructurados de conversaciones para campanas futuras.

## 4. Alcance propuesto (fase comercial actual)

### Incluye
- Ajuste y estabilizacion de flujos productivos.
- Mejora de coherencia conversacional.
- Tablero cliente dark mode orientado a uso no tecnico.
- Historial de conversaciones y seguimiento de casos.
- Hardening de conectividad (timeouts, retries, fallback).
- Soporte de evolucion de flujo desde editor visual.

### No incluye en esta fase
- Integraciones profundas con ERP/CRM externo no definido.
- BI avanzado multi-fuente fuera del tablero actual.
- Operacion humana 24/7 tercerizada.

## 5. Paquetes comerciales sugeridos

## Plan Base
- Setup: USD 1,200
- Mensual: USD 350
- Incluye: mantenimiento de flujo principal, monitoreo basico, hasta 2 ajustes mensuales

## Plan Growth
- Setup: USD 1,800
- Mensual: USD 650
- Incluye: todo Base + optimizacion continua + 1 flujo adicional + soporte prioritario

## Plan Scale
- Setup: USD 2,900
- Mensual: USD 1,100
- Incluye: todo Growth + multi-sucursal + integraciones avanzadas + SLA extendido

## 6. Modelo de ROI (escenario base)

Supuestos ejemplo:
- 1,500 conversaciones/mes
- 45% automatizacion util
- 4 min manual evitados por conversacion automatizada
- Costo operativo promedio: USD 6/h

Resultado aproximado:
- Horas ahorradas mes: 45 horas
- Ahorro operativo mensual: USD 270
- Con mejora de conversion adicional (2% sobre pedidos): retorno total potencial > costo mensual en plan Growth

Nota: la cifra final se ajusta con datos reales de Delko en semana 1.

## 7. Plan de implementacion

- Semana 1: workshop de alcance y KPIs finales
- Semana 2: ajuste de flujos y reglas criticas
- Semana 3: QA funcional y pruebas guiadas
- Semana 4: estabilizacion productiva + reporte inicial
- Semana 5+: optimizacion continua y backlog evolutivo

## 8. Riesgos y mitigacion

- Dependencia de servicios externos (Meta/Vercel/KV): mitigado con retry/fallback y monitoreo.
- Cambios de alcance: mitigado con backlog, prioridades y control de cambios.
- Variabilidad operativa humana: mitigado con reglas de derivacion claras y tablero de casos.

## 9. Proximo paso comercial

Propuesta de cierre:
1. Elegir plan (Base/Growth/Scale).
2. Confirmar kickoff de 60 minutos.
3. Firma y pago inicial de setup.
4. Inicio de ejecucion en 72 horas habiles.


