function renderFlowDashboard() {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Flow Studio - n8n style</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg: #12141a;
        --panel: #1a1f2b;
        --panel-2: #111827;
        --card: #21293a;
        --ink: #e7edf8;
        --muted: #9fb1cc;
        --stroke: #3a4458;
        --accent: #ff6d2d;
        --accent-soft: rgba(255, 109, 45, 0.2);
        --ok: #27c499;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--ink);
        font-family: "Manrope", sans-serif;
        background: radial-gradient(circle at 15% -10%, rgba(255, 109, 45, 0.18), transparent 38%), var(--bg);
      }

      .wrap {
        width: min(1500px, 96vw);
        margin: 0 auto;
        padding: 22px 0 34px;
      }

      .header {
        background: linear-gradient(135deg, rgba(37, 44, 59, 0.95), rgba(22, 27, 38, 0.95));
        border: 1px solid var(--stroke);
        border-radius: 14px;
        padding: 16px 18px;
        box-shadow: 0 16px 35px rgba(0, 0, 0, 0.32);
      }

      .tag {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 5px 11px;
        border-radius: 999px;
        border: 1px solid rgba(255, 109, 45, 0.5);
        background: var(--accent-soft);
        font-size: 11px;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 10px 0 8px;
        font-size: clamp(1.3rem, 2.8vw, 2rem);
      }

      .sub {
        margin: 0;
        color: var(--muted);
        max-width: 90ch;
      }

      .toolbar {
        margin-top: 15px;
        display: flex;
        gap: 9px;
        flex-wrap: wrap;
      }

      .wf-btn {
        border: 1px solid var(--stroke);
        background: #182031;
        color: var(--ink);
        border-radius: 10px;
        padding: 8px 12px;
        font-size: 13px;
        cursor: pointer;
      }

      .wf-btn.active {
        border-color: rgba(255, 109, 45, 0.75);
        box-shadow: inset 0 0 0 1px rgba(255, 109, 45, 0.3);
      }

      .layout {
        margin-top: 14px;
        display: grid;
        grid-template-columns: 1.75fr 1fr;
        gap: 14px;
      }

      .panel {
        border: 1px solid var(--stroke);
        border-radius: 14px;
        background: linear-gradient(160deg, var(--panel), #141a25);
        padding: 14px;
      }

      .title {
        margin: 0;
        font-size: 14px;
        letter-spacing: .08em;
        text-transform: uppercase;
        color: #b8c8df;
      }

      .workflow-name {
        margin: 10px 0 4px;
        font-size: 1.2rem;
      }

      .workflow-desc {
        margin: 0 0 10px;
        color: var(--muted);
      }

      .canvas-shell {
        border: 1px solid #2f3b52;
        border-radius: 12px;
        background:
          linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px) 0 0 / 22px 22px,
          linear-gradient(0deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px) 0 0 / 22px 22px,
          #0f1420;
        overflow: auto;
        padding: 12px;
        min-height: 520px;
      }

      .canvas {
        position: relative;
        transform-origin: top left;
      }

      .edges {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .node {
        position: absolute;
        border: 1px solid #43506a;
        border-radius: 10px;
        background: #1d2535;
        box-shadow: 0 10px 22px rgba(3, 7, 14, 0.45);
        overflow: hidden;
      }

      .node-head {
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 9px;
        border-bottom: 1px solid #3a465e;
        background: linear-gradient(90deg, rgba(255, 109, 45, 0.25), rgba(255, 109, 45, 0.06));
      }

      .node-kind {
        font-family: "JetBrains Mono", monospace;
        font-size: 11px;
        color: #ffd9c8;
      }

      .node-body {
        padding: 9px;
      }

      .node-title {
        margin: 0 0 4px;
        font-size: 13px;
      }

      .node-sub {
        margin: 0;
        color: #a8bcda;
        font-size: 12px;
        line-height: 1.35;
      }

      .paths {
        margin-top: 12px;
        border-top: 1px solid #37445d;
        padding-top: 10px;
        display: grid;
        gap: 6px;
      }

      .path-row {
        display: flex;
        gap: 8px;
        font-size: 12px;
        color: #a8bedb;
        padding: 7px 8px;
        border: 1px solid #364259;
        border-radius: 9px;
        background: #141b29;
      }

      .path-label {
        color: #ffd0bc;
        font-family: "JetBrains Mono", monospace;
      }

      .meta-list, .future-list {
        display: grid;
        gap: 8px;
      }

      .meta-item, .future-item {
        border: 1px solid #334258;
        border-radius: 10px;
        background: #141b29;
        padding: 10px;
      }

      .meta-k {
        color: #8ea3c2;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .07em;
      }

      .meta-v {
        margin-top: 5px;
        font-size: 13px;
        font-family: "JetBrains Mono", monospace;
        word-break: break-word;
      }

      .future-head {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }

      .future-title {
        margin: 0;
        font-size: 14px;
      }

      .future-status {
        font-family: "JetBrains Mono", monospace;
        font-size: 11px;
        border: 1px solid rgba(255, 109, 45, 0.5);
        border-radius: 999px;
        color: #ffd8c7;
        padding: 2px 8px;
      }

      .future-detail {
        margin: 8px 0 0;
        color: #a6bbd8;
        font-size: 13px;
      }

      @media (max-width: 1100px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="header">
        <span class="tag">n8n style workflow map</span>
        <h1>Todos los caminos del bot, visualizados como canvas de nodos</h1>
        <p class="sub">
          Vista operativa del flujo real en produccion: nodos, ramas y loops tal como una orquestacion en n8n.
        </p>
        <div class="toolbar" id="toolbar"></div>
      </section>

      <section class="layout">
        <article class="panel">
          <h2 class="title">Workflow Canvas</h2>
          <h3 class="workflow-name" id="workflow-name">-</h3>
          <p class="workflow-desc" id="workflow-desc">-</p>
          <div id="canvas-host"></div>
        </article>
        <aside class="panel">
          <h2 class="title">Arquitectura</h2>
          <div class="meta-list" id="meta"></div>
          <h2 class="title" style="margin-top:14px;">Roadmap</h2>
          <div class="future-list" id="future"></div>
        </aside>
      </section>
    </div>

    <script>
      let payload = null;
      let activeWorkflowId = null;

      const toolbar = document.getElementById("toolbar");
      const workflowName = document.getElementById("workflow-name");
      const workflowDesc = document.getElementById("workflow-desc");
      const canvasHost = document.getElementById("canvas-host");
      const meta = document.getElementById("meta");
      const future = document.getElementById("future");

      function toMapById(nodes) {
        const m = {};
        nodes.forEach(function (n) { m[n.id] = n; });
        return m;
      }

      function edgePath(from, to) {
        const fromRight = to.x >= from.x;
        const sx = fromRight ? (from.x + from.w) : from.x;
        const sy = from.y + (from.h / 2);
        const ex = fromRight ? to.x : (to.x + to.w);
        const ey = to.y + (to.h / 2);
        const spread = Math.max(80, Math.abs(ex - sx) * 0.45);
        const c1x = fromRight ? sx + spread : sx - spread;
        const c2x = fromRight ? ex - spread : ex + spread;
        return "M " + sx + " " + sy + " C " + c1x + " " + sy + ", " + c2x + " " + ey + ", " + ex + " " + ey;
      }

      function renderToolbar() {
        const workflows = payload.workflows || [];
        toolbar.innerHTML = workflows.map(function (wf) {
          const active = wf.id === activeWorkflowId ? "active" : "";
          return '<button class="wf-btn ' + active + '" data-id="' + wf.id + '">' + wf.name + '</button>';
        }).join("");
        Array.from(toolbar.querySelectorAll(".wf-btn")).forEach(function (btn) {
          btn.addEventListener("click", function () {
            activeWorkflowId = btn.dataset.id;
            render();
          });
        });
      }

      function renderMeta() {
        const a = payload.architecture || {};
        const items = [
          { k: "runtime", v: a.runtime || "-" },
          { k: "state model", v: a.stateModel || "-" },
          { k: "channels", v: (a.channels || []).join(", ") || "-" },
          { k: "deployment", v: a.deployment || "-" },
          { k: "api endpoints", v: (a.apiEndpoints || []).join(" | ") || "-" },
          { k: "updated at", v: payload.updatedAt || "-" }
        ];
        meta.innerHTML = items.map(function (it) {
          return '<div class="meta-item"><div class="meta-k">' + it.k + '</div><div class="meta-v">' + it.v + '</div></div>';
        }).join("");
      }

      function renderFuture() {
        const list = payload.futureFlows || [];
        future.innerHTML = list.map(function (f) {
          return (
            '<article class="future-item">' +
              '<div class="future-head"><h3 class="future-title">' + f.title + '</h3><span class="future-status">' + f.status + '</span></div>' +
              '<p class="future-detail">' + f.detail + '</p>' +
            '</article>'
          );
        }).join("");
      }

      function renderWorkflow() {
        const workflows = payload.workflows || [];
        const wf = workflows.find(function (x) { return x.id === activeWorkflowId; }) || workflows[0];
        if (!wf) {
          canvasHost.innerHTML = "<p>No workflow data.</p>";
          return;
        }

        activeWorkflowId = wf.id;
        workflowName.textContent = wf.name;
        workflowDesc.textContent = wf.description || "";

        const nodes = wf.nodes || [];
        const edges = wf.edges || [];
        const map = toMapById(nodes);
        const width = (wf.canvas && wf.canvas.width) || 1200;
        const height = (wf.canvas && wf.canvas.height) || 560;

        const edgeSvg = edges.map(function (e, idx) {
          const from = map[e.from];
          const to = map[e.to];
          if (!from || !to) return "";
          const d = edgePath(from, to);
          const midX = (from.x + to.x + from.w) / 2;
          const midY = (from.y + to.y + from.h) / 2;
          return (
            '<g>' +
              '<path d="' + d + '" stroke="rgba(255,210,194,0.58)" stroke-width="2" fill="none" marker-end="url(#arrow)"></path>' +
              '<rect x="' + (midX - 46) + '" y="' + (midY - 12) + '" width="92" height="18" rx="8" fill="rgba(17,24,39,0.95)"></rect>' +
              '<text x="' + midX + '" y="' + (midY + 1) + '" text-anchor="middle" fill="#ffd8c8" font-size="11" font-family="JetBrains Mono">' + (e.label || "") + '</text>' +
            '</g>'
          );
        }).join("");

        const nodeHtml = nodes.map(function (n) {
          return (
            '<article class="node" style="left:' + n.x + 'px;top:' + n.y + 'px;width:' + n.w + 'px;height:' + n.h + 'px;">' +
              '<div class="node-head"><span class="node-kind">' + n.kind + '</span><span class="node-kind">id:' + n.id + '</span></div>' +
              '<div class="node-body"><h4 class="node-title">' + n.title + '</h4><p class="node-sub">' + (n.subtitle || "") + '</p></div>' +
            '</article>'
          );
        }).join("");

        const paths = edges.map(function (e) {
          return '<div class="path-row"><span class="path-label">' + e.label + '</span><span>' + e.from + " -> " + e.to + '</span></div>';
        }).join("");

        canvasHost.innerHTML =
          '<div class="canvas-shell">' +
            '<div class="canvas" style="width:' + width + 'px;height:' + height + 'px;">' +
              '<svg class="edges" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">' +
                '<defs>' +
                  '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">' +
                    '<path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,210,194,0.85)" />' +
                  '</marker>' +
                '</defs>' +
                edgeSvg +
              '</svg>' +
              nodeHtml +
            '</div>' +
          '</div>' +
          '<div class="paths">' + paths + '</div>';
      }

      function render() {
        if (!payload) return;
        renderToolbar();
        renderWorkflow();
        renderMeta();
        renderFuture();
      }

      fetch("/api/flows")
        .then(function (res) { return res.json(); })
        .then(function (json) {
          payload = json;
          activeWorkflowId = ((json.workflows || [])[0] || {}).id || null;
          render();
        })
        .catch(function () {
          canvasHost.innerHTML = '<p style="color:#ffb8b8">No se pudo cargar /api/flows</p>';
        });
    </script>
  </body>
</html>`;
}

module.exports = {
  renderFlowDashboard
};
