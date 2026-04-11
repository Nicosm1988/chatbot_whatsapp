# Productos y Descuentos

Estado: documentacion oficial temporal para el chatbot hasta conectar la API del sistema de farmacia.

Fuente oficial:
- Archivo recibido del cliente: `Productos y Descuentos.docx`
- Imagen embebida con ejemplos numericos de importes finales

## Reglas generales

- Estos productos no tienen cobertura general de obras sociales o prepagas.
- Los programas de descuento informados por laboratorio son `FTCheq` y `Recetario Solidario`.
- Farmacia Delko aplica descuentos adicionales segun el caso.
- Hasta tener integracion por API, esta documentacion es la base oficial para el flujo guiado del bot.

## Venta particular

Aplica a todos los productos listados.

- Efectivo o transferencia: 25% de descuento
- Tarjeta de debito: 20% de descuento
- Tarjeta de credito: 10% de descuento + 3 cuotas sin interes

## Productos por laboratorio

### Laboratorio Elea

#### DUTIDE

- `DUTIDE 0.25 mg jer. prell. x 4`
- `DUTIDE 0.5 mg jer. prell. x 4`
- `DUTIDE 1 mg jer. prell. x 4`
  - Programa disponible: `FTCheq`
  - Beneficio informado: 30% de descuento
  - Beneficio adicional Delko: 20% extra si paga en efectivo o transferencia

- `DUTIDE 14 mg comp. x 30`
- `DUTIDE 3 mg comp. x 30`
- `DUTIDE 7 mg comp. x 30`
  - No tienen cobertura por programas
  - Solo venta particular

#### OBETIDE

- `OBETIDE 0.25 mg jer. prell. x 4`
- `OBETIDE 0.5 mg jer. prell. x 4`
- `OBETIDE 1 mg jer. prell. x 4`
- `OBETIDE 1.7 mg jer. prell. x 4`
- `OBETIDE 2.4 mg jer. prell. x 4`
  - Programa disponible: `Recetario Solidario`
  - Beneficio informado: 20% de descuento
  - Beneficio adicional Delko: 20% extra si paga en efectivo o transferencia

### Laboratorio Novo Nordisk

- `OZEMPIC 0.25 0.5mg/dosis x1.5ml`
- `OZEMPIC 1mg/dosis x 3ml`
- `WEGOVY 0.25 mg/ds lap.x1 x1.5ml`
- `WEGOVY 0.5 mg/ds lap.x1 x1.5ml`
- `WEGOVY 1 mg/ds lap.x1 x3ml`
- `WEGOVY 1.7 mg/ds lap.x1 x3ml`
- `WEGOVY 2.4 mg/ds lap.x1 x3ml`
- `SAXENDA lap.prell.x 3`

Opciones informadas:

- `FTCheq`
  - El descuento puede variar entre 25%, 30% o 35%
  - Delko agrega 20% extra si paga en efectivo o transferencia

- `Recetario Solidario + FTCheq`
  - Recetario Solidario: 20%
  - FTCheq: 25%, 30% o 35% segun corresponda
  - Delko agrega 20% extra si paga en efectivo o transferencia

Nota:
- `SAXENDA` es el unico producto del documento donde una obra social podria llegar a cubrir algo.

### Laboratorio Adium

- `MOUNJARO 2.5 mg/0.6 mLx1 KwikPen`
- `MOUNJARO 5 mg/0.6 mLx1 KwikPen`
  - Programa disponible: `FTCheq`
  - Beneficio informado: 30% de descuento
  - Beneficio adicional Delko: 20% extra si paga en efectivo o transferencia

## Ejemplos numericos transcritos del documento

Estos importes sirven como referencia documental. No deben asumirse como lista universal de precios para todos los productos.

| Producto | Escenario | Importe final |
| --- | --- | --- |
| DUTIDE 1 mg jer. prell. x 4 | FTCheq 30% + Delko 20% en efectivo/transferencia | $ 85.625,94 |
| DUTIDE 7 mg comp. x 30 | Venta particular con 25% en efectivo/transferencia | $ 163.678,92 |
| OBETIDE 2.4 mg jer. prell. x 4 | Recetario Solidario 20% + Delko 20% en efectivo/transferencia | $ 168.774,34 |
| OZEMPIC 1mg/dosis x 3ml | FTCheq + Delko 20% en efectivo/transferencia | $ 216.527,45 |
| OZEMPIC 1mg/dosis x 3ml | Recetario Solidario + FTCheq + Delko 20% en efectivo/transferencia | $ 173.221,95 |
| MOUNJARO 5 mg/0.6 mLx1 KwikPen | FTCheq 30% + Delko 20% en efectivo/transferencia | $ 464.789,15 |

## Criterio operativo para el bot

- Primer menu del bot: `Delivery` o `Mostrador`.
- Si elige `Mostrador`, pedir receta directamente y cerrar con atencion humana por mostrador.
- Si elige `Vacunas`, guiar la seleccion por laboratorio -> marca -> presentacion.
- Si elige `Particular`, pedir el producto en texto libre con `Que necesitas?`.
- Si elige `Obra Social`, pedir receta y cerrar con continuidad por asesor.
- En ambos casos, consultar stock y precio por API cuando la integracion exista.
- Mientras la API no este conectada, usar este documento como fallback honesto para identificar productos y valores de referencia sin inventar stock en tiempo real.
- En cada paso guiado ofrecer `Volver` al paso anterior.
- Mostrar todas las presentaciones disponibles sin `Mas opciones`.
- Luego consultar si esta adherido a `Recetario Solidario`.
- Cerrar con un resumen corto y opcion de `Confirmar` o `Volver`.
