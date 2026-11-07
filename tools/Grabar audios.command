#!/bin/zsh
# English on Board · record every audio the course is missing: model voice (Brian) and the characters' voices.
# Double-click this file. The first time it asks for your ElevenLabs key and keeps it in the Keychain.
cd "$HOME/Downloads" || exit 1
clear
echo "English on Board · grabar los audios que faltan"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node. Instalalo desde https://nodejs.org (versión LTS) y volvé a abrir este archivo."
  read -k 1 "?Apretá una tecla para cerrar."; exit 1
fi

# always the latest version of the recorder
curl -fsSL -o model-voice.mjs "https://raw.githubusercontent.com/BiancaTortore/EnglishOnBoard/main/tools/model-voice.mjs" || {
  echo "No hay conexión a internet. Probá de nuevo con Wi-Fi."; read -k 1 "?Apretá una tecla para cerrar."; exit 1; }

KEY=$(security find-generic-password -s "eob-elevenlabs" -w 2>/dev/null)
if [[ -z "$KEY" ]]; then
  echo "La primera vez hace falta tu clave de ElevenLabs (empieza con sk_)."
  echo "Pegala y apretá Enter (no se ve mientras la pegás):"
  read -s KEY; echo
  if [[ "$KEY" != sk_* ]]; then echo "Eso no parece una clave de ElevenLabs."; read -k 1 "?Apretá una tecla para cerrar."; exit 1; fi
  security add-generic-password -U -s "eob-elevenlabs" -a "$USER" -w "$KEY"
  echo "Clave guardada en el Llavero."
  echo
fi

OUT="$HOME/Desktop/audios-nuevos"
rm -rf "$OUT"
ELEVENLABS_API_KEY="$KEY" node model-voice.mjs --new --cast --us --voice "Brian" --out "$OUT"
STATUS=$?
# the saved key was rejected: forget it so the next run asks for the new one
[[ $STATUS -eq 3 ]] && security delete-generic-password -s "eob-elevenlabs" >/dev/null 2>&1

if [[ $STATUS -eq 0 ]]; then
  COUNT=$(find "$OUT" -name "*.mp3" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$COUNT" -gt 0 ]]; then
    ZIP="$HOME/Desktop/audios-nuevos.zip"
    rm -f "$ZIP"
    (cd "$HOME/Desktop" && zip -qr "audios-nuevos.zip" "audios-nuevos")
    echo
    echo "Listo: $COUNT audios nuevos en audios-nuevos.zip, en el Escritorio. Mandáselo a Claude."
    open -R "$ZIP"
  else
    echo
    echo "No falta nada: el curso ya tiene todas las grabaciones."
    rm -rf "$OUT"
  fi
fi
echo
read -k 1 "?Apretá una tecla para cerrar."
