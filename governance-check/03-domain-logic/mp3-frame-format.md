# MPEG-1 Layer III Frame Format (reference)

Everything the parser needs to know about the format, checked against primary sources: the LAME, FFmpeg,
mpg123 and MediaInfoLib source code, the mp3-tech.org header spec, the Windszus "MPEG Audio Frame
Header" paper, and the ID3/APE specs. Research was done 2026-09-26 by an independent agent, and every
claim was reproduced on real files.

## 1. File layout

```
[ ID3v2 tag(s) ]  [ Xing/Info/VBRI frame ]  [ audio frame ][ audio frame ] … [ audio frame ]  [ APEv2 ][ Lyrics3 ][ ID3v1 ]
   optional,            optional,                 the frames we count                           optional trailing tags
   0..n, any size       first frame only
```

An MP3 has no container and no global header. It is a sequence of self-describing frames, each starting
with a 4-byte header. **The only way to count frames is to read each header, compute that frame's
length, and jump to the next one.**

## 2. Frame header (32 bits, big-endian)

`AAAAAAAA AAABBCCD EEEEFFGH IIJJKLMM`

| Field | Bits | Meaning | Rule for our parser |
|---|---|---|---|
| A sync | 11 | all ones | `b0 === 0xFF && (b1 & 0xE0) === 0xE0` |
| B version | 2 | 00 MPEG-2.5 · 01 reserved · 10 MPEG-2 · **11 MPEG-1** | must be `11`; others are *unsupported* |
| C layer | 2 | 00 reserved · **01 Layer III** · 10 Layer II · 11 Layer I | must be `01`; others are *unsupported* |
| D protection | 1 | 0 = 16-bit CRC follows the header | either value; the CRC is already included in the frame length |
| E bitrate index | 4 | see table · 0 = free format · 15 = bad | 1–14; 0 is *unsupported*, 15 is invalid |
| F sample-rate index | 2 | 0 = 44100 · 1 = 48000 · 2 = 32000 · 3 = reserved | 0–2 |
| G padding | 1 | +1 byte | used in the frame length |
| H private | 1 | informative | ignore |
| I channel mode | 2 | stereo / joint / dual / mono | sets side-info size; **may differ between frames** |
| J mode extension | 2 | joint-stereo detail | ignore |
| K, L copyright, original | 1+1 | informative | ignore |
| M emphasis | 2 | 10 is reserved | ignore (FFmpeg and mpg123 don't check it either) |

### Bitrate table (MPEG-1 Layer III, kbps)

| idx | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kbps | free | 32 | 40 | 48 | 56 | 64 | 80 | 96 | 112 | 128 | 160 | 192 | 224 | 256 | 320 | bad |

Samples per frame: **1152**. This is used only to cross-check against mediainfo's duration, never to
compute the count.

## 3. Frame length

```
frameLength = floor(144 × bitrate_bps / sampleRate) + padding        // bytes
```

- The length **includes** the 4-byte header, the optional 2-byte CRC, the side info and the main data.
  Sources: FFmpeg `ff_mpegaudio_decode_header`, LAME `calcFrameLength`. CRC and non-CRC fixtures have
  identical frame sizes.
- Range: **96 bytes** (32 kbps at 48 kHz) to **1441 bytes** (320 kbps at 32 kHz, padded).
- Example: 128 kbps at 44.1 kHz → 417 bytes, or 418 with padding.

## 4. After the header

| Part | Size |
|---|---|
| CRC | 2 bytes, only if protection bit = 0 |
| Side info | **17** bytes (mono) / **32** bytes (stereo, joint, dual) |
| Main data | the rest of the frame |

## 5. Xing / Info / VBRI metadata frame

Encoders (LAME, FFmpeg) usually write a **first frame that holds metadata instead of audio**: VBR
frame/byte counts, a seek table and the LAME encoder tag. It has a valid MPEG header, so a naive walker
counts it.

| Tag | Offset from frame start | Notes |
|---|---|---|
| `Xing` (VBR) / `Info` (CBR) | **4 + side-info size** → 36 (stereo) / 21 (mono) | **The CRC is NOT added.** LAME writes the tag at 36 even when CRC is on (`lame_get_lametag_frame`), and FFmpeg, mpg123 and MediaInfo look only there. We also accept +2 when CRC is on, for tolerance |
| `VBRI` (Fraunhofer) | **36**, always | rare |

- **The Xing "frames" field never includes the metadata frame itself.** This holds for LAME
  (`nVbrNumFrames` starts at 0 after the tag frame) and FFmpeg (`mp3->frames++` per audio packet).
- **Demuxers and decoders skip it.** FFmpeg `mp3_parse_vbr_tags` seeks past it; mpg123 uses
  `goto read_again` without incrementing the frame number. A decoder that doesn't know the tag decodes it
  to exactly 1152 samples of silence (verified).
- In FFmpeg-written files (including the provided sample), the metadata frame uses **channel mode
  `stereo` and a different bitrate**, while the audio frames are `joint stereo`. So a consistency check
  that compared channel mode or bitrate would wrongly reject it.
- ⇒ **It is not an audio frame and is not counted** (D-002, NN-05).

## 6. Tags that surround the audio (never counted)

| Tag | Where | Signature | Size |
|---|---|---|---|
| ID3v2.2/2.3/2.4 | start (can repeat); v2.4 can also be appended | `"ID3"` + ver ≠ 0xFF + 4 size bytes each < 0x80 | `10 + syncsafe28(bytes 6..9)` **+ 10 if v2.4 footer flag (0x10)** |
| ID3v1 | last 128 bytes | `"TAG"` | 128 |
| Enhanced TAG | before ID3v1 | `"TAG+"` | 227 |
| APEv2 | after the audio, before ID3v1 | `"APETAGEX"` | footer size (+32 if a header is present) |
| Lyrics3v2 | before ID3v1 | ends `"LYRICS200"` | size + 15 |

Syncsafe integer: 4 bytes, 7 bits used per byte → `(b6 << 21) | (b7 << 14) | (b8 << 7) | b9`.

ID3v2 tags can hold megabytes of album art (JPEG data full of `FF Ex` bytes that look like sync). They
must be **skipped by their declared size, never scanned**.

## 7. What the reference tools report (why "correct" = audio frames)

| Tool | What its count means |
|---|---|
| mediainfo `--Full` "Frame count" | For VBR: the Xing frames field (excludes the metadata frame). For CBR: an estimate from size. On short CBR files (≤ ~256 frames) or with `--ParseSpeed=1` it includes the Info frame, so it is **not a perfectly consistent oracle for CBR Info files** |
| ffprobe `-count_packets` | Audio packets. It skips the metadata frame when it sits directly after ID3v2 |
| Xing frames field | The encoder's own audio-frame count |

For the **provided sample** (VBR, FFmpeg-written Xing frame), every one of these says **6089**. See
[ground-truth.md](ground-truth.md).
