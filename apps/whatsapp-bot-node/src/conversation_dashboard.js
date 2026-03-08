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
    :root{--bg:#f3f6fb;--surface:#fff;--ink:#182338;--muted:#61708d;--stroke:#d6dfef;--brand:#0f62fe;--ok:#1f9d63;--warn:#d48500}
    *{box-sizing:border-box} html,body{margin:0;width:100%;height:100%}
    body{font-family:Manrope,sans-serif;background:radial-gradient(circle at 10% -20%,#dbe8ff,transparent 35%),var(--bg);color:var(--ink)}
    .app{height:100vh;display:grid;grid-template-rows:auto 1fr;gap:12px;padding:12px}
    .top{background:var(--surface);border:1px solid var(--stroke);border-radius:14px;padding:12px;display:grid;gap:10px}
    .line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.title{margin:0;font-size:20px}.sub{margin:0;color:var(--muted);font-size:13px}
    .tag{font-size:10px;letter-spacing:.08em;text-transform:uppercase;border:1px solid #b8cbf3;background:#eef4ff;border-radius:999px;padding:3px 8px;color:#2f5ca8}
    .status{margin-left:auto;color:var(--muted);font-size:12px}
    .ctrl,.btn{border:1px solid var(--stroke);background:#fff;color:var(--ink);border-radius:10px;padding:8px 10px;font-size:13px}
    .btn{cursor:pointer}.btn:hover{border-color:#adc1e8}
    .main{min-height:0;display:grid;grid-template-columns:360px 1fr;gap:12px}
    .panel{min-height:0;background:var(--surface);border:1px solid var(--stroke);border-radius:14px;overflow:hidden;display:grid;grid-template-rows:auto 1fr}
    .ph{padding:10px 12px;border-bottom:1px solid var(--stroke);font-weight:700;font-size:13px}
    .list{overflow:auto;padding:10px;display:grid;gap:9px}
    .item{border:1px solid #d8e3f6;border-radius:12px;padding:10px;cursor:pointer;background:#fbfdff}
    .item:hover{border-color:#b8ccef}.item.active{border-color:#7ea4e8;box-shadow:0 0 0 2px #eaf1ff inset}
    .name{font-weight:700;font-size:14px}.meta{font-size:12px;color:var(--muted);margin-top:4px}
    .pill{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700}
    .pill.open{background:#eef5ff;color:#235dbf}.pill.pending{background:#fff4e6;color:#b06500}.pill.closed{background:#ebf8ef;color:#1a7f50}
    .timeline{overflow:auto;padding:12px;display:grid;gap:10px}
    .summary{border:1px solid #d8e3f6;background:#f9fbff;border-radius:12px;padding:10px;display:grid;gap:4px}
    .srow{font-size:13px;color:#34435f}
    .event{border:1px solid #dbe5f6;border-radius:12px;padding:10px;background:#fff}
    .etype{font-weight:700;font-size:13px}.etime{font-size:11px;color:var(--muted)}
    .edesc{margin-top:6px;font-size:13px;line-height:1.45;color:#24324d}
    .empty{padding:16px;color:var(--muted);font-size:13px}
    @media (max-width:980px){.main{grid-template-columns:1fr;grid-template-rows:44% 56%}}
  </style>
</head>
<body>
  <main class="app">
    <section class="top">
      <div class="line"><span class="tag">cliente</span><h1 class="title">Seguimiento de Conversaciones</h1><span id="status" class="status">Cargando...</span></div>
      <p class="sub">Visualiza qué pasó en cada caso, cómo se atendió y cómo terminó, con texto claro y sin información técnica.</p>
      <div class="line">
        <input class="ctrl" id="q-contact" placeholder="Buscar por teléfono o nombre" />
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
    var listEl = document.getElementById("list");
    var timelineEl = document.getElementById("timeline");
    var statusEl = document.getElementById("status");
    var qContact = document.getElementById("q-contact");
    var qStatus = document.getElementById("q-status");
    var qTag = document.getElementById("q-tag");
    var bRefresh = document.getElementById("b-refresh");

    function esc(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
    function fmt(ts){try{return new Date(ts).toLocaleString("es-AR")}catch(_e){return ts||"-"}}
    function setStatus(text){statusEl.textContent=text}
    function normalize(v){return String(v||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase()}
    function statusClass(status){if(status==="closed")return"closed";if(status==="agent_pending")return"pending";return"open"}
    function statusLabel(status){if(status==="closed")return"Cerrado";if(status==="agent_pending")return"Con asesor";return"Abierto"}
    function friendlyStep(step){
      var map={menu:"Menú principal",mode:"Selección de modalidad",zone:"Selección de zona",address_decision:"Confirmación de dirección",address_input:"Carga de dirección",pickup_branch:"Selección de sucursal",order_type:"Tipo de pedido",receta_upload:"Carga de receta",credential_upload:"Carga de credencial",item_input:"Carga de productos",item_decision:"Confirmación de pedido",agent_continue:"Continuación",agent_add_more:"Agregar más",payment_proof:"Comprobante de pago",survey:"Encuesta final",returning:"Cliente recurrente"};
      return map[String(step||"").trim()]||"En curso";
    }

    function describeEvent(ev){
      var type=String(ev&&ev.type||"");
      var p=ev&&ev.payload||{};
      if(type==="inbound_message"){
        var inbound=p.inbound||{};
        if(inbound.hasMedia){return "El cliente envió un archivo o imagen.";}
        if(inbound.buttonId){return "El cliente eligió una opción del menú.";}
        if(inbound.text){return "El cliente escribió: \\"" + String(inbound.text).slice(0,160) + "\\"";}
        return "Se recibió un nuevo mensaje del cliente.";
      }
      if(type==="outbound_message"){
        if(p.status==="failed"){return "No se pudo enviar un mensaje automático. Se recomienda revisar.";}
        var action=p.action||{};
        if(action.type==="interactive"){
          var buttons=(action.buttons||[]).map(function(b){return b.title}).filter(Boolean);
          if(buttons.length){return "El sistema mostró opciones: " + buttons.slice(0,4).join(", ") + ".";}
          return "El sistema mostró opciones para continuar.";
        }
        if(action.type==="image"){return "El sistema envió una imagen informativa.";}
        if(action.type==="text"){return "El sistema respondió: \\"" + String(action.text||"").slice(0,160) + "\\"";}
        return "El sistema envió una respuesta automática.";
      }
      if(type==="flow_transition"){
        if(p.handedToHuman){return "El caso fue derivado a un asesor humano.";}
        if(p.closed){return "El caso se cerró correctamente.";}
        var fromStep=friendlyStep(p.before&&p.before.step);
        var toStep=friendlyStep(p.after&&p.after.step);
        if(fromStep!==toStep){return "El caso avanzó de \\"" + fromStep + "\\" a \\"" + toStep + "\\".";}
        return "El caso continuó dentro del flujo automático.";
      }
      return "Se registró una actividad del caso.";
    }

    function renderList(rows){
      var query=normalize(qContact.value);
      var filtered=(rows||[]).filter(function(r){
        if(!query){return true;}
        return normalize(r.contactName).includes(query)||normalize(r.contactId).includes(query);
      });
      if(!filtered.length){listEl.innerHTML='<div class="empty">No hay casos para mostrar con ese filtro.</div>';return;}
      listEl.innerHTML=filtered.map(function(r){
        var displayName=r.contactName||("Cliente "+String(r.contactId||"").slice(-4));
        return '<article class="item '+(r.id===currentId?'active':'')+'" data-id="'+esc(r.id)+'">'+
          '<div class="line" style="justify-content:space-between;align-items:center"><div class="name">'+esc(displayName)+'</div><span class="pill '+statusClass(r.status)+'">'+statusLabel(r.status)+'</span></div>'+
          '<div class="meta">Último paso: '+esc(friendlyStep(r.currentStep))+'</div>'+
          '<div class="meta">Resumen: '+esc(r.summary||"Sin resumen todavía")+'</div>'+
          '<div class="meta">Actualizado: '+esc(fmt(r.lastEventAt))+'</div>'+
        '</article>';
      }).join("");
      Array.from(listEl.querySelectorAll("[data-id]")).forEach(function(item){
        item.onclick=function(){openConversation(item.getAttribute("data-id"));};
      });
    }

    function renderTimeline(data){
      var c=data&&data.conversation||null;
      var events=data&&data.events||[];
      if(!c){timelineEl.innerHTML='<div class="empty">Seleccioná un caso para ver el detalle.</div>';return;}

      var summaryHtml='<article class="summary">'+
        '<div class="srow"><strong>Estado:</strong> '+esc(statusLabel(c.status))+'</div>'+
        '<div class="srow"><strong>Inicio:</strong> '+esc(fmt(c.openedAt))+'</div>'+
        '<div class="srow"><strong>Cierre:</strong> '+esc(c.closedAt?fmt(c.closedAt):"Todavía abierto")+'</div>'+
        '<div class="srow"><strong>Resolución:</strong> '+esc(c.resolver==="human"?"Asesor humano":"Automática")+'</div>'+
        '<div class="srow"><strong>Resumen:</strong> '+esc(c.summary||"Sin resumen todavía")+'</div>'+
      '</article>';

      var eventsHtml=events.map(function(ev){
        return '<article class="event">'+
          '<div class="line" style="justify-content:space-between;align-items:center"><span class="etype">'+esc(friendlyEventType(ev.type))+'</span><span class="etime">'+esc(fmt(ev.timestamp))+'</span></div>'+
          '<div class="edesc">'+esc(describeEvent(ev))+'</div>'+
        '</article>';
      }).join("");

      timelineEl.innerHTML=summaryHtml+(eventsHtml||'<div class="empty">Aún no hay actividades registradas.</div>');
    }

    function friendlyEventType(type){
      if(type==="inbound_message")return"Mensaje del cliente";
      if(type==="outbound_message")return"Respuesta del sistema";
      if(type==="flow_transition")return"Avance del caso";
      return"Actividad";
    }

    async function loadList(){
      setStatus("Cargando casos...");
      var qs=new URLSearchParams({limit:"120"});
      if(qStatus.value)qs.set("status",qStatus.value);
      if(qTag.value)qs.set("tag",qTag.value);
      var res=await fetch("/api/conversations?"+qs.toString(),{cache:"no-store"});
      if(!res.ok)throw new Error("status_"+res.status);
      var rows=await res.json();
      renderList(rows||[]);
      setStatus((rows||[]).length+" casos cargados");
      if(!currentId&&rows&&rows[0]){openConversation(rows[0].id);}
    }

    async function openConversation(id){
      currentId=id;
      setStatus("Cargando detalle del caso...");
      var res=await fetch("/api/conversations/"+encodeURIComponent(id),{cache:"no-store"});
      if(!res.ok)throw new Error("status_"+res.status);
      var detail=await res.json();
      renderTimeline(detail||{});
      await loadList();
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

