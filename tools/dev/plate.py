import sys,asyncio,json
from playwright.async_api import async_playwright
css=open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'..','..','app.css')).read()
async def main(svg,out,pins):
  html=f"<html><head><style>{css} body{{margin:0;padding:10px;background:var(--bg)}} .w{{position:relative;width:800px}} .w svg{{width:800px;display:block}} .pin{{position:absolute;width:18px;height:18px;border-radius:50%;background:#E2671C;color:#fff;font:700 11px sans-serif;display:grid;place-items:center;transform:translate(-50%,-50%)}}</style></head><body><div class=w>{open(svg).read()}"
  import re
  vb=[float(x) for x in re.search(r'viewBox="([^"]+)"',open(svg).read()).group(1).split()]
  for i,p in enumerate(pins,1):
    html+=f"<div class=pin style='left:{(p['x']-vb[0])/vb[2]*800}px;top:{(p['y']-vb[1])/vb[3]*(800*vb[3]/vb[2])}px'>{i}</div>"
  html+="</div></body></html>"
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for scheme in ['light','dark']:
      pg=await b.new_page(color_scheme=scheme,viewport={'width':820,'height':500})
      await pg.set_content(html); await pg.screenshot(path=out.replace('.png',f'-{scheme}.png'))
    await b.close()
asyncio.run(main(sys.argv[1],sys.argv[2],json.loads(sys.argv[3]) if len(sys.argv)>3 else []))
