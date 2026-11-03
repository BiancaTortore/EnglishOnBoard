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
- `audio/lNN/<id>.mp3`: voces de personajes (ElevenLabs). La voz "model" la dice el celular, no se graba.
- `tools/audio-script.mjs N`: guion CSV de audios de personajes de la lección N.
- `tools/kit-build.py N`: kit HTML de producción (fichas de cara, voces, guion, prompts de fotos) → `tools/out/`.
- `sw.js`: subir `VERSION` cada vez que cambian app.js, app.css o index.html.

## Hecho
- Módulo 1 completo (L1–L5), con fotos y audios. Revisión de contenido aplicada (opciones parejas, ejercicio "Read and tap").
- App: bienvenida, resumen de lección y de módulo, repaso de errores, ajustes (velocidad, reinicio de progreso).
- Lesson 6 (Joining the ship) publicada: JSON, lámina, prompts y kit. **Faltan sus 2 fotos (`scene.jpg`, `hero.jpg`) y sus 29 audios** (`audio/l06/script.csv`). Mientras tanto la app usa la voz del celular.
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
- `worker.js`: recibe todo eso, lo guarda en KV (`DATA`) y manda el mail desde english@chartroomlab.com a `FEEDBACK_TO`. Panel en **/admin** (PIN `ADMIN_PIN`): personas, activas, instaladas, embudo por lección, comentarios y CSV.
- Configuración en Cloudflare (no va en el repo, que es público): secretos `FEEDBACK_TO` y `ADMIN_PIN`, namespace KV para `DATA` (su id va en `wrangler.jsonc`), dominio english.chartroomlab.com.

## Pendiente
1. (hecho) Audio `l01-13` de Rolando subido el 3 nov.
2. Test final del curso + certificado único (al terminar las 27).
3. Probar en iPhone/Safari.
4. Lecciones 7–27 (temario e historia en BIBLE.md). Por cada lección: JSON, lámina SVG, prompts de fotos, kit, después recibir fotos y audios.
5. Tarjeta "English on Board · Beta" en la landing chartroomlab.com (necesita el código de la landing).
6. Venta: cuentas y pagos (Cloudflare D1 + Stripe, Módulo 1 gratis), landing, chequeo de marca, aclarar que no es un curso aprobado por la OMI ni certifica STCW.

## Cómo trabaja Bianca
- Aprueba cada cambio antes de aplicarlo y quiere opinión antes de modificar el curso.
- Manda fotos y audios como adjuntos (máx. 20 por mensaje). Audios llegan como `<hash>-<id>.mp3`:
  normalizar con ffmpeg (silenceremove + loudnorm I=-16, mono 44.1k 96k) a `audio/lNN/<id>.mp3`.
- Probar con Playwright a 390×844 en claro y oscuro antes de subir.
