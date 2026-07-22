import type { Circuit, EseProject, Legend, LegendEntry, ProjectPage, SourceDocument } from "./types";

const escapeJson = (value: unknown): string =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export type StandalonePage = {
  page: ProjectPage;
  imageDataUrl: string;
};

type ExportPage = ProjectPage & { imageDataUrl: string };

type ExportPayload = {
  format: "ese-html-project";
  formatVersion: 1;
  project: {
    projectId: string;
    createdAt: string;
    modifiedAt: string;
    sources: SourceDocument[];
    legends: Legend[];
  };
  title: string;
  pages: ExportPage[];
  initialPageId: string;
  circuits: Circuit[];
  legendEntries: LegendEntry[];
};

const exportPageView = (page: ProjectPage) => {
  const candidate = page.view;
  if (
    !candidate ||
    ![candidate.x, candidate.y, candidate.width, candidate.height].every(Number.isFinite) ||
    candidate.width <= 0 ||
    candidate.height <= 0
  ) {
    return { x: 0, y: 0, width: page.width, height: page.height };
  }
  const view = { ...candidate };
  const marginX = view.width * 0.25;
  const marginY = view.height * 0.25;
  view.x = Math.max(-marginX, Math.min(page.width - view.width + marginX, view.x));
  view.y = Math.max(-marginY, Math.min(page.height - view.height + marginY, view.y));
  return view;
};

export const createStandaloneHtml = (
  project: EseProject,
  standalonePages: StandalonePage[],
  editable: boolean,
  initialPageId = standalonePages[0]?.page.id || ""
): string => {
  if (!standalonePages.length) throw new Error("Aucune page à exporter.");
  const exportedPageIds = new Set(standalonePages.map(({ page }) => page.id));
  const payload: ExportPayload = {
    format: "ese-html-project",
    formatVersion: 1,
    project: {
      projectId: project.projectId,
      createdAt: project.createdAt,
      modifiedAt: project.modifiedAt,
      sources: project.sources
        .map(({ originalPath: _originalPath, ...source }) => ({
          ...source,
          pageIds: source.pageIds.filter((pageId) => exportedPageIds.has(pageId))
        }))
        .filter((source) => source.pageIds.length > 0),
      legends: project.legends
    },
    title: project.title,
    pages: standalonePages.map(({ page, imageDataUrl }) => ({ ...page, imageDataUrl })),
    initialPageId: exportedPageIds.has(initialPageId) ? initialPageId : standalonePages[0].page.id,
    circuits: project.circuits
      .map((circuit) => ({
        ...circuit,
        traces: circuit.traces.filter((trace) => exportedPageIds.has(trace.pageId))
      }))
      .filter((circuit) => circuit.traces.length > 0 || exportedPageIds.size === project.pages.length),
    legendEntries: project.legendEntries
  };

  const editorControls = editable
    ? `<label class="mode"><input id="mode" type="checkbox"> Mode édition</label>
       <button id="add" type="button" hidden>Ajouter un tracé</button>
       <button id="finish" type="button" hidden disabled>Terminer</button>
       <button id="cancel" type="button" hidden disabled>Annuler</button>
       <button id="save" type="button" hidden>Enregistrer le HTML</button>`
    : "";
  const firstPage = payload.pages.find((page) => page.id === payload.initialPageId) || payload.pages[0];
  const firstView = exportPageView(firstPage);
  const pageControls = payload.pages.length > 1
    ? `<nav class="pages" aria-label="Navigation entre les pages"><button id="previous-page" type="button" aria-label="Page précédente">&lsaquo;</button><select id="page-select" aria-label="Page active"></select><button id="next-page" type="button" aria-label="Page suivante">&rsaquo;</button></nav>`
    : "";
  const viewControls = `<nav class="view" aria-label="Contrôle de la vue"><button id="zoom-out" type="button" aria-label="Dézoomer">−</button><button id="zoom-in" type="button" aria-label="Zoomer">+</button><button id="fit-view" type="button">Vue entière</button></nav>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(project.title)}</title>
<style>
:root{color-scheme:light dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;--bg:#eef1f5;--panel:#fff;--text:#202630;--muted:#697383;--border:#d8dde5;--accent:#2767d7}
@media(prefers-color-scheme:dark){:root{--bg:#15191f;--panel:#1d222a;--text:#ecf0f5;--muted:#a8b1bf;--border:#353d49;--accent:#76a7ff}}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text)}header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;background:var(--panel);border-bottom:1px solid var(--border)}header strong{margin-right:auto}button,select,.mode{min-height:34px;padding:6px 10px;border:1px solid var(--border);border-radius:7px;background:var(--panel);color:var(--text)}button{cursor:pointer}.mode,.pages,.view{display:inline-flex;align-items:center;gap:7px}.pages select{max-width:240px}.layout{display:grid;grid-template-columns:minmax(0,1fr) 260px;min-height:calc(100vh - 54px)}main{padding:12px;overflow:hidden}.sheet{background:#b7bec8;box-shadow:0 10px 28px #0003}.sheet svg{display:block;width:100%;height:auto}.sheet svg.panning{cursor:grabbing}.source{pointer-events:none}.reset{fill:transparent}.wire path{fill:none;stroke-linecap:round;stroke-linejoin:round}.outline{stroke:#fff;stroke-width:17;opacity:0}.main{stroke:var(--a);stroke-width:11;opacity:0}.stripe{stroke:var(--b);stroke-width:4;stroke-dasharray:12 7;opacity:0}.hit{stroke:transparent;stroke-width:25;pointer-events:stroke;cursor:pointer;vector-effect:non-scaling-stroke}.wire.hover .outline,.wire.hover .main,.wire.hover .stripe,.wire.selected .outline,.wire.selected .main,.wire.selected .stripe{opacity:1}.preview{fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}.preview.out{stroke:#fff;stroke-width:17}.preview.one{stroke:var(--a);stroke-width:11}.preview.two{stroke:var(--b);stroke-width:4;stroke-dasharray:12 7}aside{background:var(--panel);border-left:1px solid var(--border);padding:10px;overflow:auto}.row{width:100%;display:grid;grid-template-columns:28px 66px minmax(0,1fr);gap:7px;align-items:center;padding:7px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--text);text-align:left}.row:hover{background:color-mix(in srgb,var(--accent) 8%,transparent)}.row.selected{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,transparent)}.sw{width:24px;height:14px;border:1px solid #7778;border-radius:4px;background:linear-gradient(90deg,var(--a) 0 42%,var(--b,var(--a)) 42% 58%,var(--a) 58%)}.ref{font-weight:700}.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)}#status{width:100%;font-size:12px;color:var(--muted)}@media(max-width:760px){.layout{grid-template-columns:1fr}.layout aside{border-left:0;border-top:1px solid var(--border);max-height:300px}header strong{width:100%}.pages{order:2}}
</style>
</head>
<body>
<header><strong>${escapeHtml(project.title)}</strong>${pageControls}${viewControls}${editorControls}<output id="status">Aucun circuit sélectionné.</output></header>
<div class="layout">
<main><div class="sheet"><svg id="diagram" viewBox="${firstView.x} ${firstView.y} ${firstView.width} ${firstView.height}" aria-label="Schéma électrique interactif"><image class="source" id="source" href="${firstPage.imageDataUrl}" width="${firstPage.width}" height="${firstPage.height}"></image><rect class="reset" id="reset" width="${firstPage.width}" height="${firstPage.height}"></rect><g id="wires"></g><g id="preview"><path class="preview out"></path><path class="preview one"></path><path class="preview two"></path></g></svg></div></main>
<aside><div id="list"></div></aside>
</div>
<script type="application/json" id="ese-data">${escapeJson(payload)}</script>
<script>
(()=>{
const ns="http://www.w3.org/2000/svg",dataNode=document.getElementById("ese-data"),data=JSON.parse(dataNode.textContent),svg=document.getElementById("diagram"),source=document.getElementById("source"),reset=document.getElementById("reset"),layer=document.getElementById("wires"),list=document.getElementById("list"),status=document.getElementById("status"),pageSelect=document.getElementById("page-select"),previousPage=document.getElementById("previous-page"),nextPage=document.getElementById("next-page"),zoomOut=document.getElementById("zoom-out"),zoomIn=document.getElementById("zoom-in"),fit=document.getElementById("fit-view");
const editable=${editable ? "true" : "false"},mode=document.getElementById("mode"),add=document.getElementById("add"),finish=document.getElementById("finish"),cancel=document.getElementById("cancel"),save=document.getElementById("save"),preview=[...document.querySelectorAll(".preview")];
let selected=null,hovered=null,drawing=null,currentPageId=data.initialPageId,view=null,pan=null,suppressClick=false;
const page=()=>data.pages.find(x=>x.id===currentPageId)||data.pages[0],entry=id=>data.legendEntries.find(x=>x.id===id),circuit=id=>data.circuits.find(x=>x.id===id),ref=c=>c.referenceOverride||entry(c.legendEntryId)?.reference||"—";
const pageView=p=>{const v=p.view;if(!v||![v.x,v.y,v.width,v.height].every(Number.isFinite)||v.width<=0||v.height<=0)return{x:0,y:0,width:p.width,height:p.height};const r={...v},mx=r.width*.25,my=r.height*.25;r.x=Math.max(-mx,Math.min(p.width-r.width+mx,r.x));r.y=Math.max(-my,Math.min(p.height-r.height+my,r.y));return r};
const applyView=()=>{svg.setAttribute("viewBox",view.x+" "+view.y+" "+view.width+" "+view.height);page().view={...view}};
const clampView=()=>{const p=page(),mx=view.width*.25,my=view.height*.25;view.x=Math.max(-mx,Math.min(p.width-view.width+mx,view.x));view.y=Math.max(-my,Math.min(p.height-view.height+my,view.y))};
const zoomAt=(factor,center)=>{const p=page(),target=center||{x:view.x+view.width/2,y:view.y+view.height/2},width=Math.max(p.width/18,Math.min(p.width*1.4,view.width*factor)),height=width*(view.height/view.width),rx=(target.x-view.x)/view.width,ry=(target.y-view.y)/view.height;view={x:target.x-width*rx,y:target.y-height*ry,width,height};clampView();applyView()};
const path=points=>points.length?"M"+points.map((p,i)=>(i?"L":"")+p.x+" "+p.y).join(""):"";
const style=c=>entry(c.legendEntryId)?.highlight||{colors:["#e93478"],pattern:"solid"};
const pt=e=>{const m=svg.getScreenCTM();if(m){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(m.inverse());return{x:Math.round(q.x),y:Math.round(q.y)}}const r=svg.getBoundingClientRect(),v=svg.viewBox.baseVal;return{x:Math.round(v.x+(e.clientX-r.left)/r.width*v.width),y:Math.round(v.y+(e.clientY-r.top)/r.height*v.height)}};
const ortho=(a,b)=>Math.abs(b.x-a.x)>=Math.abs(b.y-a.y)?{x:b.x,y:a.y}:{x:a.x,y:b.y};
function setStatus(c,locked=false){status.textContent=c?ref(c)+" — "+(entry(c.legendEntryId)?.name||c.name)+(locked?" — sélection active":""):"Aucun circuit sélectionné."}
function select(id){selected=selected===id?null:id;render();setStatus(circuit(selected),!!selected)}
function setHover(id){hovered=id;document.querySelectorAll("[data-cid]").forEach(el=>el.classList.toggle("hover",el.dataset.cid===id))}
function render(){layer.replaceChildren();list.replaceChildren();for(const c of data.circuits){const s=style(c),g=document.createElementNS(ns,"g");g.dataset.cid=c.id;g.classList.add("wire");if(c.id===selected)g.classList.add("selected");if(c.id===hovered)g.classList.add("hover");g.style.setProperty("--a",s.colors[0]||"#e93478");g.style.setProperty("--b",s.colors[1]||"transparent");for(const cls of ["outline","main",...(s.colors[1]?["stripe"]:[]),"hit"]){const p=document.createElementNS(ns,"path");p.setAttribute("class",cls);p.setAttribute("d",c.traces.filter(t=>t.pageId===currentPageId).map(t=>path(t.points)).join(" "));g.append(p)}g.onpointerenter=()=>{if(!drawing){setHover(c.id);setStatus(c,c.id===selected)}};g.onpointerleave=()=>{setHover(null);setStatus(circuit(selected),!!selected)};g.onclick=e=>{e.stopPropagation();if(!drawing)select(c.id)};layer.append(g);
const row=document.createElement("button");row.dataset.cid=c.id;row.className="row"+(c.id===selected?" selected":"");row.innerHTML='<span class="sw"></span><span class="ref"></span><span class="name"></span>';row.style.setProperty("--a",s.colors[0]||"#777");row.style.setProperty("--b",s.colors[1]||s.colors[0]||"#777");row.querySelector(".ref").textContent=ref(c);row.querySelector(".name").textContent=c.name;row.onpointerenter=()=>{setHover(c.id);setStatus(c,c.id===selected)};row.onpointerleave=()=>{setHover(null);setStatus(circuit(selected),!!selected)};row.onclick=()=>select(c.id);list.append(row)}}
function showPreview(cursor){if(!drawing){preview.forEach(p=>p.setAttribute("d",""));return}const c=circuit(selected),s=style(c),points=drawing.points.slice();if(cursor&&points.length)points.push(ortho(points.at(-1),cursor));preview.forEach(p=>p.setAttribute("d",path(points)));preview.forEach(p=>{p.style.setProperty("--a",s.colors[0]);p.style.setProperty("--b",s.colors[1]||"transparent")})}
function begin(){if(!editable||!selected)return;drawing={points:[]};svg.style.cursor="crosshair";finish.disabled=true;cancel.disabled=false;setStatus(circuit(selected),true)}
function end(again=false){if(!drawing||drawing.points.length<2)return;const c=circuit(selected);c.traces.push({id:"trace-"+Date.now(),pageId:currentPageId,points:drawing.points});drawing=null;svg.style.cursor="";showPreview();render();finish.disabled=true;cancel.disabled=true;if(again)begin()}
function showPage(id){const next=data.pages.find(x=>x.id===id);if(!next)return;currentPageId=next.id;data.initialPageId=next.id;drawing=null;showPreview();view=pageView(next);applyView();source.setAttribute("href",next.imageDataUrl);source.setAttribute("width",next.width);source.setAttribute("height",next.height);reset.setAttribute("width",next.width);reset.setAttribute("height",next.height);if(pageSelect)pageSelect.value=next.id;const index=data.pages.findIndex(x=>x.id===next.id);if(previousPage)previousPage.disabled=index<=0;if(nextPage)nextPage.disabled=index>=data.pages.length-1;render();setStatus(circuit(selected),!!selected)}
svg.onpointerdown=e=>{if(drawing||(e.button!==0&&e.button!==1)||(e.target!==reset&&e.button!==1))return;pan={id:e.pointerId,x:e.clientX,y:e.clientY,viewX:view.x,viewY:view.y,moved:false};svg.classList.add("panning");svg.setPointerCapture(e.pointerId)};
svg.onpointermove=e=>{if(pan&&pan.id===e.pointerId){const rect=svg.getBoundingClientRect(),dx=(e.clientX-pan.x)/rect.width*view.width,dy=(e.clientY-pan.y)/rect.height*view.height;if(Math.hypot(e.clientX-pan.x,e.clientY-pan.y)>3)pan.moved=true;view.x=pan.viewX-dx;view.y=pan.viewY-dy;clampView();applyView();return}showPreview(pt(e))};
svg.onpointerup=e=>{if(!pan||pan.id!==e.pointerId)return;suppressClick=pan.moved;pan=null;svg.classList.remove("panning");if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId)};
svg.onclick=e=>{if(suppressClick){suppressClick=false;e.preventDefault();return}if(!drawing){selected=null;render();setStatus(null);return}let p=pt(e);if(drawing.points.length)p=ortho(drawing.points.at(-1),p);const last=drawing.points.at(-1);if(!last||last.x!==p.x||last.y!==p.y)drawing.points.push(p);finish.disabled=drawing.points.length<2;showPreview();if(e.detail>1)end(true)};svg.ondblclick=e=>e.preventDefault();
svg.onwheel=e=>{e.preventDefault();zoomAt(e.deltaY<0?0.86:1.16,pt(e))};zoomIn.onclick=()=>zoomAt(0.8);zoomOut.onclick=()=>zoomAt(1.25);fit.onclick=()=>{view={x:0,y:0,width:page().width,height:page().height};applyView()};
if(pageSelect){for(const p of data.pages){const option=document.createElement("option");option.value=p.id;option.textContent=p.name;pageSelect.append(option)}pageSelect.onchange=()=>showPage(pageSelect.value);previousPage.onclick=()=>{const i=data.pages.findIndex(x=>x.id===currentPageId);if(i>0)showPage(data.pages[i-1].id)};nextPage.onclick=()=>{const i=data.pages.findIndex(x=>x.id===currentPageId);if(i<data.pages.length-1)showPage(data.pages[i+1].id)}}
if(editable){mode.onchange=()=>{for(const el of [add,finish,cancel,save])el.hidden=!mode.checked;if(!mode.checked){drawing=null;showPreview()}};add.onclick=begin;finish.onclick=()=>end(false);cancel.onclick=()=>{drawing=null;showPreview();finish.disabled=true;cancel.disabled=true};save.onclick=()=>{dataNode.textContent=JSON.stringify(data).replaceAll("<","\\\\u003c");const blob=new Blob(["<!doctype html>\\n"+document.documentElement.outerHTML],{type:"text/html"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="ese-export-modifiable.html";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}
document.onkeydown=e=>{if(e.key==="Escape"&&drawing){drawing=null;showPreview()}else if(e.key==="Enter"&&drawing)end(false);else if(e.key==="Backspace"&&drawing){e.preventDefault();drawing.points.pop();showPreview()}};showPage(currentPageId);
})();
</script>
</body>
</html>`;
};
