#!/usr/bin/env node
/* English on Board · records the MODEL voice (words, examples, model answers) with ElevenLabs.
   Runs on your computer with Node 18 or newer. No installs needed.

   Usage (Terminal):
     ELEVENLABS_API_KEY=your_key node model-voice.mjs
     ELEVENLABS_API_KEY=your_key node model-voice.mjs --voice "Alice" --lessons 1-5

   Options
     --voice    name of an ElevenLabs voice in your account (default "Alice")
     --lessons  which lessons, e.g. 1-5 or 1,2,6 (default: every lesson marked ready)
     --out      output folder (default: a folder "model-voice" on your Desktop)

   It downloads the lesson texts from GitHub, creates one mp3 per model line with the right
   file name, and skips files that already exist, so you can stop it and run it again.
   When it finishes, zip the "model-voice" folder and send it. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const RAW = "https://raw.githubusercontent.com/BiancaTortore/EnglishOnBoard/main";
const API = process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io/v1";
const MODEL_ID = "eleven_multilingual_v2";
/* only for the recording: spellings that make the voice say the nautical word right */
const RESPELL = {bow: "bough", starboard: "starb'd", bosun: "bo'sun", boatswain: "bo'sun", forecastle: "fo'c'sle", "fo'c'sle": "fo'c'sle", leeward: "loo-ard", gunwale: "gunnel"};

const args = Object.fromEntries(process.argv.slice(2).join(" ").split(/\s+(?=--)/).filter(Boolean).map(a => {
  const m = /^--(\w+)\s*(.*)$/.exec(a.trim()); return m ? [m[1], m[2].replace(/^["']|["']$/g, "")] : [a, ""];
}));
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error("\nMissing your ElevenLabs key. Run it like this:\n  ELEVENLABS_API_KEY=your_key node model-voice.mjs\n"); process.exit(1); }
if (typeof fetch !== "function") { console.error("\nThis needs Node 18 or newer. Check with: node -v\n"); process.exit(1); }
const OUT = args.out || path.join(os.homedir(), "Desktop", "model-voice");
const VOICE_NAME = args.voice || "Alice";
const pad = n => String(n).padStart(2, "0");
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseLessons(s, ready){
  if (!s) return ready;
  const out = new Set();
  s.split(",").forEach(p => { const [a, b] = p.split("-").map(Number); for (let i = a; i <= (b || a); i++) out.add(i); });
  return [...out].sort((x, y) => x - y);
}
function sayText(t){
  let s = String(t).trim();
  for (const [w, r] of Object.entries(RESPELL)) s = s.replace(new RegExp(`(^|[^\\w'])${w.replace(/'/g, "'")}(?![\\w'])`, "gi"), `$1${r}`);
  if (!/[.!?]$/.test(s)) s += ".";   /* a full stop gives single words a natural, finished intonation */
  return s;
}
process.on("unhandledRejection", e => {
  const net = e && (e.cause && /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/.test(String(e.cause.code || e.cause)) || /fetch failed/.test(e.message));
  console.error(net ? "\nNo connection to the internet (or to ElevenLabs). Check the Wi-Fi and run it again.\n" : `\nSomething went wrong: ${e && e.message}\n`);
  process.exit(1);
});
async function getJSON(url){ const r = await fetch(url); if (!r.ok) throw new Error(`${url} → ${r.status}`); return r.json(); }

async function findVoice(name){
  const r = await fetch(`${API}/voices`, {headers: {"xi-api-key": KEY}});
  if (r.status === 401 || r.status === 403) {
    const body = await r.text();
    if (/permission/i.test(body)) console.error("\nThe key works, but it is missing a permission. In ElevenLabs → Developers → API Keys, edit the key and set\n  Text to Speech: Access\n  Voices: Read\nthen run this again.\n\nElevenLabs said: " + body.slice(0, 300) + "\n");
    else console.error("\nElevenLabs did not accept the key. Copy it again from ElevenLabs → Developers → API Keys.\n\nElevenLabs said: " + body.slice(0, 300) + "\n");
    process.exit(1);
  }
  if (!r.ok) throw new Error(`voices → ${r.status}`);
  const {voices} = await r.json();
  const v = voices.find(v => v.voice_id === name) || voices.find(v => v.name.toLowerCase() === name.toLowerCase())
         || voices.find(v => v.name.toLowerCase().startsWith(name.toLowerCase()));
  if (!v) { console.error(`\nNo voice called "${name}" in your account. Available:\n  ${voices.map(v => v.name).join(", ")}\n\nRun again with --voice "Name".\n`); process.exit(1); }
  return v;
}
async function tts(voiceId, text, file){
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {"xi-api-key": KEY, "content-type": "application/json", accept: "audio/mpeg"},
      body: JSON.stringify({text, model_id: MODEL_ID, voice_settings: {stability: 0.6, similarity_boost: 0.8, style: 0, use_speaker_boost: true}})
    });
    if (r.ok) { fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return; }
    const msg = await r.text();
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * attempt); continue; }
    if (r.status === 401 || r.status === 403) { console.error(`\nElevenLabs refused to record (${r.status}). If it mentions a permission, edit the key and set "Text to Speech: Access".\n\nElevenLabs said: ${msg.slice(0, 300)}\n`); process.exit(1); }
    if (/quota|credits/i.test(msg)) { console.error("\nYour ElevenLabs credits ran out. Files made so far are kept; run again after topping up.\n"); process.exit(1); }
    throw new Error(`${r.status} ${msg.slice(0, 200)}`);
  }
  throw new Error("ElevenLabs is busy; try again in a few minutes");
}

const course = await getJSON(`${RAW}/course.json`);
const ready = course.modules.flatMap(m => m.lessons).filter(l => l.ready).map(l => l.n);
const lessons = parseLessons(args.lessons, ready);
const voice = await findVoice(VOICE_NAME);
console.log(`\nVoice: ${voice.name} · lessons ${lessons.join(", ")} · saving to ${OUT}\n`);

const jobs = [];
for (const n of lessons) {
  const L = await getJSON(`${RAW}/lessons/lesson-${pad(n)}.json`);
  const dir = path.join(OUT, `l${pad(n)}`);
  fs.mkdirSync(dir, {recursive: true});
  for (const [id, c] of Object.entries(L.audio || {})) {
    if (c.voice !== "model") continue;
    jobs.push({n, id, text: c.text, file: path.join(dir, `${id}.mp3`)});
  }
}
const todo = jobs.filter(j => !fs.existsSync(j.file));
const chars = todo.reduce((a, j) => a + sayText(j.text).length, 0);
console.log(`${jobs.length} model lines · ${jobs.length - todo.length} already done · ${todo.length} to make (about ${chars} characters of credit)\n`);

let done = 0, failed = [];
async function worker(){
  while (todo.length) {
    const j = todo.shift();
    try { await tts(voice.voice_id, sayText(j.text), j.file); done++; process.stdout.write(`  ✓ L${j.n} ${j.id}  "${j.text}"\n`); }
    catch (e) { failed.push(j); process.stdout.write(`  ✗ L${j.n} ${j.id}  ${e.message}\n`); }
  }
}
await Promise.all([worker(), worker()]);
console.log(`\nDone: ${done} new files${failed.length ? ` · ${failed.length} failed (run again to retry them)` : ""}.`);
console.log(`Now zip the folder "${path.basename(OUT)}" on your Desktop and send it.\n`);
