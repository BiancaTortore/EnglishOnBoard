# English on Board — estado del trabajo

Leer junto con `BIBLE.md` (historia, personajes, temario de las 27 lecciones, reglas de imagen y audio).
Actualizado: 3 nov 2026 (inicio con pestañas, test por módulo, audio sin cortes).

## Qué es
Web app para celular (PWA, funciona sin conexión) de inglés marítimo para oficiales de cubierta hispanohablantes.
JS sin frameworks ni build. Se publica sola en Cloudflare Workers al hacer push a `main`.

## Archivos
- `app.js`: motor (pantallas, audio, radio VHF, reconocimiento de voz, progreso, repaso, ajustes).
- `app.css`: estilos con tokens y modo oscuro.
- `course.json`: módulos y lecciones (`"ready": true` = publicada).
- `lessons/lesson-NN.json`: contenido de cada lección.
- `img/lNN/`: `plate.svg` (lámina técnica dibujada), `hero.jpg`, `scene.jpg`, `prompts.md`.
- `audio/lNN/<id>.mp3`: voces de personajes (ElevenLabs). La voz "model" se graba con ElevenLabs ("Brian") con `tools/model-voice.mjs`. Bianca graba todo lo que falta (modelo y personajes) con doble clic en `tools/Grabar audios.command` (usa `--new --cast`; las voces de cada personaje están en `CAST`).
- `tools/audio-script.mjs N`: guion CSV de audios de personajes de la lección N.
- `tools/kit-build.py N`: kit HTML de producción (fichas de cara, voces, guion, prompts de fotos) → `tools/out/`.
- `sw.js`: subir `VERSION` cada vez que cambian app.js, app.css o index.html.

## Hecho
- Módulo 1 completo (L1–L5), con fotos y audios. Revisión de contenido aplicada (opciones parejas, ejercicio "Read and tap").
- App: bienvenida, resumen de lección y de módulo, repaso de errores, ajustes (velocidad, reinicio de progreso).
- Lesson 6 (Joining the ship) completa (7 nov): JSON, lámina, fotos (`scene.jpg`, `hero.jpg`), 29 audios de personajes y voz modelo. Sigue con candado en la beta (solo se ve en modo vista previa). Diego lo grabó Bianca a mano; Lars, Tanya y James salieron de `Grabar audios.command`.
- Lessons 7, 8 y 9 escritas (19 nov): JSON, láminas, prompts de la escena y kits. Las portadas ya estaban. Audios completos (19 nov): personajes con Eleven v4 (como Bianca en la web), voz modelo Brian. L7 con escena y portada nuevas (mismo camarote). L8 y L9 con escena: **Módulo 2 completo** (19 nov). Siguen con candado en la beta (modo vista previa).
- `tools/model-voice.mjs`: los personajes van con `CHAR_MODEL` = Eleven v4, Stability 0.5, Similarity 0.75 (los ajustes de Bianca en la web; v4 no tiene Speed ni Style). Para regrabar líneas ya publicadas, ponerlas en `REDO_LIST` y vaciarla cuando lleguen.
- La app tiene efecto de altavoz del buque para los anuncios: `"pa": true` en el audio (L9).
- Inicio rediseñado (nov 2026, opción A "aligerada"): foto de la lección actual con un solo botón Continue, carta náutica de la derrota real Houston → Marsella con el barco según el avance (una sola línea: "Module N · X% of the voyage"), franja finita de repaso si hay errores, lista del módulo actual con foto y barra de progreso, y barra de pestañas abajo: Home, Lessons, Practice, Logbook (todas las palabras de las lecciones empezadas, con audio y buscador) y Profile (estadísticas + ajustes).
- Portada por módulo en el inicio: `img/mNN/hero.jpg` (9:16, Diego en la mitad de arriba, abajo cubierta oscura para el texto), declarada como `"hero"` en el módulo de `course.json`. Si un módulo no la tiene, el inicio usa la foto de la lección actual. Hecha: Módulo 1.
- Quick practice (en la pestaña Practice): 8 preguntas al azar de las lecciones empezadas. Test por módulo: 15 preguntas (5 escuchar, 4 vocabulario, 3 lectura, 3 completar), 80 % para aprobar, opcional (no bloquea el módulo siguiente), se habilita al terminar todas las lecciones del módulo. Los errores van al repaso.
- **Certificado: uno solo, al final del curso. Ningún certificado por módulo** (decisión de Bianca).
- Audio de diálogos: se precargan todas las líneas antes de reproducir y la pausa entre líneas es de 0,16 s (cambia el que habla) o 0,06 s (mismo personaje); 0,25 s con radio. Antes cada línea se cargaba recién al terminar la anterior.
- `tools/kit-build.py` lee cada prompt por su encabezado (`## \`scene.jpg\``, `## \`hero.jpg\``) y las referencias de la línea "Referencias:" de `prompts.md`; la escena va primero.

## Beta pública (nov 2026)
- Solo el **Módulo 1** está abierto (`"beta": {"openModules": [1]}` en `course.json`); el resto aparece con candado. **Modo vista previa** para Bianca: en Profile, tocar 5 veces la línea de versión (abre todo lo que está `ready`, por ejemplo la L6). Es un bloqueo de pantalla, no de seguridad.
- Franja "Beta" con la aclaración de que no es un curso aprobado por la OMI ni certifica STCW (bienvenida y Profile).
- Instalar en el celular: tarjeta en bienvenida, Profile y una sola vez al terminar la primera sesión. Android: botón nativo; iPhone: pasos Compartir → Agregar a inicio.
- Opiniones: estrellas + comentario al terminar cada lección, y "Send feedback" en Profile (valoración, comentario, cargo, nombre o mail, permiso para publicar). Salen por `/api/feedback`; sin señal quedan en cola y se mandan solas después.
- Datos anónimos de uso: cada celular manda su avance (sesiones por lección, tests, instalado o no, Android/iPhone) a `/api/progress`, con un id al azar, sin nombres.
- `worker.js`: recibe todo eso, lo guarda en KV (`DATA`) y manda el mail desde english@chartroomlab.com a `FEEDBACK_TO`. Panel en **/admin** (PIN `ADMIN_PIN`): personas, activas, instaladas, embudo por lección, comentarios y CSV. El mismo panel tiene pestañas para BlackLog, CertWatch y Onboarding: esas apps mandan a `POST /api/ping` (con CORS solo para *.chartroomlab.com y *.bianca-tortore.workers.dev) un resumen anónimo por celular (aperturas, instalada y totales: notas / certificados / misiones y quiz), guardado en KV como `u:<app>:<id>`.
- Configuración en Cloudflare (no va en el repo, que es público): secretos `FEEDBACK_TO` y `ADMIN_PIN`, namespace KV `englishonboard-data` conectado como `DATA` en `wrangler.jsonc`, dominio english.chartroomlab.com.

## Portadas de las lecciones 7–27 (4 nov)
- (5 nov) Portadas cargadas de la L6 a la L27: todas las lecciones tienen portada.
- Prompts de `hero.jpg` en `img/l07…l27/prompts.md` (solo la portada; la escena se agrega al escribir cada lección). Cuando llega una portada, la lista la muestra sola junto al "Coming soon" (la miniatura usa `img/lNN/hero.jpg`).

## Sin conexión (6 nov)
- Las voces grabadas (ElevenLabs), las fotos y las láminas viven en una caché aparte (`eob-media-v1`) que **no se borra al publicar versiones nuevas**.
- Al abrir la app con señal, se descargan solas en segundo plano todas las lecciones abiertas: texto, audios e imágenes (Módulo 1 ≈ 5 MB). Profile → "Offline" muestra si ya están guardadas.
- **Peso (7 nov):** audios a 64 kbps mono (para voz no se nota; 7,4 → 5,2 MB). La lista de lecciones usa miniaturas `img/lNN/thumb.jpg` de 260 px: **al agregar o cambiar una portada, correr `python3 tools/make-thumbs.py`**. Los audios nuevos se suben también a 64 kbps.
- **Cuando se reemplazan audios o fotos de una lección, subir `"mediaRev"` en su JSON** (hoy L1–L5 = 3 o 4, L6 = 5). La app compara ese número con el que guardó, borra las copias viejas de esa lección y baja las nuevas al abrirse.
- El celular pide el audio por partes; el service worker las corta del archivo guardado, así suena igual con o sin señal. La voz "model" (palabras, ejemplos y respuestas modelo) se graba con ElevenLabs usando `tools/model-voice.mjs` en la Mac de Bianca; cuando una lección tiene sus grabaciones se marca con `"modelAudio": true` en su JSON y la app las usa (y las descarga para usar sin conexión). Sin esa marca, o si falta un archivo, habla el celular. **Hecho para L1–L6: 175 grabaciones con la voz "Brian" (americano, `--us`), niveladas a −17,5 LUFS como los personajes. Reemplazó a "Alice" el 6 nov.**

## Logo (5 nov)
- Timón blanco con el centro naranja (como la rosa de ChartroomLab con su centro de color), sobre azul `#17506A`. Fuente: `icons/icon.svg`; exportados `icon-192/512.png`, `apple-touch-icon.png`, `favicon-32.png`. En la app el mismo timón (`I.wheel`), blanco con centro naranja. También en la tarjeta de la landing de ChartroomLab.

## Pendiente
1. (hecho) Audio `l01-13` de Rolando subido el 3 nov.
2. Test final del curso + certificado único (al terminar las 27).
3. Probar en iPhone/Safari.
4. **Siguiente:** Módulo 3 completo (20 nov). Módulo 4 (L13–L16) completo el 20 nov (fotos, láminas y audios). Mateo (3/O) existe en la biblia pero todavía no habla en ninguna lección; su voz ya está (ElevenLabs "Alberto Loco"); cuando hable en una foto, necesita su ficha (`PENDING_CHARACTERS` en `tools/photos-build.py`).
- **Fotos:** `python3 tools/photos-build.py` arma una sola página con todas las fotos pendientes del curso (`tools/out/fotos.html`); se publica siempre como el mismo artifact "Fotos pendientes" (https://claude.ai/artifact/ECkDhdAJ96VVo4tnKEjDDY: actualizarlo pasando esa URL). Ya no se publican kits por lección. Módulo 5 (L17–L20) escrito el 20 nov, todo el módulo en el Día 6, fondeados frente a Port Everglades: escenas y audios listos (20 nov) salvo los 12 audios de Chen (L20): voz elegida el 20 nov (Sarah), falta grabarlos con Grabar audios.command. Módulo 6 (L21–L24, Días 7–10, Atlántico) escrito el 20 nov: JSON, láminas y prompts listos; completo el 20 nov (fotos, láminas y audios). En L24 aparecen ABs sin voz propia solo por nombre (Santos, Bautista, Lim). **Siguiente: Módulo 7**, lecciones 25–27 (proponer primero, esperar aprobación; temario e historia en BIBLE.md).
5. (hecho, 4 nov) Tarjeta "APP 04 · English on Board · Public beta" en la landing chartroomlab.com, con captura del inicio; se sube a mano como zip al proyecto de la landing en Cloudflare.
6. Venta: cuentas y pagos (Cloudflare D1 + Stripe, Módulo 1 gratis), landing, chequeo de marca, aclarar que no es un curso aprobado por la OMI ni certifica STCW.

## Cómo trabaja Bianca
- Aprueba cada cambio antes de aplicarlo y quiere opinión antes de modificar el curso.
- Manda fotos y audios como adjuntos (máx. 20 por mensaje). Audios llegan como `<hash>-<id>.mp3`:
  normalizar con ffmpeg (silenceremove al principio y al final + loudnorm I=-17.5 TP=-1.5, mono 44.1k 64k) a `audio/lNN/<id>.mp3`; después subir `mediaRev` y `VERSION` de `sw.js`.
- Antes de subir audios de personajes, medir el tono (F0) de cada archivo para confirmar voz de hombre o de mujer según el personaje.
- Producción de cada lección: `python3 tools/kit-build.py N` (kit, publicar como artifact) y `node tools/audio-script.mjs N`. Bianca graba los audios faltantes con doble clic en `tools/Grabar audios.command` en su Mac (clave en el Llavero) y manda `audios-nuevos.zip`.
- Probar con Playwright a 390×844 en claro y oscuro antes de subir.
