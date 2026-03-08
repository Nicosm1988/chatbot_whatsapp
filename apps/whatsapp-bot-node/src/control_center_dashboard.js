function renderControlCenterDashboard() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tablero del Cliente</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>
    :root{
      --bg:#070b14;
      --panel:#0f1728;
      --panel-2:#121d31;
      --stroke:#243854;
      --ink:#ebf3ff;
      --muted:#9db0cc;
      --brand:#26a0ff;
      --brand-soft:rgba(38,160,255,.16);
      --ok:#26ca8d;
    }
    *{box-sizing:border-box}
    html,body{width:100%;height:100%;margin:0;overflow:hidden}
    body{
      font-family:Manrope,sans-serif;
      color:var(--ink);
      background:
        radial-gradient(circle at 10% -20%,rgba(38,160,255,.24),transparent 40%),
        radial-gradient(circle at 85% 120%,rgba(38,160,255,.12),transparent 45%),
        var(--bg);
    }
    .app{height:100vh;display:grid;grid-template-columns:300px 1fr}
    .side{
      border-right:1px solid var(--stroke);
      background:linear-gradient(180deg,#0f182a,#0b1323);
      padding:14px;
      display:grid;
      grid-template-rows:auto auto 1fr auto;
      gap:12px;
    }
    .title{margin:0;font-size:19px}
    .sub{margin:0;color:var(--muted);font-size:12px;line-height:1.45}
    .tag{
      font-size:10px;
      letter-spacing:.08em;
      text-transform:uppercase;
      border:1px solid rgba(38,160,255,.45);
      background:var(--brand-soft);
      border-radius:999px;
      padding:3px 8px;
      display:inline-block;
      color:#8fcbff;
    }
    .nav{display:grid;gap:8px}
    .btn{
      border:1px solid var(--stroke);
      background:#121e33;
      color:var(--ink);
      border-radius:10px;
      padding:10px 11px;
      text-align:left;
      font-size:13px;
      cursor:pointer;
      transition:border-color .16s ease, background .16s ease;
    }
    .btn:hover{border-color:#3d5f89;background:#15243e}
    .btn.active{border-color:#58b8ff;box-shadow:0 0 0 1px rgba(88,184,255,.35) inset}
    .stats{display:grid;gap:8px}
    .card{
      border:1px solid var(--stroke);
      border-radius:11px;
      background:var(--panel-2);
      padding:9px;
    }
    .k{font-size:11px;color:var(--muted)}
    .v{font-size:21px;font-weight:700}
    .status{font-size:11px;color:var(--muted)}
    .main{min-width:0;display:grid;grid-template-rows:auto 1fr}
    .top{
      border-bottom:1px solid var(--stroke);
      background:rgba(9,14,25,.9);
      backdrop-filter:blur(8px);
      padding:10px 12px;
      display:flex;
      align-items:center;
      gap:10px;
      justify-content:space-between;
    }
    .frameWrap{min-height:0;background:#060a12}
    .frame{width:100%;height:100%;border:0;background:#060a12}
    .quick{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .link{
      border:1px solid var(--stroke);
      background:#121e33;
      color:#d6e8ff;
      border-radius:8px;
      padding:6px 9px;
      font-size:11px;
      text-decoration:none;
    }
    .link:hover{border-color:#3d5f89}
    .live-dot{display:inline-block;width:8px;height:8px;border-radius:999px;background:var(--ok);margin-right:6px}
  </style>
</head>
<body>
  <main class="app">
    <aside class="side">
      <div>
        <span class="tag">cliente</span>
        <h1 class="title">Tablero Central</h1>
        <p class="sub">Operacion, seguimiento y pruebas del bot en un solo lugar.</p>
      </div>
      <nav class="nav">
        <button class="btn active" data-view="editor">Editor de Flujos (n8n)</button>
        <button class="btn" data-view="conversations">Casos de Clientes</button>
        <button class="btn" data-view="tests">Registro de Pruebas</button>
      </nav>
      <section class="stats">
        <article class="card"><div class="k">Total de casos</div><div id="s-total" class="v">-</div></article>
        <article class="card"><div class="k">Casos abiertos</div><div id="s-open" class="v">-</div></article>
        <article class="card"><div class="k">Con asesor</div><div id="s-agent" class="v">-</div></article>
        <article class="card"><div class="k">Pruebas guardadas</div><div id="s-tests" class="v">-</div></article>
      </section>
      <div class="status" id="status">Cargando...</div>
    </aside>

    <section class="main">
      <header class="top">
        <div>
          <strong id="view-title">Editor de Flujos (n8n)</strong>
          <div class="sub" id="view-sub">Aqui podes mover nodos, editar mensajes y conectar caminos.</div>
        </div>
        <div class="quick">
          <a class="link" target="_blank" href="/flows">Abrir editor</a>
          <a class="link" target="_blank" href="/conversations">Abrir casos</a>
          <button class="btn" id="b-refresh" style="padding:6px 10px"><span class="live-dot"></span>Actualizar datos</button>
        </div>
      </header>
      <div class="frameWrap"><iframe id="frame" class="frame" src="/flows"></iframe></div>
    </section>
  </main>

  <script>
    var views={
      editor:{src:"/flows",title:"Editor de Flujos (n8n)",sub:"Aqui podes mover nodos, editar mensajes y conectar caminos."},
      conversations:{src:"/conversations",title:"Casos de Clientes",sub:"Seguimiento claro de cada conversacion y resolucion."},
      tests:{src:"/conversations?tag=test_run",title:"Registro de Pruebas",sub:"Historial de pruebas y validaciones del equipo."}
    };

    var frame=document.getElementById("frame");
    var statusEl=document.getElementById("status");
    var viewTitle=document.getElementById("view-title");
    var viewSub=document.getElementById("view-sub");
    var sTotal=document.getElementById("s-total");
    var sOpen=document.getElementById("s-open");
    var sAgent=document.getElementById("s-agent");
    var sTests=document.getElementById("s-tests");
    var summaryAbortController = null;

    function setStatus(text){statusEl.textContent=text;}

    async function fetchJsonWithTimeout(url, timeoutMs){
      if(summaryAbortController){
        summaryAbortController.abort();
      }
      summaryAbortController = new AbortController();
      var timeout = setTimeout(function(){ summaryAbortController.abort(); }, timeoutMs);
      try{
        var res = await fetch(url,{cache:"no-store",signal:summaryAbortController.signal});
        if(!res.ok)throw new Error("status_"+res.status);
        return await res.json();
      } finally {
        clearTimeout(timeout);
      }
    }

    function activate(view){
      var meta=views[view]||views.editor;
      frame.src=meta.src;
      viewTitle.textContent=meta.title;
      viewSub.textContent=meta.sub;
      Array.from(document.querySelectorAll("[data-view]")).forEach(function(btn){
        btn.classList.toggle("active",btn.getAttribute("data-view")===view);
      });
    }

    async function loadSummary(){
      setStatus("Actualizando datos...");
      try{
        var s=await fetchJsonWithTimeout("/api/conversations/summary",9000);
        sTotal.textContent=String(s.total||0);
        sOpen.textContent=String(s.open||0);
        sAgent.textContent=String(s.agentPending||0);
        sTests.textContent=String(s.testRuns||0);
        setStatus("Ultima actividad: "+(s.lastEventAt?new Date(s.lastEventAt).toLocaleString("es-AR"):"-"));
      }catch(err){
        setStatus("No se pudieron actualizar los datos (timeout/conectividad)");
        console.error(err);
      }
    }

    Array.from(document.querySelectorAll("[data-view]")).forEach(function(btn){
      btn.onclick=function(){activate(btn.getAttribute("data-view"));};
    });

    document.getElementById("b-refresh").onclick=function(){loadSummary();};

    activate("editor");
    loadSummary();
    setInterval(loadSummary,45000);
  </script>
</body>
</html>`;
}

module.exports = {
  renderControlCenterDashboard
};
