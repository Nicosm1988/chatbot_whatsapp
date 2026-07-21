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
    .tag.prominent{
      font-size:11px;
      padding:5px 10px;
      font-weight:700;
      letter-spacing:.04em;
    }
    .tag.delivery,.tag.mode-delivery{background:rgba(57,167,255,.18);border-color:rgba(57,167,255,.48);color:#b8e5ff}
    .tag.mostrador,.tag.mode-mostrador{background:rgba(255,180,87,.16);border-color:rgba(255,180,87,.45);color:#ffd39a}
    .tag.particular,.tag.category-particular{background:rgba(41,203,141,.16);border-color:rgba(41,203,141,.44);color:#9ce6c6}
    .tag.programa_obesidad_y_diabetes,.tag.category-programa{background:rgba(233,96,164,.16);border-color:rgba(233,96,164,.45);color:#ffc2df}
    .tag.obra_social,.tag.category-obra-social{background:rgba(126,132,255,.16);border-color:rgba(126,132,255,.45);color:#ccd0ff}
    .tag.esperando_asesor,.tag.status-waiting{background:rgba(255,90,90,.16);border-color:rgba(255,90,90,.48);color:#ffc2c2}
    .tag.atendido,.tag.status-attended{background:rgba(41,203,141,.16);border-color:rgba(41,203,141,.48);color:#9ce6c6}
    .tag.test_run,.tag.misc-prueba{background:rgba(255,122,122,.16);border-color:rgba(255,122,122,.45);color:#ffc2c2}
    .status{margin-left:auto;color:var(--muted);font-size:12px}
    .mode-toggle{
      display:inline-flex;align-items:center;gap:10px;
      padding:6px 12px;border-radius:999px;
      background:rgba(57,167,255,.08);
      border:1px solid rgba(57,167,255,.28);
    }
    .mode-toggle .mode-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#9fd6ff}
    .mode-toggle .mode-text{font-size:13px;font-weight:700;color:#ecf3ff;min-width:130px}
    .mode-toggle.holding{background:rgba(255,180,87,.1);border-color:rgba(255,180,87,.42)}
    .mode-toggle.holding .mode-label{color:#ffd39a}
    .switch{position:relative;display:inline-block;width:42px;height:22px;flex:0 0 auto}
    .switch input{opacity:0;width:0;height:0}
    .slider{
      position:absolute;cursor:pointer;inset:0;
      background:#2b3f5c;border-radius:999px;transition:.18s;
      border:1px solid rgba(255,255,255,.12);
    }
    .slider::before{
      content:"";position:absolute;
      height:16px;width:16px;left:2px;top:2px;
      background:#ecf3ff;border-radius:50%;transition:.18s;
    }
    .switch input:checked + .slider{background:#ffb457;border-color:rgba(255,180,87,.6)}
    .switch input:checked + .slider::before{transform:translateX(20px)}
    .switch input:disabled + .slider{opacity:.5;cursor:wait}
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
    .panel.chats-panel{background:#111b21;border-color:#0b141a}
    .panel.chats-panel .ph{background:#202c33;color:#e9edef;border-bottom-color:#0b141a}
    .list{overflow:auto;padding:0;display:block;background:#111b21}
    .item{
      display:grid;
      grid-template-columns:49px 1fr auto;
      grid-template-rows:auto auto;
      column-gap:12px;
      row-gap:2px;
      align-items:center;
      padding:10px 13px 10px 13px;
      cursor:pointer;
      background:#111b21;
      border:0;
      border-bottom:1px solid rgba(134,150,160,.12);
      border-radius:0;
    }
    .item:hover{background:#202c33}
    .item.active{background:#2a3942}
    .item .wa-avatar{
      grid-row:1 / span 2;
      width:49px;height:49px;border-radius:50%;
      display:grid;place-items:center;
      background:linear-gradient(135deg,#00a884,#008069);
      color:#e9edef;font-weight:700;font-size:16px;
    }
    .item .wa-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
    .item .name{font-weight:500;font-size:15px;color:#e9edef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .item .wa-time{font-size:12px;color:#8696a0;flex:0 0 auto}
    .item.unread .wa-time{color:#00a884;font-weight:600}
    .item .wa-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
    .item .wa-preview{
      font-size:13.5px;color:#8696a0;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      display:flex;align-items:center;gap:4px;min-width:0;flex:1;
    }
    .item .wa-right{display:flex;align-items:center;gap:6px;flex:0 0 auto}
    .item .wa-badge{
      background:#00a884;color:#111b21;
      border-radius:999px;min-width:20px;height:20px;
      display:inline-flex;align-items:center;justify-content:center;
      padding:0 6px;font-size:11px;font-weight:700;
    }
    .item .wa-labels{
      grid-column:2 / span 2;
      display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;
    }
    .wa-label{
      display:inline-flex;align-items:center;gap:5px;
      font-size:11px;line-height:1;
      padding:3px 8px 3px 7px;border-radius:4px;
      background:rgba(255,255,255,.06);color:#d1d7db;
      border:1px solid rgba(134,150,160,.2);
    }
    .wa-label::before{
      content:"";width:7px;height:7px;border-radius:50%;
      background:var(--dot,#00a884);display:inline-block;
    }
    .wa-label.delivery{--dot:#39a7ff}
    .wa-label.mostrador{--dot:#ffb457}
    .wa-label.particular{--dot:#29cb8d}
    .wa-label.programa_obesidad_y_diabetes{--dot:#e960a4}
    .wa-label.obra_social{--dot:#7e84ff}
    .wa-label.esperando_asesor{--dot:#ff5a5a}
    .wa-label.atendido{--dot:#29cb8d}
    .wa-label.test_run{--dot:#ff7a7a}
    .top-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
    .meta{font-size:12px;color:var(--muted);margin-top:4px}
    .pill{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700}
    .pill.open{background:rgba(57,167,255,.18);color:#9ed7ff}
    .pill.pending{background:rgba(255,180,87,.16);color:#ffc983}
    .pill.closed{background:rgba(41,203,141,.17);color:#84e4bc}
    .timeline{
      overflow:auto;
      padding:14px;
      background:
        radial-gradient(circle at 15% 15%,rgba(255,255,255,.02),transparent 22%),
        radial-gradient(circle at 80% 30%,rgba(255,255,255,.025),transparent 24%),
        linear-gradient(180deg,#0a131f 0%,#0d1726 100%);
    }
    .chat-shell{min-height:100%;display:grid;grid-template-rows:auto 1fr;gap:14px}
    .chat-head{
      display:grid;
      gap:12px;
      padding:14px;
      border:1px solid #294463;
      border-radius:18px;
      background:linear-gradient(180deg,rgba(19,35,61,.96),rgba(14,26,45,.98));
      box-shadow:0 18px 42px rgba(0,0,0,.18);
    }
    .chat-person{display:flex;align-items:center;gap:12px}
    .avatar{
      width:42px;
      height:42px;
      border-radius:50%;
      display:grid;
      place-items:center;
      background:linear-gradient(135deg,rgba(57,167,255,.33),rgba(57,167,255,.14));
      border:1px solid rgba(118,197,255,.38);
      color:#dff2ff;
      font-weight:700;
      font-size:14px;
      flex:0 0 auto;
    }
    .chat-copy{min-width:0;display:grid;gap:4px}
    .chat-name{font-size:15px;font-weight:700}
    .chat-sub{font-size:12px;color:var(--muted)}
    .chat-meta{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:#bfd2eb}
    .chat-meta span{
      display:inline-flex;
      align-items:center;
      gap:6px;
      padding:4px 9px;
      border-radius:999px;
      background:rgba(255,255,255,.04);
      border:1px solid rgba(112,145,182,.22);
    }
    .chat-board{display:grid;gap:10px;align-content:start}
    .day-chip{
      justify-self:center;
      padding:5px 12px;
      border-radius:999px;
      background:rgba(11,28,44,.9);
      border:1px solid rgba(73,114,155,.38);
      color:#b7d1ef;
      font-size:11px;
      letter-spacing:.03em;
    }
    .chat-row{display:flex}
    .chat-row.out{justify-content:flex-start}
    .chat-row.in{justify-content:flex-end}
    .chat-row.note{justify-content:center}
    .bubble{
      max-width:min(78%,680px);
      padding:10px 12px 8px;
      border-radius:16px;
      box-shadow:0 14px 28px rgba(0,0,0,.12);
      display:grid;
      gap:8px;
    }
    .bubble.out{
      background:#1f2c39;
      border:1px solid rgba(81,113,146,.34);
      border-top-left-radius:8px;
    }
    .bubble.in{
      background:#005c4b;
      border:1px solid rgba(24,201,146,.3);
      border-top-right-radius:8px;
    }
    .bubble.note{
      max-width:520px;
      text-align:center;
      padding:8px 12px;
      background:rgba(18,35,56,.92);
      border:1px solid rgba(88,129,171,.34);
      color:#cfe4ff;
      font-size:12px;
    }
    .bubble-text{
      font-size:13px;
      line-height:1.5;
      color:#ecf5ff;
      word-break:break-word;
    }
    .bubble-media{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding:8px 10px;
      border-radius:12px;
      background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.08);
      color:#d7ebff;
      font-size:12px;
      width:max-content;
      max-width:100%;
    }
    .bubble-options{display:grid;gap:8px}
    .choice-stack{display:grid;gap:7px}
    .choice-button{
      display:block;
      width:100%;
      padding:8px 10px;
      border-radius:11px;
      background:rgba(255,255,255,.07);
      border:1px solid rgba(255,255,255,.09);
      color:#def2ff;
      font-size:12px;
      text-align:left;
    }
    .choice-sheet{
      border-radius:13px;
      overflow:hidden;
      border:1px solid rgba(90,123,159,.28);
      background:rgba(10,18,31,.22);
    }
    .choice-sheet-title{
      padding:8px 10px;
      font-size:11px;
      text-transform:uppercase;
      letter-spacing:.06em;
      color:#9fc9ef;
      background:rgba(255,255,255,.04);
      border-bottom:1px solid rgba(255,255,255,.06);
    }
    .choice-sheet-group{
      padding:8px 10px 6px;
      font-size:11px;
      text-transform:uppercase;
      letter-spacing:.05em;
      color:#99bce0;
      background:rgba(255,255,255,.03);
    }
    .choice-row{
      display:grid;
      gap:2px;
      padding:9px 10px;
      border-top:1px solid rgba(255,255,255,.05);
      background:rgba(255,255,255,.03);
    }
    .choice-row-title{font-size:12px;color:#edf6ff}
    .choice-row-desc{font-size:11px;color:#a6c3e2}
    .bubble-time{
      justify-self:end;
      font-size:11px;
      color:rgba(225,242,255,.72);
    }
    .empty{padding:16px;color:var(--muted);font-size:13px}
    @media (max-width:980px){.main{grid-template-columns:1fr;grid-template-rows:44% 56%}}
  </style>
</head>
<body>
  <main class="app">
    <section class="top">
      <div class="line"><span class="tag">cliente</span><h1 class="title">Seguimiento de Conversaciones</h1>
        <div id="mode-toggle" class="mode-toggle">
          <span class="mode-label">Modo activo</span>
          <span id="mode-text" class="mode-text">Cargando…</span>
          <label class="switch" title="Cambiar entre Bot completo y Bot inicial">
            <input type="checkbox" id="mode-switch" disabled />
            <span class="slider"></span>
          </label>
        </div>
        <span id="status" class="status">Cargando...</span>
      </div>
      <p class="sub">Visualizá cada conversación como si fuera el WhatsApp Web de la farmacia, con etiquetas claras y sin texto técnico.</p>
      <div class="line">
        <input class="ctrl" id="q-contact" placeholder="Buscar por telefono o nombre" />
        <select class="ctrl" id="q-status">
          <option value="">Todos los estados</option>
          <option value="open">Abierto</option>
          <option value="agent_pending">Aguardando atención</option>
          <option value="closed">Cerrado</option>
        </select>
        <select class="ctrl" id="q-mode">
          <option value="">Delivery y mostrador</option>
          <option value="delivery">Delivery</option>
          <option value="mostrador">Mostrador</option>
        </select>
        <select class="ctrl" id="q-category">
          <option value="">Todos los programas</option>
          <option value="particular">Particular</option>
          <option value="programa_obesidad_y_diabetes">Programa de sobrepeso y diabetes</option>
          <option value="obra_social">Obra social</option>
        </select>
        <select class="ctrl" id="q-tag">
          <option value="">Todo</option>
          <option value="esperando_asesor">Aguardando ser atendido</option>
          <option value="atendido">Atendido</option>
          <option value="test_run">Solo pruebas</option>
        </select>
        <button class="btn" id="b-refresh">Actualizar</button>
      </div>
    </section>

    <section class="main">
      <section class="panel chats-panel">
        <header class="ph">Chats</header>
        <div id="list" class="list"></div>
      </section>
      <section class="panel">
        <header class="ph">Conversación</header>
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
    var qMode = document.getElementById("q-mode");
    var qCategory = document.getElementById("q-category");
    var qTag = document.getElementById("q-tag");
    var bRefresh = document.getElementById("b-refresh");
    var tagLocked = false;
    var AUTO_REFRESH_MS = 12000;
    var NL = String.fromCharCode(10);

    function esc(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
    function fmt(ts){try{return new Date(ts).toLocaleString("es-AR");}catch(_e){return ts||"-";}}
    function setStatus(text){statusEl.textContent=text;}
    function normalize(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
    function statusClass(status){if(status==="closed")return"closed";if(status==="agent_pending")return"pending";return"open";}
    function statusLabel(status){if(status==="closed")return"Cerrado";if(status==="agent_pending")return"Aguardando";return"Abierto";}
    function fmtClock(ts){
      try{return new Date(ts).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});}catch(_e){return"";}
    }
    function fmtDay(ts){
      try{return new Date(ts).toLocaleDateString("es-AR",{day:"numeric",month:"short",year:"numeric"});}catch(_e){return"";}
    }
    function chatDayKey(ts){
      try{
        var d=new Date(ts);
        return [d.getFullYear(),d.getMonth()+1,d.getDate()].join("-");
      }catch(_e){
        return String(ts||"");
      }
    }
    function textToHtml(text){
      return esc(text).split(NL).join("<br />");
    }
    function contactInitials(name, contactId){
      var source=String(name||"").trim();
      if(source){
        var tokens=source.split(" ").filter(Boolean).slice(0,2);
        if(tokens.length){return tokens.map(function(token){return token.charAt(0).toUpperCase();}).join("");}
      }
      return String(contactId||"").slice(-2) || "CL";
    }
    function prettyPhone(value){
      var digits=String(value||"").replace(/[^0-9]/g,"");
      if(digits.indexOf("549")===0 && digits.length===13){
        return "+54 9 "+digits.slice(3,5)+" "+digits.slice(5,9)+"-"+digits.slice(9);
      }
      if(digits.indexOf("54")===0 && digits.length===12){
        return "+54 "+digits.slice(2,4)+" "+digits.slice(4,8)+"-"+digits.slice(8);
      }
      if(digits){return digits;}
      return "Sin número visible";
    }
    function formatChatText(value){
      var text=String(value||"").trim();
      if(!text){return "";}
      [
        "Producto:",
        "Laboratorio / marca:",
        "Laboratorio:",
        "Marca:",
        "Presentación:",
        "Stock:",
        "Detalle:",
        "Precio:",
        "Opciones de pago:",
        "Productos en el pedido:",
        "Recetario Solidario:",
        "Totales del pedido:",
        "Totales con descuentos:",
        "Formas de pago:",
        "Delivery:",
        "Entre calles:",
        "Barrio:",
        "Mail:",
        "Nombre:",
        "Apellido:",
        "Dirección:"
      ].forEach(function(label){
        text=text.split(" - "+label).join(NL+"• "+label);
        text=text.split(" • "+label).join(NL+"• "+label);
      });
      [
        "Particular ef/transf (25%):",
        "Particular debito (20%):",
        "Particular credito (10% + 3 cuotas):",
        "FTCheq 30% + Delko 20% ef/transf:"
      ].forEach(function(label){
        text=text.split(" "+label).join(NL+label);
      });
      [
        "¿Querés agregar algo más o terminar la compra?",
        "Antes de cerrar el pedido, ¿estás adherido al Recetario Solidario?",
        "Podés escribirlo como te quede más cómodo.",
        "Página "
      ].forEach(function(marker){
        var idx=text.indexOf(" "+marker);
        if(idx>=0){text=text.slice(0,idx)+NL+text.slice(idx+1);}
      });
      return text;
    }
    function friendlyTagLabel(tag){
      var map={
        delivery:"Delivery",
        mostrador:"Mostrador",
        particular:"Particular",
        programa_obesidad_y_diabetes:"Programa de sobrepeso y diabetes",
        obra_social:"Obra social",
        esperando_asesor:"Aguardando ser atendido",
        atendido:"Atendido",
        test_run:"Prueba"
      };
      return map[String(tag||"").trim()]||"";
    }
    function getClientFacingTags(tags){
      return ["delivery","mostrador","particular","programa_obesidad_y_diabetes","obra_social","esperando_asesor","atendido","test_run"]
        .filter(function(tag){ return Array.isArray(tags) && tags.indexOf(tag) >= 0; })
        .map(function(tag){ return { id: tag, label: friendlyTagLabel(tag) }; });
    }
    function tagTone(tagId){
      var map={
        delivery:"delivery mode-delivery",
        mostrador:"mostrador mode-mostrador",
        particular:"particular category-particular",
        programa_obesidad_y_diabetes:"programa_obesidad_y_diabetes category-programa",
        obra_social:"obra_social category-obra-social",
        esperando_asesor:"esperando_asesor status-waiting",
        atendido:"atendido status-attended",
        test_run:"test_run misc-prueba"
      };
      return map[String(tagId||"").trim()]||"";
    }
    function renderTagChips(tags, opts){
      var chips=getClientFacingTags(tags);
      var options=opts||{};
      if(!chips.length){return "";}
      var wrapperClass=options.prominent ? "top-tags" : "line";
      var wrapperStyle=options.prominent ? "" : ' style="margin-top:6px;gap:6px"';
      return '<div class="'+wrapperClass+'"'+wrapperStyle+'>'+chips.map(function(tag){
        return '<span class="tag '+tagTone(tag.id)+' '+(options.prominent?'prominent':'')+'">'+esc(tag.label)+'</span>';
      }).join("")+'</div>';
    }
    function handleLoadError(err){
      if(String(err&&err.message||"").includes("status_503")){
        setStatus("Historial no disponible: falta base de datos persistente");
        listEl.innerHTML='<div class="empty">No hay base de datos persistente configurada para historial.</div>';
        timelineEl.innerHTML='<div class="empty">Configura storage persistente para ver conversaciones historicas.</div>';
      } else {
        setStatus("Error");
      }
      console.error(err);
    }
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
    function renderButtons(buttons){
      if(!Array.isArray(buttons) || !buttons.length){return "";}
      return '<div class="choice-stack">'+buttons.map(function(button){
        return '<div class="choice-button">'+esc(button.title||"Opción")+'</div>';
      }).join("")+'</div>';
    }
    function renderListSections(action){
      var sections=Array.isArray(action&&action.sections)?action.sections:[];
      if(!sections.length){return "";}
      return '<div class="choice-sheet">'+
        (action&&action.buttonText?'<div class="choice-sheet-title">'+esc(action.buttonText)+'</div>':'')+
        sections.map(function(section){
          var rows=Array.isArray(section&&section.rows)?section.rows:[];
          return (section&&section.title?'<div class="choice-sheet-group">'+esc(section.title)+'</div>':'')+rows.map(function(row){
            return '<div class="choice-row"><div class="choice-row-title">'+esc(row.title||"Opción")+'</div>'+(row&&row.description?'<div class="choice-row-desc">'+esc(row.description)+'</div>':'')+'</div>';
          }).join("");
        }).join("")+
      '</div>';
    }
    function renderActionOptions(action){
      if(!action || action.type!=="interactive"){return "";}
      if(action.interactiveType==="list"){return renderListSections(action);}
      return renderButtons(action.buttons||[]);
    }
    function systemNoteText(payload){
      var transition=payload&&payload.transition||{};
      if(payload&&payload.handedToHuman){return "Desde este punto sigue un asesor de la farmacia.";}
      if(payload&&payload.closed && transition.routeKey==="auto_close_inactivity"){return "La conversación se cerró por falta de respuesta.";}
      if(payload&&payload.closed){return "La conversación quedó cerrada.";}
      return "";
    }
    function buildTranscriptEntries(events){
      return (events||[]).map(function(ev){
        var type=String(ev&&ev.type||"");
        var payload=ev&&ev.payload||{};
        if(type==="inbound_message"){
          var inbound=payload.inbound||{};
          return {
            kind:"message",
            side:"in",
            timestamp:ev.timestamp,
            text: formatChatText(inbound.text || (inbound.hasMedia ? "Foto o archivo enviado." : "Mensaje recibido.")),
            mediaLabel: inbound.hasMedia ? (inbound.type==="image" ? "Foto enviada" : "Archivo enviado") : ""
          };
        }
        if(type==="outbound_message"){
          if(payload.status==="failed"){return null;}
          var action=payload.action||{};
          return {
            kind:"message",
            side:"out",
            timestamp:ev.timestamp,
            text: formatChatText(action.text || (action.type==="image" ? "Imagen enviada." : "")),
            mediaLabel: action.type==="image" ? "Imagen enviada por la farmacia" : "",
            optionsHtml: renderActionOptions(action)
          };
        }
        if(type==="flow_transition"){
          var note=systemNoteText(payload);
          if(!note){return null;}
          return {
            kind:"note",
            side:"note",
            timestamp:ev.timestamp,
            text:note
          };
        }
        return null;
      }).filter(Boolean);
    }
    function renderTranscriptEntry(entry){
      if(entry.kind==="note"){
        return '<div class="chat-row note"><div class="bubble note"><div class="bubble-text">'+textToHtml(entry.text)+'</div></div></div>';
      }
      return '<div class="chat-row '+entry.side+'">'+
        '<article class="bubble '+entry.side+'">'+
          (entry.mediaLabel?'<div class="bubble-media">'+esc(entry.mediaLabel)+'</div>':'')+
          (entry.text?'<div class="bubble-text">'+textToHtml(entry.text)+'</div>':'')+
          (entry.optionsHtml?'<div class="bubble-options">'+entry.optionsHtml+'</div>':'')+
          '<div class="bubble-time">'+esc(fmtClock(entry.timestamp))+'</div>'+
        '</article>'+
      '</div>';
    }
    function renderChatHeader(conversation){
      var name=conversation.contactName||("Cliente "+String(conversation.contactId||"").slice(-4));
      return '<section class="chat-head">'+
        '<div class="chat-person">'+
          '<div class="avatar">'+esc(contactInitials(name,conversation.contactId))+'</div>'+
          '<div class="chat-copy">'+
            '<div class="chat-name">'+esc(name)+'</div>'+
            '<div class="chat-sub">'+esc(prettyPhone(conversation.contactId))+'</div>'+
          '</div>'+
          '<span class="pill '+statusClass(conversation.status)+'">'+statusLabel(conversation.status)+'</span>'+
        '</div>'+
        renderTagChips(conversation.tags,{prominent:true})+
        '<div class="chat-meta">'+
          '<span>Empezó '+esc(fmt(conversation.openedAt))+'</span>'+
          '<span>'+(conversation.closedAt ? "Cerró "+esc(fmt(conversation.closedAt)) : "Sigue abierto")+'</span>'+
          '<span>'+esc(conversation.summary||"Sin resumen todavía")+'</span>'+
        '</div>'+
      '</section>';
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
        var phone=prettyPhone(r.contactId);
        var displayName=(r.contactName && String(r.contactName).trim())||phone;
        var preview=phone;
        var unread=Number(r.unreadCount||0);
        var labels=getClientFacingTags(r.tags);
        var labelsHtml=labels.length?'<div class="wa-labels">'+labels.map(function(t){
          return '<span class="wa-label '+esc(t.id)+'">'+esc(t.label)+'</span>';
        }).join("")+'</div>':'';
        return '<article class="item '+(r.id===currentId?'active':'')+(unread?' unread':'')+'" data-id="'+esc(r.id)+'">'+
          '<div class="wa-avatar">'+esc(contactInitials(displayName,r.contactId))+'</div>'+
          '<div class="wa-top"><div class="name">'+esc(displayName)+'</div><div class="wa-time">'+esc(fmtClock(r.lastEventAt)||fmtDay(r.lastEventAt))+'</div></div>'+
          '<div class="wa-bottom">'+
            '<div class="wa-preview">'+esc(preview)+'</div>'+
            '<div class="wa-right">'+
              (unread?'<span class="wa-badge">'+(unread>99?"99+":unread)+'</span>':'')+
            '</div>'+
          '</div>'+
          labelsHtml+
        '</article>';
      }).join("");

      Array.from(listEl.querySelectorAll("[data-id]")).forEach(function(item){
        item.onclick=function(){
          openConversation(item.getAttribute("data-id")).catch(handleLoadError);
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
      var transcript=buildTranscriptEntries(events);
      var lastDay="";
      var transcriptHtml=transcript.map(function(entry){
        var currentDay=chatDayKey(entry.timestamp);
        var prefix="";
        if(currentDay!==lastDay){
          prefix='<div class="day-chip">'+esc(fmtDay(entry.timestamp))+'</div>';
          lastDay=currentDay;
        }
        return prefix+renderTranscriptEntry(entry);
      }).join("");

      timelineEl.innerHTML='<section class="chat-shell">'+
        renderChatHeader(c)+
        '<section class="chat-board">'+(transcriptHtml||'<div class="empty">Todavía no hay mensajes para mostrar.</div>')+'</section>'+
      '</section>';
    }

    async function loadList(){
      setStatus("Cargando casos...");
      var qs=new URLSearchParams({limit:"120"});
      if(qStatus.value)qs.set("status",qStatus.value);
      var tags=[];
      if(qMode.value)tags.push(qMode.value);
      if(qCategory.value)tags.push(qCategory.value);
      if(qTag.value)tags.push(qTag.value);
      if(tags.length){qs.set("tag",tags.join(","));}
      var rows=await fetchJsonWithTimeout("/api/conversations?"+qs.toString(),9000,"list");
      currentRows = Array.isArray(rows) ? rows : [];
      if(currentId && !currentRows.some(function(r){ return r.id===currentId; })){
        currentId = null;
      }
      renderList(currentRows);
      setStatus(currentRows.length+" casos cargados");
      if(currentId && currentRows.some(function(r){ return r.id===currentId; })){
        await openConversation(currentId,{skipReload:true});
      } else if(!currentId && currentRows[0]){
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

    bRefresh.onclick=function(){loadList().catch(handleLoadError);};
    qStatus.onchange=function(){loadList().catch(handleLoadError);};
    qMode.onchange=function(){loadList().catch(handleLoadError);};
    qCategory.onchange=function(){loadList().catch(handleLoadError);};
    qTag.onchange=function(){loadList().catch(handleLoadError);};
    qContact.onkeydown=function(ev){if(ev.key==="Enter"){loadList().catch(handleLoadError);}};

    var init=new URLSearchParams(window.location.search||"");
    if(init.get("status"))qStatus.value=init.get("status");
    if(init.get("tag")){
      var initialTags=String(init.get("tag")||"").trim().split(",").map(function(v){ return String(v||"").trim(); }).filter(Boolean);
      if(initialTags.indexOf("delivery") >= 0) qMode.value = "delivery";
      if(initialTags.indexOf("mostrador") >= 0) qMode.value = "mostrador";
      if(initialTags.indexOf("particular") >= 0) qCategory.value = "particular";
      if(initialTags.indexOf("programa_obesidad_y_diabetes") >= 0) qCategory.value = "programa_obesidad_y_diabetes";
      if(initialTags.indexOf("obra_social") >= 0) qCategory.value = "obra_social";
      if(initialTags.indexOf("esperando_asesor") >= 0) qTag.value = "esperando_asesor";
      if(initialTags.indexOf("atendido") >= 0) qTag.value = "atendido";
      if(initialTags.indexOf("test_run") >= 0) qTag.value = "test_run";
      if(qTag.value==="test_run"){
        tagLocked = true;
        qTag.disabled = true;
      }
    }
    if(init.get("contact"))qContact.value=init.get("contact");

    if(tagLocked){
      setStatus("Mostrando solo conversaciones de pruebas");
    }

    var modeToggleEl=document.getElementById("mode-toggle");
    var modeSwitchEl=document.getElementById("mode-switch");
    var modeTextEl=document.getElementById("mode-text");
    var canUpdateBotMode=false;
    function applyModeUi(mode){
      var isHolding=mode==="holding";
      modeSwitchEl.checked=isHolding;
      modeTextEl.textContent=isHolding?"Bot inicial":"Bot completo";
      modeToggleEl.classList.toggle("holding",isHolding);
    }
    async function loadBotMode(){
      try{
        var res=await fetch("/api/bot-mode",{cache:"no-store"});
        if(!res.ok)throw new Error("status_"+res.status);
        var data=await res.json();
        applyModeUi(data.mode);
        canUpdateBotMode=data.canUpdate===true;
        modeSwitchEl.disabled=!canUpdateBotMode;
        modeToggleEl.title=canUpdateBotMode
          ?"Podés cambiar el modo desde esta PC"
          :"Por seguridad, cambiá el modo desde la PC del bot o escribiendo el comando en tu propio chat";
      }catch(err){
        console.error("bot-mode load failed",err);
        modeTextEl.textContent="No disponible";
      }
    }
    modeSwitchEl.addEventListener("change",async function(){
      var targetMode=modeSwitchEl.checked?"holding":"chatbot";
      modeSwitchEl.disabled=true;
      var previousText=modeTextEl.textContent;
      modeTextEl.textContent="Guardando…";
      try{
        var res=await fetch("/api/bot-mode",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({mode:targetMode})
        });
        if(!res.ok)throw new Error("status_"+res.status);
        var data=await res.json();
        applyModeUi(data.mode);
      }catch(err){
        console.error("bot-mode update failed",err);
        modeTextEl.textContent=previousText;
        modeSwitchEl.checked=!modeSwitchEl.checked;
        alert("No se pudo cambiar el modo del bot. Intentá de nuevo.");
      }finally{
        modeSwitchEl.disabled=!canUpdateBotMode;
      }
    });
    loadBotMode();
    loadList().catch(handleLoadError);
    window.setInterval(function(){
      if(document.hidden){return;}
      loadList().catch(handleLoadError);
      loadBotMode();
    }, AUTO_REFRESH_MS);
  </script>
</body>
</html>`;
}

module.exports = {
  renderConversationDashboard
};
