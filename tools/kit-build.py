import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(f"{ROOT}/tools/out", exist_ok=True)
import json, html, sys
N = int(sys.argv[1]) if len(sys.argv) > 1 else 1
NN = f'{N:02d}'
L = json.load(open(f'{ROOT}/lessons/lesson-{NN}.json'))
USED = {c['voice'] for c in L['audio'].values()}
e = lambda s: html.escape(str(s), quote=True)

STYLE = "Documentary photograph, natural light, realistic skin texture, real worn workwear, no logos, no visible text, no watermark."
SHEET = ("Character reference sheet of one single person shown four times on a plain light-grey studio background: "
         "front view head and shoulders, three-quarter view head and shoulders, side profile, and a waist-up front view. "
         "Identical face, hair and clothes in all four views, soft even studio light. {d} Photorealistic, " + STYLE)
CHARS = [
 ("diego","Diego Martínez","Deck cadet · argentino, 22",True,
  "A 22-year-old Argentine young man, short dark brown hair, very light stubble, slim youthful face, brown eyes, friendly but slightly nervous expression. Wearing a plain navy-blue boiler suit.",
  "A young Argentine man in his early twenties speaking good English with a light Argentine Spanish accent. Clear, polite and a little nervous, a student on his first ship. Medium pitch, natural pace."),
 ("rolando","Rolando Reyes","Bosun · filipino, 46",True,
  "A 46-year-old Filipino man, tanned skin, short greying black hair, warm wide smile, laughter lines. Wearing a well-worn orange rating's boiler suit, a white safety helmet, work gloves sticking out of the chest pocket.",
  "A Filipino man in his mid-forties speaking English with a natural Filipino accent. Warm, friendly and energetic, a bit fast. Mid-low pitch, the voice of someone used to talking on a noisy deck."),
 ("tanya","Tanya Williams","Chief Officer · británica, 41",True,
  "A 41-year-old British woman, brown hair tied back in a low ponytail, light freckles, calm confident expression. Wearing a navy-blue officer's boiler suit, top unzipped to the chest over a white T-shirt.",
  "A British woman in her early forties with a standard Southern British accent. Confident, firm and very clear. Professional, the voice of a ship's Chief Officer on the radio."),
 ("lars","Lars Andersen","Master · danés, 58",False,
  "A 58-year-old Danish man, tall, short white hair, neat grey beard, thin metal-frame glasses, calm authoritative face. Wearing a white short-sleeved uniform shirt with four gold stripes on the shoulder boards.",
  "A Danish man in his late fifties speaking English with a Scandinavian accent. Calm, deep and slow. Authoritative but kind."),
 ("james","James O'Connor","2nd Officer · irlandés, 33",False,
  "A 33-year-old Irish man, red hair, short red beard, relaxed smile. Wearing a navy fleece jacket.",
  "An Irish man in his early thirties with a Dublin accent. Relaxed, friendly and easy-going, a little humour in the voice."),
 ("marek","Marek Novak","Chief Engineer · checo, 52",False,
  "A 52-year-old Czech man, stocky build, shaved head, grey moustache, serious expression. Wearing a navy-blue engineer officer's boiler suit with a few oil stains.",
  "A Czech man in his early fifties speaking English with a Central European accent. Dry, low and matter-of-fact. Short sentences."),
 ("mario","Mario Dela Cruz","Chief Cook · filipino, 50",False,
  "A 50-year-old Filipino man, short, round friendly face, big smile. Wearing a white chef's jacket and a black chef's cap.",
  "A Filipino man about fifty speaking English with a Filipino accent. Cheerful, warm and chatty."),
 ("chen","Lt. Amy Chen","Inspectora US Coast Guard · 36",False,
  "A 36-year-old Chinese-American woman, black hair tied back, direct professional expression. Wearing a United States Coast Guard blue working uniform, holding a clipboard.",
  "An American woman in her mid-thirties with a General American accent. Direct, professional and crisp."),
 ("terminal","Houston Terminal","Operador de radio · estadounidense",False,None,
  "An American man in his forties with a Southern US accent, a port radio operator. Fast, routine and clear, like someone who makes the same call every day."),
 ("pilot","Capt. Laurent Dubois","Práctico de Marsella · francés, 55",False,
  "A 55-year-old French man, grey hair, weathered tanned face, confident expression. Wearing a red marine pilot jacket with reflective strips and a white helmet.",
  "A French man in his mid-fifties speaking English with a strong French accent. Gravelly, fast and confident."),
]
MODEL_VOICE = "A clear, neutral British English voice, a woman in her thirties. Calm, warm and measured, like a good language teacher. Every word easy to hear. Studio quality, no accent quirks."
NAMES = {c[0]: c[1] for c in CHARS}; NAMES["model"] = "Voz modelo"

def copybtn(text, label="Copiar"):
    return f'<button class="copy" data-copy="{e(text)}">{label}</button>'

# script groups
groups = [("Diálogo",f"l{NN}-","El diálogo de la lección. Grabá cada línea por separado, con naturalidad, como una charla real."),
          ("Lo que dicen los personajes en los ejercicios","c-","Órdenes y preguntas cortas, cada una con la voz de su personaje.")]
rows_by = {g[1]: [] for g in groups}
for aid, c in L["audio"].items():
    if c["voice"] == "model": continue
    parts = c["text"].split("|")
    for i, t in enumerate(parts):
        f = f"{aid}-{'ab'[i]}.mp3" if len(parts) > 1 else f"{aid}.mp3"
        note = c.get("note","")
        if len(parts) > 1: note = ("Primera mitad del mensaje" if i == 0 else "Segunda mitad del mensaje") + ". La app pone la estática en el medio."
        for g in groups:
            if aid.startswith(g[1]): rows_by[g[1]].append((f, c["voice"], t.strip(), note)); break
total = sum(len(v) for v in rows_by.values())

def script_html():
    out = []
    for title, pre, desc in groups:
        rs = rows_by[pre]
        out.append(f'<section class="grp"><div class="grp-head"><h3>{e(title)}</h3><span class="mono">{len(rs)} audios</span></div><p class="sub">{e(desc)}</p><ol class="lines">')
        for f, v, t, note in rs:
            out.append(f'<li class="line"><div class="line-top"><code>{e(f)}</code><span class="who who-{e(v)}">{e(NAMES.get(v,v))}</span></div>'
                       f'<p class="say">{e(t)}</p>{f"<p class=note>{e(note)}</p>" if note else ""}'
                       f'<div class="line-btns">{copybtn(t,"Copiar texto")}{copybtn(f,"Copiar nombre")}</div></li>')
        out.append('</ol></section>')
    return "".join(out)

def chars_html():
    out = []
    for key, name, role, inL1, look, voice in CHARS:
        inL1 = key in USED
        p = SHEET.format(d=look) if look else ""
        face = f'<div class="block"><span class="mono">Ficha de cara</span><p class="prompt">{e(p)}</p>{copybtn(p)}</div>' if look else '<p class="note">Solo voz: no aparece en fotos.</p>'
        out.append(f'''<article class="char {'l1' if inL1 else ''}"><div class="char-head"><div><h3>{e(name)}</h3><span class="sub">{e(role)}</span></div>{f'<span class="badge">Lesson {N}</span>' if inL1 else ''}</div>
        {face}
        <div class="block"><span class="mono">Voz · ElevenLabs Voice Design</span><p class="prompt">{e(voice)}</p>{copybtn(voice)}</div>
        {f'<p class="note">Guardala como <code>img/characters/{key}.jpg</code></p>' if look else ''}</article>''')
    return "".join(out)

HERO = open(f'{ROOT}/img/l{NN}/prompts.md').read()
import re
# each photo is a "## `scene.jpg` ..." / "## `hero.jpg` ..." section with one "> prompt" line
def photo_prompt(name):
    m = re.search(r"^## `" + re.escape(name) + r"`.*?^> ([^\n]+)$", HERO, re.M | re.S)
    if not m: sys.exit(f"img/l{NN}/prompts.md: missing a '## `{name}`' section with a '> prompt' line")
    return m.group(1)
hero_p, scene_p = photo_prompt("hero.jpg"), photo_prompt("scene.jpg")
m = re.search(r"^Referencias:\s*(.+)$", HERO, re.M)
REFS = re.sub(r"[*.]", "", m.group(1)).strip() if m else "los personajes de la escena"

page = f'''<title>Kit de producción · L{N}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: single reading column (max 760px) with a sticky section nav; every prompt/line has copy buttons. */
:root{{--bg:#EDF1F3;--surface:#FFFFFF;--ink:#0D1F2D;--muted:#566874;--rule:#D3DCE2;--accent:#D9480F;--accent-ink:#FFFFFF;--sea:#17506A;--sea-ink:#FFFFFF;--sea-soft:#DCE9EF;--ok:#1C7C4E;--ok-soft:#DCF2E4;
--f-display:"Barlow Condensed","Arial Narrow",system-ui,sans-serif;--f-body:"Barlow",system-ui,-apple-system,"Segoe UI",sans-serif;--f-mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{--bg:#09131A;--surface:#112029;--ink:#E3EBF0;--muted:#93A6B3;--rule:#22394A;--accent:#FF6B35;--accent-ink:#1A0A03;--sea:#0F3446;--sea-ink:#E3EBF0;--sea-soft:#16384A;--ok:#52C48C;--ok-soft:#123426;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#09131A;--surface:#112029;--ink:#E3EBF0;--muted:#93A6B3;--rule:#22394A;--accent:#FF6B35;--accent-ink:#1A0A03;--sea:#0F3446;--sea-ink:#E3EBF0;--sea-soft:#16384A;--ok:#52C48C;--ok-soft:#123426;color-scheme:dark}}
body{{background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:16px;line-height:1.5;margin:0}}
*{{box-sizing:border-box}}
body::before{{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--sea)}}
.wrap{{max-width:760px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 60px;display:flex;flex-direction:column;gap:28px}}
header.top{{background:var(--sea);color:var(--sea-ink);padding-block:28px 22px}}
header.top .in{{max-width:760px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:flex;flex-direction:column;gap:8px}}
h1,h2,h3{{font-family:var(--f-display);font-weight:700;margin:0;line-height:1.05;text-wrap:balance}}
h1{{font-size:40px}} h2{{font-size:30px}} h3{{font-size:22px}}
header.top p{{margin:0;max-width:60ch;opacity:.92}}
.mono{{font-family:var(--f-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}}
header.top .mono{{color:inherit;opacity:.8}}
nav.toc{{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);border-bottom:1px solid var(--rule);overflow-x:auto}}
nav.toc .in{{max-width:760px;margin:0 auto;display:flex;gap:6px;padding:10px max(16px,env(safe-area-inset-right,0px)) 10px max(16px,env(safe-area-inset-left,0px))}}
nav.toc a{{white-space:nowrap;text-decoration:none;color:var(--ink);font-size:14px;font-weight:500;padding:6px 12px;border-radius:999px;border:1px solid var(--rule);background:var(--surface)}}
section.part{{display:flex;flex-direction:column;gap:14px;scroll-margin-top:70px}}
.num{{color:var(--accent);font-family:var(--f-display);font-weight:700;font-size:18px}}
.sub{{color:var(--muted);margin:0}}
.steps{{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;counter-reset:s}}
.steps li{{background:var(--surface);border:1px solid var(--rule);border-radius:14px;padding:14px 14px 14px 52px;position:relative;counter-increment:s}}
.steps li::before{{content:counter(s);position:absolute;left:14px;top:14px;width:26px;height:26px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font-weight:700;font-size:14px}}
.steps b{{display:block}}
.chars{{display:grid;grid-template-columns:1fr;gap:12px}}
.char{{background:var(--surface);border:1px solid var(--rule);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px;min-width:0}}
.char.l1{{border:2px solid var(--accent)}}
.char-head{{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}}
.badge{{background:var(--accent);color:var(--accent-ink);font-size:12px;font-weight:600;border-radius:6px;padding:3px 8px;white-space:nowrap}}
.block{{display:flex;flex-direction:column;gap:6px;align-items:flex-start}}
.prompt{{margin:0;font-size:15px;background:var(--bg);border-radius:10px;padding:10px 12px;align-self:stretch}}
.copy{{all:unset;cursor:pointer;font-size:13px;font-weight:600;color:var(--sea);border:1px solid var(--rule);border-radius:999px;padding:5px 12px;background:var(--surface)}}
:root[data-theme="dark"] .copy{{color:var(--ink)}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]) .copy{{color:var(--ink)}}}}
.copy.done{{background:var(--ok-soft);color:var(--ok);border-color:transparent}}
.copy:focus-visible,nav.toc a:focus-visible{{outline:3px solid var(--accent);outline-offset:2px}}
.panel{{background:var(--surface);border:1px solid var(--rule);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px}}
.panel p{{margin:0}}
.settings{{display:grid;grid-template-columns:1fr 1fr;gap:8px}}
.settings div{{background:var(--bg);border-radius:10px;padding:8px 10px}}
.settings b{{display:block;font-family:var(--f-display);font-size:22px}}
.grp{{display:flex;flex-direction:column;gap:8px}}
.grp-head{{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:8px}}
.lines{{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}}
.line{{background:var(--surface);border:1px solid var(--rule);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:6px;min-width:0}}
.line-top{{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center}}
code{{font-family:var(--f-mono);font-size:13px;background:var(--sea-soft);border-radius:6px;padding:2px 6px;overflow-wrap:anywhere}}
.who{{font-size:13px;font-weight:600;border-radius:999px;padding:2px 10px;background:var(--bg)}}
.say{{margin:0;font-size:17px;font-weight:500}}
.line .note,.note{{margin:0;font-size:14px;color:var(--muted)}}
.line-btns{{display:flex;gap:6px;flex-wrap:wrap}}
.photo{{background:var(--surface);border:1px solid var(--rule);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px}}
.photo .meta{{display:flex;gap:8px;flex-wrap:wrap}}
.photo .meta span{{font-size:13px;background:var(--bg);border-radius:999px;padding:3px 10px}}
ul.plain{{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px}}
@media (min-width:700px){{.chars{{grid-template-columns:1fr 1fr}}}}
</style>

<header class="top"><div class="in">
  <span class="mono">English on Board · Kit de producción</span>
  <h1>Lesson {N} · {e(L['title'])}</h1>
  <p>Todo lo que hay que generar para la Lesson {N}: las caras de los personajes, sus voces, los {total} audios de los personajes y las 2 fotos. Cada texto tiene su botón para copiarlo.</p>
</div></header>
<nav class="toc" aria-label="Secciones"><div class="in">
  <a href="#caras">1 · Caras</a><a href="#voces">2 · Voces</a><a href="#guion">3 · Audios</a><a href="#fotos">4 · Fotos</a><a href="#enviar">5 · Mandármelos</a>
</div></nav>

<main class="wrap">
<section class="part" id="caras" style="margin-top:24px">
  <span class="num">01</span><h2>Mismas caras en todas las lecciones</h2>
  <p class="sub">La forma más confiable es armar una ficha de cada personaje una sola vez y usarla siempre como imagen de referencia.</p>
  <ol class="steps">
    <li><b>Generá la ficha de cada personaje</b>Con el prompt de "Ficha de cara": la misma persona de frente, de tres cuartos, de perfil y de medio cuerpo. Generá varias y quedate con la que más te guste.</li>
    <li><b>Esa ficha es la cara oficial</b>Guardala como <code>img/characters/clave.jpg</code>. No se vuelve a generar nunca.</li>
    <li><b>En cada escena, pasá la ficha como referencia</b>Usá la función de personaje o referencia de tu herramienta: Nano Banana (Gemini) o Flux Kontext con la imagen adjunta, o en Midjourney la referencia de personaje (omni-reference). En escenas con dos personajes, adjuntá las dos fichas.</li>
    <li><b>Repetí siempre la misma ropa</b>Los prompts de escena repiten la descripción de la ficha. Si la ropa cambia de una foto a otra, se nota más que la cara.</li>
  </ol>
  <p class="note">Si alguna vez la consistencia no alcanza, el paso siguiente es entrenar un modelo propio de cada personaje (un LoRA) con 15–20 imágenes de su ficha. Para empezar no hace falta.</p>
  <div class="chars">{chars_html()}</div>
</section>

<section class="part" id="voces">
  <span class="num">02</span><h2>Voces en ElevenLabs</h2>
  <p class="sub">Para la Lesson {N} necesitás {len(USED - {'model'})}: {', '.join('<b>'+NAMES[v].split()[0]+'</b>' for v in sorted(USED - {'model'}))}. Los textos de "Voz" de cada ficha de arriba sirven para crearlas con Voice Design, o para buscar una parecida en la Voice Library. Las palabras sueltas, los ejemplos y las respuestas modelo no se graban: los dice la voz del celular.</p>
  <div class="panel"><span class="mono">Ajustes de partida (después afinás a oído)</span>
    <div class="settings"><div><span class="mono">Stability</span><b>50</b></div><div><span class="mono">Similarity</span><b>75</b></div><div><span class="mono">Style</span><b>0–10</b></div><div><span class="mono">Speed</span><b>0.95</b></div></div>
    <p class="note">Con stability más baja suena más expresivo pero menos parejo.</p></div>
  <div class="panel"><p><b>Importante:</b> una vez elegida cada voz, anotá su <b>voice ID</b> (o pasámelo) y no la cambies más. Si a mitad del curso cambia la voz de Rolando, se nota.</p>
    <p>Todo se graba <b>limpio</b>, sin efecto de radio: el efecto lo pone la app.</p></div>
</section>

<section class="part" id="guion">
  <span class="num">03</span><h2>Los {total} audios de los personajes</h2>
  <p class="sub">Cada audio es un archivo separado. El nombre de archivo tiene que ser exactamente el que figura (si no, avisame el orden y los renombro yo).</p>
  {script_html()}
</section>

<section class="part" id="fotos">
  <span class="num">04</span><h2>Las 2 fotos de la Lesson {N}</h2>
  <p class="sub">Solo personas y ambiente: planos cerrados, el buque de fondo y nada técnico a la vista (cabos, bitas, planchada). Lo técnico va en las láminas que dibujo yo. Generá primero la escena y usala de referencia para la portada. Fichas a adjuntar: {e(REFS)}.</p>
  <article class="photo"><h3>1 · Escena del diálogo · <code>scene.jpg</code></h3><div class="meta"><span>Horizontal 4:3</span><span>mín. 1440 × 1080</span><span>Referencias: {e(REFS)}</span></div><p class="prompt">{e(scene_p)}</p>{copybtn(scene_p)}</article>
  <article class="photo"><h3>2 · Portada · <code>hero.jpg</code></h3><div class="meta"><span>Vertical 4:5</span><span>mín. 1080 × 1350</span><span>Adjuntá <code>scene.jpg</code> como referencia</span></div><p class="prompt">{e(hero_p)}</p>{copybtn(hero_p)}</article>
</section>

<section class="part" id="enviar">
  <span class="num">05</span><h2>Mandámelos y yo los ubico</h2>
  <div class="panel">
    <p>Sí: adjuntá los audios y las fotos acá en el chat (de a varios o en un .zip) y yo me encargo del resto:</p>
    <ul class="plain">
      <li>Convierto los audios a mp3, nivelo el volumen para que todos suenen igual y recorto los silencios del principio y del final.</li>
      <li>Achico las fotos al tamaño justo para que la app cargue rápido en el celular.</li>
      <li>Los pongo en su carpeta con el nombre correcto y los subo. Cloudflare los publica solo.</li>
    </ul>
    <p><b>Lo único que necesito:</b> que cada audio venga con su nombre de la lista (por ejemplo <code>l01-04.mp3</code>). Las fotos las reconozco yo, pero los audios no los puedo escuchar, así que sin nombre no sé cuál es cuál.</p>
  </div>
</section>
</main>

<script>
document.addEventListener("click", async ev => {{
  const b = ev.target.closest(".copy"); if (!b) return;
  const text = b.dataset.copy, label = b.textContent;
  try {{ await navigator.clipboard.writeText(text); }}
  catch (e) {{
    const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
    try {{ document.execCommand("copy"); }} catch (e2) {{}} t.remove();
  }}
  b.classList.add("done"); b.textContent = "Copiado";
  setTimeout(() => {{ b.classList.remove("done"); b.textContent = label; }}, 1400);
}});
</script>
'''
open(f'{ROOT}/tools/out/kit-l{NN}.html','w').write(page)
md = ["# Personajes · fichas de cara y voces", "",
 "Generá una sola vez la ficha de cada personaje y usala como imagen de referencia en todas las escenas. Guardala en `img/characters/<clave>.jpg` (la app no la usa, es solo para generar).", "",
 "**Ropa:** oficiales con mameluco azul marino, ratings con mameluco naranja.", ""]
for key, name, role, inL1, look, voice in CHARS:
    md += [f"## `{key}` · {name} · {role}", ""] + (["**Ficha de cara**", "", "> " + SHEET.format(d=look), ""] if look else ["Solo voz.", ""]) + ["**Voz (ElevenLabs Voice Design)**", "", "> " + voice, ""]
md += ["## `model` · Voz modelo", "", "No se graba: la dice la voz del celular.", ""]
open(f'{ROOT}/img/characters.md','w').write("\n".join(md))
print("ok", total)
