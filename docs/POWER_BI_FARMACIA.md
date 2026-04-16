# Power BI para sistema de farmacia

Esta guia deja documentado como conectar Power BI al software de farmacia por API, como estructurar un primer modelo y como guardar el proyecto en formato editable para que podamos trabajarlo desde este repo.

## Lo importante

- La fuente correcta para Power BI de productos, precios, stock y ventas es la API del sistema de farmacia.
- No corresponde usar Neon para este tablero.
- Para que yo pueda revisar y editar el modelo aca en el repo, lo ideal es trabajar en formato `PBIP` con reporte `PBIR` y modelo semantico en `TMDL`.

## Conexion confirmada

Integracion usada por el proyecto:

- Base URL: `http://delko.plex25center.com.ar:8081`
- Prefijo API: `/wsplexcenter`
- Autenticacion: `Basic`

La integracion del proyecto ya usa esta misma API en [pharmacy_system_lookup.js](</C:/Users/Taligent/Desktop/Nicolás/Proyectos Personales/ChatBot Whatsapp/apps/whatsapp-bot-node/src/pharmacy_system_lookup.js:12>).

## Endpoints utiles para BI

Validados con las credenciales actuales:

- `GET /wsplexcenter/sucursales`
- `GET /wsplexcenter/productos?busqueda=...&paginanro=...&paginacant=...`
- `GET /wsplexcenter/stock?sucursal=...&paginanro=...&paginacant=...`
- `GET /wsplexcenter/laboratorios`
- `GET /wsplexcenter/clientes`
- `GET /wsplexcenter/ventas?fecha=YYYYMMDD&sucursal=...`

Estructura observada en vivo el `2026-04-16`:

- `sucursales`: `idsucursal`, `sucursal`, `empresa`, `cuit`
- `laboratorios`: `idlaboratorio`, `laboratorio`
- `productos`: `codproducto`, `producto`, `precio`, `idlaboratorio`, `codebar`, `gtin`, `troquel`, `coddroga`, `delivery`, `ecommerce`
- `stock`: `codproducto`, `cajas`, `unidades`, `minimo`, `maximo`, `seguridad`, `abc`
- `clientes`: `idcliente`, `nombre`, `tipodoc`, `nrodoc`, `telefono`, `email`, `idgrupo`
- `ventas`: la respuesta trae `comprobantes`
- `comprobantes`: `idcomprobante`, `fecha`, `tipo`, `letra`, `punto_vta`, `numero`, `sucursal`, `importe`, `idcliente`, `lineas`, `medios_de_pago`, `recetas`
- `lineas` dentro de `comprobantes`: `idproducto`, `descripcion`, `cant_vendida`, `precio`, `descuentos`, `iva`, `total`
- `medios_de_pago` dentro de `comprobantes`: `idmediodepago`, `concepto`, `tarjeta`, `cuotas`, `importe`

Nota importante:

- En una muestra real, `lineas.idproducto` coincidió con `productos.codproducto` para `OBETIDE 2.4 mg jer. prell. x 4`, asi que esa relacion es prometedora.
- Igual conviene validar esa clave con mas muestra antes de cerrar el modelo definitivo.

## Modelo inicial recomendado

Primer modelo pragmatico:

- `DimSucursal`
- `DimLaboratorio`
- `DimProducto`
- `FactStock`
- `FactComprobantes`
- `FactComprobanteLineas`
- `FactMediosPago`
- `DimCliente`

Relaciones sugeridas:

- `DimLaboratorio[idlaboratorio]` 1:* `DimProducto[idlaboratorio]`
- `DimProducto[codproducto]` 1:* `FactStock[codproducto]`
- `DimSucursal[idsucursal]` 1:* `FactStock[idsucursal]`
- `DimSucursal[idsucursal]` 1:* `FactComprobantes[sucursal]`
- `DimCliente[idcliente]` 1:* `FactComprobantes[idcliente]`
- `FactComprobantes[idcomprobante]` 1:* `FactComprobanteLineas[idcomprobante]`
- `FactComprobantes[idcomprobante]` 1:* `FactMediosPago[idcomprobante]`
- `DimProducto[codproducto]` 1:* `FactComprobanteLineas[idproducto]`

## Medidas DAX iniciales

Medidas utiles para arrancar:

```DAX
Stock Cajas = SUM ( FactStock[cajas] )

Stock Unidades = SUM ( FactStock[unidades] )

Ventas Importe = SUM ( FactComprobantes[importe] )

Unidades Vendidas = SUM ( FactComprobanteLineas[cant_vendida] )

Ticket Promedio = DIVIDE ( [Ventas Importe], DISTINCTCOUNT ( FactComprobantes[idcomprobante] ) )

Precio Promedio Lista = AVERAGE ( DimProducto[precio] )
```

## Paso a paso en Power BI Desktop

### 1. Crear el proyecto editable

En Power BI Desktop:

1. Ir a `File > Options and settings > Options > Preview features`.
2. Activar:
   - `Power BI Project (.pbip) save option`
   - `Store reports using enhanced metadata format (PBIR)`
   - `Store semantic model using TMDL format`
3. Reiniciar Power BI Desktop.

### 2. Crear parametros

En Power Query:

1. Crear parametro `BaseUrl` = `http://delko.plex25center.com.ar:8081`
2. Crear parametro `SucursalId` = `1`
3. Crear parametro `FechaVentas` = por ejemplo `20260415`

No guardes usuario y password dentro del codigo M. Es mejor dejarlos en las credenciales del origen.

### 3. Conectar con autenticacion Basic

1. `Get Data > Web`
2. Poner una URL base, por ejemplo:
   - `http://delko.plex25center.com.ar:8081/wsplexcenter/sucursales`
3. Cuando Power BI pida autenticacion:
   - elegir `Basic`
   - cargar usuario y password de la API
4. Aplicar el permiso al nivel del host:
   - `http://delko.plex25center.com.ar:8081`

### 4. Crear queries base

Ejemplo `Sucursales`:

```powerquery
let
    Source = Json.Document(
        Web.Contents(
            BaseUrl,
            [
                RelativePath = "wsplexcenter/sucursales"
            ]
        )
    ),
    Sucursales = Source[response][content][sucursales],
    Tabla = Table.FromRecords(Sucursales)
in
    Tabla
```

Ejemplo `Laboratorios`:

```powerquery
let
    Source = Json.Document(
        Web.Contents(
            BaseUrl,
            [
                RelativePath = "wsplexcenter/laboratorios"
            ]
        )
    ),
    Laboratorios = Source[response][content][laboratorios],
    Tabla = Table.FromRecords(Laboratorios)
in
    Tabla
```

Ejemplo `ProductosPagina1`:

```powerquery
let
    Source = Json.Document(
        Web.Contents(
            BaseUrl,
            [
                RelativePath = "wsplexcenter/productos",
                Query = [
                    busqueda = "",
                    paginanro = "1",
                    paginacant = "100"
                ]
            ]
        )
    ),
    Productos = Source[response][content][productos],
    Tabla = Table.FromRecords(Productos)
in
    Tabla
```

Ejemplo `StockSucursal1Pagina1`:

```powerquery
let
    Source = Json.Document(
        Web.Contents(
            BaseUrl,
            [
                RelativePath = "wsplexcenter/stock",
                Query = [
                    sucursal = SucursalId,
                    paginanro = "1",
                    paginacant = "1000"
                ]
            ]
        )
    ),
    Productos = Source[response][content][productos],
    TablaBase = Table.FromRecords(Productos),
    Tabla = Table.AddColumn(TablaBase, "idsucursal", each SucursalId, type text)
in
    Tabla
```

Ejemplo `ComprobantesDia`:

```powerquery
let
    Source = Json.Document(
        Web.Contents(
            BaseUrl,
            [
                RelativePath = "wsplexcenter/ventas",
                Query = [
                    fecha = FechaVentas,
                    sucursal = SucursalId
                ]
            ]
        )
    ),
    Comprobantes = Source[response][content][comprobantes],
    Tabla = Table.FromRecords(Comprobantes)
in
    Tabla
```

### 5. Expandir ventas

Para `FactComprobanteLineas`:

1. Duplicar `ComprobantesDia`
2. Dejar `idcomprobante`
3. Expandir la columna `lineas`
4. Expandir el record resultante
5. Renombrar a `FactComprobanteLineas`

Para `FactMediosPago`:

1. Duplicar `ComprobantesDia`
2. Dejar `idcomprobante`
3. Expandir `medios_de_pago`
4. Expandir el record resultante
5. Renombrar a `FactMediosPago`

## Como traer el proyecto aca para que yo lo edite

Lo que necesitas traer al repo no es solo `PBIR`.

Lo correcto es:

- `PBIP` para el contenedor del proyecto
- `PBIR` para el reporte
- `TMDL` para el modelo semantico

Guardalo asi:

1. `File > Save As`
2. Elegi `Power BI Project (.pbip)`
3. Guardalo idealmente dentro de una carpeta corta

Sugerencia de ruta:

- `C:\Repos\chatbot_whatsapp\bi\powerbi\farmacia-delko`

Si lo queres dejar en este repo, la carpeta sugerida es:

- `bi/powerbi/farmacia-delko/`

Pero ojo:

- Microsoft advierte limite de `260` caracteres en Windows para PBIP.
- Este repo hoy esta en una ruta larga.
- Si Power BI te da error al guardar, hay que usar una copia del repo en una ruta mas corta.

## Archivos que necesito que queden en Git

Quiero ver estos archivos:

- `*.pbip`
- `*.Report/definition.pbir`
- `*.Report/definition/**`
- `*.SemanticModel/definition/**`
- `*.SemanticModel/DAXQueries/**` si guardas consultas DAX
- `*.SemanticModel/TMDLScripts/**` si usas scripts TMDL

No hace falta subir:

- `**/.pbi/localSettings.json`
- `**/.pbi/cache.abf`

## Que voy a poder editar yo despues

Si me pasas ese proyecto en el repo, yo voy a poder:

- revisar tablas y columnas
- crear o corregir relaciones
- escribir medidas DAX
- ordenar el modelo en estrella
- ajustar nombres de negocio
- revisar M y detectar pasos fragiles
- proponerte una capa mas limpia para ventas, stock y precios

## Referencias oficiales

- Power Query Web connector:
  - `https://learn.microsoft.com/en-us/power-query/connectors/web/web`
- Power BI Projects (`PBIP`):
  - `https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-overview`
- Report folder (`PBIR`):
  - `https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report`
- Semantic model folder (`TMDL`):
  - `https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-dataset`
