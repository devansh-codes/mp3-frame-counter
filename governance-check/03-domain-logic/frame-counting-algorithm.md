# Frame Counting Algorithm (normative)

This is the specification the implementation must follow. It was validated by two independent prototypes
(buffered/seek and streaming). Both match the ground truth on all 22 fixtures and on the provided sample
(6089). The streaming prototype also gives identical results across 270 different chunkings per fixture.
See [../06-records/validation-log.md](../06-records/validation-log.md).

## 1. Definitions

- **valid(h)**: the 4 bytes at a position are an MPEG-1 Layer III header:
  sync `0xFFE`, version `11`, layer `01`, bitrate index 1–14, sample-rate index 0–2.
- **len(h)**: `floor(144 × bitrate / sampleRate) + padding`
  (see [mp3-frame-format.md](mp3-frame-format.md) §3).
- **consistent(a, b)**: same sample rate. Version and layer are already fixed by `valid`. Channel mode,
  bitrate, padding, CRC and emphasis may change from frame to frame and are **not** compared.
- **confirmed(p)**: `valid(H(p))` **and** the next **2** frames follow back to back, each `valid` and
  `consistent` with `H(p)`. A chain that reaches exactly end-of-stream before 2 frames also confirms
  it. (Originally 1 following header. Raised to 2 after the V-010 audit estimated a ~13% chance of
  a false frame in 1 GB of random data with 1. With 2 it drops to about 1e-15 per byte. MediaInfo uses
  the same 3-frame chain.)

## 2. State machine (streaming, one pass)

```
          ┌──────────────┐  "ID3" + valid size: skip tag bytes (never buffered)
 start ──▶│ LEADING_TAGS │───────────────┐ (loop: tags can repeat)
          └──────┬───────┘◀──────────────┘
                 │ no ID3 at position
                 ▼
          ┌──────────────┐  scan forward byte by byte for a confirmed(p) candidate
          │  SEARCHING   │  (junk, zero padding and fake syncs are skipped, never counted)
          └──────┬───────┘
                 │ first confirmed frame found
                 │  → if it is the stream's FIRST frame and carries Xing/Info/VBRI: mark it as metadata, DON'T count it
                 ▼
          ┌──────────────┐  at each expected offset: valid(h) && consistent(locked, h) → count++, jump len(h)
          │   SYNCED     │
          └──────┬───────┘
                 │ header at the expected offset is invalid/inconsistent
                 │  → "ID3" here: skip the tag, go to SEARCHING
                 │  → otherwise (trailing tags, junk, corruption): go to SEARCHING (needs confirmation again)
                 ▼
             end of stream → finish()
```

### Rules in order

1. **Leading ID3v2 tags.** While the stream starts with `"ID3"` and a valid syncsafe size, skip
   `10 + size (+10 if footer flag)` bytes by **counting them off as they arrive** (never buffer them;
   the `id3v2_bigart` fixture has a 2.3 MB tag).
2. **Find the first frame.** Scan for the first position `p` where `confirmed(p)`. Bytes before `p` are
   junk. This is what rejects the fake header in `junk_after_id3.mp3`: the header its length points to is
   garbage.
3. **Metadata frame.** For the first confirmed frame only, look for `"Xing"` or `"Info"` at
   `p + 4 + sideInfoSize` (and at `+2` when CRC is on, for tolerance) and `"VBRI"` at `p + 36`. If found,
   the frame is **not counted**. Its length is still used to jump to the next frame.
4. **Walk.** In SYNCED, each header at the expected offset that is `valid` and `consistent` with the
   locked sample rate is counted. Then jump `len` bytes (body bytes are skipped, not copied).
5. **Lost sync.** If the header at the expected offset fails: if it is `"ID3"`, skip that tag (as in
   rule 1). Otherwise return to SEARCHING, which again needs confirmation. Trailing ID3v1, APEv2 and
   Lyrics3 tags are therefore never counted: no confirmed frame chain exists inside them.
6. **End of stream** (`finish()`):
   - In SYNCED, a final frame whose header was valid but whose body is cut short is **counted**
     (truncated-final-frame policy, §4). A warning is logged.
   - A final 1–3 bytes that cannot form a header are ignored.
   - In SEARCHING, an unconfirmed candidate is not counted, except one that ends exactly at
     end-of-stream (that counts as confirmation).
7. **Outcome** (`FrameCountResult` in `src/mp3/frame-counter.ts`; HTTP mapping in `src/http/api-error.ts`)

   | Domain result | When | HTTP |
   |---|---|---|
   | `{ ok: true, frameCount }` | ≥ 1 confirmed MPEG-1 Layer III frame, the metadata frame included (a file holding only a metadata frame gives 0) | 200 `{"frameCount": n}` |
   | `{ ok: false, reason: 'EMPTY_FILE' }` | 0 bytes received | 422 `EMPTY_FILE` |
   | `{ ok: false, reason: 'UNSUPPORTED_FORMAT', format }` | No MPEG-1 L3 frame, **and** the first 4 bytes after the leading tags are a well-formed MPEG audio header of another version, layer or free-format bitrate. Only the header bits are checked; other formats are **not** parsed (NN-09) | 422 `UNSUPPORTED_MP3_FORMAT` (message names the format, e.g. "MPEG-2 Layer III") |
   | `{ ok: false, reason: 'NO_MPEG1_LAYER3_FRAMES' }` | Anything else with no confirmed frame | 422 `INVALID_MP3` |

## 3. Streaming mechanics (bounded memory)

- The counter is fed chunks as they arrive: `push(chunk)` then `finish()`. It is independent of the
  HTTP layer and has no I/O.
- **Skip counter:** when a jump (tag or frame body) goes past the end of the current chunk, the
  remainder is kept as a number (`bytesToSkip`) and taken from the next chunks. No bytes are stored.
- **Carry buffer:** when a decision needs bytes that haven't arrived yet (a header split across chunks,
  or the confirmation look-ahead while SEARCHING), only the bytes from the current position onward are
  **copied** (never a view that pins the whole chunk). The next chunk is appended to them.
  - The carry is bounded by the largest look-ahead: 2 max frames (2 × 1441) + next header (4) = **2886 bytes**.
  - Merging happens only when a decision straddles a chunk boundary. While SYNCED that is rare (a header
    split at the boundary), so the cost is negligible.
- Memory per request is therefore O(1): roughly one chunk plus ≤ 2886 bytes, whatever the file size.
  The prototype measured 3.2 MB of live heap after 1 GB and after 10.7 GB.
- **Invariant, enforced by a fuzz test:** the result must be identical for every way of splitting the
  same bytes into chunks (1-byte chunks, random splits, whole file).

## 4. Edge-case policies (decided)

| Case | Policy | Why |
|---|---|---|
| Xing/Info/VBRI first frame | Not counted | Metadata, not audio. Encoders exclude it from their own count; ffprobe, mpg123 and mediainfo agree (D-002) |
| Xing/Info later in the stream (e.g. two files concatenated) | Counted | Same as FFmpeg and mediainfo, which only check the first frame |
| Channel mode / bitrate change between frames | Allowed | FFmpeg's Xing frame is `stereo` while its audio is `joint`; VBR changes bitrate every frame |
| Sample-rate change mid-stream | Treated as lost sync (not counted) | Not a valid single stream. Documented limitation |
| Truncated final frame (header present) | **Counted** + warning logged | Matches ffprobe (always) and mediainfo on `truncated.mp3`; decoders output its 1152 samples. mpg123 drops it; that alternative is documented |
| Fewer than 3 frames between a resync point and a trailing tag, junk or end of stream (e.g. junk → 2 frames → ID3v1) | Those frames are **not counted** | The 2-header confirmation rule (D-012) can't confirm them. Found by adversarial testing (V-010b): API 380 vs ffprobe 382 on such crafted files. It never affects a normal file, where the first frame follows the tags directly and trailing tags come after a long, already-synced run. A truncated frame right after a resync is not counted for the same reason |
| Free-format bitrate (index 0) | `UNSUPPORTED_FORMAT` | Length cannot be computed from the header. Out of scope, and extremely rare |
| MPEG-2 / 2.5, Layer I / II | `UNSUPPORTED_FORMAT` (header bits only) | Out of scope per brief (NN-09) |
| Junk / zero padding between frames | Skipped via SEARCHING | Matches MediaInfo and mpg123 tolerance |
| A file of only 1–2 frames followed by 1–3 junk bytes | `NO_MPEG1_LAYER3_FRAMES` (HTTP `INVALID_MP3`) | Cannot be confirmed. A pathological case, accepted |

## 5. Complexity

- Time: O(n) in bytes received. While SYNCED, only 4 header bytes per frame (~418 bytes) are examined.
  SEARCHING uses `findFrameSync()`: `indexOf(0xFF)` jumps across junk, and only positions where
  `0xFF` is followed by `0xFA`/`0xFB` are decoded. Measured: about 0.3–0.5 s of CPU per GB for real
  MP3 or random data, and 2.8 s/GB in the worst case (all 0xFF bytes, down from 15.9 s/GB before
  the two-byte check; V-010b). All of it is far below network transfer time.
- Memory: O(1), ≤ 2886 bytes of carry plus the current chunk.
