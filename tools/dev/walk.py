import asyncio,sys
from playwright.async_api import async_playwright
import os, tempfile
OUT=os.path.join(tempfile.gettempdir(),"eob-walk/"); os.makedirs(OUT, exist_ok=True)
async def m(n,scheme):
  async with async_playwright() as p:
    b=await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    pg=await b.new_page(viewport={"width":390,"height":844},color_scheme=scheme)
    errs=[]; pg.on("pageerror",lambda e: errs.append(str(e))); pg.on("console",lambda m: m.type=="error" and errs.append(m.text))
    await pg.goto("http://localhost:8774/"); await pg.evaluate("localStorage.setItem('eob-welcome-v1','1');localStorage.setItem('eob-preview','1')")
    await pg.reload(); await pg.wait_for_timeout(800)
    await pg.evaluate(f"openLesson({n})"); await pg.wait_for_timeout(1200)
    await pg.screenshot(path=OUT+f"l{n}-{scheme}-00.png")
    nsess=await pg.evaluate("L.sessions.length"); k=0
    for i in range(nsess):
      await pg.evaluate(f"startSession({i})"); await pg.wait_for_timeout(600)
      last=None; same=0
      for step in range(120):
        if await pg.evaluate("!S || !document.querySelector('.player')"): break
        pos=await pg.evaluate("S.pos"); same = same+1 if pos==last else 0; last=pos
        if same>5: await pg.evaluate("next()"); same=0; continue
        if same==0: k+=1; await pg.screenshot(path=OUT+f"l{n}-{scheme}-{k:03d}.png")
        go=pg.locator("#go")
        if await go.count() and await go.is_enabled():
          await go.click(); await pg.wait_for_timeout(250); continue
        acted=False
        for sel in [".opt:not([disabled])",".bank .tok:not(.used)",".pin",".mt:not([disabled])","[data-t]"]:
          if await pg.locator(sel).count():
            await pg.locator(sel).first.click(force=True,timeout=2000); acted=True; break
        if await pg.locator("#tf").count(): await pg.fill("#tf","x"); acted=True
        if not acted:
          # skip button for speaking etc
          for sel in ["#skip","button:has-text('Skip')","button:has-text('Continue')","button:has-text('Next')"]:
            if await pg.locator(sel).count(): await pg.locator(sel).first.click(timeout=2000); acted=True; break
        if not acted: await pg.evaluate("next()")
        await pg.wait_for_timeout(250)
      await pg.evaluate("stopAll()")
    print(n,scheme,"screens",k,"errors",errs[:5])
    await b.close()
asyncio.run(m(int(sys.argv[1]),sys.argv[2]))
