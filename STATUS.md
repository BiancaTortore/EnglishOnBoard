# English on Board — estado del trabajo

Leer junto con `BIBLE.md` (historia, personajes, temario de las 27 lecciones, reglas de imagen y audio).
Actualizado: 31 oct 2026.

## Qué es
Web app para celular (PWA, funciona sin conexión) de inglés marítimo para oficiales de cubierta hispanohablantes.
JS sin frameworks ni build. Se publica sola en Cloudflare Workers al hacer push a `main`.

## Archivos
- `app.js`: motor (pantallas, audio, radio VHF, reconocimiento de voz, progreso, repaso, ajustes).
- `app.css`: estilos con tokens y modo oscuro.
- `course.json`: módulos y lecciones (`"ready": true` = publicada).
- `lessons/lesson-NN.json`: contenido de cada lección.
- `img/lNN/`: `plate.svg` (lámina técnica dibujada), `hero.jpg`, `scene.jpg`, `prompts.md`.
- `audio/lNN/<id>.mp3`: voces de personajes (ElevenLabs). La voz "model" la dice el celular, no se graba.
- `tools/audio-script.mjs N`: guion CSV de audios de personajes de la lección N.
- `tools/kit-build.py N`: kit HTML de producción (fichas de cara, voces, guion, prompts de fotos) → `tools/out/`.
- `sw.js`: subir `VERSION` cada vez que cambian app.js, app.css o index.html.

## Hecho
- Módulo 1 completo (L1–L5), con fotos y audios. Revisión de contenido aplicada (opciones parejas, ejercicio "Read and tap").
- App: bienvenida, resumen de lección y de módulo, repaso de errores, ajustes (velocidad, reinicio de progreso).

## Pendiente
1. Audio `l01-13` (Rolando: "The Captain is busy with the terminal this morning. You sign on with him this afternoon.").
2. Test y certificado al cerrar cada módulo.
3. Probar en iPhone/Safari.
4. Lecciones 6–27 (temario e historia en BIBLE.md). Por cada lección: JSON, lámina SVG, prompts de fotos, kit, después recibir fotos y audios.
5. Venta: cuentas y pagos (Cloudflare D1 + Stripe, Módulo 1 gratis), landing, chequeo de marca, aclarar que no es un curso aprobado por la OMI ni certifica STCW.

## Cómo trabaja Bianca
- Aprueba cada cambio antes de aplicarlo y quiere opinión antes de modificar el curso.
- Manda fotos y audios como adjuntos (máx. 20 por mensaje). Audios llegan como `<hash>-<id>.mp3`:
  normalizar con ffmpeg (silenceremove + loudnorm I=-16, mono 44.1k 96k) a `audio/lNN/<id>.mp3`.
- Probar con Playwright a 390×844 en claro y oscuro antes de subir.
