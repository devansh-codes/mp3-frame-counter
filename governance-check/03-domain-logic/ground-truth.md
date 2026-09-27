# Ground Truth: Reference Frame Counts

The expected frame count for every test fixture. These values were established with independent
reference tools before any parser code was written, so the tests have a fixed target.

## Tools and versions

| Tool | Version | Command | Meaning |
|---|---|---|---|
| mediainfo | 26.05 | `mediainfo --Full f.mp3` → "Frame count" (or `--Inform="Audio;%FrameCount%"`) | What a reviewer following the brief's tip will see |
| mediainfo (full parse) | 26.05 | `mediainfo --ParseSpeed=1 --Inform="Audio;%FrameCount%" f.mp3` | Forces a full scan instead of a header-based estimate |
| ffprobe | Homebrew ffmpeg | `ffprobe -v error -select_streams a:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 f.mp3` | Audio packets the demuxer actually emits |
| Xing field | — | frames field of the Xing/Info tag, when present | The encoder's own count |

## Key finding: the Xing/Info frame is not counted

LAME and FFmpeg write a **metadata frame** first (tagged `Xing` for VBR, `Info` for CBR). It has a valid
MPEG header but holds no audio. On a LAME CBR file of 10 s at 44.1 kHz:

| Source | Count |
|---|---|
| Frames with a valid sync header in the file | 385 |
| mediainfo `--Full` "Frame count" | **384** |
| ffprobe audio packets | **384** |
| Xing/Info frames field | **384** |
| mediainfo duration (10.031 s × 44100 / 1152) | **384** |
| `mediainfo --ParseSpeed=1` | 385 for CBR "Info" files, 384 for VBR "Xing" files (inconsistent) |

⇒ **Decision: count audio frames only and exclude the Xing/Info/VBRI frame** (DER-04, NN-05). This is
the number that four independent sources agree on, and it is what a reviewer sees with mediainfo.

## Fixture corpus

Generated with `lame` 3.100 and FFmpeg's libmp3lame from a 10 s synthetic source (tone + pink noise).

| Fixture | Expected | What it exercises |
|---|---|---|
| cbr128_info.mp3 | 384 | LAME CBR 128k 44.1k stereo **with Info frame** (385 sync frames) |
| cbr128_noinfo.mp3 | 384 | CBR, no Info frame (`lame -t`) |
| cbr128_crc.mp3 | 384 | CRC-protected frames (protection bit 0 → 2-byte CRC). **Gotcha:** LAME still writes "Info" at offset 36 (4 + 32), ignoring the CRC bytes, so the Xing probe must check both 4+side-info and 4+2+side-info |
| vbr_v2_xing.mp3 | 384 | VBR (frame sizes vary) with Xing frame |
| vbr_v2_noxing.mp3 | 384 | VBR, no Xing frame |
| mono_cbr128.mp3 | 384 | Mono: 17-byte side info (Info tag at a different offset) |
| mono_vbr.mp3 | 384 | Mono VBR with Xing |
| cbr320_48k.mp3 | 418 | 48 kHz, 320 kbps |
| cbr32_32k.mp3 | 279 | 32 kHz, 32 kbps (smallest frames, 144 B). **No Info frame**: LAME skips it because the frame is too small for the tag (279 × 144 = 40176 B = file size) |
| ffmpeg_cbr192.mp3 | 384 | Different encoder (FFmpeg): Info frame + ID3v2 |
| ffmpeg_vbr.mp3 | 384 | FFmpeg VBR: Xing frame + ID3v2 |
| ffmpeg_bare.mp3 | 384 | No Xing, no ID3 |
| id3v2.mp3 | 384 | ID3v2 tag at start |
| id3v1.mp3 | 384 | ID3v1 128-byte `TAG` at end |
| id3v2_bigart.mp3 | 384 | ~2.3 MB embedded JPEG in ID3v2 (must be skipped without buffering) |
| apev2_id3v1.mp3 | 384 | APEv2 tag + ID3v1 after the audio (mediainfo's default estimate says 385; its full parse and ffprobe say 384) |
| junk_after_id3.mp3 | 384 | 1000 zero bytes + a **fake frame header** between ID3v2 and audio (ffprobe is fooled and says 385; a correct parser rejects the fake) |
| truncated.mp3 | 384 | Last frame cut short. mediainfo and ffprobe still count it. Policy: see `frame-counting-algorithm.md` |
| mpeg2_22k.mp3 | error `UNSUPPORTED_FORMAT` | MPEG-2 Layer III, out of scope |
| empty.mp3 | error | 0 bytes |
| random.bin | error | 5000 random bytes |
| not_mp3.wav | error | WAV file |

## Provided sample file

The assessment's sample is publicly available. The same file (1,458,172 bytes,
SHA-1 `91adcdcbe919177611009096ff961454c9914cdb`) appears in 18 public repos of this take-home. A copy
was used for validation; the owner's own copy must be checked against this SHA-1 before it is committed.

| Property | Value |
|---|---|
| Structure | 44-byte ID3v2.4 tag (`TSSE=Lavf60.3.100`) → FFmpeg `Xing` frame (64 kbps, `stereo`, 208 B, frames field 6089) → 6089 VBR audio frames (`joint stereo`, 32–160 kbps) → ends exactly at EOF, no trailing tags |
| Frames with a valid sync header | 6090 |
| mediainfo `--Full` "Frame count" | **6089** |
| mediainfo `--ParseSpeed=1` | **6089** |
| ffprobe `-count_packets` / `-count_frames` | **6089 / 6089** |
| Xing frames field | 6089 |
| Duration cross-check | 159.060 s = 6089 × 1152 / 44100 ✓ |
| **Expected API response** | **`{"frameCount": 6089}`** |
| Prototype A (buffered, seek) | 6089, 6089 ✓ |
| Prototype B (streaming, chunks of 1/7/4096/65536 B) | 6089 ×4 ✓ |

Other public solutions to this take-home: 11 answer 6089 (metadata frame excluded) and 5 answer 6090
(counted, each explaining the discrepancy with mediainfo). We match the tool the brief names.

## Oracle caveat for short CBR files

mediainfo's CBR "Frame count" includes the Info frame when the file has ≤ ~256 frames (default mode) or
with `--ParseSpeed=1`. For any new short CBR test fixture, use ffprobe or the encoder's Xing field as the
oracle, not mediainfo alone.
