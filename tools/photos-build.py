"""English on Board · one page with every photo still to make, across the whole course.

  python3 tools/photos-build.py   →  tools/out/fotos.html  (publish it as one artifact, always the same one)

A lesson photo is pending when its file is missing, or when its section in img/lNN/prompts.md says
"(rehacer)". New character sheets are listed in PENDING_CHARACTERS (remove a key once the sheet exists).
The look of the page is taken from tools/kit-build.py so both pages match.
"""
import os, re, json, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PENDING_CHARACTERS = []          # character sheets to make, keys from img/characters.md
e = lambda s: html.escape(str(s), quote=True)

kit = open(f"{ROOT}/tools/kit-build.py", encoding="utf-8").read()
STYLE = kit[kit.index("<style>"):kit.index("</style>") + 8].replace("{{", "{").replace("}}", "}")
SCRIPT = kit[kit.index("<script>"):kit.index("</script>") + 9].replace("{{", "{").replace("}}", "}")
copybtn = lambda t: f'<button class="copy" data-copy="{e(t)}">Copiar</button>'

course = json.load(open(f"{ROOT}/course.json", encoding="utf-8"))
lessons = [l for m in course["modules"] for l in m["lessons"] if l.get("ready")]

def sections(md):
    """{'scene.jpg': (heading, prompt), 'hero.jpg': (...)} from a prompts.md"""
    out = {}
    for m in re.finditer(r"^## `([\w.]+)`([^\n]*)\n(.*?)(?=^## |\Z)", md, re.M | re.S):
        p = re.search(r"^> ([^\n]+)$", m.group(3), re.M)
        if p: out[m.group(1)] = (m.group(2), p.group(1))
    return out

cards = []
for l in lessons:
    nn = f"{l['n']:02d}"; d = f"{ROOT}/img/l{nn}"
    if not os.path.exists(f"{d}/prompts.md"): continue
    md = open(f"{d}/prompts.md", encoding="utf-8").read()
    sec = sections(md)
    refs = re.search(r"^Referencias:\s*(.+)$", md, re.M)
    refs = re.sub(r"[*]", "", refs.group(1)).strip() if refs else ""
    todo = []
    for f in ("hero.jpg", "scene.jpg"):
        if f not in sec: continue
        redo = "rehacer" in sec[f][0]
        if redo or not os.path.exists(f"{d}/{f}"): todo.append((f, sec[f][1], redo))
    if not todo: continue
    # the order of the sections in prompts.md is the order to make them (the second one uses the first as reference)
    todo.sort(key=lambda t: md.index(f"## `{t[0]}`"))
    hero_first = todo[0][0] == "hero.jpg"
    items = []
    for i, (f, prompt, redo) in enumerate(todo, 1):
        fmt = "Vertical 4:5 · mín. 1080 × 1350" if f == "hero.jpg" else "Horizontal 4:3 · mín. 1440 × 1080"
        what = "Portada" if f == "hero.jpg" else "Escena del diálogo"
        attach = (("Adjuntá la portada nueva" if hero_first else "Adjuntá la portada actual") if f == "scene.jpg"
                  else ("Adjuntá la escena nueva" if not hero_first and len(todo) > 1 else ""))
        items.append(f'''<article class="photo"><h3>{len(todo) > 1 and f"{i} · " or ""}{what} · <code>{f}</code>{" · rehacer" if redo else ""}</h3>
          <div class="meta"><span>{fmt}</span>{f"<span>{attach}</span>" if attach else ""}</div>
          <p class="prompt">{e(prompt)}</p>{copybtn(prompt)}</article>''')
    cards.append(f'''<section class="lesson" id="l{nn}"><h2>Lesson {l["n"]} · {e(l["title"])}</h2>
      <p class="sub">Referencias: {e(refs)}</p>{"".join(items)}</section>''')

chars_md = open(f"{ROOT}/img/characters.md", encoding="utf-8").read()
char_cards = []
for key in PENDING_CHARACTERS:
    m = re.search(r"^## `" + key + r"` · ([^\n]+)\n(.*?)(?=^## |\Z)", chars_md, re.M | re.S)
    if not m: continue
    p = re.search(r"\*\*Ficha de cara\*\*\s*\n\s*> ([^\n]+)", m.group(2))
    if not p: continue
    char_cards.append(f'''<article class="photo"><h3>Ficha · {e(m.group(1))}</h3>
      <div class="meta"><span>Cuadrada o 3:2</span><span>Guardala como <code>img/characters/{key}.jpg</code></span></div>
      <p class="prompt">{e(p.group(1))}</p>{copybtn(p.group(1))}</article>''')

count = sum(c.count('class="photo"') for c in cards) + len(char_cards)
page = f'''<title>Fotos pendientes</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
{STYLE}
<style>.lesson{{margin:28px 0}} .lesson h2{{margin-bottom:4px}}</style>
<main class="wrap">
  <header><p class="mono">English on Board · todo el curso</p><h1>Fotos pendientes</h1>
  <p class="sub">{count} fotos por hacer. Copiá cada prompt y adjuntá las fichas de los personajes que nombra. Cuando una lección tiene portada y escena, hacelas en el orden de la lista. Esta página se actualiza a medida que llegan las fotos.</p></header>
  {f'<section class="lesson"><h2>Personajes nuevos</h2><p class="sub">Primero estas fichas: las fotos que siguen las usan como referencia.</p>{"".join(char_cards)}</section>' if char_cards else ""}
  {"".join(cards) or '<p class="note">No hay fotos pendientes.</p>'}
</main>
{SCRIPT}
'''
os.makedirs(f"{ROOT}/tools/out", exist_ok=True)
open(f"{ROOT}/tools/out/fotos.html", "w", encoding="utf-8").write(page)
print("fotos pendientes:", count)
