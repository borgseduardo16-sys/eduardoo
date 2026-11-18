# converte uma pasta de frames (lista.txt) em clip VP9 30fps 1080x1920 (o Chromium daqui não toca H.264)
d=$1
ffmpeg -loglevel error -y -f concat -safe 0 -i $d/lista.txt -vf "scale=1080:1920:flags=lanczos,fps=30,format=yuv420p" -c:v libvpx-vp9 -crf 18 -b:v 0 -row-mt 1 -deadline good -cpu-used 4 $d.webm && rm -rf $d && echo "$d.webm $(ffprobe -v error -show_entries format=duration -of csv=p=0 $d.webm)"
