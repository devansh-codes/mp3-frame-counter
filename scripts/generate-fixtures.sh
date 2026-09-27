#!/usr/bin/env bash
# Regenerates the encoder-produced MP3 fixtures in test/fixtures/.
#
# Requires: ffmpeg, lame. The resulting counts are listed in test/fixtures/README.md and were checked
# against mediainfo and ffprobe. Edge cases (junk, trailing tags, truncation, large ID3 tags, non-MP3
# input) are built inside the tests from these files, so they don't need to be stored as binaries.
set -euo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/test/fixtures"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 10 s of tone + pink noise (fixed seed, so it's reproducible). The noise makes VBR frame sizes vary.
# 10 s gives 384 frames at 44.1 kHz, which is above the ~256-frame point where mediainfo's CBR
# estimate starts counting the Info frame.
ffmpeg -v error -y -f lavfi -i "sine=frequency=440:duration=10" \
  -f lavfi -i "anoisesrc=d=10:c=pink:a=0.3:seed=42" \
  -filter_complex "[0][1]amix=inputs=2,aformat=channel_layouts=stereo" -ar 44100 "$TMP/st44.wav"
ffmpeg -v error -y -i "$TMP/st44.wav" -ar 48000 "$TMP/st48.wav"
ffmpeg -v error -y -i "$TMP/st44.wav" -ar 32000 "$TMP/st32.wav"
ffmpeg -v error -y -i "$TMP/st44.wav" -ar 22050 "$TMP/st22.wav"
ffmpeg -v error -y -i "$TMP/st44.wav" -ac 1 "$TMP/mono44.wav"

lame() { command lame --quiet "$@"; }

lame -b 128 "$TMP/st44.wav" "$OUT/cbr128-info.mp3"            # CBR + LAME "Info" frame
lame -b 128 -t "$TMP/st44.wav" "$OUT/cbr128-no-info.mp3"      # CBR, no Info frame
lame -b 128 -p "$TMP/st44.wav" "$OUT/cbr128-crc.mp3"          # CRC-protected frames
lame -V 2 "$TMP/st44.wav" "$OUT/vbr-xing.mp3"                 # VBR + "Xing" frame
lame -V 2 -t "$TMP/st44.wav" "$OUT/vbr-no-xing.mp3"           # VBR, no Xing frame
lame -b 128 "$TMP/mono44.wav" "$OUT/mono-cbr.mp3"             # mono: 17-byte side info
lame -V 4 "$TMP/mono44.wav" "$OUT/mono-vbr.mp3"
lame -b 320 "$TMP/st48.wav" "$OUT/cbr320-48khz.mp3"           # 48 kHz, largest bitrate
lame -b 32 --resample 32 "$TMP/st32.wav" "$OUT/cbr32-32khz.mp3" # 32 kHz; frame too small for an Info tag
lame -b 128 --add-id3v2 --tt "Title" --ta "Artist" "$TMP/st44.wav" "$OUT/id3v2.mp3"
lame -b 128 --id3v1-only --tt "Title" "$TMP/st44.wav" "$OUT/id3v1.mp3"
lame -b 64 "$TMP/st22.wav" "$OUT/mpeg2-layer3.mp3"            # MPEG-2: out of scope

# A second encoder: FFmpeg writes its own Xing/Info frame (stereo mode, unlike its joint-stereo audio).
ffmpeg -v error -y -i "$TMP/st44.wav" -c:a libmp3lame -b:a 192k "$OUT/ffmpeg-cbr.mp3"
ffmpeg -v error -y -i "$TMP/st44.wav" -c:a libmp3lame -q:a 0 "$OUT/ffmpeg-vbr.mp3"
ffmpeg -v error -y -i "$TMP/st44.wav" -c:a libmp3lame -b:a 128k -write_xing 0 -id3v2_version 0 \
  "$OUT/ffmpeg-bare.mp3"

echo "Fixtures written to $OUT"
