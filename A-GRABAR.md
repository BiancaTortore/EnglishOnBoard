# Audios para grabar

Lista de las frases que todavía no tienen audio grabado o que hay que volver a grabar.
Claude la va completando con cada corrección y borra cada línea cuando llega el zip con ese audio ya normalizado y publicado.

- **Nueva**: frase que no existía. Grabar audios la graba sola, porque solo graba las que faltan.
- **Regrabar**: el texto cambió. La clave también está en `REDO_LIST` de `tools/model-voice.mjs`.

Hasta que se graban, la app las lee con la voz del celular.

| Lección | Clave | Voz | Texto | Tipo |
|---|---|---|---|---|
| L12 | `w-slackaway` | Brian (modelo) | slack away | Nueva |
| L12 | `x-slackaway` | Brian (modelo) | Slack away the stern line. | Nueva |
| L12 | `w-headline` | Brian (modelo) | head line | Nueva |
| L12 | `x-headline` | Brian (modelo) | The head lines are on the forecastle. | Nueva |
| L3 | `w-smoking` | Brian (modelo) | smoking room | Nueva |
| L3 | `x-smoking` | Brian (modelo) | The smoking room is on B-deck. | Nueva |
| L3 | `w-recreation` | Brian (modelo) | recreation room | Nueva |
| L3 | `x-recreation` | Brian (modelo) | We watch films in the recreation room. | Nueva |
| L4 | `w-ab` | Brian (modelo) | AB | Nueva |
| L4 | `x-ab` | Brian (modelo) | The AB is on watch with the Second Officer. | Nueva |
| L4 | `w-pumpman` | Brian (modelo) | pumpman | Nueva |
| L4 | `x-pumpman` | Brian (modelo) | The pumpman works with the cargo pumps. | Nueva |
| L4 | `w-messman` | Brian (modelo) | messman | Nueva |
| L4 | `x-messman` | Brian (modelo) | The messman cleans the mess room. | Nueva |
| L14 | `w-gps` | Brian (modelo) | GPS | Nueva |
| L14 | `x-gps` | Brian (modelo) | The GPS gives our position. | Nueva |
| L14 | `w-log` | Brian (modelo) | speed log | Nueva |
| L14 | `x-log` | Brian (modelo) | The speed log shows twelve knots. | Nueva |
| L14 | `w-anemometer` | Brian (modelo) | anemometer | Nueva |
| L14 | `x-anemometer` | Brian (modelo) | The anemometer shows the wind direction and speed. | Nueva |
| L15 | `w-range` | Brian (modelo) | range | Nueva |
| L15 | `x-range` | Brian (modelo) | Change the range to six miles. | Nueva |
| L15 | `w-brill` | Brian (modelo) | brilliance | Nueva |
| L15 | `x-brill` | Brian (modelo) | Turn down the brilliance at night. | Nueva |
| L20 | `w-flow` | Brian (modelo) | flow | Nueva |
| L20 | `x-flow` | Brian (modelo) | The gas flow to the engines is steady. | Nueva |
| L25 | `w-firedoor` | Brian (modelo) | fire door | Nueva |
| L25 | `x-firedoor` | Brian (modelo) | Keep the fire door closed. | Nueva |
| L25 | `w-mask` | Brian (modelo) | face mask | Nueva |
| L25 | `x-mask` | Brian (modelo) | Check the face mask before you enter. | Nueva |
| L25 | `w-radio` | Brian (modelo) | portable radio | Nueva |
| L25 | `x-radio` | Brian (modelo) | Take the red radio for the fire party. | Nueva |
| L25 | `w-torch` | Brian (modelo) | torch | Nueva |
| L25 | `x-torch` | Brian (modelo) | Take a torch. There is a lot of smoke. | Nueva |
| L25 | `c-show-firedoor` | James | Show me the fire door. | Nueva |
| L27 | `w-kit` | Brian (modelo) | first-aid kit | Nueva |
| L27 | `x-kit` | Brian (modelo) | Bring the first-aid kit to the galley. | Nueva |
| L29 | `w-pilotboat` | Brian (modelo) | pilot boat | Nueva |
| L29 | `x-pilotboat` | Brian (modelo) | The pilot boat is alongside. | Nueva |
| L29 | `w-station` | Brian (modelo) | pilot station | Nueva |
| L29 | `x-station` | Brian (modelo) | Call the pilot station on channel twelve. | Nueva |
| L13 | `w-stopper` | Brian (modelo) | chain stopper | Nueva |
| L13 | `x-stopper` | Brian (modelo) | Put the chain stopper on. | Nueva |
| L13 | `w-hawse` | Brian (modelo) | hawse pipe | Nueva |
| L13 | `x-hawse` | Brian (modelo) | The chain runs through the hawse pipe. | Nueva |
| L13 | `w-locker` | Brian (modelo) | chain locker | Nueva |
| L13 | `x-locker` | Brian (modelo) | The chain is stowed in the chain locker. | Nueva |
| L12 | `w-winch` | Brian (modelo) | winch | Nueva |
| L12 | `x-winch` | Brian (modelo) | Start the winch. | Nueva |
| L12 | `w-drum` | Brian (modelo) | drum | Nueva |
| L12 | `x-drum` | Brian (modelo) | Keep three turns on the drum. | Nueva |
| L11 | todas (58) | Personajes y Brian | Lección nueva *Lifting gear*: todo lo de `audio/l11/script.csv` (25 de personajes) más las 33 de la voz modelo | Nueva |
| L28 | todas (61) | Personajes y Brian | Lección nueva *Engine orders*: todo lo de `audio/l28/script.csv` (32 de personajes) más las 29 de la voz modelo | Nueva |
| L25 | `l25-03` | James | Diego, you're with me. Take a radio. You're my messenger to the bridge. | Regrabar |
| L25 | `l25-04` | Diego | Yes, Second. I'll take the radio. | Regrabar |
| L25 | `l25-08` | Rolando | Team one ready. BA on, pressure two hundred bar. | Regrabar |
| L25 | `l25-09` | Diego | Bridge, fire party. Team one is entering the galley. Over. | Regrabar |
| L25 | `l25-12` | Diego | Bridge, fire party. Team one is at the extractor. Small fire. Over. | Regrabar |
| L25 | `l25-17` | James | Good work, Diego. The bridge knew everything, all the time. | Regrabar |
| L25 | `c-take` | James | Diego, you're with me. Take a radio. | Regrabar |
| L25 | `p-radio` | Brian (modelo) | I'll take the radio. | Nueva |
| L25 | `p-relay` | Brian (modelo) | Bridge, fire party. Team one is entering the galley. Over. | Nueva |
| L25 | `m-radio` | Brian (modelo) | I'll take the radio. | Nueva |
| L25 | `m-relay` | Brian (modelo) | Bridge, fire party. Team two is starting boundary cooling. Over. | Nueva |
| L25 | `m-noinj` | Brian (modelo) | Bridge, fire party. No injuries. Over. | Nueva |
| L25 | `c-relay` | James | Diego, tell the bridge: team two is starting boundary cooling. | Nueva |
| L25 | `c-bridge-q` | Lars | Fire party, bridge. Is anybody injured? Over. | Nueva |
| L25 | `c-relay-other` | James | Diego, tell the bridge the fire door is closed. | Nueva |
| L4 | `l04-07` | Marek | Hello. If something breaks, you call me. | Regrabar (voz nueva) |
| L4 | `c-show-2o` | Marek | Show me the Second Officer. | Regrabar (voz nueva) |
| L4 | `c-who-bosun` | Marek | Who's the bosun on this ship? | Regrabar (voz nueva) |
| L4 | `c-deck-who` | Marek | Who's in charge of the deck department? | Regrabar (voz nueva) |
| L19 | `l19-06` | Marek | Radar one. OK. I'm coming. | Regrabar (voz nueva) |
| L19 | `l19-07` | Marek | So. What happened? | Regrabar (voz nueva) |
| L19 | `l19-09` | Marek | Hmm. Has anybody touched it? | Regrabar (voz nueva) |
| L19 | `l19-11` | Marek | A fuse has blown. I have a spare. | Regrabar (voz nueva) |
| L19 | `l19-12` | Marek | OK. I've changed the fuse. Now reset it, cadet. | Regrabar (voz nueva) |
| L19 | `l19-14` | Marek | Good. Write it in the defect list. Fault, cause, repair. Short. | Regrabar (voz nueva) |
| L19 | `c-show-frozen` | Marek | Which screen has frozen? | Regrabar (voz nueva) |
| L19 | `c-show-reset` | Marek | Where's the reset button? | Regrabar (voz nueva) |
| L19 | `c-show-fuse` | Marek | Show me the fuse. | Regrabar (voz nueva) |
| L19 | `c-show-spare` | Marek | Where's the spare? | Regrabar (voz nueva) |
| L19 | `c-happened` | Marek | So, cadet. What happened? When? | Regrabar (voz nueva) |
| L19 | `c-touched` | Marek | Has anybody touched it? | Regrabar (voz nueva) |
| L19 | `c-time-other` | Marek | The fuse blew at zero six fifty. | Regrabar (voz nueva) |
