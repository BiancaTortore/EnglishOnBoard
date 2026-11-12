/* English on Board · small server in front of the static app.
   Everything is the static site (assets) except:
     POST /api/feedback   a learner's comment → saved + mailed to FEEDBACK_TO
     POST /api/progress   anonymous progress snapshot of one device (no names)
     GET  /admin          page to read comments and usage (PIN protected)
     POST /api/admin      data for that page
     POST /api/ping       anonymous usage of the other ChartroomLab apps (BlackLog, CertWatch,
                          onboarding): one snapshot per device, no names, no content
   Bindings (wrangler.jsonc): ASSETS, EMAIL (send_email), DATA (KV, optional until created).
   Secrets (Cloudflare dashboard): FEEDBACK_TO (verified inbox), ADMIN_PIN. */
import { EmailMessage } from "cloudflare:email";

const FROM = "english@chartroomlab.com";
const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {"content-type": "application/json", "cache-control": "no-store"}});
const clip = (v, n) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, n).trim();

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/api/feedback" && req.method === "POST") return feedback(req, env);
      if (url.pathname === "/api/progress" && req.method === "POST") return progress(req, env);
      if (url.pathname === "/api/ping") return ping(req, env);
      if (url.pathname === "/api/admin" && req.method === "POST") return adminData(req, env);
      if (url.pathname === "/admin" || url.pathname === "/admin/") return new Response(ADMIN_HTML, {headers: {"content-type": "text/html;charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex"}});
      if (url.pathname.startsWith("/api/")) return json({error: "not found"}, 404);
    } catch (e) {
      return json({error: "server"}, 500);
    }
    return env.ASSETS.fetch(req);
  }
};

async function body(req, max = 20000) {
  const t = await req.text();
  if (t.length > max) throw new Error("too big");
  return JSON.parse(t || "{}");
}

/* ---------- feedback ---------- */
async function feedback(req, env) {
  let b; try { b = await body(req); } catch (e) { return json({error: "bad request"}, 400); }
  const f = {
    id: clip(b.id, 40) || crypto.randomUUID(),
    at: new Date().toISOString(),
    rating: Math.max(0, Math.min(5, parseInt(b.rating, 10) || 0)),
    comment: clip(b.comment, 4000),
    rank: clip(b.rank, 80),
    name: clip(b.name, 120),
    contact: clip(b.contact, 160),
    publish: !!b.publish,
    where: clip(b.where, 80),
    device: clip(b.device, 40),
    version: clip(b.version, 20)
  };
  if (!f.comment && !f.rating) return json({error: "empty"}, 400);
  let saved = false, mailed = false;
  if (env.DATA) {
    /* the same id twice (a retry from the offline queue) overwrites, never duplicates */
    await env.DATA.put(`f:${f.at.slice(0, 10)}:${f.id}`, JSON.stringify(f));
    saved = true;
  }
  if (env.EMAIL && env.FEEDBACK_TO) {
    try { await sendMail(env, f); mailed = true; } catch (e) {}
  }
  if (!saved && !mailed) return json({error: "not configured"}, 503);
  return json({ok: true, saved, mailed});
}

function sendMail(env, f) {
  const stars = f.rating ? "★".repeat(f.rating) + "☆".repeat(5 - f.rating) + ` (${f.rating}/5)` : "—";
  const text = [
    `Rating: ${stars}`,
    `Where: ${f.where || "—"}`,
    "",
    f.comment || "(no comment)",
    "",
    `Rank: ${f.rank || "—"}`,
    `Name: ${f.name || "—"}`,
    `Contact: ${f.contact || "—"}`,
    `May be published on chartroomlab.com: ${f.publish ? "YES" : "no"}`,
    "",
    `Device: ${f.device || "—"} · App ${f.version || "—"} · ${f.at}`
  ].join("\r\n");
  const subject = `English on Board feedback ${f.rating ? f.rating + "/5" : ""} · ${f.where || "app"}`.trim();
  const enc = s => "=?UTF-8?B?" + b64(s) + "?=";
  const raw = [
    `From: ${enc("English on Board")} <${FROM}>`,
    `To: <${env.FEEDBACK_TO}>`,
    `Subject: ${enc(subject)}`,
    `Message-ID: <${f.id}@chartroomlab.com>`,
    `Date: ${new Date(f.at).toUTCString()}`,
    ...(f.contact && /@/.test(f.contact) ? [`Reply-To: <${f.contact.replace(/[<>\r\n]/g, "")}>`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(text).replace(/.{1,76}/g, "$&\r\n")
  ].join("\r\n");
  return env.EMAIL.send(new EmailMessage(FROM, env.FEEDBACK_TO, raw));
}
function b64(s) { const bytes = new TextEncoder().encode(s); let bin = ""; bytes.forEach(c => bin += String.fromCharCode(c)); return btoa(bin); }

/* ---------- anonymous progress: one snapshot per device, overwritten each time ---------- */
async function progress(req, env) {
  if (!env.DATA) return json({ok: true, stored: false});
  let b; try { b = await body(req); } catch (e) { return json({error: "bad request"}, 400); }
  const id = clip(b.id, 40);
  if (!/^[a-z0-9-]{8,40}$/i.test(id)) return json({error: "bad id"}, 400);
  const lessons = {};
  for (const [k, v] of Object.entries(b.lessons || {}).slice(0, 40)) if (/^\d{1,2}$/.test(k)) lessons[k] = Math.max(0, Math.min(6, v | 0));
  const tests = {};
  for (const [k, v] of Object.entries(b.tests || {}).slice(0, 10)) if (/^m\d$/.test(k)) tests[k] = {best: Math.max(0, Math.min(100, v.best | 0)), passed: !!v.passed};
  const key = `d:${id}`;
  const prev = JSON.parse((await env.DATA.get(key)) || "null");
  const now = new Date().toISOString();
  const snap = {first: prev ? prev.first : now, last: now, device: clip(b.device, 40), installed: !!b.installed || !!(prev && prev.installed), lessons, tests, opens: (prev ? prev.opens || 0 : 0) + (b.open ? 1 : 0)};
  await env.DATA.put(key, JSON.stringify(snap));
  return json({ok: true, stored: true});
}

/* ---------- usage of the other ChartroomLab apps ----------
   Each app sends, from the phone, a snapshot of totals: how many times it was opened and a
   few counters (notes, certificates, missions). Never texts, names, cabins or documents. */
const PING_APPS = ["blacklog", "certwatch", "onboarding"];
const PING_ORIGIN = /^https:\/\/(([a-z0-9-]+\.)?chartroomlab\.com|[a-z0-9-]+\.bianca-tortore\.workers\.dev)$/;
async function ping(req, env) {
  const origin = req.headers.get("origin") || "";
  const ok = PING_ORIGIN.test(origin);
  const cors = ok ? {"access-control-allow-origin": origin, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type", "access-control-max-age": "86400", "vary": "origin"} : {};
  const out = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {"content-type": "application/json", "cache-control": "no-store", ...cors}});
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: cors});
  if (req.method !== "POST" || !ok) return out({error: "not allowed"}, 403);
  if (!env.DATA) return out({ok: true, stored: false});
  let b; try { b = await body(req, 4000); } catch (e) { return out({error: "bad request"}, 400); }
  const app = String(b.app || "");
  const id = clip(b.id, 40);
  if (!PING_APPS.includes(app) || !/^[a-z0-9-]{8,40}$/i.test(id)) return out({error: "bad data"}, 400);
  const stats = {};
  for (const [k, v] of Object.entries(b.stats || {}).slice(0, 10)) {
    if (!/^[a-z]{1,20}$/i.test(k)) continue;
    if (typeof v === "number") stats[k] = Math.max(0, Math.min(100000, Math.round(v)));
    else if (typeof v === "boolean") stats[k] = v;
    else stats[k] = clip(v, 20);
  }
  const key = `u:${app}:${id}`;
  const prev = JSON.parse((await env.DATA.get(key)) || "null");
  const now = new Date().toISOString();
  const snap = {app, id, host: new URL(origin).hostname, first: prev ? prev.first : now, last: now,
    device: clip(b.device, 40), installed: !!b.installed || !!(prev && prev.installed),
    opens: Math.max(prev ? prev.opens || 0 : 0, Math.min(100000, b.opens | 0)), stats};
  await env.DATA.put(key, JSON.stringify(snap));
  return out({ok: true, stored: true});
}

/* ---------- admin ---------- */
async function adminData(req, env) {
  let b; try { b = await body(req, 500); } catch (e) { return json({error: "bad request"}, 400); }
  const pin = String(b.pin || "");
  const ok = env.ADMIN_PIN && pin.length === String(env.ADMIN_PIN).length && timingSafe(pin, String(env.ADMIN_PIN));
  if (!ok) { await new Promise(r => setTimeout(r, 1200)); return json({error: "wrong pin"}, 401); }
  if (!env.DATA) return json({ok: true, configured: {data: false, email: !!(env.EMAIL && env.FEEDBACK_TO)}, feedback: [], devices: [], usage: []});
  const all = async prefix => {
    const out = []; let cursor;
    do {
      const r = await env.DATA.list({prefix, cursor});
      for (const k of r.keys) { const v = await env.DATA.get(k.name); if (v) out.push(JSON.parse(v)); }
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor && out.length < 5000);
    return out;
  };
  const [feedback, devices, usage] = await Promise.all([all("f:"), all("d:"), all("u:")]);
  feedback.sort((a, b) => b.at.localeCompare(a.at));
  return json({ok: true, configured: {data: true, email: !!(env.EMAIL && env.FEEDBACK_TO)}, feedback, devices, usage});
}
function timingSafe(a, b) { let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

const ADMIN_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>ChartroomLab · Panel</title>
<style>
:root{--bg:#09131A;--s:#112029;--ink:#E3EBF0;--mu:#93A6B3;--ru:#22394A;--ac:#FF6B35;--ok:#52C48C}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:20px 16px 60px}h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 10px}
.mu{color:var(--mu)}.card{background:var(--s);border:1px solid var(--ru);border-radius:12px;padding:14px;margin:10px 0}
input{font:inherit;padding:12px;border-radius:10px;border:1px solid var(--ru);background:var(--s);color:var(--ink);width:180px}
button{font:inherit;padding:11px 16px;border-radius:10px;border:0;background:var(--ac);color:#1A0A03;font-weight:700;cursor:pointer}
button.sec{background:transparent;color:var(--ink);border:1px solid var(--ru);font-weight:500}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.stats div{background:var(--s);border:1px solid var(--ru);border-radius:12px;padding:12px}
.stats b{display:block;font-size:28px;color:var(--ac)}table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:8px 6px;border-bottom:1px solid var(--ru);text-align:left}
th{color:var(--mu);font-weight:500}.bar{height:8px;border-radius:4px;background:var(--ru);overflow:hidden;min-width:80px}.bar i{display:block;height:100%;background:var(--ac)}
.fb p{margin:6px 0;white-space:pre-wrap}.tag{display:inline-block;font-size:12px;border:1px solid var(--ok);color:var(--ok);border-radius:999px;padding:1px 8px;margin-left:6px}
.warn{border-color:var(--ac)}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 18px}.tabs button{background:transparent;color:var(--mu);border:1px solid var(--ru);font-weight:500;padding:9px 14px}
.tabs button.on{background:var(--ac);color:#1A0A03;border-color:var(--ac);font-weight:700}td.n{text-align:right;font-variant-numeric:tabular-nums}
</style></head><body><main>
<h1>ChartroomLab · Panel</h1><p class="mu">Uso anónimo de tus herramientas y comentarios de English on Board.</p>
<form id="f" class="card"><label>PIN <input id="pin" type="password" inputmode="numeric" autocomplete="current-password"></label> <button>Entrar</button> <span id="msg" class="mu"></span></form>
<div id="out"></div>
<script>
const $=s=>document.querySelector(s),esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let DATA=null;
$("#f").onsubmit=async e=>{e.preventDefault();$("#msg").textContent="…";
  const r=await fetch("/api/admin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pin:$("#pin").value})});
  if(!r.ok){$("#msg").textContent=r.status===401?"PIN incorrecto":"Error "+r.status;return}
  DATA=await r.json();$("#f").hidden=true;draw()};
const APPS={eob:"English on Board",blacklog:"BlackLog",certwatch:"CertWatch",onboarding:"Onboarding"};let TAB="eob";
function draw(){
  $("#out").innerHTML='<nav class="tabs">'+Object.entries(APPS).map(([k,v])=>'<button class="'+(k===TAB?"on":"")+'" data-tab="'+k+'">'+v+'</button>').join("")+'</nav><div id="pane"></div>';
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{TAB=b.dataset.tab;draw()});
  if(TAB==="eob")drawEOB();else drawApp(TAB)}
const fecha=d=>d?new Date(d).toLocaleString("es-AR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"—";
const row=(a,b)=>'<tr><td>'+a+'</td><td class="n">'+b+'</td></tr>';
function drawApp(app){
  const U=(DATA.usage||[]).filter(u=>u.app===app),st=u=>u.stats||{},N=f=>U.filter(f).length,S=k=>U.reduce((a,u)=>a+(+st(u)[k]||0),0),week=Date.now()-7*864e5;
  let h='<div class="stats"><div><b>'+U.length+'</b>personas (celulares)</div><div><b>'+N(u=>new Date(u.last)>week)+'</b>activas esta semana</div><div><b>'+N(u=>u.installed)+'</b>instalaron la app</div><div><b>'+U.reduce((a,u)=>a+(u.opens||0),0)+'</b>veces abierta</div></div>';
  if(!U.length&&app==="onboarding"){$("#pane").innerHTML='<div class="card">El onboarding del Navvik Lancer guarda su uso en su propio panel: <a style="color:var(--ac)" href="https://navviklancer.chartroomlab.com/editar" target="_blank" rel="noopener">navviklancer.chartroomlab.com/editar</a> → pestaña <b>Uso</b>.</div>';return}
  if(!U.length){$("#pane").innerHTML=h+'<p class="mu">Todavía no hay datos. Empiezan a llegar cuando alguien abre la versión nueva de la app con conexión.</p>';return}
  if(app==="blacklog")h+='<h2>Uso</h2><table>'+row("Notas en la libreta (total)",S("notas"))+row("Personas con al menos una nota",N(u=>st(u).notas>0))+row("Pendientes abiertos (total)",S("pendientes"))+row("Embarques archivados (total)",S("archivados"))+'</table>';
  if(app==="certwatch")h+='<h2>Uso</h2><table>'+row("Certificados cargados (total)",S("certificados"))+row("Personas con al menos un certificado",N(u=>st(u).certificados>0))+row("Promedio por persona",(S("certificados")/U.length).toFixed(1))+row("Certificados vencidos (total)",S("vencidos"))+row("Vencen en menos de 90 días (total)",S("porvencer"))+'</table>';
  if(app==="onboarding"){
    const tot=Math.max(0,...U.map(u=>st(u).total||0));
    h+='<h2>¿Hasta dónde llegan?</h2><table>'+row("Abrieron su camarote",N(u=>st(u).camarote))+row("Marcaron al menos una misión",N(u=>st(u).misiones>0))+row("Completaron todas las misiones"+(tot?" ("+tot+")":""),N(u=>st(u).total&&st(u).misiones>=st(u).total))+row("Respondieron todo el quiz",N(u=>st(u).quiz>=6))+row("Aprobaron el quiz",N(u=>st(u).aprobado))+'</table>';
    const host={},lang={};U.forEach(u=>{host[u.host]=(host[u.host]||0)+1;const l=st(u).idioma;if(l)lang[l]=(lang[l]||0)+1});
    h+='<p class="mu">Sitio: '+Object.entries(host).map(([k,v])=>esc(k)+" "+v).join(" · ")+(Object.keys(lang).length?'<br>Idioma: '+Object.entries(lang).map(([k,v])=>esc(k).toUpperCase()+" "+v).join(" · "):"")+'</p>';
  }
  const dev={};U.forEach(u=>dev[u.device||"?"]=(dev[u.device||"?"]||0)+1);
  h+='<p class="mu">Celulares: '+Object.entries(dev).map(([k,v])=>esc(k)+" "+v).join(" · ")+'</p>';
  const main={blacklog:["notas","Notas"],certwatch:["certificados","Certif."],onboarding:["misiones","Misiones"]}[app];
  h+='<h2>Últimas visitas</h2><table><tr><th>Celular</th><th>Primera vez</th><th>Última vez</th><th>Aperturas</th><th>'+main[1]+'</th></tr>'+
    U.slice().sort((a,b)=>b.last.localeCompare(a.last)).slice(0,30).map(u=>'<tr><td>'+esc(u.device)+(u.installed?" · app":"")+'</td><td>'+fecha(u.first)+'</td><td>'+fecha(u.last)+'</td><td class="n">'+(u.opens||0)+'</td><td class="n">'+(st(u)[main[0]]||0)+'</td></tr>').join("")+'</table>';
  $("#pane").innerHTML=h}
function drawEOB(){
  const {feedback,devices,configured}=DATA,N=d=>devices.filter(d).length;
  const warn=[!configured.data&&"Falta conectar el almacenamiento (KV DATA): los comentarios no se guardan, solo llegan por mail.",!configured.email&&"Falta configurar el mail (FEEDBACK_TO): los comentarios no llegan a tu casilla."].filter(Boolean);
  const week=Date.now()-7*864e5,avg=feedback.filter(f=>f.rating).map(f=>f.rating);
  let h=warn.map(w=>'<div class="card warn">'+w+'</div>').join("");
  h+='<div class="stats"><div><b>'+devices.length+'</b>personas (celulares)</div><div><b>'+N(d=>new Date(d.last)>week)+'</b>activas esta semana</div><div><b>'+N(d=>d.installed)+'</b>instalaron la app</div><div><b>'+feedback.length+'</b>comentarios'+(avg.length?' · '+(avg.reduce((a,b)=>a+b,0)/avg.length).toFixed(1)+'★':'')+'</div></div>';
  h+='<h2>¿Hasta dónde llegan?</h2><table><tr><th>Lección</th><th>Empezaron</th><th>Terminaron</th><th></th></tr>';
  for(let n=1;n<=6;n++){const s=N(d=>(d.lessons||{})[n]>0),t=N(d=>(d.lessons||{})[n]>=6);if(n===6&&!s)continue;
    h+='<tr><td>Lesson '+n+'</td><td>'+s+'</td><td>'+t+'</td><td><div class="bar"><i style="width:'+(devices.length?Math.round(t/devices.length*100):0)+'%"></i></div></td></tr>'}
  const tt=devices.filter(d=>d.tests&&d.tests.m1);h+='<tr><td>Test Módulo 1</td><td>'+tt.length+'</td><td>'+tt.filter(d=>d.tests.m1.passed).length+' aprobaron</td><td></td></tr></table>';
  const dev={};devices.forEach(d=>dev[d.device||"?"]=(dev[d.device||"?"]||0)+1);
  h+='<p class="mu">Celulares: '+Object.entries(dev).map(([k,v])=>esc(k)+' '+v).join(" · ")+'</p>';
  h+='<h2>Comentarios</h2><button class="sec" id="csv">Descargar en Excel (CSV)</button>';
  h+=feedback.map(f=>'<div class="card fb"><b>'+(f.rating?"★".repeat(f.rating)+"☆".repeat(5-f.rating):"Sin estrellas")+'</b> <span class="mu">'+esc(f.where)+' · '+new Date(f.at).toLocaleString("es-AR")+'</span>'+(f.publish?'<span class="tag">se puede publicar</span>':'')+
    (f.comment?'<p>'+esc(f.comment)+'</p>':'')+'<span class="mu">'+[f.rank,f.name,f.contact,f.device].filter(Boolean).map(esc).join(" · ")+'</span></div>').join("")||'<p class="mu">Todavía no hay comentarios.</p>';
  $("#pane").innerHTML=h;
  $("#csv").onclick=()=>{const cols=["at","rating","where","comment","rank","name","contact","publish","device","version"];
    const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
    const csv="\\ufeff"+cols.join(",")+"\\n"+feedback.map(f=>cols.map(c=>q(f[c])).join(",")).join("\\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="english-on-board-comentarios.csv";a.click()};
}
</script></main></body></html>`;
