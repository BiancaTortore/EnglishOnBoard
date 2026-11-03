/* English on Board · small server in front of the static app.
   Everything is the static site (assets) except:
     POST /api/feedback   a learner's comment → saved + mailed to FEEDBACK_TO
     POST /api/progress   anonymous progress snapshot of one device (no names)
     GET  /admin          page to read comments and usage (PIN protected)
     POST /api/admin      data for that page
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

/* ---------- admin ---------- */
async function adminData(req, env) {
  let b; try { b = await body(req, 500); } catch (e) { return json({error: "bad request"}, 400); }
  const pin = String(b.pin || "");
  const ok = env.ADMIN_PIN && pin.length === String(env.ADMIN_PIN).length && timingSafe(pin, String(env.ADMIN_PIN));
  if (!ok) { await new Promise(r => setTimeout(r, 1200)); return json({error: "wrong pin"}, 401); }
  if (!env.DATA) return json({ok: true, configured: {data: false, email: !!(env.EMAIL && env.FEEDBACK_TO)}, feedback: [], devices: []});
  const all = async prefix => {
    const out = []; let cursor;
    do {
      const r = await env.DATA.list({prefix, cursor});
      for (const k of r.keys) { const v = await env.DATA.get(k.name); if (v) out.push(JSON.parse(v)); }
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor && out.length < 5000);
    return out;
  };
  const [feedback, devices] = await Promise.all([all("f:"), all("d:")]);
  feedback.sort((a, b) => b.at.localeCompare(a.at));
  return json({ok: true, configured: {data: true, email: !!(env.EMAIL && env.FEEDBACK_TO)}, feedback, devices});
}
function timingSafe(a, b) { let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

const ADMIN_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>English on Board · Beta</title>
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
</style></head><body><main>
<h1>English on Board · Beta</h1><p class="mu">Comentarios y uso anónimo de la app.</p>
<form id="f" class="card"><label>PIN <input id="pin" type="password" inputmode="numeric" autocomplete="current-password"></label> <button>Entrar</button> <span id="msg" class="mu"></span></form>
<div id="out"></div>
<script>
const $=s=>document.querySelector(s),esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let DATA=null;
$("#f").onsubmit=async e=>{e.preventDefault();$("#msg").textContent="…";
  const r=await fetch("/api/admin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pin:$("#pin").value})});
  if(!r.ok){$("#msg").textContent=r.status===401?"PIN incorrecto":"Error "+r.status;return}
  DATA=await r.json();$("#f").hidden=true;draw()};
function draw(){
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
  $("#out").innerHTML=h;
  $("#csv").onclick=()=>{const cols=["at","rating","where","comment","rank","name","contact","publish","device","version"];
    const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
    const csv="\\ufeff"+cols.join(",")+"\\n"+feedback.map(f=>cols.map(c=>q(f[c])).join(",")).join("\\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="english-on-board-comentarios.csv";a.click()};
}
</script></main></body></html>`;
