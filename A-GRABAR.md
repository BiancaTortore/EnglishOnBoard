# Audios para grabar

Lista de las frases que todavía no tienen audio grabado o que hay que volver a grabar.
Claude la va completando con cada corrección y borra cada línea cuando llega el zip con ese audio ya normalizado y publicado.

- **Nueva**: frase que no existía. Grabar audios la graba sola, porque solo graba las que faltan.
- **Regrabar**: el texto cambió. La clave también está en `REDO_LIST` de `tools/model-voice.mjs`.

Hasta que se graban, la app las lee con la voz del celular.

| Lección | Clave | Voz | Texto | Tipo |
|---|---|---|---|---|
| L11 | `w-slackaway` | Brian (modelo) | slack away | Nueva |
| L11 | `x-slackaway` | Brian (modelo) | Slack away the stern line. | Nueva |
| L11 | `w-headline` | Brian (modelo) | head line | Nueva |
| L11 | `x-headline` | Brian (modelo) | The head lines are on the forecastle. | Nueva |
| L10 | `l10-04` | Diego | Thanks. Can I help? I can finish the chipping here, with the hammer. | Regrabar |
| L10 | `x-hammer` | Brian (modelo) | I'm chipping with the hammer. | Regrabar |
| L10 | `m-hammer` | Brian (modelo) | Can you pass me the hammer, please? | Regrabar |
| L10 | `c-show-hammer` | Rolando | Show me the hammer. | Regrabar |
| L13 | `l13-09` | Tanya | We call it the helm. Now the autopilot steers, but we can change to hand steering any time. | Regrabar |
| L13 | `x-autopilot` | Brian (modelo) | The autopilot steers the ship. | Regrabar |
| L13 | `x-helm` | Brian (modelo) | Take the helm. | Regrabar |
| L13 | `c-show-helm` | Tanya | Show me the helm. | Regrabar |
| L13 | `c-steers` | Tanya | The autopilot steers. We watch. | Regrabar |
| L27 | `l27-07` | Pilot | Thank you, Captain. Who is on the helm? | Regrabar |
| L27 | `l27-23` | Pilot | Finished with the helm. Well done, cadet. You'll make a good officer. | Regrabar |
| L27 | `x-helm` | Brian (modelo) | Who is on the helm? | Regrabar |
| L27 | `c-show-helm` | Lars | Where's the helm? | Regrabar |
| L21 | `l21-09` | Tanya | When it's activated, it sends our position by satellite. The SART shows us on other ships' radar. | Regrabar |
| L21 | `x-sart` | Brian (modelo) | The SART shows us on radar. | Regrabar |
| L26 | `l26-10` | Doctor | Good. What are his vital signs? | Regrabar |
| L26 | `l26-12` | Doctor | Thank you. Clean the wound with saline. Close it with steri-strips and put on a pressure bandage. Give him a painkiller, paracetamol, one gram. No work with that hand for five days. Call me again in six hours. | Regrabar |
| L26 | `x-wound` | Brian (modelo) | Clean the wound with saline. | Regrabar |
| L26 | `x-vitals` | Brian (modelo) | What are his vital signs? | Regrabar |
| L26 | `x-painkiller` | Brian (modelo) | Give him a painkiller. | Regrabar |
| L26 | `c-show-wound` | Tanya | Show me the wound. | Regrabar |
| L17 | `l17-10` | Rolando | Good. Now report it to the bridge. Say exactly where it is. | Regrabar |
| L17 | `l17-12` | Tanya | Received, Diego. Well done. Write a near miss report after the watch. Over. | Regrabar |
| L17 | `x-nearmiss` | Brian (modelo) | Write a near miss report. | Regrabar |
| L17 | `x-report` | Brian (modelo) | Report it to the bridge. | Regrabar |
| L20 | `l20-01` | Tanya | The bunker barge is alongside and the hose is connected. Diego, before we start: scuppers? | Regrabar |
| L20 | `x-hose` | Brian (modelo) | The hose is connected. | Regrabar |
| L20 | `c-show-hose` | Chen | Where's the hose? | Regrabar |
| L22 | `l22-01` | Lars | Attention, all crew. This is a drill. Man overboard, starboard side. Man overboard, starboard side. | Regrabar |
| L22 | `l22-02` | Rolando | Man overboard, starboard side! I see it! | Regrabar |
| L22 | `l22-12` | Lars | This is the Captain. Recovery complete. The dummy is on board. The drill is over. | Regrabar |
| L22 | `x-recovery` | Brian (modelo) | Recovery complete. | Regrabar |
| L23 | `l23-05` | Rolando | No, no. Careful! Blue is dry powder. Cream is foam. Use foam for class B fires: oil and fuel. | Regrabar |
| L23 | `l23-06` | Diego | Sorry. Blue, dry powder. Cream, foam. I'll read the label first. | Regrabar |
| L23 | `x-powder` | Brian (modelo) | The blue label is dry powder. | Regrabar |
| L23 | `c-show-powder` | Rolando | Which one is dry powder? | Regrabar |
| L25 | `l25-07` | Diego | Tarifa Traffic, Tarifa Traffic, this is LNG Horizon, LNG Horizon. Received Mayday from Cap Béar. We are six miles from the position. Proceeding to assist. ETA thirty minutes. Over. | Regrabar |
| L25 | `m-call` | Brian (modelo) | Tarifa Traffic, Tarifa Traffic, this is LNG Horizon, LNG Horizon. Over. | Regrabar |
