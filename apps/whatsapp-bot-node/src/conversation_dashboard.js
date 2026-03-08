function renderConversationDashboard() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Historial de Conversaciones</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    :root{--bg:#0c1220;--panel:#121b2e;--stroke:#364c70;--ink:#e9f0ff;--muted:#a8b9d7;--accent:#ff6d2d}
    *{box-sizing:border-box} html,body{margin:0;width:100%;height:100%;overflow:hidden}
    body{font-family:Manrope,sans-serif;color:var(--ink);background:radial-gradient(circle at 5% -8%,rgba(255,109,45,.18),transparent 30%),var(--bg)}
    .app{height:100vh;display:grid;grid-template-rows:auto 1fr;gap:10px;padding:10px}
    .top{border:1px solid var(--stroke);border-radius:12px;background:linear-gradient(160deg,rgba(29,41,63,.95),rgba(16,22,34,.95));padding:10px;display:grid;gap:8px}
    .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.title{margin:0;font-size:16px}.sub{margin:0;color:var(--muted);font-size:12px}
    .tag{border:1px solid rgba(255,109,45,.55);background:rgba(255,109,45,.14);border-radius:999px;padding:3px 8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
    .status{margin-left:auto;color:var(--muted);font-size:12px}
    .btn,.in{border:1px solid var(--stroke);background:#10192a;color:var(--ink);border-radius:8px;padding:7px 10px;font-size:12px}
    .main{min-height:0;display:grid;grid-template-columns:360px 1fr;gap:10px}
    .panel{min-height:0;border:1px solid var(--stroke);border-radius:12px;background:var(--panel);overflow:hidden}
    .list{height:100%;overflow:auto;padding:8px;display:grid;gap:8px}
    .item{border:1px solid #425a81;border-radius:10px;background:#0f1829;padding:8px;cursor:pointer}
    .item:hover{border-color:#5a77a6}.item.active{border-color:rgba(255,109,45,.9)}
    .line{font-size:12px;color:var(--muted)} .head{display:flex;justify-content:space-between;gap:8px}.name{font-weight:700;font-size:13px}
    .badge{font-size:10px;padding:2px 6px;border-radius:999px;border:1px solid #5f7bab;background:#172642}
    .timeline{height:100%;overflow:auto;padding:10px;display:grid;gap:8px}
    .event{border:1px solid #415979;border-radius:10px;background:#101a2b;padding:8px}
    .etype{font-family:"JetBrains Mono",monospace;font-size:11px;color:#ffcfb8}.etime{font-size:11px;color:var(--muted)}
    .payload{margin-top:6px;white-space:pre-wrap;font-family:"JetBrains Mono",monospace;font-size:11px;color:#d6e4ff}
    .empty{color:var(--muted);padding:14px;font-size:13px}
    @media (max-width:980px){.main{grid-template-columns:1fr;grid-template-rows:45% 55%}}
  </style>
</head>
<body>
  <main class="app">
    <section class="top">
      <div class="row"><span class="tag">whatsapp audit trail</span><h1 class="title">Registro de Conversaciones</h1><span id="status" class="status">Cargando...</span></div>
      <p class="sub">Historial completo por conversación: mensajes, transiciones del flujo, resultado y resolución.</p>
      <div class="row">
        <input class="in" id="q-contact" placeholder="Filtrar por contacto (wa_id)" />
        <select class="in" id="q-status">
          <option value="">Todos</option>
          <option value="open">Abierto</option>
          <option value="agent_pending">Con asesor</option>
          <option value="closed">Cerrado</option>
        </select>
        <select class="in" id="q-tag">
          <option value="">Sin tag</option>
          <option value="test_run">Solo pruebas</option>
        </select>
        <button class="btn" id="b-refresh">Actualizar</button>
      </div>
    </section>
    <section class="main">
      <section class="panel"><div id="list" class="list"></div></section>
      <section class="panel"><div id="timeline" class="timeline"></div></section>
    </section>
  </main>
  <script>
    var currentId=null;
    var listEl=document.getElementById("list"),timelineEl=document.getElementById("timeline"),statusEl=document.getElementById("status");
    var qContact=document.getElementById("q-contact"),qStatus=document.getElementById("q-status"),qTag=document.getElementById("q-tag"),bRefresh=document.getElementById("b-refresh");
    function esc(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
    function setStatus(t){statusEl.textContent=t}
    function fmt(ts){try{return new Date(ts).toLocaleString("es-AR")}catch(_e){return ts||""}}
    function tone(s){if(s==="closed")return "#2ecb92";if(s==="agent_pending")return "#ffca61";if(s==="open")return "#90b4ff";return "#aebfdd"}
    function payloadTxt(v){try{return JSON.stringify(v||{},null,2)}catch(_e){return String(v||"")}}

    async function loadList(){
      setStatus("Cargando conversaciones...");
      var qs=new URLSearchParams({limit:"120"});
      if(qContact.value.trim())qs.set("contactId",qContact.value.trim());
      if(qStatus.value)qs.set("status",qStatus.value);
      if(qTag.value)qs.set("tag",qTag.value);
      var res=await fetch("/api/conversations?"+qs.toString(),{cache:"no-store"});
      if(!res.ok)throw new Error("status_"+res.status);
      var rows=await res.json();
      renderList(rows||[]);
      setStatus((rows||[]).length+" conversaciones");
      if(!currentId && rows && rows[0]){openConversation(rows[0].id)}
    }

    function renderList(rows){
      if(!rows.length){listEl.innerHTML='<div class="empty">Sin conversaciones registradas.</div>';return}
      listEl.innerHTML=rows.map(function(r){
        return '<article class="item '+(r.id===currentId?'active':'')+'" data-id="'+esc(r.id)+'">'+
          '<div class="head"><div class="name">'+esc(r.contactName||r.contactId)+'</div><span class="badge" style="border-color:'+tone(r.status)+';color:'+tone(r.status)+'">'+esc(r.status)+'</span></div>'+
          '<div class="line">'+esc(r.contactId)+'</div>'+
          '<div class="line">Paso: '+esc(r.currentStep||"-")+'</div>'+
          '<div class="line">Resumen: '+esc(r.summary||"-")+'</div>'+
          '<div class="line">Actualizado: '+esc(fmt(r.lastEventAt))+'</div>'+
        '</article>';
      }).join("");
      Array.from(listEl.querySelectorAll("[data-id]")).forEach(function(el){el.onclick=function(){openConversation(el.getAttribute("data-id"))}});
    }

    async function openConversation(id){
      currentId=id;
      setStatus("Cargando detalle...");
      var res=await fetch("/api/conversations/"+encodeURIComponent(id),{cache:"no-store"});
      if(!res.ok)throw new Error("status_"+res.status);
      var data=await res.json();
      renderTimeline(data||{});
      await loadList();
      setStatus("Detalle cargado");
    }

    function renderTimeline(data){
      var c=data.conversation||null,e=data.events||[];
      if(!c){timelineEl.innerHTML='<div class="empty">Selecciona una conversación.</div>';return}
      var header='<article class="event"><div class="head"><strong>'+esc(c.contactName||c.contactId)+'</strong><span class="badge" style="border-color:'+tone(c.status)+';color:'+tone(c.status)+'">'+esc(c.status)+'</span></div><div class="line">ID: '+esc(c.id)+'</div><div class="line">Apertura: '+esc(fmt(c.openedAt))+'</div><div class="line">Cierre: '+esc(c.closedAt?fmt(c.closedAt):"-")+'</div><div class="line">Resolver: '+esc(c.resolver||"-")+'</div><div class="line">Resumen: '+esc(c.summary||"-")+'</div></article>';
      var events=e.map(function(ev){
        return '<article class="event"><div class="head"><span class="etype">'+esc(ev.type)+'</span><span class="etime">'+esc(fmt(ev.timestamp))+'</span></div><div class="payload">'+esc(payloadTxt(ev.payload))+'</div></article>';
      }).join("");
      timelineEl.innerHTML=header+(events||'<div class="empty">Sin eventos para esta conversación.</div>');
    }

    bRefresh.onclick=function(){loadList().catch(function(err){setStatus("Error");console.error(err)})};
    qStatus.onchange=function(){loadList().catch(function(err){setStatus("Error");console.error(err)})};
    qTag.onchange=function(){loadList().catch(function(err){setStatus("Error");console.error(err)})};
    qContact.onkeydown=function(ev){if(ev.key==="Enter"){loadList().catch(function(err){setStatus("Error");console.error(err)})}};

    var qsInit=new URLSearchParams(window.location.search||"");
    if(qsInit.get("contactId"))qContact.value=qsInit.get("contactId");
    if(qsInit.get("status"))qStatus.value=qsInit.get("status");
    if(qsInit.get("tag"))qTag.value=qsInit.get("tag");

    loadList().catch(function(err){setStatus("Error cargando");console.error(err)});
  </script>
</body>
</html>`;
}

module.exports = {
  renderConversationDashboard
};
