function renderFlowDashboard() {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Flow Studio - WhatsApp Bot</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
      :root {
        --bg-0: #06111f;
        --bg-1: #0e1f35;
        --panel: rgba(8, 21, 37, 0.82);
        --stroke: rgba(126, 167, 211, 0.26);
        --ink: #e6f6ff;
        --muted: #9fc0db;
        --accent: #27d8a5;
        --accent-2: #ffb95d;
        --danger: #ff7d7d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: var(--ink);
        font-family: "Space Grotesk", sans-serif;
        background:
          radial-gradient(1000px 500px at 5% 0%, rgba(39, 216, 165, 0.16), transparent 40%),
          radial-gradient(900px 420px at 100% 10%, rgba(255, 185, 93, 0.14), transparent 45%),
          linear-gradient(155deg, var(--bg-0) 0%, var(--bg-1) 100%);
        min-height: 100vh;
      }
      .wrap {
        width: min(1180px, 94vw);
        margin: 0 auto;
        padding: 36px 0 44px;
      }
      .hero {
        border: 1px solid var(--stroke);
        background: linear-gradient(140deg, rgba(7, 25, 43, 0.94), rgba(5, 16, 30, 0.85));
        border-radius: 18px;
        padding: 22px;
        box-shadow: 0 25px 65px rgba(0, 0, 0, 0.35);
      }
      .badge {
        display: inline-block;
        border-radius: 999px;
        border: 1px solid rgba(39, 216, 165, 0.4);
        background: rgba(39, 216, 165, 0.12);
        color: #bcffe9;
        padding: 4px 10px;
        font-size: 12px;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 10px 0 8px;
        font-size: clamp(1.5rem, 3.3vw, 2.4rem);
        line-height: 1.1;
      }
      .subtitle {
        color: var(--muted);
        margin: 0;
        max-width: 70ch;
      }
      .tabs {
        margin-top: 20px;
        display: flex;
        gap: 10px;
      }
      .tab {
        border: 1px solid var(--stroke);
        background: rgba(8, 21, 37, 0.8);
        color: var(--ink);
        border-radius: 10px;
        padding: 10px 14px;
        cursor: pointer;
        font-family: inherit;
      }
      .tab.active {
        border-color: rgba(39, 216, 165, 0.62);
        box-shadow: inset 0 0 0 1px rgba(39, 216, 165, 0.26);
      }
      .grid {
        margin-top: 18px;
        display: grid;
        gap: 16px;
        grid-template-columns: 1.55fr 1fr;
      }
      .panel {
        border: 1px solid var(--stroke);
        border-radius: 16px;
        background: var(--panel);
        padding: 16px;
      }
      .section-title {
        margin: 0 0 12px;
        font-size: 0.98rem;
        text-transform: uppercase;
        letter-spacing: .08em;
        color: #9ac8ea;
      }
      .timeline {
        display: grid;
        gap: 10px;
      }
      .node {
        border: 1px solid rgba(126, 167, 211, 0.22);
        background: rgba(9, 25, 43, 0.82);
        border-radius: 12px;
        padding: 12px;
        animation: rise .5s ease both;
      }
      .node:nth-child(2) { animation-delay: .05s; }
      .node:nth-child(3) { animation-delay: .1s; }
      .node:nth-child(4) { animation-delay: .15s; }
      .node:nth-child(5) { animation-delay: .2s; }
      .node:nth-child(6) { animation-delay: .25s; }
      .node:nth-child(7) { animation-delay: .3s; }
      .node:nth-child(8) { animation-delay: .35s; }
      .node:nth-child(9) { animation-delay: .4s; }
      .node:nth-child(10) { animation-delay: .45s; }
      .node-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .node-title {
        margin: 0;
        font-size: 1rem;
      }
      .kind {
        font-family: "IBM Plex Mono", monospace;
        font-size: 11px;
        color: var(--accent);
        border: 1px solid rgba(39, 216, 165, 0.4);
        border-radius: 999px;
        padding: 1px 8px;
      }
      .node p {
        margin: 8px 0 0;
        color: #bad5ea;
      }
      .flowline {
        margin: 8px 0 4px 2px;
        color: #8bb4d6;
        font-size: 12px;
      }
      .future-grid {
        display: grid;
        gap: 10px;
      }
      .future-card {
        border: 1px solid rgba(126, 167, 211, 0.22);
        border-radius: 12px;
        background: rgba(9, 25, 43, 0.82);
        padding: 12px;
      }
      .future-status {
        font-family: "IBM Plex Mono", monospace;
        font-size: 11px;
        border-radius: 999px;
        padding: 2px 8px;
        border: 1px solid rgba(255, 185, 93, 0.5);
        color: #ffd6a0;
      }
      .meta-list {
        display: grid;
        gap: 8px;
      }
      .meta-row {
        border: 1px solid rgba(126, 167, 211, 0.2);
        border-radius: 10px;
        padding: 10px;
      }
      .meta-key {
        font-size: 12px;
        color: #8eb7d8;
        text-transform: uppercase;
        letter-spacing: .06em;
      }
      .meta-val {
        margin-top: 5px;
        font-family: "IBM Plex Mono", monospace;
        font-size: 13px;
        word-break: break-word;
      }
      @keyframes rise {
        from { transform: translateY(8px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @media (max-width: 940px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="hero">
        <span class="badge">Flow Studio</span>
        <h1>WhatsApp Bot Architecture Map</h1>
        <p class="subtitle">
          Vista viva del flujo actual y del roadmap futuro para presentar al cliente en cualquier momento.
        </p>
        <div class="tabs">
          <button class="tab active" data-tab="current">Flujo Actual</button>
          <button class="tab" data-tab="future">Flujos Futuros</button>
        </div>
      </section>

      <section class="grid">
        <article class="panel">
          <h2 class="section-title" id="left-title">Flujo Actual</h2>
          <div id="left-content"></div>
        </article>
        <aside class="panel">
          <h2 class="section-title">Arquitectura</h2>
          <div class="meta-list" id="meta"></div>
        </aside>
      </section>
    </div>

    <script>
      const tabs = Array.from(document.querySelectorAll(".tab"));
      const leftTitle = document.getElementById("left-title");
      const leftContent = document.getElementById("left-content");
      const meta = document.getElementById("meta");
      let payload = null;
      let activeTab = "current";

      function row(label, value) {
        return '<div class="meta-row"><div class="meta-key">' + label + '</div><div class="meta-val">' + value + '</div></div>';
      }

      function renderMeta(data) {
        const a = data.architecture || {};
        const endpoints = (a.apiEndpoints || []).join("  |  ");
        meta.innerHTML =
          row("runtime", a.runtime || "-") +
          row("state model", a.stateModel || "-") +
          row("channels", (a.channels || []).join(", ")) +
          row("deployment", a.deployment || "-") +
          row("api endpoints", endpoints || "-") +
          row("updated at", data.updatedAt || "-");
      }

      function renderCurrent(data) {
        const nodes = (data.currentFlow && data.currentFlow.nodes) || [];
        const transitions = (data.currentFlow && data.currentFlow.transitions) || [];
        const transitionMap = {};
        transitions.forEach(function (t) {
          transitionMap[t.from] = transitionMap[t.from] || [];
          transitionMap[t.from].push(t);
        });

        leftTitle.textContent = "Flujo Actual";
        leftContent.innerHTML = '<div class="timeline">' + nodes.map(function (n, idx) {
          const links = transitionMap[n.id] || [];
          const next = links.length
            ? '<div class="flowline">' + links.map(function (x) { return x.label + " -> " + x.to; }).join(" | ") + '</div>'
            : "";
          return (
            '<article class="node">' +
              '<div class="node-head"><h3 class="node-title">' + (idx + 1) + ". " + n.title + '</h3><span class="kind">' + n.kind + '</span></div>' +
              '<p>' + n.detail + '</p>' +
              next +
            '</article>'
          );
        }).join("") + '</div>';
      }

      function renderFuture(data) {
        const future = data.futureFlows || [];
        leftTitle.textContent = "Roadmap Futuro";
        leftContent.innerHTML = '<div class="future-grid">' + future.map(function (f) {
          return (
            '<article class="future-card">' +
              '<div class="node-head"><h3 class="node-title">' + f.title + '</h3><span class="future-status">' + f.status + '</span></div>' +
              '<p>' + f.detail + '</p>' +
            '</article>'
          );
        }).join("") + '</div>';
      }

      function render() {
        if (!payload) return;
        tabs.forEach(function (tab) {
          tab.classList.toggle("active", tab.dataset.tab === activeTab);
        });
        renderMeta(payload);
        if (activeTab === "current") renderCurrent(payload);
        else renderFuture(payload);
      }

      tabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
          activeTab = tab.dataset.tab;
          render();
        });
      });

      fetch("/api/flows")
        .then(function (res) { return res.json(); })
        .then(function (json) {
          payload = json;
          render();
        })
        .catch(function () {
          leftContent.innerHTML = '<p style="color:#ffb5b5">No se pudo cargar /api/flows.</p>';
        });
    </script>
  </body>
</html>`;
}

module.exports = {
  renderFlowDashboard
};
