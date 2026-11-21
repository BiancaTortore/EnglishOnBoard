# Herramientas de desarrollo (para Claude)

Se corren desde la raíz del repo.

- **Las lecciones se corrigen directamente en `lessons/lesson-NN.json`** (es la única fuente; los generadores con que se escribieron no se usan más). Editar con cambios puntuales de texto, sin reescribir el archivo entero con `json.dump`, para no tocar el formato ni lo que no se quiere cambiar.
- `walk.py N light|dark` — recorre con Playwright todas las sesiones de la lección N y avisa errores de JS. Necesita `python3 -m http.server 8774` corriendo en la raíz.
- `plate.py lámina.svg salida.png '<pins json>'` — dibuja una lámina con sus números en claro y oscuro.
- `norm2.sh archivo.mp3` — normaliza un audio nuevo (recorta silencios, loudnorm −17,5 LUFS, mono 64k) y lo deja en `audio/lNN/`. Si ffmpeg se cuelga, hacerlo en pasos (wav → silencios → loudnorm).
- `vc.py N [N…]` — tono (F0) y velocidad por personaje, para comparar voces entre lecciones.

Después de cambiar texto que tiene audio, el audio queda viejo: agregar la clave a `REDO_LIST` en `tools/model-voice.mjs` para que Bianca lo regrabe con *Grabar audios.command*, y subir `mediaRev` de la lección.
