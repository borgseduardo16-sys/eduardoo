#!/usr/bin/env bash
# Render completo: 2 processos em paralelo (metades do vídeo) e depois o ffmpeg junta com a narração.
set -euo pipefail
cd "$(dirname "$0")"
AUDIO="${1:?caminho do mp3 da narração}"
FPS=30
DUR=$(node -e "console.log(require('./roteiro.json').duracao)")
MEIO=$(node -e "console.log(($DUR/2).toFixed(3))")
rm -rf quadros && mkdir -p quadros
node gravar.mjs quadros $FPS 0 "$MEIO" > log-a.txt 2>&1 &
node gravar.mjs quadros $FPS "$MEIO" "$DUR" > log-b.txt 2>&1 &
wait
ffmpeg -hide_banner -loglevel error -y -framerate $FPS -i quadros/%05d.png -i "$AUDIO" \
  -af "apad" -t "$DUR" -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 192k -movflags +faststart coluna-em-movimento-9x16.mp4
echo "OK $(ls -la coluna-em-movimento-9x16.mp4)"
