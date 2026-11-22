/* English on Board · small server in front of the static app.
   Everything is the static site (assets) except:
     POST /api/feedback   a learner's comment → saved + mailed to FEEDBACK_TO
     POST /api/progress   anonymous progress snapshot of one device (no names)
     GET  /admin          page to read comments and usage (PIN protected)
     POST /api/admin      data for that page
     POST /api/cert       a course certificate: code, name, date and result (the learner typed the name for it)
     GET  /verify         page where anybody checks a certificate by its code
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
      if (url.pathname === "/api/cert" && req.method === "POST") return certSave(req, env);
      if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/me")) return accounts(req, url, env);
      if (url.pathname === "/verify" || url.pathname === "/verify/") return verify(url, env);
      if (url.pathname === "/api/admin" && req.method === "POST") return adminData(req, env);
      if (url.pathname === "/admin" || url.pathname === "/admin/") return new Response(ADMIN_HTML, {headers: {"content-type": "text/html;charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex"}});
      if (url.pathname.startsWith("/api/")) return json({error: "not found"}, 404);
      const lm = /^\/lessons\/lesson-(\d+)\.json$/.exec(url.pathname) || /^\/audio\/l(\d+)\//.exec(url.pathname);
      if (lm && !(await isFree(+lm[1], url, env))) return lockedContent(req, env);
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
  for (const [k, v] of Object.entries(b.tests || {}).slice(0, 10)) if (/^(m\d|final)$/.test(k)) tests[k] = {best: Math.max(0, Math.min(100, v.best | 0)), passed: !!v.passed};
  const key = `d:${id}`;
  const prev = JSON.parse((await env.DATA.get(key)) || "null");
  const now = new Date().toISOString();
  const snap = {first: prev ? prev.first : now, last: now, device: clip(b.device, 40), installed: !!b.installed || !!(prev && prev.installed), lessons, tests, opens: (prev ? prev.opens || 0 : 0) + (b.open ? 1 : 0)};
  await env.DATA.put(key, JSON.stringify(snap));
  return json({ok: true, stored: true});
}

/* ---------- paid content ----------
   Lessons of the free modules (course.json → beta.openModules) are public. The lesson text and the voices of the
   other modules go only to accounts with access (paid, given in /admin, or the author). The session travels in a
   cookie, so audio tags and the offline download carry it on their own; what is already saved on the phone keeps
   working at sea. */
let FREE = null, FREE_AT = 0;
async function isFree(n, url, env) {
  if (!FREE || Date.now() - FREE_AT > 300e3) {
    try {
      const c = await (await env.ASSETS.fetch(new Request(url.origin + "/course.json"))).json();
      const open = c.beta && c.beta.openModules;
      FREE = new Set(c.modules.filter(m => !open || open.includes(m.n)).flatMap(m => m.lessons.map(l => l.n)));
      FREE_AT = Date.now();
    } catch (e) { return false; }
  }
  return FREE.has(n);
}
const ACCESS = new Map();   /* token → {ok, until}: one KV read per minute, not one per audio clip */
async function hasAccess(tok, env) {
  if (!tok || !env.DATA) return false;
  const c = ACCESS.get(tok);
  if (c && c.until > Date.now()) return c.ok;
  const uid = await env.DATA.get(`s:${tok}`), a = uid && await kvJSON(env, `a:${uid}`);
  const authors = String(env.AUTHOR_EMAILS || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  const ok = !!(a && (a.paid || a.access || authors.includes(a.email)));
  ACCESS.set(tok, {ok, until: Date.now() + 60e3});
  if (ACCESS.size > 5000) ACCESS.clear();
  return ok;
}
const cookieTok = req => { const m = /(?:^|;\s*)eob_s=([A-Za-z0-9_-]{20,80})/.exec(req.headers.get("cookie") || ""); return m && m[1]; };
async function lockedContent(req, env) {
  if (!(await hasAccess(cookieTok(req), env))) return json({error: "locked"}, 403);
  const r = await env.ASSETS.fetch(req), h = new Headers(r.headers);
  h.set("cache-control", "private, max-age=3600");
  return new Response(r.body, {status: r.status, headers: h});
}
const withCookie = (res, tok) => {
  res.headers.append("set-cookie", tok ? `eob_s=${tok}; Path=/; Max-Age=${SESSION_TTL}; Secure; HttpOnly; SameSite=Lax` : "eob_s=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax");
  return res;
};

/* ---------- accounts ----------
   Sign in with a 6-digit code sent by e-mail, or with Google. No passwords.
   KV:  e:<email> → uid · a:<uid> → account (with progress) · s:<token> → uid (180 days) · o:<email> → pending code (10 min)
   Secrets/vars (Cloudflare dashboard): RESEND_KEY, MAIL_FROM ("English on Board <login@chartroomlab.com>"), GOOGLE_CLIENT_ID */
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const SESSION_TTL = 180 * 86400;
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha = async t => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
const rnd = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
const kvJSON = async (env, k) => JSON.parse((await env.DATA.get(k)) || "null");

async function accounts(req, url, env) {
  if (!env.DATA) return json({error: "not configured"}, 503);
  const p = url.pathname;
  if (req.method !== "POST") return json({error: "method"}, 405);
  let b; try { b = await body(req, 60000); } catch (e) { return json({error: "bad request"}, 400); }
  if (p === "/api/auth/code") return authCode(b, env);
  if (p === "/api/auth/verify") return authVerify(b, env);
  if (p === "/api/auth/google") return authGoogle(b, env);
  /* everything below needs a session */
  const tok = clip(b.token, 80), uid = tok && await env.DATA.get(`s:${tok}`);
  const acct = uid && await kvJSON(env, `a:${uid}`);
  if (!acct) return json({error: "signed out"}, 401);
  if (p === "/api/me") return withCookie(json({ok: true, user: publicUser(acct, env), progress: acct.progress || {}}), tok);
  if (p === "/api/me/progress") {
    acct.progress = b.replace ? mergeProgress({}, b.progress || {}) : mergeProgress(acct.progress || {}, b.progress || {});
    acct.updated = new Date().toISOString(); acct.device = clip(b.device, 20) || acct.device;
    const s = JSON.stringify(acct);
    if (s.length > 100000) return json({error: "too big"}, 413);
    await env.DATA.put(`a:${uid}`, s);
    return withCookie(json({ok: true, user: publicUser(acct, env), progress: acct.progress}), tok);
  }
  if (p === "/api/auth/logout") { await env.DATA.delete(`s:${tok}`); ACCESS.delete(tok); return withCookie(json({ok: true}), null); }
  if (p === "/api/me/delete") {
    await Promise.all([env.DATA.delete(`a:${uid}`), env.DATA.delete(`e:${acct.email}`), env.DATA.delete(`s:${tok}`)]);
    ACCESS.delete(tok);
    return withCookie(json({ok: true}), null);
  }
  return json({error: "not found"}, 404);
}
const publicUser = (a, env) => ({email: a.email, name: a.name || "", paid: !!a.paid, google: !!a.google,
  access: !!(a.paid || a.access || String((env && env.AUTHOR_EMAILS) || "").toLowerCase().split(/[\s,]+/).includes(a.email))});

async function authCode(b, env) {
  const email = clip(b.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return json({error: "bad email"}, 400);
  if (!env.RESEND_KEY || !env.MAIL_FROM) return json({error: "mail not configured"}, 503);
  /* at most 5 codes per address per hour */
  const rk = `r:${email}`, n = +(await env.DATA.get(rk) || 0);
  if (n >= 5) return json({error: "too many"}, 429);
  await env.DATA.put(rk, String(n + 1), {expirationTtl: 3600});
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  await env.DATA.put(`o:${email}`, JSON.stringify({h: await sha(code + email), tries: 0}), {expirationTtl: 600});
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#13212D">
    <p>Your English on Board sign-in code:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>
    <p style="color:#5B6670">It works for 10 minutes. If you didn't ask for it, ignore this e-mail.</p>
    <p style="color:#5B6670">Tu código para entrar a English on Board. Vale 10 minutos.</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {method: "POST",
    headers: {"authorization": `Bearer ${env.RESEND_KEY}`, "content-type": "application/json"},
    body: JSON.stringify({from: env.MAIL_FROM, to: [email], subject: `${code} is your English on Board code`, html,
      text: `Your English on Board sign-in code: ${code}\nIt works for 10 minutes.`})});
  if (!r.ok) return json({error: "mail failed"}, 502);
  return json({ok: true});
}
async function authVerify(b, env) {
  const email = clip(b.email, 254).toLowerCase(), code = clip(b.code, 10).replace(/\D/g, "");
  const k = `o:${email}`, o = await kvJSON(env, k);
  if (!o) return json({error: "expired"}, 400);
  if (o.h !== await sha(code + email)) {
    o.tries++;
    if (o.tries >= 5) await env.DATA.delete(k); else await env.DATA.put(k, JSON.stringify(o), {expirationTtl: 600});
    return json({error: o.tries >= 5 ? "expired" : "wrong code"}, 400);
  }
  await env.DATA.delete(k);
  return signIn(env, email, {}, b);
}
let GKEYS = null, GKEYS_AT = 0;
async function authGoogle(b, env) {
  if (!env.GOOGLE_CLIENT_ID) return json({error: "google not configured"}, 503);
  const parts = clip(b.credential, 4000).split(".");
  if (parts.length !== 3) return json({error: "bad token"}, 400);
  const dec = s => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))));
  let head, claims; try { head = dec(parts[0]); claims = dec(parts[1]); } catch (e) { return json({error: "bad token"}, 400); }
  if (!GKEYS || Date.now() - GKEYS_AT > 3600e3) { GKEYS = (await (await fetch("https://www.googleapis.com/oauth2/v3/certs")).json()).keys; GKEYS_AT = Date.now(); }
  const jwk = GKEYS.find(k => k.kid === head.kid);
  if (!jwk || head.alg !== "RS256") return json({error: "bad token"}, 400);
  const key = await crypto.subtle.importKey("jwk", jwk, {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["verify"]);
  const sig = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok || claims.aud !== env.GOOGLE_CLIENT_ID || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)
      || claims.exp * 1000 < Date.now() || !claims.email || !claims.email_verified) return json({error: "bad token"}, 400);
  return signIn(env, String(claims.email).toLowerCase(), {google: claims.sub, name: clip(claims.name, 80)}, b);
}
async function signIn(env, email, extra, b) {
  let uid = await env.DATA.get(`e:${email}`), acct = uid && await kvJSON(env, `a:${uid}`);
  if (!acct) {
    uid = rnd(12);
    acct = {uid, email, created: new Date().toISOString(), paid: false, progress: {}};
    await env.DATA.put(`e:${email}`, uid);
  }
  if (extra.google) acct.google = extra.google;
  if (extra.name && !acct.name) acct.name = extra.name;
  /* the progress already on the phone joins the account */
  if (b.progress) acct.progress = mergeProgress(acct.progress || {}, b.progress);
  acct.updated = new Date().toISOString(); acct.device = clip(b.device, 20) || acct.device;
  const dev = clip(b.id, 40);
  if (dev) acct.devices = [...new Set([...(acct.devices || []), dev])].slice(-10);
  await env.DATA.put(`a:${uid}`, JSON.stringify(acct));
  const token = rnd(32);
  await env.DATA.put(`s:${token}`, uid, {expirationTtl: SESSION_TTL});
  return withCookie(json({ok: true, token, user: publicUser(acct, env), progress: acct.progress}), token);
}
/* progress from two phones: lessons keep every finished session and the best scores; tests keep the best */
function mergeProgress(a, b) {
  const out = {...a};
  for (const [k, v] of Object.entries(b || {})) {
    if (/^l\d{1,2}$/.test(k) && v && typeof v === "object") {
      const o = out[k] || {done: [], scores: {}};
      const done = [...new Set([...(o.done || []), ...(Array.isArray(v.done) ? v.done : [])].map(x => clip(x, 20)))].slice(0, 12);
      const scores = {...(o.scores || {})};
      for (const [s, n] of Object.entries(v.scores || {})) if (typeof n === "number") scores[clip(s, 20)] = Math.max(scores[s] || 0, n);
      out[k] = {...o, ...v, done, scores};
    } else if (k === "tests" && v && typeof v === "object") {
      const t = {...(out.tests || {})};
      for (const [m, r] of Object.entries(v)) {
        if (!/^(m\d|final)$/.test(m) || !r) continue;
        const p = t[m] || {};
        t[m] = {best: Math.max(p.best || 0, r.best || 0), passed: !!(p.passed || r.passed), last: r.last ?? p.last};
      }
      out.tests = t;
    } else if (k === "cert" && v && !out.cert) out.cert = v;
    else if (!(k in out)) out[k] = v;   /* review queue and other small things: the first copy wins */
  }
  return out;
}

/* ---------- certificates ---------- */
const CERT_RE = /^EOB-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
async function certSave(req, env) {
  if (!env.DATA) return json({error: "not configured"}, 503);
  let b; try { b = await body(req, 2000); } catch (e) { return json({error: "bad request"}, 400); }
  const code = clip(b.code, 20), name = clip(b.name, 60).replace(/\s+/g, " "), id = clip(b.id, 40);
  const pct = b.pct | 0, date = clip(b.date, 10);
  if (!CERT_RE.test(code) || name.length < 3 || pct < 80 || pct > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-z0-9-]{8,40}$/i.test(id)) return json({error: "bad data"}, 400);
  const key = `c:${code}`, prev = JSON.parse((await env.DATA.get(key)) || "null");
  if (prev && prev.device !== id) return json({error: "code taken"}, 409);
  /* the course must really be passed on that phone */
  const dev = JSON.parse((await env.DATA.get(`d:${id}`)) || "null");
  const passed = !!(dev && dev.tests && dev.tests.final && dev.tests.final.passed);
  const c = prev || {code, name, pct, date, device: id, at: new Date().toISOString(), passed};
  if (!prev) await env.DATA.put(key, JSON.stringify(c));
  return json({ok: true});
}
async function verify(url, env) {
  const code = String(url.searchParams.get("c") || "").trim().toUpperCase().replace(/\s+/g, "");
  let found = null, asked = !!code;
  if (asked && CERT_RE.test(code) && env.DATA) found = JSON.parse((await env.DATA.get(`c:${code}`)) || "null");
  const e = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const when = found ? new Date(found.date + "T12:00:00Z").toLocaleDateString("en-GB", {day: "numeric", month: "long", year: "numeric", timeZone: "UTC"}) : "";
  const result = !asked ? "" : found
    ? `<div class="card ok"><span class="tag">Valid certificate</span><h2>${e(found.name)}</h2><p>completed <b>English on Board</b> (Maritime English for deck officers, 27 lessons in 7 modules) and passed the final test with <b>${found.pct}%</b> on <b>${e(when)}</b>.</p><p class="mu">Code ${e(found.code)}</p></div>`
    : `<div class="card no"><span class="tag">Not found</span><p>There is no English on Board certificate with the code <b>${e(code)}</b>. Check the letters and numbers and try again.</p></div>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Check a certificate · English on Board</title><link rel="icon" href="/icons/favicon-32.png">
<style>:root{--bg:#F4F6F7;--s:#fff;--ink:#13212D;--mu:#5B6670;--ru:#D5DCE1;--ac:#17506A;--ok:#2E9E5B;--no:#C8281C}
@media (prefers-color-scheme:dark){:root{--bg:#09131A;--s:#112029;--ink:#E3EBF0;--mu:#93A6B3;--ru:#22394A;--ac:#7FB8D6}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:560px;margin:0 auto;padding:28px 16px 60px}.brand{font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ac)}
h1{font-size:30px;margin:10px 0 6px}h2{font-size:26px;margin:8px 0 4px}.mu{color:var(--mu)}
form{display:flex;gap:8px;margin:18px 0}input{flex:1;min-width:0;font:inherit;padding:12px;border-radius:10px;border:1px solid var(--ru);background:var(--s);color:var(--ink);text-transform:uppercase}
button{font:inherit;font-weight:700;padding:12px 16px;border-radius:10px;border:0;background:var(--ac);color:#fff;cursor:pointer}
.card{background:var(--s);border:1px solid var(--ru);border-radius:12px;padding:16px;margin:12px 0}.card.ok{border-color:var(--ok)}.card.no{border-color:var(--no)}
.tag{display:inline-block;font-size:13px;font-weight:700;border-radius:999px;padding:2px 10px;color:#fff;background:var(--ok)}.no .tag{background:var(--no)}
.small{font-size:13px}a{color:var(--ac)}</style></head><body><main>
<p class="brand">ChartroomLab · English on Board</p><h1>Check a certificate</h1>
<p class="mu">Type the code printed on the certificate, for example EOB-7K3M-Q9TD.</p>
<form method="get" action="/verify"><input name="c" value="${e(code)}" placeholder="EOB-XXXX-XXXX" autocomplete="off" aria-label="Certificate code"><button>Check</button></form>
${result}
<p class="mu small">English on Board is a language course by Bianca Tortore, deck officer. It is not approved by the IMO and is not an STCW certificate. <a href="/">english.chartroomlab.com</a></p>
</main></body></html>`;
  return new Response(html, {status: asked && !found ? 404 : 200, headers: {"content-type": "text/html;charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex"}});
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
  const ok0 = env.ADMIN_PIN && pin.length === String(env.ADMIN_PIN).length && timingSafe(pin, String(env.ADMIN_PIN));
  const ok = ok0;
  if (!ok) { await new Promise(r => setTimeout(r, 1200)); return json({error: "wrong pin"}, 401); }
  /* give or take away access to the full course (beta testers, companies, the author's second account) */
  if (b.action === "access" && env.DATA) {
    const email = clip(b.email, 254).toLowerCase(), uid = await env.DATA.get(`e:${email}`), a = uid && await kvJSON(env, `a:${uid}`);
    if (!a) return json({error: "no account"}, 404);
    a.access = !!b.value; await env.DATA.put(`a:${uid}`, JSON.stringify(a)); ACCESS.clear();
    return json({ok: true});
  }
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
  const [feedback, devices, usage, certs, accts] = await Promise.all([all("f:"), all("d:"), all("u:"), all("c:"), all("a:")]);
  const accounts = {total: accts.length, google: accts.filter(a => a.google).length, paid: accts.filter(a => a.paid).length,
    list: accts.map(a => ({email: a.email, created: a.created, updated: a.updated, google: !!a.google, paid: !!a.paid, access: !!a.access,
      lessons: Object.keys(a.progress || {}).filter(k => /^l\d+$/.test(k) && ((a.progress[k].done || []).length >= 6)).length}))
      .sort((x, y) => String(y.updated).localeCompare(String(x.updated)))};
  feedback.sort((a, b) => b.at.localeCompare(a.at));
  certs.sort((a, b) => b.at.localeCompare(a.at));
  return json({ok: true, configured: {data: true, email: !!(env.EMAIL && env.FEEDBACK_TO)}, feedback, devices, usage, certs, accounts});
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
document.addEventListener("click",async e=>{const b=e.target.closest("[data-acc]");if(!b)return;b.disabled=true;
  const r=await fetch("/api/admin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pin:$("#pin").value,action:"access",email:b.dataset.acc,value:b.dataset.v==="1"})});
  if(!r.ok){b.disabled=false;alert("No se pudo");return}
  const a=DATA.accounts.list.find(x=>x.email===b.dataset.acc);a.access=b.dataset.v==="1";draw()});
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
  const MODS=[[1,6],[7,9],[10,12],[13,16],[17,20],[21,24],[25,27]];
  MODS.forEach(([a,b],i)=>{
    for(let n=a;n<=b;n++){const s=N(d=>(d.lessons||{})[n]>0),t=N(d=>(d.lessons||{})[n]>=6);
      h+='<tr><td>Lesson '+n+'</td><td>'+s+'</td><td>'+t+'</td><td><div class="bar"><i style="width:'+(devices.length?Math.round(t/devices.length*100):0)+'%"></i></div></td></tr>'}
    const k="m"+(i+1),tt=devices.filter(d=>d.tests&&d.tests[k]);
    h+='<tr><td><b>Test Módulo '+(i+1)+'</b></td><td>'+tt.length+'</td><td>'+tt.filter(d=>d.tests[k].passed).length+' aprobaron</td><td></td></tr>'});
  const tf=devices.filter(d=>d.tests&&d.tests.final);h+='<tr><td><b>Examen final</b></td><td>'+tf.length+'</td><td>'+tf.filter(d=>d.tests.final.passed).length+' aprobaron</td><td></td></tr></table>';
  const AC=DATA.accounts||{total:0,google:0,paid:0};
  h+='<h2>Cuentas</h2><p>'+AC.total+' cuentas · '+AC.google+' con Google · '+AC.paid+' pagaron</p>';
  if((AC.list||[]).length)h+='<table><tr><th>Mail</th><th>Lecciones</th><th>Último uso</th><th>Curso completo</th></tr>'+AC.list.map(a=>'<tr><td>'+esc(a.email)+(a.google?' <span class="mu">· Google</span>':'')+'</td><td class="n">'+a.lessons+'</td><td>'+fecha(a.updated)+'</td><td>'+(a.paid?'Pagó':'<button data-acc="'+esc(a.email)+'" data-v="'+(a.access?0:1)+'">'+(a.access?'Quitar acceso':'Dar acceso')+'</button>')+'</td></tr>').join("")+'</table>';
  const C=DATA.certs||[];
  h+='<h2>Certificados ('+C.length+')</h2>'+(C.length?'<table><tr><th>Nombre</th><th>Código</th><th>Nota</th><th>Fecha</th></tr>'+C.map(c=>'<tr><td>'+esc(c.name)+'</td><td><a style="color:var(--ac)" href="/verify?c='+esc(c.code)+'" target="_blank">'+esc(c.code)+'</a></td><td class="n">'+c.pct+'%</td><td>'+esc(c.date)+'</td></tr>').join("")+'</table>':'<p class="mu">Todavía nadie terminó el curso.</p>');
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
