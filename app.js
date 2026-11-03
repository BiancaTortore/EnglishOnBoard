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
function lessonProgress(n){ return progress["l"+n] || (progress["l"+n] = {done:[], scores:{}}); }

/* settings (speed) — per device */
const SETKEY = "eob-settings-v1";
let settings = {speed: "normal"};
try { settings = {...settings, ...(JSON.parse(localStorage.getItem(SETKEY) || "{}") || {})}; } catch (e) {}
function saveSettings(){ try { localStorage.setItem(SETKEY, JSON.stringify(settings)); } catch (e) {} }
const defRate = () => settings.speed === "slow" ? .75 : 1;

/* review queue: screens the learner got wrong. key = lesson|session|screen position */
const WELCOME_KEY = "eob-welcome-v1";
function reviewList(){ return Array.isArray(progress.review) ? progress.review : (progress.review = []); }
function addReview(rk, type){
  if (!rk) return; const r = reviewList();
  if (!r.some(x => x.k === rk)) { r.push({k: rk, t: type}); saveProgress(); }
}
function clearReview(rk){
  if (!rk || !Array.isArray(progress.review)) return;
  const before = progress.review.length;
  progress.review = progress.review.filter(x => x.k !== rk);
  if (progress.review.length !== before) saveProgress();
}

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

/* Preloaded audio elements, so the lines of a conversation follow each other
   without waiting for each file to load. Each element is used once. */
const prepared = new Map();
function prepFile(file){
  if (missing.has(file) || prepared.has(file)) return;
  const el = new Audio(); el.preload = "auto";
  el.addEventListener("error", () => { missing.add(file); prepared.delete(file); });
  el.src = file; el.load();
  prepared.set(file, el);
}
function clipFiles(id){
  const c = clip(id); if (c.voice === "model") return [];
  const parts = String(c.text).split("|");
  return parts.map((p, i) => `audio/${lessonDir()}/${parts.length > 1 ? `${id}-${"ab"[i]}` : id}.mp3`);
}

/* Try the recorded file; resolve false if it doesn't exist */
function playFile(file, {radio, rate}, tok){
  return new Promise(res => {
    if (missing.has(file)) { res(false); return; }
    const pre = prepared.get(file); prepared.delete(file);
    const el = pre || new Audio(); let started = false, settled = false;
    const end = ok => { if (!settled) { settled = true; res(ok); } };
    if (!pre) { el.preload = "auto"; el.src = file; }
    if ("preservesPitch" in el) el.preservesPitch = true;
    el.playbackRate = rate || 1;
    el.onerror = () => { if (!started) missing.add(file); end(started); };
    el.onended = () => end(true);
    el.onpause = () => { if (started && el.currentTime < el.duration - .05) end(true); };
    const timer = setTimeout(() => { if (!started) { missing.add(file); end(false); } }, 5000);
    if (pre && pre.error) { clearTimeout(timer); missing.add(file); end(false); return; }
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
    if (pre && pre.readyState >= 3) el.oncanplay();
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
  /* load the whole conversation first, then play it line after line
     with a short, natural gap: a little longer when the speaker changes */
  ids.forEach(id => clipFiles(id).forEach(prepFile));
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k];
    if (tok !== playToken) return;
    onLine && onLine(id);
    await playClip(id, {rate}, tok);
    const nx = ids[k + 1];
    if (nx && tok === playToken) {
      const a = clip(id), b = clip(nx);
      await wait(a.radio || b.radio ? 250 : a.voice === b.voice ? 60 : 160);
    }
  }
  onLine && onLine(null);
}

/* =========================================================
   ICONS
   ========================================================= */
const I = {
  t_home:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5L12 4l8 6.5V20h-5v-6h-6v6H4z"/></svg>',
  t_lessons:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13"/></svg>',
  t_practice:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>',
  t_logbook:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M13 4H5v16h14v-8"/><path d="M17.5 3.5l3 3L12 15l-4 1 1-4z"/></svg>',
  t_profile:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  chev:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  lock:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  flag:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
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
  wheel:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>',
  gear:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
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
function clearBar(){ const b = $("#checkbar"); if (b) b.remove(); const t = $("#tabbar"); if (t) t.remove(); }

/* =========================================================
   HOME · TABS (Home, Lessons, Practice, Logbook, Profile)
   ========================================================= */
const SESS_PER_LESSON = 6;
const allLessons = () => COURSE.modules.flatMap(m => m.lessons);
const isDone = l => { const p = progress["l" + l.n]; return !!p && p.done.length >= SESS_PER_LESSON; };
const doneCount = n => Math.min(SESS_PER_LESSON, ((progress["l" + n] || {}).done || []).length);
const started = l => l.ready && doneCount(l.n) > 0;
const moduleOf = n => COURSE.modules.find(m => m.lessons.some(l => l.n === n));
const moduleDone = m => m.lessons.every(l => l.ready && isDone(l));
function currentLesson(){ const all = allLessons(); return all.find(l => l.ready && !isDone(l)) || all.filter(l => l.ready).pop(); }
const thumb = n => `img/l${pad(n)}/hero.jpg`;
function testsState(){ return progress.tests && typeof progress.tests === "object" ? progress.tests : (progress.tests = {}); }

function setTabs(active){
  const tabs = [["home", "Home", viewHome], ["lessons", "Lessons", viewLessons], ["practice", "Practice", viewPractice], ["logbook", "Logbook", viewLogbook], ["profile", "Profile", viewProfile]];
  let t = $("#tabbar");
  if (!t) { t = document.createElement("nav"); t.id = "tabbar"; t.className = "tabbar"; t.setAttribute("aria-label", "Main"); document.body.appendChild(t); }
  t.innerHTML = `<div class="tabbar-in">${tabs.map(([k, label]) => `<button class="tab" data-tab="${k}" ${k === active ? 'aria-current="page"' : ""}>${I["t_" + k]}<span>${label}</span></button>`).join("")}</div>`;
  tabs.forEach(([k, , fn]) => { t.querySelector(`[data-tab="${k}"]`).onclick = fn; });
}
function clearTabs(){ const t = $("#tabbar"); if (t) t.remove(); }
function tabView(active, html){
  stopAll(); clearBar(); location.hash = "";
  app.innerHTML = `<div class="tabview tab-${active}">${html}</div>`;
  setTabs(active);
  window.scrollTo(0, 0);
}

function lessonRow(l, cur){
  const d = isDone(l), dc = doneCount(l.n);
  const meta = !l.ready ? "Coming soon" : d ? "Done" : `${dc} of ${SESS_PER_LESSON} sessions`;
  return `<li class="lrow ${l.ready ? "ready" : "locked"} ${cur ? "current" : ""} ${d ? "complete" : ""}">
    <button class="lrow-btn" ${l.ready ? `data-n="${l.n}"` : "disabled"}>
      <span class="lrow-num">${d ? I.check : l.n}</span>
      <span class="lrow-thumb"><img src="${thumb(l.n)}" alt="" loading="lazy" onerror="this.remove()"><i>${l.n}</i></span>
      <span class="lrow-body"><span class="lrow-title">${esc(l.title)}</span><span class="lrow-meta">${meta}</span>
        ${l.ready ? `<span class="lbar"><i style="width:${Math.round(dc / SESS_PER_LESSON * 100)}%"></i></span>` : ""}</span>
      <span class="lrow-end">${l.ready ? I.chev : I.lock}</span></button></li>`;
}
function moduleTestRow(m){
  const open = moduleDone(m), t = testsState()["m" + m.n];
  const meta = !open ? "Finish the lessons of this module first" : t ? `Best: ${t.best}%${t.passed ? " · passed" : ""}` : "15 questions · about 8 min";
  return `<li class="lrow test ${open ? "ready" : "locked"} ${t && t.passed ? "complete" : ""}">
    <button class="lrow-btn" ${open ? `data-test="${m.n}"` : "disabled"}>
      <span class="lrow-num">${t && t.passed ? I.check : I.flag}</span>
      <span class="lrow-body"><span class="lrow-title">Module ${m.n} test</span><span class="lrow-meta">${meta}</span></span>
      <span class="lrow-end">${open ? I.chev : I.lock}</span></button></li>`;
}
function moduleSection(m, cur){
  return `<section class="module">
    <div class="module-head"><h3>${m.n} · ${esc(m.title)}</h3><span class="mono">${esc(m.where || "")}</span></div>
    <ol class="lrows">${m.lessons.map(l => lessonRow(l, cur && l.n === cur.n)).join("")}${m.lessons.some(l => l.ready) ? moduleTestRow(m) : ""}</ol></section>`;
}
function wireRows(){
  $$("[data-n]").forEach(b => b.onclick = () => openLesson(+b.dataset.n));
  $$("[data-test]").forEach(b => b.onclick = () => startDrill("test", +b.dataset.test));
}

/* the voyage chart: Diego's real passage, Houston → Marseille.
   Simplified coastlines in lon/lat, projected (equirectangular, standard parallel 35°N). */
const MAP = {lon0: -100, lon1: 10, lat0: 52, lat1: 18, W: 340};
MAP.sx = MAP.W / (MAP.lon1 - MAP.lon0); MAP.sy = MAP.sx / Math.cos(35 * Math.PI / 180); MAP.H = Math.round((MAP.lat0 - MAP.lat1) * MAP.sy);
const prj = ([lon, lat]) => [+((lon - MAP.lon0) * MAP.sx).toFixed(1), +((MAP.lat0 - lat) * MAP.sy).toFixed(1)];
const LAND = [
  /* North America */
  [[-100,52],[-56,52],[-53,47.5],[-59.5,46],[-66,45],[-70,42.2],[-74,40.5],[-76,37.2],[-75.5,35.2],[-78,33.8],[-81,31.5],[-80.6,28.5],[-80.1,26],[-80.6,25.2],[-81.8,26.5],[-82.7,28],[-84,30],[-86,30.4],[-89,30.2],[-89.4,29],[-91,29.5],[-94,29.6],[-95,29.3],[-97.2,27.8],[-97.4,25.9],[-97.7,22],[-97,20],[-96,19],[-94,18.3],[-91,18.6],[-90.5,21],[-87,21.5],[-87.5,19],[-88,18],[-100,18]],
  /* Cuba */
  [[-85,21.8],[-82,23.1],[-80,23.1],[-77,21.8],[-74.2,20.2],[-77.7,19.9],[-80,21.7],[-83,22]],
  /* Hispaniola */
  [[-74.4,19.8],[-71,19.9],[-68.4,18.6],[-71.4,17.9],[-74.4,18.4]],
  /* Great Britain (cut at the top) */
  [[-5.7,50],[-3,50.6],[1.3,51.2],[1.8,52],[-4.5,52],[-4.3,51.6]],
  /* Europe */
  [[4,52],[3,51.3],[1.5,50.6],[-1.5,49.7],[-4.7,48.4],[-1.5,46.5],[-1.5,43.4],[-8,43.7],[-9.3,43],[-8.8,41],[-9.5,38.7],[-8.9,37],[-6.3,36.8],[-5.6,36.05],[-4.4,36.7],[-2,36.8],[-0.5,38.3],[0.2,39.8],[0.9,41],[3.2,41.9],[3.1,43],[4.5,43.4],[5.4,43.3],[7,43.6],[8.8,44.3],[10,44],[10,52]],
  /* Africa */
  [[-5.9,35.8],[-6.8,34],[-9.6,30.4],[-13,27.7],[-16.5,22],[-17,20],[-17,18],[10,18],[10,37],[8,37],[3,36.8],[-1,35.3],[-5.3,35.9]]
];
const ROUTE = [[-95,29.1],[-94.4,28.6],[-92,27],[-89,25.6],[-85.5,24.4],[-82,24.2],[-80.6,24.9],[-79.9,26.1],[-79.4,27.6],[-76,30.5],[-68,33.5],[-58,35.3],[-45,36.2],[-30,36.6],[-18,36.5],[-10.5,36.2],[-7,35.9],[-5.6,35.95],[-3,36.3],[0.5,37.6],[3,39.8],[4.6,42],[5.3,43.1]];
/* where each module starts along the route (fraction of its length) */
const LEG = [0, .006, .02, .05, .25, .38, .9, 1];
const PORTS = [["Houston", [-95,29.1], "s"], ["Port Everglades", [-79.9,26.1], "e"], ["Gibraltar", [-5.6,35.95], "s"], ["Marseille", [5.3,43.1], "w"]];

function routeAt(f){
  const P = ROUTE.map(prj), L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const target = Math.max(0, Math.min(1, f)) * L[L.length - 1];
  let i = 1; while (i < P.length - 1 && L[i] < target) i++;
  const t = (target - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
  const pt = [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t];
  const ang = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]) * 180 / Math.PI;
  return {pt, ang, sailed: P.slice(0, i).concat([pt]), all: P};
}
function voyageHTML(cur){
  const mods = COURSE.modules, total = allLessons().length * SESS_PER_LESSON;
  const done = allLessons().reduce((a, l) => a + doneCount(l.n), 0);
  const pct = Math.round(done / total * 100);
  const m = cur ? moduleOf(cur.n) : mods[0], mi = mods.indexOf(m);
  const mTot = m.lessons.length * SESS_PER_LESSON, mDone = m.lessons.reduce((a, l) => a + doneCount(l.n), 0);
  const allDone = allLessons().every(isDone);
  const f = allDone ? 1 : LEG[mi] + (LEG[mi + 1] - LEG[mi]) * (mDone / mTot);
  const r = routeAt(f), pts = a => a.map(p => p.join(",")).join(" ");
  const [sx, sy] = r.pt, W = MAP.W, H = MAP.H;
  const grid = [];
  for (let lon = -90; lon <= 0; lon += 15) { const x = prj([lon, 0])[0]; grid.push(`<path d="M${x},0V${H}"/>`); }
  for (let lat = 20; lat <= 50; lat += 10) { const y = prj([0, lat])[1]; grid.push(`<path d="M0,${y}H${W}"/>`); }
  const ports = PORTS.map(([name, ll, pos]) => {
    const [x, y] = prj(ll), reached = f >= ROUTE.findIndex(p => p[0] === ll[0] && p[1] === ll[1]) / (ROUTE.length - 1) - .001;
    const tx = pos === "e" ? x + 7 : pos === "w" ? x - 12 : x, ty = pos === "s" ? y + 13 : pos === "n" ? y - 7 : y + 3, anc = pos === "e" ? "start" : pos === "w" ? "end" : x > W - 30 ? "end" : x < 30 ? "start" : "middle";
    return `<g class="port ${reached ? "reached" : ""}"><circle cx="${x}" cy="${y}" r="2.6"/><text x="${pos === "w" ? tx : anc === "end" ? W - 2 : anc === "start" && pos !== "e" ? Math.max(2, x - 6) : tx}" y="${ty}" text-anchor="${anc}">${name.toUpperCase()}</text></g>`;
  }).join("");
  return `<section class="voyage" aria-label="Training voyage, Houston to Marseille: ${pct}% of the course done. Now in module ${m.n}, ${esc(m.title)}.">
    <div class="voyage-head"><span class="mono">Houston → Marseille</span><b>${pct}%</b></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true">
      <rect class="sea" width="${W}" height="${H}"/>
      <g class="grid">${grid.join("")}</g>
      <g class="land">${LAND.map(poly => `<polygon points="${pts(poly.map(prj))}"/>`).join("")}</g>
      <text class="ocean" x="${prj([-42,30])[0]}" y="${prj([-42,30])[1]}" text-anchor="middle">North Atlantic Ocean</text>
      <polyline class="route-ahead" points="${pts(r.all)}"/>
      <polyline class="route-sailed" points="${pts(r.sailed)}"/>
      ${ports}
      <g class="ship" transform="translate(${sx.toFixed(1)},${sy.toFixed(1)}) rotate(${r.ang.toFixed(0)})"><circle r="9" class="halo"/><path d="M-6,-3 L4,-3 L8,0 L4,3 L-6,3 Z"/></g>
    </svg>
    <div class="voyage-foot"><span><span class="vlabel">Now · </span>${m.n} · ${esc(m.title)}</span><span class="vcount">${done}/${total}</span></div>
    <span class="vbar"><i style="width:${Math.max(1, pct)}%"></i></span>
  </section>`;
}

function viewHome(){
  const cur = currentLesson(), cp = cur ? lessonProgress(cur.n) : null, rc = reviewList().length;
  const m = cur ? moduleOf(cur.n) : COURSE.modules[0];
  tabView("home", `
    <header class="home-hero">
      <img src="${cur ? thumb(cur.n) : ""}" alt="" onload="this.parentNode.classList.add('has-img')" onerror="this.remove()">
      <div class="brand"><div class="brand-mark">${I.wheel}</div><div><h1>${esc(COURSE.title)}</h1><p>${esc(COURSE.subtitle)}</p></div></div>
      ${cur ? `<div class="hh-body"><span class="mono">${cp.done.length ? "Current lesson" : "Start here"} · Lesson ${cur.n}</span>
        <h2>${esc(cur.title)}</h2>
        <span class="hh-meta">${esc(m.title)} · ${Math.min(cp.done.length, SESS_PER_LESSON)} of ${SESS_PER_LESSON} sessions done</span>
        <div class="hh-actions"><button class="cta hh-go" data-n="${cur.n}">${I.play}<span>${cp.done.length ? "Continue" : "Start"}</span></button>
          <button class="hh-quick" id="quick">${I.t_practice}<span><b>Quick practice</b><small>5 min</small></span></button></div></div>` : ""}
    </header>
    ${voyageHTML(cur)}
    ${rc ? `<button class="review-card" id="reviewBtn"><span class="mono">Review · ${rc} to fix</span><h2>Words and answers you missed</h2><span class="go">START REVIEW</span></button>` : ""}
    ${moduleSection(m, cur)}
    <button class="chip-btn see-all" id="seeAll">See all 7 modules</button>`);
  wireRows();
  if ($("#quick")) $("#quick").onclick = () => startDrill("quick");
  const rb = $("#reviewBtn"); if (rb) rb.onclick = startReview;
  $("#seeAll").onclick = viewLessons;
}

function viewLessons(){
  const cur = currentLesson();
  tabView("lessons", `<h2 class="tab-title">Lessons</h2><p class="sub tab-sub">27 lessons in 7 modules, from the first walk on deck to the radio.</p>
    ${COURSE.modules.map(m => moduleSection(m, cur)).join("")}
    <p class="note">Progress is saved on this device.</p>`);
  wireRows();
}

function viewPractice(){
  const rc = reviewList().length, any = allLessons().some(started);
  const mods = COURSE.modules.filter(m => m.lessons.some(l => l.ready));
  tabView("practice", `<h2 class="tab-title">Practice</h2><p class="sub tab-sub">Short rounds with what you have already learned.</p>
    <button class="pcard" id="quick"><span class="pcard-ico">${I.t_practice}</span><span><b>Quick practice</b><small>${any ? "8 questions from your lessons · about 5 min" : "8 questions from Lesson 1 · about 5 min"}</small></span>${I.chev}</button>
    <button class="pcard" id="reviewBtn" ${rc ? "" : "disabled"}><span class="pcard-ico">${I.check}</span><span><b>Review your mistakes</b><small>${rc ? `${rc} to fix` : "Nothing to fix right now"}</small></span>${I.chev}</button>
    <section class="module"><div class="module-head"><h3>Module tests</h3><span class="mono">80% to pass</span></div>
      <ol class="lrows">${mods.map(moduleTestRow).join("")}</ol></section>
    <p class="note">One certificate at the end of the course, when you pass the final test.</p>`);
  $("#quick").onclick = () => startDrill("quick");
  if (rc) $("#reviewBtn").onclick = startReview;
  wireRows();
}

async function viewLogbook(){
  const ls = allLessons().filter(started);
  tabView("logbook", `<h2 class="tab-title">Logbook</h2><p class="sub tab-sub">Every word and phrase from the lessons you have started.</p><div id="lb"><p class="loading">Opening the logbook…</p></div>`);
  if (!ls.length) { $("#lb").innerHTML = `<div class="panel"><b>Your logbook is empty.</b> <span class="sub">Finish a session and its words appear here.</span></div>`; return; }
  const groups = [];
  try { for (const l of ls) { await loadLesson(l.n); groups.push({l, words: Object.entries(L.words || {})}); } }
  catch (e) { if ($("#lb")) $("#lb").innerHTML = `<p>The logbook could not be loaded. Check your connection.</p>`; return; }
  if (!$("#lb")) return;
  const total = groups.reduce((a, g) => a + g.words.length, 0);
  $("#lb").innerHTML = `<input class="field lb-search" id="lbq" placeholder="Search ${total} words · English or Spanish" autocomplete="off" aria-label="Search the logbook">
    ${groups.map(g => `<section class="lb-group" data-g><div class="module-head"><h3>${g.l.n} · ${esc(g.l.title)}</h3></div>
      <ul class="lb-list">${g.words.map(([k, w]) => `<li data-s="${esc(norm(w.en + " " + w.es))}"><button class="small-play" data-ln="${g.l.n}" data-a="${esc(w.audio)}" aria-label="Hear: ${esc(w.en)}">${I.spk}</button>
        <div><b>${esc(w.en)}</b> <span class="ipa">${esc(w.ipa || "")}</span><small>${esc(w.es)}</small></div></li>`).join("")}</ul></section>`).join("")}`;
  $$(".lb-list [data-a]").forEach(b => b.onclick = async () => { await loadLesson(+b.dataset.ln); playClip(b.dataset.a); });
  $("#lbq").oninput = e => {
    const q = norm(e.target.value);
    $$(".lb-list li").forEach(li => li.hidden = !!q && !li.dataset.s.includes(q));
    $$("[data-g]").forEach(g => g.hidden = !g.querySelector("li:not([hidden])"));
  };
}

function viewProfile(){
  const all = allLessons(), ld = all.filter(isDone).length;
  const sess = all.reduce((a, l) => a + doneCount(l.n), 0);
  const sc = Object.keys(progress).filter(k => /^l\d+$/.test(k)).flatMap(k => Object.values(progress[k].scores || {}));
  const avg = sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) + "%" : "–";
  const tests = testsState(), passed = Object.values(tests).filter(t => t.passed).length;
  const seg = (v, label) => `<button class="seg-b" data-speed="${v}" aria-pressed="${settings.speed === v}">${label}</button>`;
  tabView("profile", `<h2 class="tab-title">Profile</h2>
    <div class="stats4">
      <div><b>${ld}</b><span>${ld === 1 ? "lesson" : "lessons"} done</span></div><div><b>${sess}</b><span>sessions</span></div>
      <div><b>${avg}</b><span>right first time</span></div><div><b>${passed}</b><span>module ${passed === 1 ? "test" : "tests"} passed</span></div>
    </div>
    <section class="panel setting">
      <div><b>Listening speed</b><span class="sub">Clips start at this speed. You can always tap Slower on a clip.</span></div>
      <div class="seg" role="group" aria-label="Listening speed">${seg("normal", "Normal")}${seg("slow", "Slower")}</div>
    </section>
    <section class="panel setting">
      <div><b>Introduction</b><span class="sub">Show the welcome screen again.</span></div>
      <button class="chip-btn" id="showWelcome">Show intro</button>
    </section>
    <section class="panel setting">
      <div><b>Reset progress</b><span class="sub">Clears lessons, scores, tests and the review list on this device.</span></div>
      <button class="chip-btn danger" id="reset">Reset progress</button>
    </section>
    <p class="note">English on Board · beta</p>`);
  $$(".seg-b").forEach(b => b.onclick = () => { settings.speed = b.dataset.speed; saveSettings(); viewProfile(); });
  $("#showWelcome").onclick = viewWelcome;
  let armed = false; const reset = $("#reset");
  reset.onclick = () => {
    if (!armed) { armed = true; reset.textContent = "Tap again to erase"; reset.classList.add("armed"); return; }
    progress = {}; saveProgress(); viewHome();
  };
}
const viewSettings = viewProfile;

/* =========================================================
   DRILLS — Quick practice and the module test
   Both are built from the graded screens of the lessons, plus word questions.
   ========================================================= */
const TEST_N = 15, TEST_PASS = 80, QUICK_N = 8;
async function screenPools(ns){
  const pools = {listen: [], read: [], complete: [], vocab: []};
  for (const n of ns) {
    await loadLesson(n);
    L.sessions.forEach(se => se.screens.forEach((s, j) => {
      const it = {...s, ln: n, rk: `${n}|${se.id}|${j}`};
      if (s.type === "listen" || s.type === "tap") pools.listen.push(it);
      else if (s.type === "doc" || s.type === "docfind") pools.read.push(it);
      else if (s.type === "build" || (s.type === "type" && !s.audio) || (s.type === "choice" && !s.quick && /_{3}/.test(s.q))) pools.complete.push(it);
    }));
    const ws = Object.values(L.words || {});
    ws.forEach(w => {
      const others = shuffle(ws.filter(o => o.en !== w.en)).slice(0, 2).map(o => o.en);
      if (others.length === 2) pools.vocab.push({type: "choice", q: `"${w.es}" in English:`, opts: [w.en, ...others], a: 0, ln: n, rk: null, kind: "choice"});
      pools.vocab.push({type: "type", audio: w.audio, q: "Type what you hear.", accept: [w.en], ln: n, rk: null, kind: "type"});
    });
  }
  /* spread each pool across the lessons */
  for (const k in pools) pools[k] = shuffle(pools[k]);
  return pools;
}
function takeSpread(pool, k, ns){
  const out = [], byL = ns.map(n => pool.filter(x => x.ln === n));
  for (let r = 0; out.length < k && byL.some(b => b.length); r++) byL.forEach(b => { if (out.length < k && b.length) out.push(b.shift()); });
  return out;
}

async function startDrill(kind, modN){
  stopAll(); clearBar(); clearTabs();
  app.innerHTML = `<p class="loading">${kind === "test" ? "Preparing the test…" : "Preparing your practice…"}</p>`;
  let ns, items = [];
  try {
    if (kind === "test") {
      ns = COURSE.modules.find(m => m.n === modN).lessons.filter(l => l.ready).map(l => l.n);
      const p = await screenPools(ns);
      const voc = [...takeSpread(p.vocab.filter(x => x.kind === "choice"), 2, ns), ...takeSpread(p.vocab.filter(x => x.kind === "type"), 2, ns)];
      items = [...takeSpread(p.listen, 5, ns), ...voc, ...takeSpread(p.read, 3, ns), ...takeSpread(p.complete, 3, ns)];
    } else {
      const st = allLessons().filter(started);
      ns = (st.length ? st : allLessons().filter(l => l.ready).slice(0, 1)).map(l => l.n);
      const p = await screenPools(ns), all = shuffle([...p.listen, ...p.vocab, ...p.read, ...p.complete]);
      items = takeSpread(all, QUICK_N, ns);
    }
  } catch (e) {
    app.innerHTML = `<div class="home"><p>This could not be loaded. Check your connection and try again.</p><button class="cta" id="home">Back</button></div>`;
    $("#home").onclick = viewHome; return;
  }
  if (!items.length) { viewHome(); return; }
  if (kind === "quick") items = shuffle(items);
  S = {drill: kind, mod: modN, review: false, i: -1, sess: null, pos: 0, graded: 0, firstRight: 0, missed: 0, queue: items};
  openPlayer();
  render();
}
function finishDrill(){
  $("#prog").style.width = "100%";
  const pct = S.graded ? Math.round(S.firstRight / S.graded * 100) : 0;
  if (S.drill === "test") {
    const t = testsState(), key = "m" + S.mod, prev = t[key], pass = pct >= TEST_PASS;
    t[key] = {best: Math.max(pct, prev ? prev.best : 0), passed: pass || !!(prev && prev.passed), last: pct};
    saveProgress();
    const mod = COURSE.modules.find(m => m.n === S.mod);
    $("#stage").innerHTML = `<div class="result"><span class="mono kicker">Module ${mod.n} test · ${esc(mod.title)}</span>
      <div class="score ${pass ? "" : "low"}">${pct}%</div>
      <h2 class="prompt">${pass ? "Passed." : "Not yet."}</h2>
      <p style="margin:0">${S.firstRight} of ${S.graded} right. ${pass ? "Well done." : `You need ${TEST_PASS}% to pass. Practise a little and try again.`}</p>
      ${S.missed ? `<p class="sub" style="margin:0">The questions you missed are in your review.</p>` : ""}</div>`;
    setBar(pass ? `<button class="cta" id="go">Back to home</button>` : `<div class="self"><button class="opt" id="home2">Back</button><button class="cta" id="go" style="flex:1">Try again</button></div>`, pass ? "ok" : "bad");
    if (pass) $("#go").onclick = viewHome;
    else { $("#go").onclick = () => startDrill("test", S.mod); $("#home2").onclick = viewPractice; }
  } else {
    $("#stage").innerHTML = `<div class="result"><span class="mono kicker">Quick practice · done</span>
      <div class="score">${pct}%</div><p style="margin:0">${S.firstRight} of ${S.graded} right.${S.missed ? " The ones you missed are in your review." : ""}</p></div>`;
    setBar(`<div class="self"><button class="opt" id="home2">Home</button><button class="cta" id="go" style="flex:1">Another round</button></div>`, pct >= TEST_PASS ? "ok" : "");
    $("#go").onclick = () => startDrill("quick"); $("#home2").onclick = viewHome;
  }
}

/* =========================================================
   LESSON
   ========================================================= */
async function openLesson(n){
  stopAll(); clearBar(); markWelcomeSeen();
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
      <button class="back" id="back">${I.back} Home</button>
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
  S = {i, sess, review: false, drill: null, pos: 0, graded: 0, firstRight: 0, missed: 0,
    queue: sess.screens.map((s, j) => ({...s, ln: L.n, rk: `${L.n}|${sess.id}|${j}`}))};
  openPlayer();
  render();
}
function openPlayer(){
  app.innerHTML = `<div class="player"><div class="topbar"><button class="x" id="quit" aria-label="Close session">${I.x}</button><div class="bar"><i id="prog"></i></div></div><div class="stage" id="stage"></div></div>`;
  $("#quit").onclick = () => { stopAll(); if (S.drill === "test") viewPractice(); else if (S.review || S.drill) viewHome(); else viewLesson(); };
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
  if (!ok && !sc.retry) { if (S.drill !== "test") S.queue.push({...sc, retry: true}); S.missed++; }
  if (ok) clearReview(sc.rk); else addReview(sc.rk, sc.type);
  setBar(`<div class="verdict" role="status"><b>${ok ? "Good." : "Not quite."}</b>
    ${!ok && answer ? `<span>Answer: <strong>${esc(answer)}</strong></span>` : ""}
    ${why ? `<span>${esc(why)}</span>` : ""}
    ${!ok && !sc.retry && S.drill !== "test" ? `<span class="note">It comes back at the end.</span>` : ""}</div>
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
  pl.onclick = () => { if (pl.classList.contains("playing")) { stopAll(); pl.classList.remove("playing"); pl.innerHTML = I.play; } else run(defRate()); };
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
function docHTML(key, tap){
  const d = L.docs[key]; let t = 0;
  const T = () => tap ? ` data-t="${t++}" tabindex="0" role="button"` : "";
  if (d.kind === "message") {
    return `<div class="msg ${tap ? "tapdoc" : ""}" role="figure" aria-label="Message from ${esc(d.from)}">
      <div class="msg-from"><span class="msg-av">${esc(d.from.trim()[0])}</span><div><b>${esc(d.from)}</b><span>${esc(d.role || "")}</span></div></div>
      <div class="bubble">${d.text.map(p => `<p${T()}>${esc(p)}</p>`).join("")}<time>${esc(d.time || "")}</time></div></div>`;
  }
  /* kind: form */
  return `<div class="doc ${tap ? "tapdoc" : ""}" role="figure" aria-label="${esc(d.title)}">
    <div class="doc-head"><b>${esc(d.title)}</b><span>${esc(d.subtitle || "")}</span></div>
    ${d.cells ? `<div class="doc-grid">${d.cells.map(([k, v]) => `<div class="doc-cell"${T()}><small>${esc(k)}</small>${esc(v)}</div>`).join("")}</div>` : ""}
    ${d.table ? `<div style="overflow-x:auto"><table><thead><tr>${d.table.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${d.table.rows.map(r => `<tr${T()}>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
  </div>`;
}

/* ---------- screens ---------- */
function render(){
  const sc = S.queue[S.pos];
  if (L && L.n === sc.ln) { draw(); return; }
  /* review mixes lessons: load the lesson this screen belongs to first */
  const st = $("#stage"); if (st) st.innerHTML = `<p class="loading">Loading…</p>`;
  loadLesson(sc.ln).then(draw, () => { if ($("#stage")) $("#stage").innerHTML = `<p>This lesson could not be loaded. Check your connection.</p>`; cont("Skip"); });
}
function draw(){
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
    wireOpts(sc); run(defRate());
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
    run(defRate());
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

  docfind(sc, st, retry){
    st.innerHTML = `${retry}<span class="mono kicker">Read and tap</span><h2 class="prompt" style="font-size:24px">${esc(sc.q)}</h2>${docHTML(sc.doc, true)}`;
    setBar(`<button class="cta" disabled>Tap the document</button>`);
    let locked = false;
    $$("[data-t]").forEach(el => {
      const go = () => {
        if (locked) return; locked = true;
        const ok = +el.dataset.t === sc.a;
        el.classList.add(ok ? "t-right" : "t-wrong");
        const right = document.querySelector(`[data-t="${sc.a}"]`); if (!ok && right) right.classList.add("t-right");
        verdict(ok, ok ? "" : (right.querySelector("td, small") || right).textContent.replace(/\s+/g, " ").trim(), sc.why || (ok ? "" : "The right one is in green."));
      };
      el.addEventListener("click", go);
      el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  },

  doc(sc, st, retry){
    st.innerHTML = `${retry}<span class="mono kicker">Read</span>${docHTML(sc.doc)}<h2 class="prompt" style="font-size:24px">${esc(sc.q)}</h2>${optsHTML(sc.opts)}`;
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
    if (run) run(defRate());
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
  if (!isRole) wirePlayer(rate => playClip(sc.model, {rate}))(defRate());
  else if (cue) wirePlayer(rate => playClip(sc.cue, {rate}))(defRate());
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
    clearReview(sc.rk);
    setBar(`<div class="verdict" role="status"><b>Clear and correct.</b><span>That's what a listener on board would hear.</span></div><button class="cta" id="go">Continue</button>`, "ok");
    $("#go").onclick = next;
  } else {
    const msg = level === "almost" ? `Missing: <strong>${esc(missing.join(", "))}</strong>` : "Not clear yet. Listen to the model and try again.";
    setBar(`<div class="verdict" role="status"><b>${level === "almost" ? "Almost." : "Try again."}</b><span>${msg}</span></div>
      <div class="self"><button class="opt" id="later">Continue</button><button class="cta" id="retryNow" style="flex:1">Try again</button></div>`, "bad");
    $("#retryNow").onclick = () => { setBar(`<button class="cta" disabled>Say it again</button>`); $("#mic").click(); };
    $("#later").onclick = () => { addReview(sc.rk, sc.type); if (!sc.retry) S.queue.push({...sc, retry: true}); next(); };
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
  $("#gotit").onclick = () => { clearReview(sc.rk); next(); };
  $("#again").onclick = () => { addReview(sc.rk, sc.type); if (!sc.retry) S.queue.push({...sc, retry: true}); next(); };
}

function finish(){
  stopAll();
  if (S.drill) { finishDrill(); return; }
  if (S.review) { finishReview(); return; }
  const s = S.sess, p = lessonProgress(L.n);
  if (!p.done.includes(s.id)) p.done.push(s.id);
  const pct = S.graded ? Math.round(S.firstRight / S.graded * 100) : null;
  p.scores = p.scores || {};
  if (pct !== null) p.scores[s.id] = pct;
  saveProgress();
  $("#prog").style.width = "100%";
  const nextIdx = L.sessions.findIndex(x => !p.done.includes(x.id));
  $("#stage").innerHTML = `<div class="result"><span class="mono kicker">${esc(s.skill)} · done</span>
    ${pct !== null ? `<div class="score">${pct}%</div><p style="margin:0">${S.firstRight} of ${S.graded} right the first time.${S.missed ? " The ones you missed came back once." : ""}</p>` : `<h2 class="prompt" style="font-size:40px">Session done</h2>`}
    <h2 class="prompt">${esc(s.title)}</h2></div>`;
  setBar(`<button class="cta" id="go">${nextIdx > -1 ? "Next: " + esc(L.sessions[nextIdx].title) : "Lesson summary"}</button>`, "ok");
  $("#go").onclick = () => { if (nextIdx > -1) startSession(nextIdx); else viewLessonDone(); };
}

/* =========================================================
   LESSON LOADING (shared by lessons and review)
   ========================================================= */
const LESSON_CACHE = {};
async function loadLesson(n){
  if (L && L.n === n) return;
  if (!LESSON_CACHE[n]) LESSON_CACHE[n] = await getJSON(`lessons/lesson-${pad(n)}.json`);
  L = LESSON_CACHE[n];
  PLATE_SVG = "";
  if (L.plate && L.plate.svg) { try { const r = await fetch(L.plate.svg); if (r.ok) PLATE_SVG = await r.text(); } catch (e) {} }
}

/* =========================================================
   REVIEW — the screens the learner got wrong, across lessons
   ========================================================= */
async function startReview(){
  stopAll(); clearBar();
  app.innerHTML = `<p class="loading">Preparing your review…</p>`;
  const items = [];
  try {
    for (const {k, t} of reviewList().slice()) {
      const [n, sid, i] = k.split("|");
      await loadLesson(+n);
      const sess = L.sessions.find(x => x.id === sid), scr = sess && sess.screens[+i];
      if (!scr || scr.type !== t) { clearReview(k); continue; }   /* the lesson changed since the miss */
      items.push({...scr, ln: +n, rk: k});
    }
  } catch (e) {
    app.innerHTML = `<div class="home"><p>The review could not be loaded. Check your connection and try again.</p><button class="cta" id="home">Back</button></div>`;
    $("#home").onclick = viewHome; return;
  }
  if (!items.length) { viewHome(); return; }
  S = {review: true, drill: null, i: -1, sess: null, pos: 0, graded: 0, firstRight: 0, missed: 0, queue: items};
  openPlayer();
  render();
}
function finishReview(){
  $("#prog").style.width = "100%";
  const left = reviewList().length, n = new Set(S.queue.map(x => x.rk)).size;
  $("#stage").innerHTML = `<div class="result"><span class="mono kicker">Review · done</span>
    <h2 class="prompt" style="font-size:40px">${n} ${n === 1 ? "item" : "items"} checked</h2>
    <p style="margin:0">${left ? `${left} still to fix. They come back next time.` : "Nothing left to fix. Well done."}</p></div>`;
  setBar(`<button class="cta" id="go">Back to home</button>`, "ok");
  $("#go").onclick = viewHome;
}

/* =========================================================
   LESSON SUMMARY — after the last session of a lesson
   ========================================================= */
function viewLessonDone(){
  stopAll(); clearBar(); location.hash = "l" + L.n;
  const p = lessonProgress(L.n), scores = Object.values(p.scores || {});
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const mod = COURSE.modules.find(m => m.lessons.some(l => l.n === L.n));
  const all = COURSE.modules.flatMap(m => m.lessons);
  const nxt = all[all.findIndex(l => l.n === L.n) + 1];
  const modDone = mod.lessons.every(l => { const q = progress["l" + l.n]; return q && q.done.length >= 6; });
  const toReview = reviewList().filter(r => r.k.startsWith(L.n + "|")).length;
  const words = Object.keys(L.words || {}).length;
  app.innerHTML = `<div class="home lesson-done">
    <span class="mono kicker">Lesson ${L.n} · complete</span>
    <h2 class="done-title">${esc(L.title)}</h2>
    <div class="done-stats">
      <div><b>${avg !== null ? avg + "%" : "–"}</b><span>right the first time</span></div>
      <div><b>${words}</b><span>words</span></div>
      <div><b>${toReview}</b><span>to review</span></div>
    </div>
    ${modDone ? `<div class="panel module-done"><span class="mono kicker">Module ${mod.n} · complete</span><h3>${esc(mod.title)}</h3>
      <p class="sub" style="margin:6px 0 10px">Check what you learned: 15 questions, 80% to pass.</p><button class="chip-btn" id="modTest">Take the Module ${mod.n} test</button></div>` : ""}
    ${nxt && nxt.ready ? `<button class="cta" id="nextL">Next: Lesson ${nxt.n} · ${esc(nxt.title)}</button>` : nxt ? `<p class="note">Lesson ${nxt.n} is coming soon.</p>` : ""}
    <button class="chip-btn" id="allL" style="align-self:center">All lessons</button>
  </div>`;
  if ($("#nextL")) $("#nextL").onclick = () => openLesson(nxt.n);
  $("#allL").onclick = viewLessons;
  if ($("#modTest")) $("#modTest").onclick = () => startDrill("test", mod.n);
  window.scrollTo(0, 0);
}

/* =========================================================
   WELCOME — first time only
   ========================================================= */
function markWelcomeSeen(){ try { localStorage.setItem(WELCOME_KEY, "1"); } catch (e) {} }
function viewWelcome(){
  stopAll(); clearBar(); location.hash = "";
  app.innerHTML = `<div class="home welcome">
    <div class="brand"><div class="brand-mark">${I.wheel}</div><div><h1>English on Board</h1><p>Maritime English for deck officers</p></div></div>
    <h2 class="welcome-title">Practice the English you use on the bridge, on deck and on the radio.</h2>
    <p class="sub">Inglés para oficiales de cubierta: escuchar, hablar y leer lo que pasa a bordo.</p>
    <ol class="how">
      <li><span class="mono">Listen</span><p>Clips with the crew, the captain and the VHF. Some have static, like a real radio.</p></li>
      <li><span class="mono">Speak</span><p>Say the lines out loud. The app checks what it hears.</p></li>
      <li><span class="mono">Read</span><p>Find the right line in a log, a message or a crew list.</p></li>
    </ol>
    <p class="sub">27 short lessons in 7 modules. Your progress is saved on this phone, and the lessons work offline after the first load.</p>
    <button class="cta" id="wStart">Start Lesson 1</button>
    <button class="chip-btn" id="wSkip" style="align-self:center">Go to the lessons</button>
  </div>`;
  $("#wStart").onclick = () => { markWelcomeSeen(); openLesson(1); };
  $("#wSkip").onclick = () => { markWelcomeSeen(); viewHome(); };
  window.scrollTo(0, 0);
}

/* =========================================================
   BOOT
   ========================================================= */
(async function boot(){
  try { COURSE = await getJSON("course.json"); }
  catch (e) { app.innerHTML = `<p class="loading">The course could not be loaded. Check your connection and reload.</p>`; return; }
  const m = /^#l(\d+)$/.exec(location.hash);
  const ready = m && COURSE.modules.some(mod => mod.lessons.some(l => l.n === +m[1] && l.ready));
  let fresh = false;
  try { fresh = !localStorage.getItem(WELCOME_KEY) && Object.keys(progress).length === 0; } catch (e) {}
  if (ready) openLesson(+m[1]);
  else if (fresh) viewWelcome();
  else viewHome();
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch (e) {}
  }
})();
