f="$1"; d=$(basename $(dirname "$f")); n=$(basename "$f"); mkdir -p /tmp/eob-wav; w=/tmp/eob-wav/$d-$n.wav
mkdir -p $(dirname $w)
timeout 20 ffmpeg -nostdin -loglevel error -y -i "$f" -ac 1 -ar 44100 "$w" && timeout 20 ffmpeg -nostdin -loglevel error -y -i "$w" -af "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,loudnorm=I=-17.5:TP=-1.5:LRA=11" -ac 1 -ar 44100 -b:a 64k "audio/$d/$n" || echo "FAIL $d/$n"
