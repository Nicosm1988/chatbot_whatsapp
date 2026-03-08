function renderFlowDashboard() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Flow Studio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    :root{--bg:#0b1020;--panel:#111a2c;--stroke:#334a6f;--ink:#e8f0ff;--muted:#a8b8d6;--accent:#ff6d2d;--ok:#2ecb92;--warn:#ffca61}
    *{box-sizing:border-box} html,body{width:100%;height:100%;margin:0;overflow:hidden}
    body{font-family:Manrope,sans-serif;color:var(--ink);background:radial-gradient(circle at 8% -8%,rgba(255,109,45,.2),transparent 32%),var(--bg)}
    .app{height:100vh;display:grid;grid-template-rows:auto 1fr;gap:10px;padding:10px}
    .top{border:1px solid var(--stroke);border-radius:12px;background:linear-gradient(160deg,rgba(29,41,63,.95),rgba(15,22,34,.95));padding:10px;display:grid;gap:8px}
    .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.title{margin:0;font-size:15px}.sub{margin:0;color:var(--muted);font-size:12px}
    .tag{border:1px solid rgba(255,109,45,.55);background:rgba(255,109,45,.13);border-radius:999px;padding:3px 8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
    .tabs{display:flex;gap:8px;flex-wrap:wrap}.btn{border:1px solid var(--stroke);background:#0f1828;color:var(--ink);border-radius:9px;padding:7px 11px;font-size:12px;cursor:pointer}
    .btn.active{border-color:rgba(255,109,45,.9)} .btn.connecting{border-color:rgba(46,203,146,.8)}
    .status{margin-left:auto;font-size:12px;color:var(--muted)} .status.ok{color:var(--ok)} .status.warn{color:var(--warn)}
    .hidden{display:flex;gap:6px;flex-wrap:wrap}.chip{border:1px dashed #6078a3;background:#0e1b2f;color:#d7e4fb;border-radius:999px;padding:4px 10px;font-size:11px;cursor:pointer}
    .canvas{border:1px solid var(--stroke);border-radius:12px;position:relative;overflow:hidden;background:linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px) 0 0/28px 28px,linear-gradient(0deg,rgba(255,255,255,.03) 1px,transparent 1px) 0 0/28px 28px,#0c1321}
    .vp{position:absolute;inset:0;overflow:hidden;touch-action:none}.scene{position:absolute;transform-origin:top left}
    .edges{position:absolute;inset:0}.edge .line{pointer-events:stroke;cursor:pointer}.edge.sel .line{stroke:rgba(255,206,136,.95)}
    .node{position:absolute;border:1px solid #415879;border-radius:11px;background:linear-gradient(180deg,#1b2640,#152032);box-shadow:0 12px 24px rgba(0,0,0,.44);overflow:hidden;cursor:grab;user-select:none}
    .node.drag{cursor:grabbing}.node.src{border-color:rgba(46,203,146,.92)}
    .head{height:28px;display:flex;align-items:center;justify-content:space-between;padding:0 8px;border-bottom:1px solid #3a4f6f;background:linear-gradient(90deg,rgba(255,109,45,.22),rgba(255,109,45,.06))}
    .kind{font-family:"JetBrains Mono",monospace;font-size:11px;color:#ffd8c6}.open{border:1px solid #546f99;background:rgba(10,16,30,.84);color:#deebff;border-radius:7px;font-size:10px;padding:2px 6px;cursor:pointer}
    .body{padding:8px}.nt{margin:0 0 4px;font-size:13px}.ns{margin:0;color:#b1c5e2;font-size:12px;line-height:1.3}
    .port{position:absolute;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:999px;border:2px solid #dde8fd;background:#20365f}
    .port.in{left:-6px;cursor:crosshair}.port.out{right:-6px;background:#2b6546;border-color:#daf7ea;cursor:crosshair}
    .modal{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(8,12,22,.64);z-index:20}.modal.v{display:flex}
    .card{width:min(700px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;border:1px solid #3b4f72;border-radius:12px;background:#111c30;padding:14px;display:grid;gap:10px}
    .f{display:grid;gap:4px}.f label{font-size:12px;color:#b9cae5}.f input,.f textarea{border:1px solid #496288;background:#0f1829;color:#eaf2ff;border-radius:8px;padding:8px;font:inherit}
    .f textarea{min-height:78px;resize:vertical}.help{margin:0;color:#9fb3d5;font-size:12px}.mono{font-family:"JetBrains Mono",monospace;font-size:11px;color:#cfe0ff}
  </style>
</head>
<body>
  <main class="app">
    <section class="top">
      <div class="row"><span class="tag">n8n like canvas</span><h1 class="title" id="wf-title">Workflow</h1><span class="status" id="status">Cargando...</span></div>
      <p class="sub" id="wf-sub"></p>
      <div class="tabs" id="tabs"></div>
      <div class="row">
        <button class="btn" id="b-connect">Conectar</button><button class="btn" id="b-minus">-</button><button class="btn" id="b-zoom">100%</button><button class="btn" id="b-plus">+</button>
        <button class="btn" id="b-fit">Ajustar pantalla</button><button class="btn" id="b-del">Eliminar linea</button><button class="btn" id="b-save">Guardar</button><button class="btn" id="b-reset">Reset</button>
      </div>
      <div class="hidden" id="hidden"></div>
    </section>
    <section class="canvas">
      <div class="vp" id="vp">
        <div class="scene" id="scene">
          <svg class="edges" id="svg"><defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,214,193,.82)"></path></marker></defs><g id="edge-layer"></g></svg>
          <div id="node-layer"></div>
        </div>
      </div>
    </section>
    <div class="modal" id="m"><div class="card"><h2 style="margin:0;font-size:16px">Nodo</h2><p class="mono" id="m-id"></p><p class="help">Este nodo explica en simple que hace. El mensaje del bot impacta el chatbot real.</p>
      <div class="f"><label for="m-title">Titulo</label><input id="m-title" maxlength="80" /></div>
      <div class="f"><label for="m-subtitle">Subtitulo</label><input id="m-subtitle" maxlength="120" /></div>
      <div class="f"><label for="m-explain">Explicacion simple</label><textarea id="m-explain" maxlength="400"></textarea></div>
      <div class="f"><label for="m-msg">Mensaje del bot</label><textarea id="m-msg" maxlength="600"></textarea></div>
      <div class="row"><button class="btn" id="m-save">Guardar nodo</button><button class="btn" id="m-close">Cerrar</button></div>
    </div></div>
  </main>
  <script>
    var catalog=null,activeId=null,activeNodeId=null,selectedEdgeId=null;
    var st={scale:1,panX:0,panY:0,dirty:false,connect:false,from:null,drag:null,pan:null};
    var vp=document.getElementById("vp"),scene=document.getElementById("scene"),svg=document.getElementById("svg"),edgeLayer=document.getElementById("edge-layer"),nodeLayer=document.getElementById("node-layer");
    var tabs=document.getElementById("tabs"),hidden=document.getElementById("hidden"),wfTitle=document.getElementById("wf-title"),wfSub=document.getElementById("wf-sub"),statusEl=document.getElementById("status");
    var bConnect=document.getElementById("b-connect"),bMinus=document.getElementById("b-minus"),bZoom=document.getElementById("b-zoom"),bPlus=document.getElementById("b-plus"),bFit=document.getElementById("b-fit"),bDel=document.getElementById("b-del"),bSave=document.getElementById("b-save"),bReset=document.getElementById("b-reset");
    var m=document.getElementById("m"),mId=document.getElementById("m-id"),mTitle=document.getElementById("m-title"),mSubtitle=document.getElementById("m-subtitle"),mExplain=document.getElementById("m-explain"),mMsg=document.getElementById("m-msg"),mSave=document.getElementById("m-save"),mClose=document.getElementById("m-close");
    function esc(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\\"/g,"&quot;").replace(/'/g,"&#39;")}
    function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
    function setStatus(t,tone){statusEl.textContent=t;statusEl.className="status"+(tone?" "+tone:"")}
    function markDirty(){st.dirty=true;setStatus("Cambios sin guardar","warn")}
    function clearDirty(){st.dirty=false;setStatus("Sincronizado","ok")}
    function getWf(){var w=(catalog&&catalog.workflows)||[];return w.find(function(x){return x.id===activeId})||w[0]||null}
    function getNode(wf,id){return (wf.nodes||[]).find(function(n){return n.id===id})||null}
    function norm(input){if(!input||typeof input!=="object")input={workflows:[]};if(!Array.isArray(input.workflows))input.workflows=[];input.workflows.forEach(function(wf,wi){wf.id=String(wf.id||("wf_"+(wi+1)));wf.name=String(wf.name||wf.id);wf.description=String(wf.description||"");wf.canvas=wf.canvas||{};wf.canvas.width=Number(wf.canvas.width||1400);wf.canvas.height=Number(wf.canvas.height||800);wf.nodes=Array.isArray(wf.nodes)?wf.nodes:[];wf.edges=Array.isArray(wf.edges)?wf.edges:[];wf.nodes.forEach(function(n,ni){n.id=String(n.id||("node_"+(ni+1)));n.title=String(n.title||n.id);n.subtitle=String(n.subtitle||"");n.explain=String(n.explain||"");n.kind=String(n.kind||"process");n.x=Number(n.x||0);n.y=Number(n.y||0);n.w=Number(n.w||220);n.h=Number(n.h||100);n.botMessage=String(n.botMessage||"")});wf.edges.forEach(function(e,ei){e.id=String(e.id||("edge_"+(ei+1)));e.from=String(e.from||"");e.to=String(e.to||"");e.label=String(e.label||"");e.routeKey=String(e.routeKey||"");e.disabled=Boolean(e.disabled)})});return input}
    function applyTf(){scene.style.transform="translate("+st.panX+"px,"+st.panY+"px) scale("+st.scale+")";bZoom.textContent=Math.round(st.scale*100)+"%"}
    function toWorld(cx,cy){var r=vp.getBoundingClientRect();return{x:(cx-r.left-st.panX)/st.scale,y:(cy-r.top-st.panY)/st.scale}}
    function ensureSize(wf){var maxX=0,maxY=0;(wf.nodes||[]).forEach(function(n){maxX=Math.max(maxX,n.x+n.w+220);maxY=Math.max(maxY,n.y+n.h+180)});wf.canvas.width=Math.max(Number(wf.canvas.width||0),maxX,1300);wf.canvas.height=Math.max(Number(wf.canvas.height||0),maxY,760);scene.style.width=wf.canvas.width+"px";scene.style.height=wf.canvas.height+"px";svg.setAttribute("viewBox","0 0 "+wf.canvas.width+" "+wf.canvas.height)}
    function path(a,b){var r=b.x>=a.x,sx=r?(a.x+a.w):a.x,sy=a.y+(a.h/2),ex=r?b.x:(b.x+b.w),ey=b.y+(b.h/2),sp=Math.max(85,Math.abs(ex-sx)*.45),c1=r?(sx+sp):(sx-sp),c2=r?(ex-sp):(ex+sp);return{d:"M "+sx+" "+sy+" C "+c1+" "+sy+", "+c2+" "+ey+", "+ex+" "+ey,mx:(sx+ex)/2,my:(sy+ey)/2}}
    function renderTabs(){var wf=getWf(),arr=(catalog&&catalog.workflows)||[];tabs.innerHTML=arr.map(function(x){return "<button class=\\\"btn "+((wf&&x.id===wf.id)?"active":"")+"\\\" data-tab=\\\""+esc(x.id)+"\\\">"+esc(x.name)+"</button>"}).join("");Array.from(tabs.querySelectorAll("[data-tab]")).forEach(function(b){b.onclick=function(){activeId=b.getAttribute("data-tab");st.from=null;selectedEdgeId=null;renderAll();fit()}})}
    function renderHidden(wf){var hs=(wf.edges||[]).filter(function(e){return e.disabled});hidden.innerHTML=hs.map(function(e){var t=e.label||e.routeKey||(e.from+" -> "+e.to);return "<button class=\\\"chip\\\" data-r=\\\""+esc(e.id)+"\\\">Restaurar: "+esc(t)+"</button>"}).join("");Array.from(hidden.querySelectorAll("[data-r]")).forEach(function(c){c.onclick=function(){var e=(wf.edges||[]).find(function(x){return x.id===c.getAttribute("data-r")});if(!e)return;e.disabled=false;markDirty();renderAll()}})}
    function renderEdges(wf){var map={};(wf.nodes||[]).forEach(function(n){map[n.id]=n});edgeLayer.innerHTML=(wf.edges||[]).filter(function(e){return !e.disabled}).map(function(e){var a=map[e.from],b=map[e.to];if(!a||!b)return "";var p=path(a,b),lab=e.label||e.routeKey||"";return "<g class=\\\"edge "+(e.id===selectedEdgeId?"sel":"")+"\\\" data-e=\\\""+esc(e.id)+"\\\"><path class=\\\"line\\\" d=\\\""+esc(p.d)+"\\\" stroke=\\\"rgba(255,214,193,.68)\\\" stroke-width=\\\"2\\\" fill=\\\"none\\\" marker-end=\\\"url(#arr)\\\"></path><rect x=\\\""+(p.mx-65)+"\\\" y=\\\""+(p.my-12)+"\\\" width=\\\"130\\\" height=\\\"20\\\" rx=\\\"9\\\" fill=\\\"rgba(16,24,38,.95)\\\"></rect><text x=\\\""+p.mx+"\\\" y=\\\""+(p.my+2)+"\\\" text-anchor=\\\"middle\\\" fill=\\\"#ffd8c8\\\" font-size=\\\"11\\\" font-family=\\\"JetBrains Mono\\\">"+esc(lab)+"</text></g>"}).join("");
      Array.from(edgeLayer.querySelectorAll("[data-e]")).forEach(function(g){g.onclick=function(ev){ev.stopPropagation();selectedEdgeId=g.getAttribute("data-e");renderEdges(wf)};g.ondblclick=function(ev){ev.stopPropagation();var e=(wf.edges||[]).find(function(x){return x.id===g.getAttribute("data-e")});if(!e)return;var nl=window.prompt("Etiqueta de linea:",e.label||"");if(nl===null)return;var nr=window.prompt("Route key (afecta chatbot):",e.routeKey||"");if(nr===null)return;e.label=String(nl||"").trim();e.routeKey=String(nr||"").trim();markDirty();renderAll()}})}
    function renderNodes(wf){nodeLayer.innerHTML=(wf.nodes||[]).map(function(n){return "<article class=\\\"node"+(st.from===n.id?" src":"")+"\\\" data-n=\\\""+esc(n.id)+"\\\" style=\\\"left:"+n.x+"px;top:"+n.y+"px;width:"+n.w+"px;height:"+n.h+"px;\\\"><div class=\\\"head\\\"><span class=\\\"kind\\\">"+esc(n.kind)+"</span><button class=\\\"open\\\" data-open=\\\""+esc(n.id)+"\\\">Abrir</button></div><div class=\\\"body\\\"><h3 class=\\\"nt\\\">"+esc(n.title)+"</h3><p class=\\\"ns\\\">"+esc(n.subtitle||"")+"</p></div><span class=\\\"port in\\\" data-in=\\\""+esc(n.id)+"\\\"></span><span class=\\\"port out\\\" data-out=\\\""+esc(n.id)+"\\\"></span></article>"}).join("");
      Array.from(nodeLayer.querySelectorAll("[data-open]")).forEach(function(b){b.onclick=function(ev){ev.stopPropagation();openModal(b.getAttribute("data-open"))}});
      Array.from(nodeLayer.querySelectorAll(".node")).forEach(function(el){el.ondblclick=function(){openModal(el.getAttribute("data-n"))}});
      bindDrag(wf);bindConnect(wf)}
    function bindDrag(wf){Array.from(nodeLayer.querySelectorAll(".node")).forEach(function(el){el.onpointerdown=function(ev){if(ev.target.closest("[data-open]")||ev.target.closest(".port"))return;var id=el.getAttribute("data-n"),n=getNode(wf,id);if(!n)return;st.drag={id:id,pid:ev.pointerId,start:toWorld(ev.clientX,ev.clientY),sx:n.x,sy:n.y,el:el};el.classList.add("drag");try{el.setPointerCapture(ev.pointerId)}catch(_e){}ev.preventDefault()};el.onpointermove=function(ev){if(!st.drag||st.drag.el!==el)return;var n=getNode(wf,st.drag.id);if(!n)return;var p=toWorld(ev.clientX,ev.clientY);n.x=Math.round(Math.max(0,st.drag.sx+(p.x-st.drag.start.x)));n.y=Math.round(Math.max(0,st.drag.sy+(p.y-st.drag.start.y)));el.style.left=n.x+"px";el.style.top=n.y+"px";ensureSize(wf);renderEdges(wf)};function end(){if(!st.drag||st.drag.el!==el)return;el.classList.remove("drag");st.drag=null;markDirty()}el.onpointerup=end;el.onpointercancel=end;el.onlostpointercapture=end})}
    function nextEdgeId(wf){var id;do{id="e_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,6)}while((wf.edges||[]).some(function(e){return e.id===id}));return id}
    function bindConnect(wf){Array.from(nodeLayer.querySelectorAll("[data-out]")).forEach(function(o){o.onclick=function(ev){ev.stopPropagation();if(!st.connect)return;st.from=o.getAttribute("data-out");renderNodes(wf)}});Array.from(nodeLayer.querySelectorAll("[data-in]")).forEach(function(i){i.onclick=function(ev){ev.stopPropagation();if(!st.connect||!st.from)return;var to=i.getAttribute("data-in"),from=st.from;if(from===to){st.from=null;renderNodes(wf);return}var sug=(from+"_"+to).replace(/[^a-zA-Z0-9_]/g,"_").toLowerCase();var rk=window.prompt("Route key (importante para chatbot):",sug);if(rk===null){st.from=null;renderNodes(wf);return}rk=String(rk||"").trim();var lb=window.prompt("Etiqueta visible de la linea:",rk||"conexion");if(lb===null){st.from=null;renderNodes(wf);return}wf.edges.push({id:nextEdgeId(wf),from:from,to:to,label:String(lb||"").trim(),routeKey:rk,disabled:false});st.from=null;markDirty();renderAll()}})}
    function renderAll(){var wf=getWf();if(!wf)return;wfTitle.textContent=wf.name;wfSub.textContent=wf.description||"";ensureSize(wf);renderTabs();renderHidden(wf);renderNodes(wf);renderEdges(wf);applyTf();bConnect.classList.toggle("connecting",st.connect)}
    function fit(){var wf=getWf();if(!wf||!wf.nodes||!wf.nodes.length)return;var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;wf.nodes.forEach(function(n){minX=Math.min(minX,n.x);minY=Math.min(minY,n.y);maxX=Math.max(maxX,n.x+n.w);maxY=Math.max(maxY,n.y+n.h)});var pad=90,cw=(maxX-minX)+(pad*2),ch=(maxY-minY)+(pad*2),vw=Math.max(240,vp.clientWidth),vh=Math.max(240,vp.clientHeight),s=clamp(Math.min(vw/cw,vh/ch),.22,1.35);st.scale=s;st.panX=Math.round((vw-(cw*s))/2-((minX-pad)*s));st.panY=Math.round((vh-(ch*s))/2-((minY-pad)*s));applyTf()}
    function zoom(next,cx,cy){var r=vp.getBoundingClientRect(),x=cx-r.left,y=cy-r.top,wx=(x-st.panX)/st.scale,wy=(y-st.panY)/st.scale;st.scale=clamp(next,.2,1.8);st.panX=Math.round(x-(wx*st.scale));st.panY=Math.round(y-(wy*st.scale));applyTf()}
    function bindPanZoom(){vp.onwheel=function(ev){ev.preventDefault();zoom(st.scale*(ev.deltaY<0?1.08:.92),ev.clientX,ev.clientY)};vp.onpointerdown=function(ev){if(ev.target.closest(".node")||ev.target.closest(".edge"))return;st.pan={pid:ev.pointerId,sx:ev.clientX,sy:ev.clientY,px:st.panX,py:st.panY};try{vp.setPointerCapture(ev.pointerId)}catch(_e){}};vp.onpointermove=function(ev){if(!st.pan||st.pan.pid!==ev.pointerId)return;st.panX=Math.round(st.pan.px+(ev.clientX-st.pan.sx));st.panY=Math.round(st.pan.py+(ev.clientY-st.pan.sy));applyTf()};function end(ev){if(st.pan&&st.pan.pid===ev.pointerId)st.pan=null}vp.onpointerup=end;vp.onpointercancel=end;vp.onlostpointercapture=end}
    function openModal(id){var wf=getWf(),n=wf?getNode(wf,id):null;if(!n)return;activeNodeId=n.id;mId.textContent="ID: "+n.id;mTitle.value=n.title||"";mSubtitle.value=n.subtitle||"";mExplain.value=n.explain||"";mMsg.value=n.botMessage||"";m.classList.add("v")}
    function closeModal(){m.classList.remove("v");activeNodeId=null}
    async function load(){setStatus("Cargando...","");try{var res=await fetch("/api/flows",{cache:"no-store"});if(!res.ok)throw new Error("status_"+res.status);catalog=norm(JSON.parse(JSON.stringify(await res.json())));activeId=activeId||(((catalog.workflows||[])[0]||{}).id||null);clearDirty();renderAll();fit()}catch(err){setStatus("Error cargando flujos","warn");console.error(err)}}
    async function save(){if(!catalog)return;setStatus("Guardando...","");try{var res=await fetch("/api/flows",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(catalog)});if(!res.ok)throw new Error("status_"+res.status);catalog=norm(await res.json());clearDirty();renderAll()}catch(err){setStatus("Error al guardar","warn");console.error(err)}}
    async function reset(){if(!window.confirm("Esto restaura el catalogo por defecto en backend. Continuar?"))return;setStatus("Reseteando...","");try{var res=await fetch("/api/flows/reset",{method:"POST"});if(!res.ok)throw new Error("status_"+res.status);catalog=norm(await res.json());activeId=(((catalog.workflows||[])[0]||{}).id||null);st.from=null;selectedEdgeId=null;clearDirty();renderAll();fit()}catch(err){setStatus("Error al resetear","warn");console.error(err)}}
    bConnect.onclick=function(){st.connect=!st.connect;if(!st.connect)st.from=null;renderAll()};bPlus.onclick=function(){var r=vp.getBoundingClientRect();zoom(st.scale*1.1,r.left+r.width/2,r.top+r.height/2)};bMinus.onclick=function(){var r=vp.getBoundingClientRect();zoom(st.scale*.9,r.left+r.width/2,r.top+r.height/2)};bZoom.onclick=function(){st.scale=1;st.panX=0;st.panY=0;applyTf()};bFit.onclick=function(){fit()};bDel.onclick=function(){var wf=getWf();if(!wf||!selectedEdgeId)return;var e=(wf.edges||[]).find(function(x){return x.id===selectedEdgeId});if(!e)return;e.disabled=true;selectedEdgeId=null;markDirty();renderAll()};bSave.onclick=function(){save()};bReset.onclick=function(){reset()};
    mSave.onclick=function(){var wf=getWf(),n=wf?getNode(wf,activeNodeId):null;if(!n){closeModal();return}n.title=String(mTitle.value||"").trim();n.subtitle=String(mSubtitle.value||"").trim();n.explain=String(mExplain.value||"").trim();n.botMessage=String(mMsg.value||"").trim();markDirty();closeModal();renderAll()};mClose.onclick=function(){closeModal()};m.onclick=function(ev){if(ev.target===m)closeModal()};
    window.onresize=function(){fit()};document.onkeydown=function(ev){if(ev.key==="Escape"){st.from=null;selectedEdgeId=null;closeModal();renderAll();return}if(ev.key==="Delete"||ev.key==="Backspace"){var wf=getWf();if(!wf||!selectedEdgeId)return;var e=(wf.edges||[]).find(function(x){return x.id===selectedEdgeId});if(!e)return;e.disabled=true;selectedEdgeId=null;markDirty();renderAll()}};edgeLayer.onclick=function(ev){if(!ev.target.closest(".edge")){selectedEdgeId=null;var wf=getWf();if(wf)renderEdges(wf)}};
    bindPanZoom();load();
  </script>
</body>
</html>`;
}

module.exports = {
  renderFlowDashboard
};
