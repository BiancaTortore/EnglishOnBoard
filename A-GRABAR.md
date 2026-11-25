# Audios para grabar

Lista de las frases que todavía no tienen audio grabado o que hay que volver a grabar.
Claude la va completando con cada corrección y borra cada línea cuando llega el zip con ese audio ya normalizado y publicado.

- **Nueva**: frase que no existía. Grabar audios la graba sola, porque solo graba las que faltan.
- **Regrabar**: el texto cambió. La clave también está en `REDO_LIST` de `tools/model-voice.mjs`.

Hasta que se graban, la app las lee con la voz del celular.

| Lección | Clave | Voz | Texto | Tipo |
|---|---|---|---|---|
| L25 | `l25-03` | James | Diego, you're with me. Check team one's BA sets and read me the pressure. | Regrabar |
| L25 | `l25-04` | Diego | Yes, Second. I'll check the BA sets. | Regrabar |
| L25 | `l25-07` | James | Team one, Rolando and Santos, BA on. Diego, check them. | Regrabar |
| L25 | `l25-08` | Diego | Bosun, two hundred bar. Santos, one hundred and ninety bar. Masks are good, no leaks. | Regrabar |
| L25 | `l25-09` | James | Bridge, fire party. Team one is entering the galley. Over. | Regrabar (ahora James) |
| L25 | `l25-12` | James | Bridge, fire party. Team one is at the extractor. Small fire. Over. | Regrabar (ahora James) |
| L25 | `l25-18` | Diego | Second, team one has been inside for ten minutes. | Nueva |
| L25 | `l25-17` | James | Good work, Diego. You checked every set, and you watched the time. | Regrabar |
| L25 | `c-take` | James | Diego, you're with me. Check the BA sets. | Regrabar |
| L25 | `c-ask-pressure` | James | Diego, read me the pressure. | Nueva |
| L25 | `c-relay` | Lars | Fire party, bridge. What is team two doing? Over. | Regrabar (ahora Lars) |
| L25 | `c-relay-other` | Diego | Second, the fire door is closed. | Regrabar (ahora Diego) |
| L25 | `p-radio` | Modelo | I'll check the BA sets. | Regrabar |
| L25 | `m-radio` | Modelo | I'll check the BA sets. | Regrabar |
