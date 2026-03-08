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
    :root{--bg:#f2f6fd;--panel:#fff;--panel2:#f8fbff;--stroke:#d5e0f1;--ink:#162338;--muted:#5f718f}
    *{box-sizing:border-box} html,body{width:100%;height:100%;margin:0;overflow:hidden}
    body{font-family:Manrope,sans-serif;color:var(--ink);background:radial-gradient(circle at 8% -10%,rgba(15,98,254,.14),transparent 30%),var(--bg)}
    .app{height:100vh;display:grid;grid-template-columns:280px 1fr}
    .side{border-right:1px solid var(--stroke);background:linear-gradient(180deg,#fbfdff,#f4f8ff);padding:12px;display:grid;grid-template-rows:auto auto 1fr auto;gap:10px}
    .title{margin:0;font-size:18px}.sub{margin:0;color:var(--muted);font-size:12px}
    .tag{font-size:10px;letter-spacing:.08em;text-transform:uppercase;border:1px solid #bdd1f4;background:#edf4ff;border-radius:999px;padding:3px 8px;display:inline-block;color:#2d5ea8}
    .nav{display:grid;gap:8px}.btn{border:1px solid var(--stroke);background:#fff;color:var(--ink);border-radius:10px;padding:10px 11px;text-align:left;font-size:13px;cursor:pointer}
    .btn:hover{border-color:#b1c7ed}.btn.active{border-color:#7ca5ea;box-shadow:0 0 0 2px #eaf1ff inset}
    .stats{display:grid;gap:8px}.card{border:1px solid #d3e1f8;border-radius:11px;background:var(--panel2);padding:9px}.k{font-size:11px;color:var(--muted)}.v{font-size:20px;font-weight:700}
    .status{font-size:11px;color:var(--muted)}
    .main{min-width:0;display:grid;grid-template-rows:auto 1fr}
    .top{border-bottom:1px solid var(--stroke);background:#fff;padding:10px 12px;display:flex;align-items:center;gap:10px;justify-content:space-between}
    .frameWrap{min-height:0}.frame{width:100%;height:100%;border:0;background:#f7faff}
    .quick{display:flex;gap:8px;align-items:center}
    .link{border:1px solid var(--stroke);background:#fff;color:#1b2d4a;border-radius:8px;padding:6px 9px;font-size:11px;text-decoration:none}
  </style>
</head>
<body>
  <main class="app">
    <aside class="side">
      <div>
        <span class="tag">cliente</span>
        <h1 class="title">Tablero del Cliente</h1>
        <p class="sub">Operación, seguimiento y pruebas en un solo lugar.</p>
      </div>
      <nav class="nav">
        <button class="btn active" data-view="flows">Mapa de Atención</button>
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
          <strong id="view-title">Mapa de Atención</strong>
          <div class="sub" id="view-sub">Recorrido visual del servicio para el cliente.</div>
        </div>
        <div class="quick">
          <a class="link" target="_blank" href="/flows/client">Abrir mapa</a>
          <a class="link" target="_blank" href="/conversations">Abrir casos</a>
          <button class="btn" id="b-refresh" style="padding:6px 10px">Actualizar datos</button>
        </div>
      </header>
      <div class="frameWrap"><iframe id="frame" class="frame" src="/flows/client"></iframe></div>
    </section>
  </main>

  <script>
    var views={
      flows:{src:"/flows/client",title:"Mapa de Atención",sub:"Recorrido visual del servicio para el cliente."},
      conversations:{src:"/conversations",title:"Casos de Clientes",sub:"Seguimiento claro de cada conversación y resolución."},
      tests:{src:"/conversations?tag=test_run",title:"Registro de Pruebas",sub:"Historial de pruebas y validaciones del equipo."}
    };

    var frame=document.getElementById("frame"),statusEl=document.getElementById("status"),viewTitle=document.getElementById("view-title"),viewSub=document.getElementById("view-sub");
    var sTotal=document.getElementById("s-total"),sOpen=document.getElementById("s-open"),sAgent=document.getElementById("s-agent"),sTests=document.getElementById("s-tests");

    function setStatus(text){statusEl.textContent=text;}

    function activate(view){
      var meta=views[view]||views.flows;
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
        var res=await fetch("/api/conversations/summary",{cache:"no-store"});
        if(!res.ok)throw new Error("status_"+res.status);
        var s=await res.json();
        sTotal.textContent=String(s.total||0);
        sOpen.textContent=String(s.open||0);
        sAgent.textContent=String(s.agentPending||0);
        sTests.textContent=String(s.testRuns||0);
        setStatus("Última actividad: "+(s.lastEventAt?new Date(s.lastEventAt).toLocaleString("es-AR"):"-"));
      }catch(err){
        setStatus("No se pudieron actualizar los datos");
        console.error(err);
      }
    }

    Array.from(document.querySelectorAll("[data-view]")).forEach(function(btn){
      btn.onclick=function(){activate(btn.getAttribute("data-view"));};
    });

    document.getElementById("b-refresh").onclick=function(){loadSummary();};

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

