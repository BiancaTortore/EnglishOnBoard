"""Small list thumbnails (img/lNN/thumb.jpg, 260 px wide) from each lesson's hero.jpg.
Run after adding or replacing a cover:  python3 tools/make-thumbs.py"""
import glob, os
from PIL import Image
for hero in sorted(glob.glob("img/l*/hero.jpg")):
    out = os.path.join(os.path.dirname(hero), "thumb.jpg")
    if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(hero):
        continue
    im = Image.open(hero).convert("RGB")
    im.thumbnail((260, 400), Image.LANCZOS)
    im.save(out, quality=80, optimize=True, progressive=True)
    print(out, im.size, os.path.getsize(out) // 1024, "KB")
