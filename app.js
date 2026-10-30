/* English on Board · app engine
   One engine for all lessons. Content lives in course.json + lessons/lesson-NN.json.
   Audio: plays audio/lNN/<id>.mp3 when it exists; otherwise falls back to the phone's speech voices.
*/
"use strict";

/* =========================================================
   VOICES — fallback speech settings per character (see BIBLE.md §3)
   ========================================================= */
const VOICES = {
  diego:   {name:"Diego",   langs:["en-US","en-GB"], rate:.92, pitch:.95},
  lars:    {name:"Captain", langs:["en-GB","en-US"], rate:.88, pitch:.80},
  tanya:   {name:"Tanya",   langs:["en-GB"],         rate:.95, pitch:1.08},
  james:   {name:"James",   langs:["en-IE","en-GB"], rate:1.0, pitch:1.0},
  marek:   {name:"Marek",   langs:["en-GB","en-US"], rate:.90, pitch:.85},
  rolando: {name:"Rolando", langs:["en-PH","en-IN","en-AU","en-US"], rate:1.0, pitch:.85, pick:1},
  mario:   {name:"Mario",   langs:["en-PH","en-IN","en-US"], rate:1.0, pitch:1.0},
  chen:    {name:"Lt Chen", langs:["en-US"],         rate:1.0, pitch:1.1},
  pilot:   {name:"Pilot",   langs:["en-GB","en-US"], rate:1.0, pitch:.9},
  agent:   {name:"Agent",   langs:["en-US"],         rate:1.0, pitch:1.0},
  terminal:{name:"Terminal",langs:["en-US"],         rate:1.05, pitch:.95},
  model:   {name:"Model",   langs:["en-GB"],         rate:.92, pitch:1.0}
};
/* words the phone's voices tend to mispronounce */
const RESPELL = {starboard:"starbuhd", bosun:"bohsun", forecastle:"fohksul", "fo'c'sle":"fohksul", amidships:"amid-ships"};

/* =========================================================
   STATE
   ========================================================= */
const KEY = "eob-progress-v1";
let progress = {};
try { progress = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
function saveProgress(){ try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) {} }
function lessonProgress(n){ return progress["l"+n] || (progress["l"+n] = {done:[]}); }

let COURSE = null, L = null, PLATE_SVG = "";
const pad = n => String(n).padStart(2, "0");
const lessonDir = () => "l" + pad(L.n);

/* =========================================================
   HELPERS
   ========================================================= */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const norm = s => String(s).toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const clip = id => L.audio[id] || {voice:"model", text:id};
const voiceName = v => (VOICES[v] || {}).name || v;

async function getJSON(url){ const r = await fetch(url, {cache:"no-cache"}); if (!r.ok) throw new Error(url + " " + r.status); return r.json(); }

/* =========================================================
   AUDIO
   ========================================================= */
const canSpeak = "speechSynthesis" in window;
let enVoices = [];
function loadVoices(){ if (canSpeak) enVoices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); }
if (canSpeak) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function pickVoice(key){
  const cfg = VOICES[key] || VOICES.model;
  if (!enVoices.length) return null;
  for (const lang of cfg.langs) {
    const m = enVoices.filter(v => v.lang.replace("_", "-") === lang);
    if (m.length) return m[Math.min(cfg.pick || 0, m.length - 1)];
  }
  return enVoices[0];
}

let actx = null, noiseSrc = null, noiseGain = null, currentEl = null;
const missing = new Set();
function ctx(){
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (actx && actx.state === "suspended") actx.resume();
  return actx;
}
function staticOn(level){
  const c = ctx(); if (!c) return;
  staticOff();
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseSrc = c.createBufferSource(); noiseSrc.buffer = b; noiseSrc.loop = true;
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = .8;
  noiseGain = c.createGain(); noiseGain.gain.value = level;
  noiseSrc.connect(bp).connect(noiseGain).connect(c.destination); noiseSrc.start();
}
function staticLevel(v){ if (noiseGain && actx) noiseGain.gain.setTargetAtTime(v, actx.currentTime, .02); }
function staticOff(){ try { noiseSrc && noiseSrc.stop(); } catch (e) {} noiseSrc = null; noiseGain = null; }
async function squelch(){ if (!ctx()) return; staticLevel(.22); await wait(140); staticLevel(.035); }

let playToken = 0;
function stopAll(){
  playToken++;
  if (canSpeak) speechSynthesis.cancel();
  if (currentEl) { try { currentEl.pause(); } catch (e) {} currentEl = null; }
  staticOff();
}

function speakTTS(text, voice, rate){
  return new Promise(res => {
    if (!canSpeak) { res(); return; }
    let t = text;
    for (const [w, r] of Object.entries(RESPELL)) t = t.replace(new RegExp("\\b" + w + "\\b", "gi"), r);
    const cfg = VOICES[voice] || VOICES.model;
    const u = new SpeechSynthesisUtterance(t);
    const v = pickVoice(voice); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-GB";
    u.rate = (rate || 1) * cfg.rate; u.pitch = cfg.pitch;
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    u.onend = fin; u.onerror = fin; setTimeout(fin, Math.max(3000, text.length * 140 / (rate || 1)));
    speechSynthesis.speak(u);
  });
}

/* Try the recorded file; resolve false if it doesn't exist */
function playFile(file, {radio, rate}, tok){
  return new Promise(res => {
    if (missing.has(file)) { res(false); return; }
    const el = new Audio(); let started = false, settled = false;
    const end = ok => { if (!settled) { settled = true; res(ok); } };
    el.preload = "auto"; el.src = file;
    if ("preservesPitch" in el) el.preservesPitch = true;
    el.playbackRate = rate || 1;
    el.onerror = () => { if (!started) missing.add(file); end(started); };
    el.onended = () => end(true);
    el.onpause = () => { if (started && el.currentTime < el.duration - .05) end(true); };
    const timer = setTimeout(() => { if (!started) { missing.add(file); end(false); } }, 5000);
    el.oncanplay = () => {
      if (started || tok !== playToken) return;
      started = true; clearTimeout(timer);
      if (radio && ctx()) {
        try {
          const c = actx, src = c.createMediaElementSource(el);
          const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 380;
          const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2900;
          const ws = c.createWaveShaper(); const k = new Float32Array(256);
          for (let i = 0; i < 256; i++) { const x = i / 128 - 1; k[i] = Math.tanh(2.2 * x); }
          ws.curve = k;
          src.connect(hp).connect(lp).connect(ws).connect(c.destination);
        } catch (e) {}
      }
      currentEl = el;
      el.play().catch(() => end(false));
    };
  });
}

async function playPart(id, text, voice, radio, rate, tok){
  /* the model voice (words, examples, model answers) always uses the phone's voice */
  if (voice === "model") { await speakTTS(text, voice, rate); return; }
  const file = `audio/${lessonDir()}/${id}.mp3`;
  const ok = await playFile(file, {radio, rate}, tok);
  if (!ok && tok === playToken) await speakTTS(text, voice, rate);
}

/* Play one clip by id. Text with "|" = two halves cut by static. */
async function playClip(id, {rate = 1, garble = false} = {}, tokIn){
  const tok = tokIn ?? ++playToken;
  if (tokIn == null && canSpeak) speechSynthesis.cancel();
  const c = clip(id), radio = !!c.radio;
  if (radio) { staticOn(.035); await squelch(); }
  const parts = String(c.text).split("|");
  for (let i = 0; i < parts.length; i++) {
    if (tok !== playToken) return;
    const pid = parts.length > 1 ? `${id}-${"ab"[i]}` : id;
    if (parts[i].trim()) await playPart(pid, parts[i], c.voice, radio, rate, tok);
    if (i < parts.length - 1) { staticLevel(.32); await wait(c.garble || garble ? 900 : 400); staticLevel(.035); }
  }
  if (radio && tok === playToken) { await squelch(); staticOff(); }
}
async function playSeq(ids, {rate = 1, onLine} = {}){
  const tok = ++playToken;
  if (canSpeak) speechSynthesis.cancel();
  for (const id of ids) {
    if (tok !== playToken) return;
    onLine && onLine(id);
    await playClip(id, {rate}, tok);
    await wait(250);
  }
  onLine && onLine(null);
}

/* =========================================================
   ICONS
   ========================================================= */
const I = {
  play:'<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  stop:'<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  spk:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  slow:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  x:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  mic:'<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  ear:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>',
  tag:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5" fill="currentColor"/></svg>',
  chat:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  doc:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7"/></svg>',
  check:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  wheel:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>'
};
const SKILL_ICON = {Listening:"ear", Vocabulary:"tag", Phrases:"chat", Reading:"doc", Speaking:"mic", Review:"check"};

/* =========================================================
   CHECK BAR
   ========================================================= */
const app = $("#app");
function setBar(html, cls){
  let b = $("#checkbar");
  if (!b) { b = document.createElement("div"); b.id = "checkbar"; document.body.appendChild(b); }
  b.className = "checkbar" + (cls ? " " + cls : "");
  b.innerHTML = `<div class="checkbar-in">${html}</div>`;
  return b;
}
function clearBar(){ const b = $("#checkbar"); if (b) b.remove(); }

/* =========================================================
   HOME
   ========================================================= */
function viewHome(){
  stopAll(); clearBar(); location.hash = "";
  const all = COURSE.modules.flatMap(m => m.lessons);
  const isDone = l => { const p = progress["l"+l.n]; return p && p.done.length >= 6; };
  const current = all.find(l => l.ready && !isDone(l)) || all.filter(l => l.ready).pop();
  const cp = current ? lessonProgress(current.n) : null;
  app.innerHTML = `<div class="home">
    <div class="brand"><div class="brand-mark">${I.wheel}</div><div><h1>${esc(COURSE.title)}</h1><p>${esc(COURSE.subtitle)}</p></div></div>
    ${current ? `<button class="continue" data-n="${current.n}">
      <span class="mono">${cp.done.length ? "Continue" : "Start here"} · Lesson ${current.n}</span>
      <h2>${esc(current.title)}</h2>
      <span class="note" style="color:inherit;opacity:.85">${cp.done.length} of 6 sessions done</span>
      <span class="go">${cp.done.length ? "CONTINUE" : "START"}</span></button>` : ""}
    ${COURSE.modules.map(m => `<section class="module">
      <div class="module-head"><h3>${m.n} · ${esc(m.title)}</h3><span class="mono">${esc(m.where || "")}</span></div>
      <ol class="route">${m.lessons.map(l => {
        const d = isDone(l), cur = current && l.n === current.n;
        const meta = !l.ready ? "Coming soon" : d ? "Done" : `${lessonProgress(l.n).done.length} of 6 sessions`;
        return `<li class="stop ${l.ready ? "ready" : ""} ${cur ? "current" : ""} ${d ? "complete" : ""}">
          <button class="stop-btn" ${l.ready ? `data-n="${l.n}"` : "disabled"}>
            <span class="stop-dot">${d ? I.check : l.n}</span>
            <span class="stop-body"><span class="stop-title">${esc(l.title)}</span><span class="stop-meta">${meta}</span></span></button></li>`;
      }).join("")}</ol></section>`).join("")}
    <p class="note">Prototype build. Progress is saved on this device.</p>
  </div>`;
  $$("[data-n]").forEach(b => b.onclick = () => openLesson(+b.dataset.n));
  window.scrollTo(0, 0);
}

/* =========================================================
   LESSON
   ========================================================= */
async function openLesson(n){
  stopAll(); clearBar();
  app.innerHTML = `<p class="loading">Loading lesson ${n}…</p>`;
  try {
    L = await getJSON(`lessons/lesson-${pad(n)}.json`);
    PLATE_SVG = "";
    if (L.plate && L.plate.svg) {
      try { const r = await fetch(L.plate.svg); if (r.ok) PLATE_SVG = await r.text(); } catch (e) {}
    }
  } catch (e) {
    app.innerHTML = `<div class="home"><p>Lesson ${n} could not be loaded. Check your connection and try again.</p><button class="cta" id="home">Back</button></div>`;
    $("#home").onclick = viewHome; return;
  }
  location.hash = "l" + n;
  viewLesson();
}

function viewLesson(){
  stopAll(); clearBar();
  const p = lessonProgress(L.n);
  const nextIdx = L.sessions.findIndex(s => !p.done.includes(s.id));
  const hero = L.images && L.images.hero;
  app.innerHTML = `<div class="lesson">
    <header class="hero" id="hero">
      ${hero ? `<img src="${esc(hero)}" alt="" onload="this.parentNode.classList.add('has-img')" onerror="this.remove()">` : ""}
      <button class="back" id="back">${I.back} All lessons</button>
      <span class="mono">${esc(L.place)}</span>
      <h2>${L.n} · ${esc(L.title)}</h2>
      <p>${esc(L.goal)}</p>
    </header>
    <ol class="sessions">${L.sessions.map((s, i) => {
      const d = p.done.includes(s.id), nx = i === nextIdx;
      return `<li><button class="sess ${d ? "done" : ""} ${nx ? "next" : ""}" data-i="${i}">
        <span class="sess-ico">${d ? I.check : I[SKILL_ICON[s.skill] || "chat"]}</span>
        <span class="sess-body"><span class="sess-title">${esc(s.title)}</span><span class="sess-meta">${esc(s.skill)} · ${s.min} min</span></span>
        <span class="sess-go">${d ? "AGAIN" : nx ? "START" : ""}</span></button></li>`;
    }).join("")}</ol>
    ${nextIdx === -1 ? `<div class="panel"><b>Lesson complete.</b> <span class="sub">The words from this lesson go into your daily review.</span></div>` : ""}
  </div>`;
  $("#back").onclick = viewHome;
  $$(".sess").forEach(b => b.onclick = () => startSession(+b.dataset.i));
  window.scrollTo(0, 0);
}

/* =========================================================
   SESSION PLAYER
   ========================================================= */
let S = null;
function startSession(i){
  const sess = L.sessions[i];
  S = {i, sess, queue: sess.screens.map(s => ({...s})), pos: 0, graded: 0, firstRight: 0, missed: 0};
  app.innerHTML = `<div class="player"><div class="topbar"><button class="x" id="quit" aria-label="Close session">${I.x}</button><div class="bar"><i id="prog"></i></div></div><div class="stage" id="stage"></div></div>`;
  $("#quit").onclick = () => { stopAll(); viewLesson(); };
  render();
}
function showProgress(){ $("#prog").style.width = Math.round(S.pos / S.queue.length * 100) + "%"; }
function next(){ stopAll(); S.pos++; if (S.pos >= S.queue.length) finish(); else render(); }

function cont(label = "Continue", enabled = true){
  setBar(`<button class="cta" id="go" ${enabled ? "" : "disabled"}>${esc(label)}</button>`);
  $("#go").onclick = next;
}
function checkBtn(evalFn, info = {}){
  setBar(`<button class="cta" id="go" disabled>Check</button>`);
  $("#go").onclick = () => verdict(evalFn(), info.answer, info.why);
}
function enableCheck(on = true){ const g = $("#go"); if (g) g.disabled = !on; }
function verdict(ok, answer, why){
  const sc = S.queue[S.pos];
  if (!sc.retry) { S.graded++; if (ok) S.firstRight++; }
  if (!ok && !sc.retry) { S.queue.push({...sc, retry: true}); S.missed++; }
  setBar(`<div class="verdict" role="status"><b>${ok ? "Good." : "Not quite."}</b>
    ${!ok && answer ? `<span>Answer: <strong>${esc(answer)}</strong></span>` : ""}
    ${why ? `<span>${esc(why)}</span>` : ""}
    ${!ok && !sc.retry ? `<span class="note">It comes back at the end.</span>` : ""}</div>
    <button class="cta" id="go">Continue</button>`, ok ? "ok" : "bad");
  $("#go").onclick = next; $("#go").focus();
}

function playerHTML(label){
  return `<div class="play-row"><button class="play" id="pl" aria-label="Play">${I.play}</button>
    <button class="chip-btn" id="slow">${I.slow} Slower</button>${label ? `<span class="radio-tag mono"><i></i>${esc(label)}</span>` : ""}</div>`;
}
function wirePlayer(fn){
  const pl = $("#pl");
  const run = async rate => {
    pl.classList.add("playing"); pl.innerHTML = I.stop; pl.setAttribute("aria-label", "Stop");
    await fn(rate);
    if (pl.isConnected) { pl.classList.remove("playing"); pl.innerHTML = I.play; pl.setAttribute("aria-label", "Play"); }
  };
  pl.onclick = () => { if (pl.classList.contains("playing")) { stopAll(); pl.classList.remove("playing"); pl.innerHTML = I.play; } else run(1); };
  $("#slow").onclick = () => { stopAll(); run(.75); };
  return run;
}
const radioLabel = ids => ids.some(id => clip(id).radio) ? (L.radioChannel || "VHF") : "";

function optsHTML(opts, mix = true){
  const order = mix ? shuffle(opts.map((o, i) => i)) : opts.map((o, i) => i);
  return `<div class="opts" role="group">${order.map(i => `<button class="opt" data-i="${i}" aria-pressed="false">${esc(opts[i])}</button>`).join("")}</div>`;
}
function wireOpts(sc){
  let pick = null;
  $$(".opt").forEach(b => b.onclick = () => {
    $$(".opt").forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true"); pick = +b.dataset.i; enableCheck();
  });
  checkBtn(() => {
    $$(".opt").forEach(x => { x.disabled = true; const i = +x.dataset.i; if (i === sc.a) x.classList.add("right"); else if (i === pick) x.classList.add("wrong"); });
    return pick === sc.a;
  }, {answer: sc.opts[sc.a], why: sc.why});
}

/* ---------- plate ---------- */
function plateHTML(mode){
  if (!PLATE_SVG) return `<div class="panel note">The picture for this lesson is missing.</div>`;
  return `<div class="plate" id="plate" data-mode="${mode}">${PLATE_SVG}</div>`;
}
function addPins(onPin){
  const svg = $("#plate svg"); if (!svg) return;
  const ns = "http://www.w3.org/2000/svg";
  L.plate.pins.forEach((p, i) => {
    const w = L.words[p.word];
    const g = document.createElementNS(ns, "g");
    g.setAttribute("class", "pin"); g.dataset.word = p.word;
    g.setAttribute("tabindex", "0"); g.setAttribute("role", "button");
    g.setAttribute("aria-label", "Number " + (i + 1));
    const c = document.createElementNS(ns, "circle"); c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("r", 12);
    const t = document.createElementNS(ns, "text"); t.setAttribute("x", p.x); t.setAttribute("y", p.y); t.textContent = i + 1;
    g.append(c, t); svg.appendChild(g);
    const go = () => onPin(g, p, w, i + 1);
    g.addEventListener("click", go);
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
}

/* ---------- docs ---------- */
function docHTML(key){
  const d = L.docs[key];
  if (d.kind === "message") {
    return `<div class="msg" role="figure" aria-label="Message from ${esc(d.from)}">
      <div class="msg-from"><span class="msg-av">${esc(d.from.trim()[0])}</span><div><b>${esc(d.from)}</b><span>${esc(d.role || "")}</span></div></div>
      <div class="bubble">${d.text.map(p => `<p>${esc(p)}</p>`).join("")}<time>${esc(d.time || "")}</time></div></div>`;
  }
  /* kind: form */
  return `<div class="doc" role="figure" aria-label="${esc(d.title)}">
    <div class="doc-head"><b>${esc(d.title)}</b><span>${esc(d.subtitle || "")}</span></div>
    ${d.cells ? `<div class="doc-grid">${d.cells.map(([k, v]) => `<div class="doc-cell"><small>${esc(k)}</small>${esc(v)}</div>`).join("")}</div>` : ""}
    ${d.table ? `<div style="overflow-x:auto"><table><thead><tr>${d.table.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${d.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
  </div>`;
}

/* ---------- screens ---------- */
function render(){
  showProgress();
  const sc = S.queue[S.pos], st = $("#stage");
  window.scrollTo(0, 0);
  const retry = sc.retry ? `<span class="mono kicker" style="color:var(--accent)">Second attempt</span>` : "";
  const R = RENDER[sc.type];
  if (!R) { st.innerHTML = `<p>Unknown screen: ${esc(sc.type)}</p>`; cont(); return; }
  R(sc, st, retry);
}

const RENDER = {
  intro(sc, st){
    const img = sc.image ? `<div class="scene"><img src="${esc(sc.image)}" alt="" onerror="this.parentNode.remove()"></div>` : "";
    st.innerHTML = `${img}<span class="mono kicker">${esc(sc.kicker)}</span><h2 class="prompt" style="font-size:40px">${esc(sc.title)}</h2>
      <p style="margin:0">${esc(sc.body)}</p>${sc.es ? `<p class="sub">${esc(sc.es)}</p>` : ""}`;
    cont(sc.button || "Start");
  },

  listen(sc, st, retry){
    const ids = sc.audio;
    const text = ids.map(id => { const c = clip(id); return `<div class="tl"><span class="who">${esc(voiceName(c.voice))}</span><p class="line-text">${esc(c.text.replace("|", " ▒▒▒ "))}</p></div>`; }).join("");
    st.innerHTML = `${retry}<span class="mono kicker">Listen</span>${playerHTML(radioLabel(ids))}
      <details class="hidden-text" ${canSpeak ? "" : "open"}><summary>Can't hear it? Show the text</summary><div class="transcript" style="margin-top:8px">${text}</div></details>
      <h2 class="prompt">${esc(sc.q)}</h2>${optsHTML(sc.opts)}`;
    const run = wirePlayer(rate => playSeq(ids, {rate}));
    wireOpts(sc); run(1);
  },

  dialogue(sc, st){
    const ids = L.dialogue;
    st.innerHTML = `<span class="mono kicker">Listen</span><h2 class="prompt">${esc(sc.title)}</h2><p class="sub">${esc(sc.body)}</p>
      ${playerHTML(radioLabel(ids))}
      <div class="play-row"><button class="chip-btn" id="tgT">Show text</button><button class="chip-btn" id="tgE" aria-pressed="false">Show Spanish</button></div>
      <div class="panel transcript" id="tr" hidden>${ids.map(id => { const c = clip(id); return `<div class="tl" data-l="${id}"><span class="who">${esc(voiceName(c.voice))}</span><p class="line-text">${esc(c.text)}</p><span class="es" hidden>${esc(c.es || "")}</span></div>`; }).join("")}</div>`;
    wirePlayer(rate => playSeq(ids, {rate, onLine: id => $$(".tl").forEach(t => t.classList.toggle("speaking", t.dataset.l === id))}));
    $("#tgT").onclick = e => { const t = $("#tr"); t.hidden = !t.hidden; e.currentTarget.textContent = t.hidden ? "Show text" : "Hide text"; };
    $("#tgE").onclick = e => {
      const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
      e.currentTarget.setAttribute("aria-pressed", on); e.currentTarget.textContent = on ? "Hide Spanish" : "Show Spanish";
      $("#tr").hidden = false; $("#tgT").textContent = "Hide text"; $$(".tl .es").forEach(x => x.hidden = !on);
    };
    if (!canSpeak) $("#tr").hidden = false;
    cont(sc.button || "Finish listening");
  },

  plate(sc, st){
    st.innerHTML = `<span class="mono kicker">Vocabulary</span><h2 class="prompt">${esc(sc.title)}</h2><p class="sub">${esc(sc.body)}</p>
      ${plateHTML("learn")}<div class="panel caption" id="cap" aria-live="polite"><span class="sub">Tap a number on the picture.</span></div>`;
    const seen = new Set(), total = L.plate.pins.length;
    cont(`${total} to go`, false);
    addPins((g, p, w) => {
      g.classList.add("seen"); seen.add(p.word);
      $("#cap").innerHTML = `<button class="small-play" id="cp" aria-label="Hear it">${I.spk}</button><div><div class="en">${esc(w.en)}</div><div class="es">${esc(w.es)}</div></div>`;
      $("#cp").onclick = () => playClip(w.audio); playClip(w.audio);
      const left = total - seen.size, go = $("#go");
      go.disabled = left > 0; go.textContent = left > 0 ? `${left} to go` : "Continue";
    });
    if (!PLATE_SVG) { const go = $("#go"); go.disabled = false; go.textContent = "Continue"; }
  },

  card(sc, st){
    const w = L.words[sc.word], ex = w.ex ? clip(w.ex) : null;
    st.innerHTML = `<span class="mono kicker">New word</span><div class="wcard">
      <div class="play-row"><button class="small-play" id="cp" aria-label="Hear the word">${I.spk}</button><span class="ipa">${esc(w.ipa || "")}</span></div>
      <div class="en">${esc(w.en)}</div><div class="es">${esc(w.es)}</div>
      ${ex ? `<div class="ex"><p>${esc(ex.text)}<span>${esc(ex.es || "")}</span></p><button class="small-play" id="ce" aria-label="Hear the example">${I.spk}</button></div>` : ""}</div>`;
    $("#cp").onclick = () => playClip(w.audio);
    if (ex) $("#ce").onclick = () => playClip(w.ex);
    playClip(w.audio);
    cont();
  },

  tip(sc, st){
    st.innerHTML = `<div class="tip"><span class="tip-tag mono">${esc(sc.tag)}</span><h2 class="prompt">${esc(sc.title)}</h2>
      ${(sc.paras || []).map(p => `<p>${p}</p>`).join("")}
      ${sc.list ? `<ul>${sc.list.map(([en, es, a]) => `<li><div><b>${esc(en)}</b><small>${esc(es)}</small></div>${a ? `<button class="small-play" data-a="${esc(a)}" aria-label="Hear: ${esc(en)}">${I.spk}</button>` : ""}</li>`).join("")}</ul>` : ""}
      ${sc.steps ? `<div class="steps3">${sc.steps.map(([k, v]) => `<div class="step3"><span class="mono">${esc(k)}</span><p>${esc(v)}</p></div>`).join("")}</div>` : ""}
      ${sc.good ? `<div class="good"><b>✓</b> ${sc.good}</div>` : ""}
      ${sc.avoid ? `<div class="avoid"><b>✗</b> ${sc.avoid}</div>` : ""}</div>`;
    $$("[data-a]").forEach(b => b.onclick = () => playClip(b.dataset.a));
    cont(sc.button || "Got it");
  },

  tap(sc, st, retry){
    const c = clip(sc.audio);
    st.innerHTML = `${retry}<span class="mono kicker">Listen and tap</span>${playerHTML("")}
      <h2 class="prompt">${esc(sc.q || "Tap what you hear.")}</h2>${plateHTML("tap")}
      <details class="hidden-text"><summary>Can't hear it? Show the text</summary><p class="line-text">${esc(c.text)}</p></details>`;
    const run = wirePlayer(rate => playClip(sc.audio, {rate}));
    setBar(`<button class="cta" disabled>Tap a number</button>`);
    let locked = false;
    addPins((g, p) => {
      if (locked) return; locked = true;
      const ok = p.word === sc.a;
      g.classList.add(ok ? "right" : "wrong");
      const target = $(`.pin[data-word="${sc.a}"]`); if (!ok && target) target.classList.add("right");
      const idx = L.plate.pins.findIndex(x => x.word === sc.a) + 1;
      verdict(ok, `${idx} · ${L.words[sc.a].en}`);
    });
    run(1);
  },

  match(sc, st){
    const left = shuffle(sc.pairs.map((p, i) => i)), right = shuffle(sc.pairs.map((p, i) => i));
    st.innerHTML = `<span class="mono kicker">Practice</span><h2 class="prompt">${esc(sc.title || "Match the pairs")}</h2>
      <div class="match"><div class="col">${left.map(i => `<button class="mt" data-s="l" data-i="${i}" aria-pressed="false">${esc(sc.pairs[i][0])}</button>`).join("")}</div>
      <div class="col">${right.map(i => `<button class="mt" data-s="r" data-i="${i}" aria-pressed="false">${esc(sc.pairs[i][1])}</button>`).join("")}</div></div>`;
    let sel = {l: null, r: null}, todo = sc.pairs.length;
    cont("Continue", false);
    $$(".mt").forEach(b => b.onclick = () => {
      if (b.classList.contains("done")) return;
      const s = b.dataset.s;
      $$(`.mt[data-s="${s}"]`).forEach(x => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true"); sel[s] = b;
      if (s === "l") { const w = Object.values(L.words).find(w => w.en === sc.pairs[+b.dataset.i][0]); if (w) playClip(w.audio); }
      if (sel.l && sel.r) {
        const a = sel.l, c = sel.r;
        if (a.dataset.i === c.dataset.i) { [a, c].forEach(x => { x.classList.add("done"); x.setAttribute("aria-pressed", "false"); x.disabled = true; }); if (!--todo) $("#go").disabled = false; }
        else [a, c].forEach(x => { x.classList.add("shake"); x.setAttribute("aria-pressed", "false"); setTimeout(() => x.classList.remove("shake"), 350); });
        sel = {l: null, r: null};
      }
    });
  },

  build(sc, st, retry){
    const toks = shuffle(sc.a.concat(sc.extra || []));
    const cue = sc.cue ? clip(sc.cue) : null;
    st.innerHTML = `${retry}${cue ? `<div class="cue-card"><div><span class="mono">${esc(voiceName(cue.voice))}</span>${esc(cue.text)}</div><button class="small-play" id="cuePlay" aria-label="Hear it">${I.spk}</button></div>` : ""}
      ${sc.situation ? `<p class="sub">${esc(sc.situation)}</p>` : ""}
      <h2 class="prompt">${esc(sc.q)}</h2><div class="answer-line" id="ans" aria-live="polite"></div>
      <div class="bank">${toks.map((t, i) => `<button class="tok" data-k="${i}">${esc(t)}</button>`).join("")}</div>`;
    if (cue) { $("#cuePlay").onclick = () => playClip(sc.cue); playClip(sc.cue); }
    const picked = [];
    checkBtn(() => norm(picked.map(k => toks[k]).join(" ")) === norm(sc.a.join(" ")), {answer: sc.a.join(" ")});
    const draw = () => {
      $("#ans").innerHTML = picked.map((k, j) => `<button class="tok" data-j="${j}">${esc(toks[k])}</button>`).join("");
      $$("#ans .tok").forEach(b => b.onclick = () => { const k = picked.splice(+b.dataset.j, 1)[0]; $(`.bank .tok[data-k="${k}"]`).classList.remove("used"); draw(); });
      enableCheck(picked.length > 0);
    };
    $$(".bank .tok").forEach(b => b.onclick = () => { if (b.classList.contains("used")) return; b.classList.add("used"); picked.push(+b.dataset.k); draw(); });
  },

  choice(sc, st, retry){
    const cue = sc.cue ? clip(sc.cue) : null;
    st.innerHTML = `${retry}<span class="mono kicker">Choose</span>
      ${cue ? `<div class="cue-card"><div><span class="mono">${esc(voiceName(cue.voice))}</span>${esc(cue.text)}</div><button class="small-play" id="cuePlay" aria-label="Hear it">${I.spk}</button></div>` : ""}
      <h2 class="prompt">${esc(sc.q)}</h2>${optsHTML(sc.opts)}`;
    if (cue) { $("#cuePlay").onclick = () => playClip(sc.cue); playClip(sc.cue); }
    wireOpts(sc);
  },

  doc(sc, st, retry){
    st.innerHTML = `${retry}<span class="mono kicker">Read</span>${docHTML(sc.doc)}<h2 class="prompt" style="font-size:24px">${esc(sc.q)}</h2>${optsHTML(sc.opts, false)}`;
    wireOpts(sc);
  },

  type(sc, st, retry){
    st.innerHTML = `${retry}<span class="mono kicker">${sc.audio ? "Dictation" : "Write"}</span>${sc.audio ? playerHTML("") : ""}
      <h2 class="prompt">${esc(sc.q)}</h2>
      <input class="field" id="tf" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Your answer">
      ${sc.audio && !canSpeak ? `<p class="note">No voices on this device. The word is: ${esc(clip(sc.audio).text)}</p>` : ""}`;
    let run = null; if (sc.audio) run = wirePlayer(rate => playClip(sc.audio, {rate}));
    checkBtn(() => sc.accept.some(a => norm(a) === norm($("#tf").value)), {answer: sc.accept[0], why: sc.why});
    $("#tf").oninput = () => enableCheck(!!$("#tf").value.trim());
    $("#tf").onkeydown = e => { if (e.key === "Enter" && !$("#go").disabled) $("#go").click(); };
    if (run) run(1);
  },

  shadow(sc, st, retry){ speakScreen(sc, st, retry, false); },
  role(sc, st, retry){ speakScreen(sc, st, retry, true); }
};

function speakScreen(sc, st, retry, isRole){
  const model = clip(sc.model);
  const cue = isRole && sc.cue ? clip(sc.cue) : null;
  const canCheck = !!SR && !srOffline;
  st.innerHTML = `${retry}<span class="mono kicker">${isRole ? "Role-play" : "Shadowing"}</span>
    ${!isRole || cue ? playerHTML(cue ? (cue.radio ? (L.radioChannel || "VHF") : voiceName(cue.voice)) : "") : ""}
    ${sc.situation ? `<p class="sub">${esc(sc.situation)}</p>` : ""}
    <h2 class="prompt">${esc(isRole ? sc.task : "Listen, then say it out loud.")}</h2>
    ${!isRole ? `<p class="say">${esc(model.text)}</p><p class="sub">${esc(model.es || "")}</p>` : ""}
    <div class="mic-row">
      <button class="mic" id="mic" aria-label="${canCheck ? "Speak and check" : "Record yourself"}">${I.mic}</button>
      <div class="mic-side"><div id="micInfo" class="note">${canCheck ? "Tap and speak. The app checks your answer." : "Tap to record yourself."}</div>
        ${canCheck ? `<button class="chip-btn" id="recAlt">⏺ Record and compare instead</button>` : ""}</div>
    </div>
    <div class="panel sr-result" id="srRes" hidden aria-live="polite"></div>
    <div class="reveal" id="rev" hidden><span class="mono kicker">Model answer</span><p class="say" style="font-size:24px">${esc(model.text)}</p>
      <div class="play-row"><button class="chip-btn" id="hearModel">${I.spk} Hear the model</button><button class="chip-btn" id="hearMe" hidden>${I.spk} Hear yourself</button></div>
      <p class="sub">${esc(model.es || "")}</p></div>`;
  if (!isRole) wirePlayer(rate => playClip(sc.model, {rate}))(1);
  else if (cue) wirePlayer(rate => playClip(sc.cue, {rate}))(1);
  $("#hearModel").onclick = () => playClip(sc.model);
  setBar(`<button class="cta" disabled>Say it first</button>`);
  const recordMode = msg => {
    const alt = $("#recAlt"); if (alt) alt.remove();
    $("#mic").setAttribute("aria-label", "Record yourself");
    $("#micInfo").textContent = msg || "Tap to record yourself.";
    setupMic(() => { $("#rev").hidden = false; selfRate(sc); });
  };
  if (!canCheck) { recordMode(); return; }
  $("#recAlt").onclick = () => recordMode("Tap to record. Then compare with the model.");
  setupCheck(sc, model, recordMode);
}

/* ---------- speech recognition: "Check my answer" ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let srOffline = false;
const CONTRACT = {"it's":"it is","that's":"that is","what's":"what is","where's":"where is","who's":"who is","there's":"there is",
  "i'm":"i am","you're":"you are","we're":"we are","they're":"they are","he's":"he is","she's":"she is",
  "can't":"can not","cannot":"can not","don't":"do not","doesn't":"does not","isn't":"is not","aren't":"are not","won't":"will not",
  "i've":"i have","we've":"we have","i'll":"i will","we'll":"we will","let's":"let us","ok":"okay","alfa":"alpha","juliett":"juliet","xray":"x ray"};
const DIGIT = ["zero","one","two","three","four","five","six","seven","eight","nine"];
function words(s){
  let t = String(s).toLowerCase().replace(/[’`]/g, "'").replace(/\d/g, d => " " + DIGIT[d] + " ").replace(/\bniner\b/g, "nine");
  t = t.replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(Boolean).map(w => CONTRACT[w] || w.replace(/'/g, "")).join(" ");
  return t.split(/\s+/).filter(Boolean);
}
/* which target words appear in order in what was heard (longest common subsequence) */
function matchWords(target, heard){
  const n = target.length, m = heard.length, dp = Array.from({length: n + 1}, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = target[i] === heard[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ok = new Array(n).fill(false); let i = 0, j = 0;
  while (i < n && j < m) { if (target[i] === heard[j]) { ok[i] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  return ok;
}
function bestMatch(targets, alternatives){
  let best = null;
  for (const t of targets) {
    const tw = words(t);
    for (const h of alternatives) {
      const hw = words(h), ok = matchWords(tw, hw);
      const hits = ok.filter(Boolean).length, extra = Math.max(0, hw.length - hits);
      const score = hits / tw.length - extra * 0.02;
      if (!best || score > best.score) best = {target: t, tw, ok, heard: h, score, hits, extra};
    }
  }
  return best;
}
function setupCheck(sc, model, recordMode){
  const mic = $("#mic"), info = $("#micInfo"), res = $("#srRes");
  const targets = [model.text].concat(sc.accept || []);
  let rec = null, listening = false, gotResult = false;
  const stopUI = () => { listening = false; mic.classList.remove("rec"); mic.innerHTML = I.mic; };
  mic.onclick = () => {
    if (listening) { try { rec.stop(); } catch (e) {} return; }
    stopAll();
    rec = new SR(); rec.lang = "en-GB"; rec.interimResults = true; rec.maxAlternatives = 5; rec.continuous = false;
    gotResult = false; listening = true;
    mic.classList.add("rec"); mic.innerHTML = I.stop; info.textContent = "Listening… speak now.";
    res.hidden = false; res.innerHTML = `<span class="note">…</span>`;
    rec.onresult = e => {
      const r = e.results[e.results.length - 1];
      if (!r.isFinal) { res.innerHTML = `<span class="mono kicker">Hearing</span><p class="heard">${esc(r[0].transcript)}</p>`; return; }
      gotResult = true;
      const alts = Array.from(r).map(a => a.transcript);
      showCheck(sc, bestMatch(targets, alts));
    };
    rec.onerror = e => {
      stopUI();
      if (e.error === "no-speech" || e.error === "aborted") { info.textContent = "I didn't hear anything. Tap and try again."; res.hidden = true; return; }
      if (e.error === "network") { srOffline = true; res.hidden = true; recordMode("Checking needs internet. Record yourself and compare instead."); return; }
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { res.hidden = true; recordMode("Microphone not allowed. Say it out loud, then tap."); return; }
      info.textContent = "Something went wrong. Tap and try again.";
    };
    rec.onend = () => { if (listening && !gotResult) { info.textContent = "I didn't catch that. Tap and try again."; if (res.innerHTML.includes("…")) res.hidden = true; } stopUI(); };
    try { rec.start(); } catch (e) { stopUI(); recordMode(); }
  };
}
function showCheck(sc, m){
  const res = $("#srRes"), info = $("#micInfo");
  const missing = m.tw.filter((w, i) => !m.ok[i]);
  const level = m.hits === m.tw.length && m.extra <= 2 ? "ok" : m.score >= .6 ? "almost" : "no";
  res.innerHTML = `<span class="mono kicker">We heard</span><p class="heard">"${esc(m.heard)}"</p>
    <span class="mono kicker">Target</span><p class="target">${m.tw.map((w, i) => `<span class="${m.ok[i] ? "w-ok" : "w-miss"}">${esc(w)}</span>`).join(" ")}</p>`;
  $("#rev").hidden = false;
  info.textContent = "Tap to try again.";
  if (level === "ok") {
    setBar(`<div class="verdict" role="status"><b>Clear and correct.</b><span>That's what a listener on board would hear.</span></div><button class="cta" id="go">Continue</button>`, "ok");
    $("#go").onclick = next;
  } else {
    const msg = level === "almost" ? `Missing: <strong>${esc(missing.join(", "))}</strong>` : "Not clear yet. Listen to the model and try again.";
    setBar(`<div class="verdict" role="status"><b>${level === "almost" ? "Almost." : "Try again."}</b><span>${msg}</span></div>
      <div class="self"><button class="opt" id="later">Continue</button><button class="cta" id="retryNow" style="flex:1">Try again</button></div>`, "bad");
    $("#retryNow").onclick = () => { setBar(`<button class="cta" disabled>Say it again</button>`); $("#mic").click(); };
    $("#later").onclick = () => { if (!sc.retry) S.queue.push({...sc, retry: true}); next(); };
  }
}

/* Microphone: works on the published app (https). Elsewhere: "say it, then compare". */
let micStream = null, micBlocked = false;
function setupMic(onDone){
  const mic = $("#mic"), info = $("#micInfo"); let rec = null, chunks = [], url = null;
  const fallback = msg => {
    mic.innerHTML = I.check; mic.setAttribute("aria-label", "I said it");
    info.innerHTML = msg || "Say it out loud now, then tap.";
    mic.onclick = () => { mic.disabled = true; onDone(); };
  };
  if (micBlocked || !navigator.mediaDevices || !window.MediaRecorder) { fallback(); return; }
  mic.onclick = async () => {
    if (rec && rec.state === "recording") { rec.stop(); return; }
    try { micStream = micStream || await navigator.mediaDevices.getUserMedia({audio: true}); }
    catch (e) { micBlocked = true; fallback("Microphone not available here. Say it out loud, then tap."); return; }
    stopAll(); chunks = [];
    rec = new MediaRecorder(micStream);
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      mic.classList.remove("rec"); mic.innerHTML = I.mic; info.textContent = "Tap to record again.";
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob(chunks, {type: rec.mimeType}));
      const hm = $("#hearMe"); hm.hidden = false; hm.onclick = () => { stopAll(); const a = new Audio(url); a.play().catch(() => {}); };
      onDone();
    };
    rec.start(); mic.classList.add("rec"); mic.innerHTML = I.stop; info.textContent = "Recording… tap to stop.";
  };
}
function selfRate(sc){
  setBar(`<div class="verdict"><b style="color:var(--ink)">How did it go?</b><span>Compare your version with the model.</span></div>
    <div class="self"><button class="opt" id="again">Not yet</button><button class="cta" id="gotit" style="flex:1">Got it</button></div>`);
  $("#gotit").onclick = next;
  $("#again").onclick = () => { if (!sc.retry) S.queue.push({...sc, retry: true}); next(); };
}

function finish(){
  stopAll();
  const s = S.sess, p = lessonProgress(L.n);
  if (!p.done.includes(s.id)) p.done.push(s.id);
  saveProgress();
  $("#prog").style.width = "100%";
  const pct = S.graded ? Math.round(S.firstRight / S.graded * 100) : null;
  const nextIdx = L.sessions.findIndex(x => !p.done.includes(x.id));
  $("#stage").innerHTML = `<div class="result"><span class="mono kicker">${esc(s.skill)} · done</span>
    ${pct !== null ? `<div class="score">${pct}%</div><p style="margin:0">${S.firstRight} of ${S.graded} right the first time.${S.missed ? " The ones you missed came back once." : ""}</p>` : `<h2 class="prompt" style="font-size:40px">Session done</h2>`}
    <h2 class="prompt">${esc(s.title)}</h2></div>`;
  setBar(`<button class="cta" id="go">${nextIdx > -1 ? "Next: " + esc(L.sessions[nextIdx].title) : "Back to the lesson"}</button>`, "ok");
  $("#go").onclick = () => { if (nextIdx > -1) startSession(nextIdx); else viewLesson(); };
}

/* =========================================================
   BOOT
   ========================================================= */
(async function boot(){
  try { COURSE = await getJSON("course.json"); }
  catch (e) { app.innerHTML = `<p class="loading">The course could not be loaded. Check your connection and reload.</p>`; return; }
  const m = /^#l(\d+)$/.exec(location.hash);
  const ready = m && COURSE.modules.some(mod => mod.lessons.some(l => l.n === +m[1] && l.ready));
  if (ready) openLesson(+m[1]); else viewHome();
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch (e) {}
  }
})();
