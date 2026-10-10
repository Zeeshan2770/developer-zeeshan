#!/usr/bin/env bash
# Turns a screen recording into a small website clip (silent MP4, max 1280px wide, 24 fps, first 12 seconds).
# Usage: tools/make-clip.sh my-recording.mp4        -> my-recording-clip.mp4
# Needs ffmpeg (https://ffmpeg.org/download.html).
set -euo pipefail
in="${1:?Usage: make-clip.sh recording.mp4 [seconds]}"
secs="${2:-12}"
out="${in%.*}-clip.mp4"
ffmpeg -y -i "$in" -t "$secs" -an \
  -vf "scale='min(1280,iw)':-2,fps=24" \
  -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -movflags +faststart "$out"
ls -lh "$out"
echo "Done. Upload $out in Admin -> Media (aim for 1-4 MB; if it is bigger, lower the seconds or raise -crf to 30-32)."
