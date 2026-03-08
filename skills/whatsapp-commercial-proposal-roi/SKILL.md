---
name: whatsapp-commercial-proposal-roi
description: Modelar impacto economico y ROI esperado para justificar la inversion en chatbot WhatsApp.
---

# ROI Modeling Skill

## Overview

Traducir mejoras operativas del bot en impacto economico comprensible para decision de compra.

## Workflow

1. Medir baseline actual (sin bot).
2. Definir mejoras esperadas (con bot).
3. Calcular ahorro, ingresos incrementales y payback.
4. Preparar escenario conservador/base/agresivo.
5. Documentar supuestos.

## Core formulas

- Horas ahorradas mes = (mensajes automatizados * tiempo promedio manual) / 60
- Ahorro mensual = horas ahorradas mes * costo hora operativa
- Ingreso incremental = conversion adicional * ticket promedio
- ROI mensual = (ahorro + ingreso incremental - costo mensual) / costo mensual
- Payback setup (meses) = setup fee / (ahorro + ingreso incremental - costo mensual)

## Output

- Tabla de escenarios
- Payback estimado
- Principales palancas de mejora

Ver `references/roi-template.md`.
