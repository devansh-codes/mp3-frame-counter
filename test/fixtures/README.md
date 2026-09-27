# Test fixtures

`sample.mp3` is the sample file provided with the assessment. Everything else is regenerated with
[`scripts/generate-fixtures.sh`](../../scripts/generate-fixtures.sh) (needs `lame` and `ffmpeg`).

Expected counts were checked with **mediainfo 26.05** (`mediainfo --Full` → "Frame count") and
**ffprobe** (`-count_packets`). Both tools agree on every file:

| File | Frames | Metadata frame | What it covers |
|---|---|---|---|
| `sample.mp3` | **6089** | Xing (FFmpeg) | the provided sample: VBR, 44-byte ID3v2.4 tag |
| `cbr128-info.mp3` | 384 | Info | LAME CBR 128 kbps, 44.1 kHz |
| `cbr128-no-info.mp3` | 384 | – | CBR without a metadata frame |
| `cbr128-crc.mp3` | 384 | Info | CRC-protected frames (the Info tag is still at offset 36) |
| `vbr-xing.mp3` | 384 | Xing | LAME VBR (frame sizes vary) |
| `vbr-no-xing.mp3` | 384 | – | VBR without a metadata frame |
| `mono-cbr.mp3` | 384 | Info | mono: 17-byte side info, so the tag is at offset 21 |
| `mono-vbr.mp3` | 384 | Xing | mono VBR |
| `cbr320-48khz.mp3` | 418 | Info | 48 kHz, 320 kbps |
| `cbr32-32khz.mp3` | 279 | – | 32 kHz, 32 kbps (144-byte frames are too small for an Info tag) |
| `ffmpeg-cbr.mp3` | 384 | Info | FFmpeg-written metadata frame + ID3v2 |
| `ffmpeg-vbr.mp3` | 384 | Xing | FFmpeg VBR |
| `ffmpeg-bare.mp3` | 384 | – | no tags, no metadata frame |
| `id3v2.mp3` | 384 | Info | ID3v2 tag at the start |
| `id3v1.mp3` | 384 | Info | ID3v1 tag at the end |
| `mpeg2-layer3.mp3` | – | – | MPEG-2 Layer III: must be rejected as unsupported |

Each file has one more frame with a valid sync header than the count shown when it has a metadata
frame. That frame holds encoder metadata, not audio, so it isn't counted (see
`governance-check/03-domain-logic/`).

**Oracle caveat:** `mediainfo --ParseSpeed=1` reports +1 for CBR files with an Info frame, and so does
the default mode for CBR files of about 256 frames or fewer. The fixtures are 10 s long (384 frames),
so the default `mediainfo --Full` output is reliable for them.
