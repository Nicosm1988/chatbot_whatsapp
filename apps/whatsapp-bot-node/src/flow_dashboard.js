function renderFlowDashboard() {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Flow Studio - n8n Canvas</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg: #0f131b;
        --panel: #191f2b;
        --stroke: #34435b;
        --ink: #e9eef8;
        --muted: #a6b7d0;
        --accent: #ff6d2d;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
      }

      body {
        color: var(--ink);
        font-family: "Manrope", sans-serif;
        background: radial-gradient(circle at 15% -5%, rgba(255, 109, 45, 0.18), transparent 33%), var(--bg);
      }

      .app {
        height: 100vh;
        display: flex;
        flex-direction: column;
        padding: 10px;
        gap: 10px;
      }

      .topbar {
        flex: 0 0 auto;
        border: 1px solid var(--stroke);
        border-radius: 12px;
        background: linear-gradient(145deg, rgba(34, 41, 56, 0.95), rgba(21, 26, 36, 0.95));
        padding: 10px 12px;
      }

      .title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .tag {
        display: inline-flex;
        align-items: center;
        border: 1px solid rgba(255, 109, 45, 0.5);
        background: rgba(255, 109, 45, 0.18);
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 11px;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      .title {
        margin: 0;
        font-size: 1rem;
      }

      .subtitle {
        margin: 5px 0 0;
        color: var(--muted);
        font-size: 13px;
      }

      .toolbar {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .btn {
        border: 1px solid var(--stroke);
        background: #141b29;
        color: var(--ink);
        border-radius: 10px;
        padding: 7px 11px;
        font-size: 12px;
        cursor: pointer;
      }

      .btn.active {
        border-color: rgba(255, 109, 45, 0.75);
        box-shadow: inset 0 0 0 1px rgba(255, 109, 45, 0.35);
      }

      .btn.btn-secondary {
        background: #101623;
        color: #d1dbee;
      }

      .hidden-lines {
        margin-top: 8px;
        display: none;
        gap: 6px;
        flex-wrap: wrap;
      }

      .hidden-lines.visible {
        display: flex;
      }

      .chip {
        border: 1px dashed #566b8e;
        background: #0f1828;
        color: #c7d4ec;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 11px;
        cursor: pointer;
      }

      .canvas-panel {
        flex: 1 1 auto;
        border: 1px solid var(--stroke);
        border-radius: 12px;
        background:
          linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px) 0 0 / 24px 24px,
          linear-gradient(0deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px) 0 0 / 24px 24px,
          #0d121c;
        overflow: hidden;
        position: relative;
      }

      .canvas-viewport {
        position: absolute;
        inset: 0;
      }

      .scene {
        position: absolute;
        transform-origin: top left;
      }

      .edges {
        position: absolute;
        inset: 0;
      }

      .edge-item {
        cursor: pointer;
      }

      .edge-item path.edge-path {
        pointer-events: stroke;
      }

      .node {
        position: absolute;
        border: 1px solid #42526f;
        border-radius: 10px;
        background: #1e2738;
        box-shadow: 0 10px 22px rgba(0, 0, 0, 0.45);
        overflow: hidden;
        cursor: grab;
        user-select: none;
        touch-action: none;
      }

      .node.dragging {
        cursor: grabbing;
        border-color: #ffb58f;
      }

      .node-head {
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 8px;
        border-bottom: 1px solid #3f4f69;
        background: linear-gradient(90deg, rgba(255, 109, 45, 0.24), rgba(255, 109, 45, 0.05));
      }

      .node-kind {
        font-family: "JetBrains Mono", monospace;
        font-size: 11px;
        color: #ffd9c8;
      }

      .node-body {
        padding: 8px;
      }

      .node-title {
        margin: 0 0 3px;
        font-size: 13px;
      }

      .node-sub {
        margin: 0;
        color: #a7bcda;
        font-size: 12px;
        line-height: 1.3;
      }
    </style>
  </head>
  <body>
    <div class="app">
      <section class="topbar">
        <div class="title-row">
          <span class="tag">n8n-like canvas</span>
          <h1 class="title" id="wf-title">Workflow</h1>
        </div>
        <p class="subtitle" id="wf-subtitle">Carga...</p>
        <div class="toolbar" id="toolbar"></div>
        <div class="hidden-lines" id="hidden-lines"></div>
      </section>
      <section class="canvas-panel" id="canvas-host"></section>
    </div>

    <script>
      var LAYOUT_KEY = "n8n_layout_overrides_v2";
      var HIDDEN_EDGES_KEY = "n8n_hidden_edges_v2";

      var payload = null;
      var activeWorkflowId = null;
      var layoutOverrides = {};
      var hiddenEdgeOverrides = {};
      var currentScale = 1;
      var fitSceneFn = function () {};

      var toolbar = document.getElementById("toolbar");
      var hiddenLines = document.getElementById("hidden-lines");
      var wfTitle = document.getElementById("wf-title");
      var wfSubtitle = document.getElementById("wf-subtitle");
      var canvasHost = document.getElementById("canvas-host");

      function clamp(value, min, max) {
        return Math.max(min, Math.min(max, Math.round(value)));
      }

      function escapeHtml(value) {
        return String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\\"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function safeParse(raw, fallback) {
        try {
          var parsed = JSON.parse(raw || "");
          return parsed && typeof parsed === "object" ? parsed : fallback;
        } catch (_error) {
          return fallback;
        }
      }

      function saveLayout() {
        try {
          localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutOverrides));
        } catch (_error) {}
      }

      function saveHiddenEdges() {
        try {
          localStorage.setItem(HIDDEN_EDGES_KEY, JSON.stringify(hiddenEdgeOverrides));
        } catch (_error) {}
      }

      function getWorkflow() {
        var workflows = (payload && payload.workflows) || [];
        return workflows.find(function (wf) { return wf.id === activeWorkflowId; }) || workflows[0] || null;
      }

      function edgeKey(edge) {
        return edge.from + "|" + edge.to + "|" + (edge.label || "");
      }

      function getWorkflowLayoutMap(workflowId) {
        if (!layoutOverrides[workflowId]) {
          layoutOverrides[workflowId] = {};
        }
        return layoutOverrides[workflowId];
      }

      function getWorkflowHiddenMap(workflowId) {
        if (!hiddenEdgeOverrides[workflowId]) {
          hiddenEdgeOverrides[workflowId] = {};
        }
        return hiddenEdgeOverrides[workflowId];
      }

      function applyNodeLayout(wf) {
        var map = getWorkflowLayoutMap(wf.id);
        var width = (wf.canvas && wf.canvas.width) || 1200;
        var height = (wf.canvas && wf.canvas.height) || 560;
        return (wf.nodes || []).map(function (n) {
          var ov = map[n.id] || {};
          var x = typeof ov.x === "number" ? ov.x : n.x;
          var y = typeof ov.y === "number" ? ov.y : n.y;
          return {
            id: n.id,
            title: n.title,
            subtitle: n.subtitle,
            kind: n.kind,
            w: n.w,
            h: n.h,
            x: clamp(x, 0, Math.max(0, width - n.w)),
            y: clamp(y, 0, Math.max(0, height - n.h))
          };
        });
      }

      function mapById(nodes) {
        var map = {};
        nodes.forEach(function (n) { map[n.id] = n; });
        return map;
      }

      function edgePath(from, to) {
        var fromRight = to.x >= from.x;
        var sx = fromRight ? (from.x + from.w) : from.x;
        var sy = from.y + (from.h / 2);
        var ex = fromRight ? to.x : (to.x + to.w);
        var ey = to.y + (to.h / 2);
        var spread = Math.max(80, Math.abs(ex - sx) * 0.45);
        var c1x = fromRight ? sx + spread : sx - spread;
        var c2x = fromRight ? ex - spread : ex + spread;
        return "M " + sx + " " + sy + " C " + c1x + " " + sy + ", " + c2x + " " + ey + ", " + ex + " " + ey;
      }

      function renderToolbar() {
        var wf = getWorkflow();
        if (!wf) return;

        var workflows = payload.workflows || [];
        var html = workflows.map(function (item) {
          var active = item.id === wf.id ? "active" : "";
          return '<button class="btn ' + active + '" data-action="switch" data-id="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + '</button>';
        }).join("");

        html += '<button class="btn btn-secondary" data-action="reset-nodes">Reset nodos</button>';
        html += '<button class="btn btn-secondary" data-action="restore-lines">Restaurar lineas</button>';

        toolbar.innerHTML = html;

        Array.from(toolbar.querySelectorAll(".btn")).forEach(function (btn) {
          btn.addEventListener("click", function () {
            var action = btn.dataset.action;
            if (action === "switch") {
              activeWorkflowId = btn.dataset.id;
              renderAll();
              return;
            }
            if (action === "reset-nodes") {
              delete layoutOverrides[wf.id];
              saveLayout();
              renderAll();
              return;
            }
            if (action === "restore-lines") {
              delete hiddenEdgeOverrides[wf.id];
              saveHiddenEdges();
              renderAll();
            }
          });
        });
      }

      function renderHiddenLineChips(wf) {
        var hiddenMap = getWorkflowHiddenMap(wf.id);
        var hiddenEdges = (wf.edges || []).filter(function (edge) {
          return hiddenMap[edgeKey(edge)];
        });

        if (!hiddenEdges.length) {
          hiddenLines.classList.remove("visible");
          hiddenLines.innerHTML = "";
          return;
        }

        hiddenLines.classList.add("visible");
        hiddenLines.innerHTML = hiddenEdges.map(function (edge) {
          var key = edgeKey(edge);
          var label = (edge.label || "linea") + " ↺";
          return '<button class="chip" data-key="' + escapeHtml(key) + '">' + escapeHtml(label) + '</button>';
        }).join("");

        Array.from(hiddenLines.querySelectorAll(".chip")).forEach(function (chip) {
          chip.addEventListener("click", function () {
            var key = chip.dataset.key;
            delete hiddenMap[key];
            saveHiddenEdges();
            renderAll();
          });
        });
      }

      function renderCanvas() {
        var wf = getWorkflow();
        if (!wf) {
          canvasHost.innerHTML = "<p>No workflow data.</p>";
          return;
        }

        activeWorkflowId = wf.id;
        wfTitle.textContent = wf.name;
        wfSubtitle.textContent = wf.description || "";

        var width = (wf.canvas && wf.canvas.width) || 1200;
        var height = (wf.canvas && wf.canvas.height) || 560;
        var hiddenMap = getWorkflowHiddenMap(wf.id);
        var nodes = applyNodeLayout(wf);
        var nodeMap = mapById(nodes);
        var visibleEdges = (wf.edges || []).filter(function (edge) {
          return !hiddenMap[edgeKey(edge)];
        });

        var nodeHtml = nodes.map(function (n) {
          return (
            '<article class="node" data-id="' + escapeHtml(n.id) + '" style="left:' + n.x + 'px;top:' + n.y + 'px;width:' + n.w + 'px;height:' + n.h + 'px;">' +
              '<div class="node-head"><span class="node-kind">' + escapeHtml(n.kind) + '</span><span class="node-kind">id:' + escapeHtml(n.id) + '</span></div>' +
              '<div class="node-body"><h4 class="node-title">' + escapeHtml(n.title) + '</h4><p class="node-sub">' + escapeHtml(n.subtitle || "") + '</p></div>' +
            '</article>'
          );
        }).join("");

        canvasHost.innerHTML =
          '<div class="canvas-viewport" id="canvas-viewport">' +
            '<div class="scene" id="scene" style="width:' + width + 'px;height:' + height + 'px;">' +
              '<svg class="edges" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">' +
                '<defs>' +
                  '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">' +
                    '<path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,210,194,0.85)" />' +
                  '</marker>' +
                '</defs>' +
                '<g id="edge-layer"></g>' +
              '</svg>' +
              nodeHtml +
            '</div>' +
          '</div>';

        var viewport = document.getElementById("canvas-viewport");
        var scene = document.getElementById("scene");
        var edgeLayer = document.getElementById("edge-layer");

        function redrawEdges() {
          edgeLayer.innerHTML = visibleEdges.map(function (edge) {
            var from = nodeMap[edge.from];
            var to = nodeMap[edge.to];
            if (!from || !to) return "";
            var d = edgePath(from, to);
            var midX = (from.x + to.x + from.w) / 2;
            var midY = (from.y + to.y + from.h) / 2;
            var key = edgeKey(edge);
            return (
              '<g class="edge-item" data-key="' + escapeHtml(key) + '">' +
                '<path class="edge-path" d="' + d + '" stroke="rgba(255,210,194,0.62)" stroke-width="2" fill="none" marker-end="url(#arrow)"></path>' +
                '<rect x="' + (midX - 58) + '" y="' + (midY - 11) + '" width="116" height="18" rx="8" fill="rgba(17,24,39,0.95)"></rect>' +
                '<text x="' + midX + '" y="' + (midY + 1) + '" text-anchor="middle" fill="#ffd8c8" font-size="11" font-family="JetBrains Mono">' + escapeHtml(edge.label || "") + '</text>' +
              '</g>'
            );
          }).join("");

          Array.from(edgeLayer.querySelectorAll(".edge-item")).forEach(function (item) {
            item.addEventListener("click", function () {
              var key = item.dataset.key;
              hiddenMap[key] = true;
              saveHiddenEdges();
              renderAll();
            });
          });
        }

        function fitScene() {
          var pad = 18;
          var vw = Math.max(100, viewport.clientWidth - (pad * 2));
          var vh = Math.max(100, viewport.clientHeight - (pad * 2));
          var sx = vw / width;
          var sy = vh / height;
          var scale = Math.min(sx, sy);
          scale = Math.max(0.22, Math.min(scale, 1));
          currentScale = scale;

          var scaledW = width * scale;
          var scaledH = height * scale;
          var tx = Math.round((viewport.clientWidth - scaledW) / 2);
          var ty = Math.round((viewport.clientHeight - scaledH) / 2);
          scene.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
        }

        fitSceneFn = fitScene;
        fitScene();
        redrawEdges();
        bindNodeDrag(wf, nodes, nodeMap, visibleEdges, redrawEdges, width, height);
      }

      function bindNodeDrag(wf, nodes, nodeMap, visibleEdges, redrawEdges, width, height) {
        var layoutMap = getWorkflowLayoutMap(wf.id);
        var nodeElements = Array.from(canvasHost.querySelectorAll(".node"));
        var drag = null;

        nodeElements.forEach(function (el) {
          el.addEventListener("pointerdown", function (event) {
            var nodeId = el.dataset.id;
            var node = nodeMap[nodeId];
            if (!node) return;

            drag = {
              id: nodeId,
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              originX: node.x,
              originY: node.y,
              el: el
            };

            el.classList.add("dragging");
            try { el.setPointerCapture(event.pointerId); } catch (_error) {}
            event.preventDefault();
          });

          el.addEventListener("pointermove", function (event) {
            if (!drag || drag.el !== el) return;
            var node = nodeMap[drag.id];
            if (!node) return;

            var dx = (event.clientX - drag.startX) / currentScale;
            var dy = (event.clientY - drag.startY) / currentScale;
            var maxX = Math.max(0, width - node.w);
            var maxY = Math.max(0, height - node.h);

            node.x = clamp(drag.originX + dx, 0, maxX);
            node.y = clamp(drag.originY + dy, 0, maxY);

            el.style.left = node.x + "px";
            el.style.top = node.y + "px";

            layoutMap[node.id] = { x: node.x, y: node.y };
            redrawEdges();
          });

          function endDrag() {
            if (!drag || drag.el !== el) return;
            try { el.releasePointerCapture(drag.pointerId); } catch (_error) {}
            el.classList.remove("dragging");
            drag = null;
            saveLayout();
          }

          el.addEventListener("pointerup", endDrag);
          el.addEventListener("pointercancel", endDrag);
          el.addEventListener("lostpointercapture", endDrag);
        });
      }

      function renderAll() {
        if (!payload) return;
        renderToolbar();
        renderHiddenLineChips(getWorkflow());
        renderCanvas();
      }

      window.addEventListener("resize", function () {
        fitSceneFn();
      });

      fetch("/api/flows")
        .then(function (res) { return res.json(); })
        .then(function (json) {
          payload = json;
          layoutOverrides = safeParse(localStorage.getItem(LAYOUT_KEY), {});
          hiddenEdgeOverrides = safeParse(localStorage.getItem(HIDDEN_EDGES_KEY), {});
          activeWorkflowId = ((json.workflows || [])[0] || {}).id || null;
          renderAll();
        })
        .catch(function () {
          canvasHost.innerHTML = '<p style="padding:20px;color:#ffb8b8;">No se pudo cargar /api/flows</p>';
        });
    </script>
  </body>
</html>`;
}

module.exports = {
  renderFlowDashboard
};
