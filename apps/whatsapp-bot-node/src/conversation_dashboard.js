function renderConversationDashboard() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Seguimiento de Conversaciones</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>
    :root{
      --bg:#070b14;
      --surface:#101a2d;
      --surface-2:#15233b;
      --ink:#ecf3ff;
      --muted:#9db0cc;
      --stroke:#263c5c;
      --brand:#39a7ff;
      --ok:#29cb8d;
      --warn:#ffb457;
    }
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%}
    body{
      font-family:Manrope,sans-serif;
      background:
        radial-gradient(circle at 12% -25%,rgba(57,167,255,.26),transparent 40%),
        radial-gradient(circle at 80% 120%,rgba(57,167,255,.12),transparent 45%),
        var(--bg);
      color:var(--ink);
    }
    .app{height:100vh;display:grid;grid-template-rows:auto 1fr;gap:12px;padding:12px}
    .top{background:var(--surface);border:1px solid var(--stroke);border-radius:14px;padding:12px;display:grid;gap:10px}
    .line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .title{margin:0;font-size:20px}
    .sub{margin:0;color:var(--muted);font-size:13px;line-height:1.45}
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
    .status{margin-left:auto;color:var(--muted);font-size:12px}
    .ctrl,.btn{
      border:1px solid var(--stroke);
      background:var(--surface-2);
      color:var(--ink);
      border-radius:10px;
      padding:8px 10px;
      font-size:13px;
    }
    .ctrl{min-width:140px}
    .btn{cursor:pointer}
    .btn:hover{border-color:#3f618e}
    .main{min-height:0;display:grid;grid-template-columns:360px 1fr;gap:12px}
    .panel{min-height:0;background:var(--surface);border:1px solid var(--stroke);border-radius:14px;overflow:hidden;display:grid;grid-template-rows:auto 1fr}
    .ph{padding:10px 12px;border-bottom:1px solid var(--stroke);font-weight:700;font-size:13px;background:#0f192a}
    .list{overflow:auto;padding:10px;display:grid;gap:9px}
    .item{border:1px solid #2b4366;border-radius:12px;padding:10px;cursor:pointer;background:#14233a}
    .item:hover{border-color:#4e74a6}
    .item.active{border-color:#63bdff;box-shadow:0 0 0 1px rgba(99,189,255,.28) inset}
    .name{font-weight:700;font-size:14px}
    .meta{font-size:12px;color:var(--muted);margin-top:4px}
    .pill{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700}
    .pill.open{background:rgba(57,167,255,.18);color:#9ed7ff}
    .pill.pending{background:rgba(255,180,87,.16);color:#ffc983}
    .pill.closed{background:rgba(41,203,141,.17);color:#84e4bc}
    .timeline{overflow:auto;padding:12px;display:grid;gap:10px}
    .summary{border:1px solid #2d4568;background:#13243d;border-radius:12px;padding:10px;display:grid;gap:4px}
    .srow{font-size:13px;color:#d8e9ff}
    .event{border:1px solid #2b4467;border-radius:12px;padding:10px;background:#112038}
    .etype{font-weight:700;font-size:13px}
    .etime{font-size:11px;color:var(--muted)}
    .edesc{margin-top:6px;font-size:13px;line-height:1.45;color:#d8e8ff}
    .empty{padding:16px;color:var(--muted);font-size:13px}
    @media (max-width:980px){.main{grid-template-columns:1fr;grid-template-rows:44% 56%}}
  </style>
</head>
<body>
  <main class="app">
    <section class="top">
      <div class="line"><span class="tag">cliente</span><h1 class="title">Seguimiento de Conversaciones</h1><span id="status" class="status">Cargando...</span></div>
      <p class="sub">Visualiza que paso en cada caso, como se atendio y como termino, con texto claro y sin informacion tecnica.</p>
      <div class="line">
        <input class="ctrl" id="q-contact" placeholder="Buscar por telefono o nombre" />
        <select class="ctrl" id="q-status">
          <option value="">Todos los estados</option>
          <option value="open">Abierto</option>
          <option value="agent_pending">Con asesor</option>
          <option value="closed">Cerrado</option>
        </select>
        <select class="ctrl" id="q-tag">
          <option value="">Todo</option>
          <option value="test_run">Solo pruebas</option>
        </select>
        <button class="btn" id="b-refresh">Actualizar</button>
      </div>
    </section>

    <section class="main">
      <section class="panel">
        <header class="ph">Casos</header>
        <div id="list" class="list"></div>
      </section>
      <section class="panel">
        <header class="ph">Detalle del Caso</header>
        <div id="timeline" class="timeline"></div>
      </section>
    </section>
  </main>

  <script>
    var currentId = null;
    var currentRows = [];
    var listAbortController = null;
    var detailAbortController = null;
    var listEl = document.getElementById("list");
    var timelineEl = document.getElementById("timeline");
    var statusEl = document.getElementById("status");
    var qContact = document.getElementById("q-contact");
    var qStatus = document.getElementById("q-status");
    var qTag = document.getElementById("q-tag");
    var bRefresh = document.getElementById("b-refresh");

    function esc(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
    function fmt(ts){try{return new Date(ts).toLocaleString("es-AR");}catch(_e){return ts||"-";}}
    function setStatus(text){statusEl.textContent=text;}
    function normalize(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
    function statusClass(status){if(status==="closed")return"closed";if(status==="agent_pending")return"pending";return"open";}
    function statusLabel(status){if(status==="closed")return"Cerrado";if(status==="agent_pending")return"Con asesor";return"Abierto";}
    async function fetchJsonWithTimeout(url, timeoutMs, type){
      var controller = new AbortController();
      var timeout = setTimeout(function(){ controller.abort(); }, timeoutMs);
      if(type==="list" && listAbortController){ listAbortController.abort(); }
      if(type==="detail" && detailAbortController){ detailAbortController.abort(); }
      if(type==="list"){ listAbortController = controller; }
      if(type==="detail"){ detailAbortController = controller; }
      try{
        var res = await fetch(url,{cache:"no-store",signal:controller.signal});
        if(!res.ok)throw new Error("status_"+res.status);
        return await res.json();
      } finally {
        clearTimeout(timeout);
      }
    }
    function friendlyStep(step){
      var map={menu:"Menu principal",mode:"Seleccion de modalidad",zone:"Seleccion de zona",address_decision:"Confirmacion de direccion",address_input:"Carga de direccion",pickup_branch:"Seleccion de sucursal",order_type:"Tipo de pedido",receta_upload:"Carga de receta",credential_upload:"Carga de credencial",item_input:"Carga de productos",item_decision:"Confirmacion de pedido",agent_continue:"Continuacion",agent_add_more:"Agregar mas",payment_proof:"Comprobante de pago",survey:"Encuesta final",returning:"Cliente recurrente"};
      return map[String(step||"").trim()]||"En curso";
    }

    function friendlyEventType(type){
      if(type==="inbound_message")return"Mensaje del cliente";
      if(type==="outbound_message")return"Respuesta del sistema";
      if(type==="flow_transition")return"Avance del caso";
      return"Actividad";
    }

    function describeEvent(ev){
      var type=String(ev&&ev.type||"");
      var p=ev&&ev.payload||{};
      if(type==="inbound_message"){
        var inbound=p.inbound||{};
        if(inbound.hasMedia){return "El cliente envio un archivo o imagen.";}
        if(inbound.buttonId){return "El cliente eligio una opcion del menu.";}
        if(inbound.text){return "El cliente escribio: \"" + String(inbound.text).slice(0,160) + "\"";}
        return "Se recibio un nuevo mensaje del cliente.";
      }
      if(type==="outbound_message"){
        if(p.status==="failed"){return "No se pudo enviar un mensaje automatico. Se recomienda revisar.";}
        var action=p.action||{};
        if(action.type==="interactive"){
          var buttons=(action.buttons||[]).map(function(b){return b.title;}).filter(Boolean);
          if(buttons.length){return "El sistema mostro opciones: " + buttons.slice(0,4).join(", ") + ".";}
          return "El sistema mostro opciones para continuar.";
        }
        if(action.type==="image"){return "El sistema envio una imagen informativa.";}
        if(action.type==="text"){return "El sistema respondio: \"" + String(action.text||"").slice(0,160) + "\"";}
        return "El sistema envio una respuesta automatica.";
      }
      if(type==="flow_transition"){
        if(p.handedToHuman){return "El caso fue derivado a un asesor humano.";}
        if(p.closed){return "El caso se cerro correctamente.";}
        var fromStep=friendlyStep(p.before&&p.before.step);
        var toStep=friendlyStep(p.after&&p.after.step);
        if(fromStep!==toStep){return "El caso avanzo de \"" + fromStep + "\" a \"" + toStep + "\".";}
        return "El caso continuo dentro del flujo automatico.";
      }
      return "Se registro una actividad del caso.";
    }

    function renderList(rows){
      var query=normalize(qContact.value);
      var filtered=(rows||[]).filter(function(r){
        if(!query){return true;}
        return normalize(r.contactName).includes(query)||normalize(r.contactId).includes(query);
      });

      if(!filtered.length){
        listEl.innerHTML='<div class="empty">No hay casos para mostrar con ese filtro.</div>';
        if(!rows || !rows.length){
          timelineEl.innerHTML='<div class="empty">Todavia no hay conversaciones registradas o hubo un problema de conectividad.</div>';
        }
        return;
      }

      listEl.innerHTML=filtered.map(function(r){
        var displayName=r.contactName||("Cliente "+String(r.contactId||"").slice(-4));
        return '<article class="item '+(r.id===currentId?'active':'')+'" data-id="'+esc(r.id)+'">'+
          '<div class="line" style="justify-content:space-between;align-items:center"><div class="name">'+esc(displayName)+'</div><span class="pill '+statusClass(r.status)+'">'+statusLabel(r.status)+'</span></div>'+
          '<div class="meta">Ultimo paso: '+esc(friendlyStep(r.currentStep))+'</div>'+
          '<div class="meta">Resumen: '+esc(r.summary||"Sin resumen todavia")+'</div>'+
          '<div class="meta">Actualizado: '+esc(fmt(r.lastEventAt))+'</div>'+
        '</article>';
      }).join("");

      Array.from(listEl.querySelectorAll("[data-id]")).forEach(function(item){
        item.onclick=function(){
          openConversation(item.getAttribute("data-id")).catch(function(err){
            setStatus("Error al cargar detalle");
            console.error(err);
          });
        };
      });
    }

    function renderTimeline(data){
      var c=data&&data.conversation||null;
      var events=data&&data.events||[];
      if(!c){
        timelineEl.innerHTML='<div class="empty">Selecciona un caso para ver el detalle.</div>';
        return;
      }

      var summaryHtml='<article class="summary">'+
        '<div class="srow"><strong>Estado:</strong> '+esc(statusLabel(c.status))+'</div>'+
        '<div class="srow"><strong>Inicio:</strong> '+esc(fmt(c.openedAt))+'</div>'+
        '<div class="srow"><strong>Cierre:</strong> '+esc(c.closedAt?fmt(c.closedAt):"Todavia abierto")+'</div>'+
        '<div class="srow"><strong>Resolucion:</strong> '+esc(c.resolver==="human"?"Asesor humano":"Automatica")+'</div>'+
        '<div class="srow"><strong>Resumen:</strong> '+esc(c.summary||"Sin resumen todavia")+'</div>'+
      '</article>';

      var eventsHtml=events.map(function(ev){
        return '<article class="event">'+
          '<div class="line" style="justify-content:space-between;align-items:center"><span class="etype">'+esc(friendlyEventType(ev.type))+'</span><span class="etime">'+esc(fmt(ev.timestamp))+'</span></div>'+
          '<div class="edesc">'+esc(describeEvent(ev))+'</div>'+
        '</article>';
      }).join("");

      timelineEl.innerHTML=summaryHtml+(eventsHtml||'<div class="empty">Aun no hay actividades registradas.</div>');
    }

    async function loadList(){
      setStatus("Cargando casos...");
      var qs=new URLSearchParams({limit:"120"});
      if(qStatus.value)qs.set("status",qStatus.value);
      if(qTag.value)qs.set("tag",qTag.value);
      var rows=await fetchJsonWithTimeout("/api/conversations?"+qs.toString(),9000,"list");
      currentRows = Array.isArray(rows) ? rows : [];
      if(currentId && !currentRows.some(function(r){ return r.id===currentId; })){
        currentId = null;
      }
      renderList(currentRows);
      setStatus(currentRows.length+" casos cargados");
      if(!currentId && currentRows[0]){
        await openConversation(currentRows[0].id,{skipReload:true});
      } else if(!currentRows.length){
        timelineEl.innerHTML='<div class="empty">Todavia no hay conversaciones registradas o hubo un problema de conectividad.</div>';
      }
    }

    async function openConversation(id, opts){
      currentId=id;
      setStatus("Cargando detalle del caso...");
      var detail=await fetchJsonWithTimeout("/api/conversations/"+encodeURIComponent(id),9000,"detail");
      renderTimeline(detail||{});
      renderList(currentRows);
      setStatus("Detalle actualizado");
    }

    bRefresh.onclick=function(){loadList().catch(function(err){setStatus("Error");console.error(err);});};
    qStatus.onchange=function(){loadList().catch(function(err){setStatus("Error");console.error(err);});};
    qTag.onchange=function(){loadList().catch(function(err){setStatus("Error");console.error(err);});};
    qContact.onkeydown=function(ev){if(ev.key==="Enter"){loadList().catch(function(err){setStatus("Error");console.error(err);});}};

    var init=new URLSearchParams(window.location.search||"");
    if(init.get("status"))qStatus.value=init.get("status");
    if(init.get("tag"))qTag.value=init.get("tag");
    if(init.get("contact"))qContact.value=init.get("contact");

    loadList().catch(function(err){setStatus("Error al cargar");console.error(err);});
  </script>
</body>
</html>`;
}

module.exports = {
  renderConversationDashboard
};
