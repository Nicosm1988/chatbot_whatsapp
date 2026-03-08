function renderControlCenterDashboard() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Control Center WhatsApp Bot</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    :root{--bg:#0a101d;--panel:#121c2f;--panel2:#0f1728;--stroke:#344967;--ink:#e9f0ff;--muted:#a9bad8;--accent:#ff6d2d}
    *{box-sizing:border-box} html,body{width:100%;height:100%;margin:0;overflow:hidden}
    body{font-family:Manrope,sans-serif;color:var(--ink);background:radial-gradient(circle at 8% -10%,rgba(255,109,45,.2),transparent 28%),var(--bg)}
    .app{height:100vh;display:grid;grid-template-columns:250px 1fr}
    .side{border-right:1px solid var(--stroke);background:linear-gradient(180deg,#131f34,#0f1728);padding:12px;display:grid;grid-template-rows:auto auto 1fr auto;gap:10px}
    .title{margin:0;font-size:15px}.sub{margin:0;color:var(--muted);font-size:12px}.tag{font-size:10px;letter-spacing:.08em;text-transform:uppercase;border:1px solid rgba(255,109,45,.55);background:rgba(255,109,45,.12);border-radius:999px;padding:3px 8px;display:inline-block}
    .nav{display:grid;gap:8px}.btn{border:1px solid var(--stroke);background:#101a2b;color:var(--ink);border-radius:9px;padding:9px 10px;text-align:left;font-size:12px;cursor:pointer}
    .btn.active{border-color:rgba(255,109,45,.9)}
    .stats{display:grid;gap:8px}.card{border:1px solid #3f567a;border-radius:10px;background:var(--panel2);padding:8px}.k{font-size:11px;color:var(--muted)}.v{font-size:18px;font-weight:700}
    .status{font-size:11px;color:var(--muted)}
    .main{min-width:0;display:grid;grid-template-rows:auto 1fr}
    .top{border-bottom:1px solid var(--stroke);padding:10px 12px;display:flex;align-items:center;gap:10px;justify-content:space-between}
    .frameWrap{min-height:0}.frame{width:100%;height:100%;border:0;background:#0b1323}
    .quick{display:flex;gap:8px;align-items:center}
    .link{border:1px solid var(--stroke);background:#111b2c;color:#dce8ff;border-radius:8px;padding:6px 9px;font-size:11px;text-decoration:none}
  </style>
</head>
<body>
  <main class="app">
    <aside class="side">
      <div>
        <span class="tag">cliente dashboard</span>
        <h1 class="title">Control Center</h1>
        <p class="sub">Todo centralizado: flujos, historial y pruebas.</p>
      </div>
      <nav class="nav">
        <button class="btn active" data-view="flows">Flujos</button>
        <button class="btn" data-view="conversations">Conversaciones</button>
        <button class="btn" data-view="tests">Pruebas</button>
      </nav>
      <section class="stats">
        <article class="card"><div class="k">Total conversaciones</div><div id="s-total" class="v">-</div></article>
        <article class="card"><div class="k">Abiertas</div><div id="s-open" class="v">-</div></article>
        <article class="card"><div class="k">Con asesor</div><div id="s-agent" class="v">-</div></article>
        <article class="card"><div class="k">Pruebas registradas</div><div id="s-tests" class="v">-</div></article>
      </section>
      <div class="status" id="status">Cargando...</div>
    </aside>
    <section class="main">
      <header class="top">
        <div>
          <strong id="view-title">Flujos</strong>
          <div class="sub" id="view-sub">Diseño de nodos y conexiones en tiempo real.</div>
        </div>
        <div class="quick">
          <a class="link" target="_blank" href="/flows">Abrir flujos</a>
          <a class="link" target="_blank" href="/conversations">Abrir historial</a>
          <button class="btn" id="b-refresh" style="padding:6px 10px">Actualizar métricas</button>
        </div>
      </header>
      <div class="frameWrap"><iframe id="frame" class="frame" src="/flows"></iframe></div>
    </section>
  </main>
  <script>
    var views={
      flows:{src:"/flows",title:"Flujos",sub:"Diseño de nodos y conexiones en tiempo real."},
      conversations:{src:"/conversations",title:"Conversaciones",sub:"Timeline completa de cada chat con resolución."},
      tests:{src:"/conversations?tag=test_run",title:"Pruebas",sub:"Registro histórico de pruebas y validaciones."}
    };
    var frame=document.getElementById("frame"),statusEl=document.getElementById("status"),viewTitle=document.getElementById("view-title"),viewSub=document.getElementById("view-sub");
    var sTotal=document.getElementById("s-total"),sOpen=document.getElementById("s-open"),sAgent=document.getElementById("s-agent"),sTests=document.getElementById("s-tests");
    function setStatus(t){statusEl.textContent=t}
    function activate(view){
      var meta=views[view]||views.flows;
      frame.src=meta.src;viewTitle.textContent=meta.title;viewSub.textContent=meta.sub;
      Array.from(document.querySelectorAll("[data-view]")).forEach(function(b){b.classList.toggle("active",b.getAttribute("data-view")===view)});
    }
    async function loadSummary(){
      setStatus("Actualizando métricas...");
      try{
        var res=await fetch("/api/conversations/summary",{cache:"no-store"});
        if(!res.ok)throw new Error("status_"+res.status);
        var s=await res.json();
        sTotal.textContent=String(s.total||0);sOpen.textContent=String(s.open||0);sAgent.textContent=String(s.agentPending||0);sTests.textContent=String(s.testRuns||0);
        setStatus("Último evento: "+(s.lastEventAt?new Date(s.lastEventAt).toLocaleString("es-AR"):"-"));
      }catch(err){
        setStatus("Error de métricas");
        console.error(err);
      }
    }
    Array.from(document.querySelectorAll("[data-view]")).forEach(function(b){b.onclick=function(){activate(b.getAttribute("data-view"))}});
    document.getElementById("b-refresh").onclick=function(){loadSummary()};
    activate("flows");
    loadSummary();
    setInterval(loadSummary,45000);
  </script>
</body>
</html>`;
}

module.exports = {
  renderControlCenterDashboard
};

