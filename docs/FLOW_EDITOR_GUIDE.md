# Flow Editor Guide (n8n style)

Last update: 2026-03-08

## Where
Open `/flows`.

## Main actions
- Move node: click and drag node body.
- Open node details: click `Abrir` or double-click node.
- Edit node content:
  - `Titulo`
  - `Subtitulo`
  - `Explicacion simple`
  - `Mensaje del bot` (this impacts chatbot responses)
- Connect nodes:
  - click `Conectar`
  - click output port (right) on source node
  - click input port (left) on target node
  - set `route key` and visible label
- Remove line:
  - click a line to select it
  - click `Eliminar linea` or press `Delete`
- Restore removed line:
  - use chips in `Restaurar: ...`
- Zoom:
  - mouse wheel
  - `+` / `-` buttons
- Fit screen:
  - click `Ajustar pantalla`
- Persist changes:
  - click `Guardar`

## Notes
- Changes are only permanent after `Guardar`.
- `route key` drives runtime transitions in chatbot logic.
- Keep labels understandable for non-technical stakeholders.
