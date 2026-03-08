function renderFlowClientDashboard() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mapa de Flujos</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>
    :root{
      --bg:#070b14;
      --surface:#101a2d;
      --surface-2:#15233a;
      --ink:#ecf3ff;
      --muted:#9db0cc;
      --stroke:#263c5c;
      --line:#5f8dc4;
      --node-stroke:#36567f;
      --node-shadow:rgba(0,0,0,.35);
      --brand:#39a7ff;
    }
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;overflow:hidden}
    body{
      font-family:Manrope,sans-serif;
      background:
        radial-gradient(circle at 12% -20%,rgba(57,167,255,.25),transparent 40%),
        radial-gradient(circle at 78% 120%,rgba(57,167,255,.12),transparent 45%),
        var(--bg);
      color:var(--ink);
    }
    .app{height:100vh;display:grid;grid-template-rows:auto 1fr;gap:10px;padding:10px}
    .top{background:var(--surface);border:1px solid var(--stroke);border-radius:14px;padding:10px;display:grid;gap:8px}
    .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .title{margin:0;font-size:19px}
    .sub{margin:0;color:var(--muted);font-size:13px}
    .tag{
      font-size:10px;
      letter-spacing:.08em;
      text-transform:uppercase;
      border:1px solid rgba(57,167,255,.45);
      background:rgba(57,167,255,.14);
      border-radius:999px;
      padding:3px 8px;
      color:#9fd6ff;
    }
    .tabs{display:flex;gap:8px;flex-wrap:wrap}
    .btn{
      border:1px solid var(--stroke);
      background:var(--surface-2);
      color:var(--ink);
      border-radius:10px;
      padding:7px 10px;
      font-size:12px;
      cursor:pointer;
    }
    .btn.active{border-color:#6dc5ff;box-shadow:0 0 0 1px rgba(109,197,255,.28) inset}
    .btn:hover{border-color:#4f79ac}
    .status{margin-left:auto;font-size:12px;color:var(--muted)}
    .canvas{
      position:relative;
      border:1px solid var(--stroke);
      border-radius:14px;
      background:
        linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px) 0 0/26px 26px,
        linear-gradient(0deg,rgba(255,255,255,.04) 1px,transparent 1px) 0 0/26px 26px,
        #0d1524;
      overflow:hidden;
    }
    .vp{position:absolute;inset:0;overflow:hidden}
    .scene{position:absolute;transform-origin:top left}
    .edges{position:absolute;inset:0}
    .line{stroke:var(--line);stroke-width:2.2;fill:none}
    .node{
      position:absolute;
      border:1px solid var(--node-stroke);
      background:linear-gradient(180deg,#1b2c47,#13233a);
      border-radius:12px;
      box-shadow:0 12px 22px var(--node-shadow);
      padding:10px;
    }
    .nt{margin:0 0 4px;font-size:13px;font-weight:700}
    .ns{margin:0 0 6px;color:#b5c9e4;font-size:12px}
    .ne{margin:0;color:#deebff;font-size:12px;line-height:1.35}
  </style>
</head>
<body>
  <main class="app">
    <section class="top">
      <div class="row"><span class="tag">cliente</span><h1 class="title">Mapa de Flujos</h1><span id="status" class="status">Cargando...</span></div>
      <p class="sub" id="wf-desc">Resumen visual de todos los caminos de atencion.</p>
      <div id="tabs" class="tabs"></div>
    </section>
    <section class="canvas">
      <div id="vp" class="vp">
        <div id="scene" class="scene">
          <svg id="svg" class="edges"><g id="edge-layer"></g></svg>
          <div id="node-layer"></div>
        </div>
      </div>
    </section>
  </main>
  <script>
    var payload=null,active=null,scale=1,panX=0,panY=0;
    var tabs=document.getElementById("tabs");
    var statusEl=document.getElementById("status");
    var wfDesc=document.getElementById("wf-desc");
    var vp=document.getElementById("vp");
    var scene=document.getElementById("scene");
    var svg=document.getElementById("svg");
    var edgeLayer=document.getElementById("edge-layer");
    var nodeLayer=document.getElementById("node-layer");

    function esc(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
    function setStatus(t){statusEl.textContent=t;}
    function getWf(){var arr=(payload&&payload.workflows)||[];return arr.find(function(w){return w.id===active;})||arr[0]||null;}
    function path(a,b){
      var right=b.x>=a.x;
      var sx=right?(a.x+a.w):a.x;
      var sy=a.y+(a.h/2);
      var ex=right?b.x:(b.x+b.w);
      var ey=b.y+(b.h/2);
      var spread=Math.max(85,Math.abs(ex-sx)*0.45);
      var c1=right?(sx+spread):(sx-spread);
      var c2=right?(ex-spread):(ex+spread);
      return "M "+sx+" "+sy+" C "+c1+" "+sy+", "+c2+" "+ey+", "+ex+" "+ey;
    }

    function fit(wf){
      var nodes=wf.nodes||[];
      if(!nodes.length)return;
      var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      nodes.forEach(function(n){
        minX=Math.min(minX,n.x);
        minY=Math.min(minY,n.y);
        maxX=Math.max(maxX,n.x+n.w);
        maxY=Math.max(maxY,n.y+n.h);
      });
      var pad=80;
      var cw=(maxX-minX)+(pad*2);
      var ch=(maxY-minY)+(pad*2);
      var vw=Math.max(260,vp.clientWidth);
      var vh=Math.max(260,vp.clientHeight);
      scale=Math.max(0.24,Math.min(1.25,Math.min(vw/cw,vh/ch)));
      panX=Math.round((vw-(cw*scale))/2-((minX-pad)*scale));
      panY=Math.round((vh-(ch*scale))/2-((minY-pad)*scale));
      scene.style.transform="translate("+panX+"px,"+panY+"px) scale("+scale+")";
    }

    function renderTabs(){
      var arr=(payload&&payload.workflows)||[];
      tabs.innerHTML=arr.map(function(w){
        return '<button class="btn '+(w.id===active?'active':'')+'" data-w="'+esc(w.id)+'">'+esc(w.name)+'</button>';
      }).join("");
      Array.from(tabs.querySelectorAll("[data-w]")).forEach(function(b){
        b.onclick=function(){active=b.getAttribute("data-w");render();};
      });
    }

    function render(){
      var wf=getWf();
      if(!wf){return;}
      wfDesc.textContent=wf.description||"";
      var map={};
      (wf.nodes||[]).forEach(function(n){map[n.id]=n;});
      var width=Math.max(Number(wf.canvas&&wf.canvas.width||1200),1200);
      var height=Math.max(Number(wf.canvas&&wf.canvas.height||700),700);
      scene.style.width=width+"px";
      scene.style.height=height+"px";
      svg.setAttribute("viewBox","0 0 "+width+" "+height);

      edgeLayer.innerHTML=(wf.edges||[])
        .filter(function(e){return !e.disabled;})
        .map(function(e){
          var a=map[e.from],b=map[e.to];
          if(!a||!b)return "";
          return '<path class="line" d="'+esc(path(a,b))+'"></path>';
        })
        .join("");

      nodeLayer.innerHTML=(wf.nodes||[]).map(function(n){
        return '<article class="node" style="left:'+n.x+'px;top:'+n.y+'px;width:'+n.w+'px;height:'+n.h+'px">'+
          '<h3 class="nt">'+esc(n.title||"Paso")+'</h3>'+
          '<p class="ns">'+esc(n.subtitle||"")+'</p>'+
          '<p class="ne">'+esc(n.explain||"")+'</p>'+
        '</article>';
      }).join("");

      renderTabs();
      fit(wf);
      setStatus("Mostrando " + (wf.nodes||[]).length + " pasos");
    }

    async function load(){
      setStatus("Cargando flujo...");
      try{
        var res=await fetch("/api/flows",{cache:"no-store"});
        if(!res.ok)throw new Error("status_"+res.status);
        payload=await res.json();
        active=(((payload.workflows||[])[0]||{}).id||null);
        render();
      }catch(err){
        setStatus("Error al cargar");
        console.error(err);
      }
    }

    window.onresize=function(){var wf=getWf();if(wf)fit(wf);};
    load();
  </script>
</body>
</html>`;
}

module.exports = {
  renderFlowClientDashboard
};
