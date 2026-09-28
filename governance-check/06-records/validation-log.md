# Validation Log

Append-only record of every validation: independent agents, prototypes, benchmarks and tool
cross-checks. Each entry says what was tested, how, the result and what it changed.

---

## V-001: Reference ground truth for the fixture corpus (2026-09-26)
- **Who:** main session.
- **How:** Generated 22 fixtures with lame 3.100 and FFmpeg libmp3lame. Measured each with mediainfo
  26.05 (`--Full`, `--ParseSpeed=1`), ffprobe `-count_packets` and the Xing field.
- **Result:** Tools agree on the audio-frame count, which excludes the Xing/Info frame. The one
  exception is mediainfo full-parse on CBR Info files (+1). See
  [../03-domain-logic/ground-truth.md](../03-domain-logic/ground-truth.md).
- **Changed:** Produced decision D-002 (exclude the metadata frame).

## V-002: Independent spec and semantics research (2026-09-26)
- **Who:** research agent. Primary sources: LAME `VbrTag.c`/`bitstream.c`, FFmpeg
  `mp3dec.c`/`mpegaudiodecheader.c`/`mp3enc.c`, mpg123 `parse.c`, MediaInfoLib `File_Mpega.cpp`,
  mp3-tech.org, the Windszus paper, the ID3v2.3/2.4 and APEv2 specs.
- **Findings:**
  1. The frame-length formula includes the header, CRC and side info. Range 96–1441 bytes. ✔ confirms
     the hypothesis.
  2. The Xing frames field **never includes the metadata frame** (LAME, FFmpeg). Demuxers and decoders
     skip it. ✔ confirms D-002.
  3. ⚠ The Xing/Info tag offset **ignores the CRC** (LAME writes it at 36 even with CRC). The naive
     `4 + 2 + sideInfo` rule is wrong. → Rule updated: check `4 + sideInfo` (plus `+2` for tolerance).
  4. ⚠ FFmpeg's Xing frame is `stereo` with a different bitrate, while its audio frames are `joint` →
     consistency must lock **only** the sample rate (and version/layer). → Rule updated.
  5. ⚠ mediainfo counts the Info frame on short CBR files (≤ ~256 frames) even in default mode → oracle
     caveat added to ground-truth.md.
  6. ⚠ The `cbr32_32k` fixture has no Info frame (LAME drops it when it doesn't fit) → ground-truth note
     corrected. Expected count unchanged.
  7. **The provided sample is public** (SHA-1 `91adcdcb…`, found in 18 repos). Expected answer:
     **6089**, which every mediainfo mode and ffprobe agree on. 11 of 16 surveyed candidate repos answer
     6089.
  8. Truncated final frame: FFmpeg counts it, mediainfo counts it if ≥ ~½ present, mpg123 drops it.
     Recommendation: count it when the header is valid and consistent.
- **Full notes:** kept in the session scratch folder (not part of the repo); condensed into
  [../03-domain-logic/mp3-frame-format.md](../03-domain-logic/mp3-frame-format.md).

## V-003: Prototype A, non-streaming parsers (2026-09-26)
- **Who:** prototype agent A, working independently.
- **What:** One sans-IO parser core with three drivers: in-memory buffer, async FileHandle seek (reads
  only headers), and seek with 64 KB read-ahead.
- **Correctness:** 22/22 fixtures match with every driver, including 3-frame confirmation. 100 MB of
  `/dev/urandom` gives `NO_FRAMES` (single confirmation is enough). Sample: 6089.
- **Performance** (M-series, warm cache; an empty Node process is 33 MB RSS):

  | Approach | 1 GB time | 1 GB peak RSS |
  |---|---|---|
  | read and discard (baseline) | 0.31 s | ~90 MB |
  | buffered (`readFile` + parse) | 1.06–1.38 s | **1.04–1.07 GB** |
  | buffered via chunk concat (what an HTTP memory store does) | 1.26–1.65 s | **1.6–2.05 GB** |
  | seek, async, 4 bytes per frame | **23–26 s** | 51 MB |
  | seek + 64 KB read-ahead | 0.70–0.79 s | 47 MB |
  | spool to temp file, then seek | 2.6–2.8 s | ~90 MB |

- **Lessons:** Buffering costs memory in proportion to file size (a DoS risk). Pure seek is a trap: a
  threadpool round-trip per 418-byte frame, and no real I/O is saved because frames are smaller than a
  page. Spooling adds a full disk write plus cleanup. ⚠ Stripping trailing tags by reading backwards is
  fragile: a malformed APE footer made the first version drop 58 bytes of real audio. The forward-only
  walker has no such failure mode.

## V-004: Prototype B, streaming parser (2026-09-26)
- **Who:** prototype agent B, working independently.
- **What:** Incremental `push(chunk)` / `finish()` counter with a bounded carry buffer.
- **Correctness:** 22/22 fixtures and 1295 synthetic edge cases pass: double ID3v2, v2.4 footer, ID3
  between concatenated files, mid-stream junk, 0xFF/0x00 padding, single frame, Info-only file, 1280
  truncation lengths. **Identical results across 270 chunkings per fixture**: sizes 1/2/3/5/7/13/64/
  1000/4096/65536 bytes, real `fs.createReadStream`, and 250 seeded random splits (seed `0x5eed2026`)
  including 0-byte chunks. Chunks were overwritten after `push()` to prove the counter never keeps
  references to them. Sample: 6089 at chunk sizes 1, 7, 4096 and 65536.
- **Performance:** 1 GB in 131–348 ms (3.1–8.2 GB/s, depending on chunk size). Parse overhead is about
  40–50 ms of CPU per GB (23–85 ns per frame). Peak RSS 55–62 MB. **Live heap 3.18 MB after 1 GB and
  3.27 MB after 10.7 GB: flat.**
- **Lesson:** Streaming is strictly better on memory, and at least as good on time. Parsing overlaps the
  network transfer, so the response is ready as soon as the last byte arrives.

## V-005: Cross-check on the provided sample (2026-09-26)
- **Who:** main session.
- **Result:** mediainfo `--Full` 6089 · mediainfo `--ParseSpeed=1` 6089 · ffprobe packets 6089 /
  frames 6089 · Xing field 6089 · Prototype A buffered 6089, seek 6089 · Prototype B streaming 6089 at
  each of 4 chunk sizes. **All sources agree: 6089.**
- **Pending:** confirm the owner's copy (`~/Downloads/test-file.mp3`) has the same SHA-1. macOS privacy
  controls currently block the agent from reading `~/Downloads`. The repo uses the public copy
  (SHA-1 `91adcdcbe919177611009096ff961454c9914cdb`) at `test/fixtures/sample.mp3`.

## V-006: HTTP stack evaluation (2026-09-26)
- **Who:** HTTP/tooling agent, working independently.
- **What:** Five stacks benchmarked with a byte-counting handler on 100 MB, 1 GB and 5 GB multipart
  uploads, then edge behaviours probed with curl, Node fetch and a naive Python client.
- **Result:** Fastify 5 + @fastify/multipart streams (1 GB: 115–197 MB RSS, 36 MB ArrayBuffers,
  0.30–0.65 s). Express + busboy and node:http + busboy stream but are fragile: a throw inside a busboy
  callback crashed the process, and busboy's size limit truncates silently with a 200. multer and Hono
  buffer (2–3 GB for 1 GB).
- **Pitfalls found, and how they're handled:**
  - `request.file()` silently ignores extra files → iterate `request.parts()` with `files: 1`.
  - The default fileSize limit truncates silently → explicit `limit` listener plus a `truncated` check.
  - Malformed bodies surface as busboy messages or `ERR_STREAM_PREMATURE_CLOSE` → mapped to 400.
  - An abort is detected with `reply.raw.destroyed`.
- **Versions:** Node 20 has been EOL since 2026-04-30. The latest Vitest and ESLint need Node ≥ 22.12
  or 20.19. → D-007.

## V-007: Early-reply strategy experiment (2026-09-26)
- **Trigger:** An in-process streaming test failed. A 413 sent with `Connection: close` produced
  `EPIPE` in Node fetch, because the server closed the socket with unread data (TCP reset) before the
  client read the reply.
- **How:** Standalone server with 3 strategies (close / keep-alive drain / lingering close), each hit
  3× with curl, fetch (stream body) and fetch (Blob body), uploading 305 MB against a 1 MB limit.
- **Result:** Across processes all strategies delivered a 413 in ~2–25 ms. In-process, only the
  non-closing strategies avoided the reset.
- **Changed:** Adopted a **lingering close** (drain, then destroy after 5 s), as nginx and Apache do
  → D-008. The test suite then passed 3/3 consecutive runs.

## V-008: Live production server vs reference tools (2026-09-26)
- **How:** `node dist/server.js`, then `curl -F file=@…` for every repo fixture and the scratch edge
  corpus. Each result compared with mediainfo (`--Full`, falling back to `--ParseSpeed=1` when the
  default is empty) and ffprobe.
- **Result: 23/23 PASS.** Every response has `Content-Type: application/json; charset=utf-8`.
  - Sample → `{"frameCount":6089}`.
  - The MPEG-2 file → 422 `UNSUPPORTED_MP3_FORMAT` ("MPEG-2 Layer III").
  - Random bytes and the WAV → 422 `INVALID_MP3`. The empty file → 422 `EMPTY_FILE`.
  - Where the tools disagree, the API gives the analytically correct audio-frame count:
    `id3v2_bigart` (mediainfo 385, ffprobe 384, API 384), `junk_after_id3` (ffprobe 385 because junk
    hides the Info frame, API 384), `apev2_id3v1` (mediainfo default 385 because tags are counted in
    the size estimate, API 384).

## V-009: Large-file streaming benchmark through the production server (2026-09-26)
- **How:** `/usr/bin/time -l node dist/server.js` (MAX_FILE_SIZE_MB=8192), then
  `curl -F file=@<N copies of cbr128-no-info.mp3>`.
- **Result:**

  | Upload | Expected | API | Total time | Throughput | Server peak RSS |
  |---|---|---|---|---|---|
  | 100 MB | 245 760 | 245 760 ✓ | 0.10–0.12 s | 0.8–1.0 GB/s | 109–116 MB |
  | 1 GB | 2 572 800 | 2 572 800 ✓ | 0.65 s | 1.6 GB/s | 118 MB |
  | 3 GB | 7 718 400 | 7 718 400 ✓ | 1.95 s | 1.6 GB/s | 145 MB |

- **Conclusion:** Memory stays roughly flat (+27 MB RSS of GC slack for 30× the data). Throughput is
  limited by loopback I/O, not by parsing.

## V-010a: Independent code-quality and requirements audit (2026-09-26)
- **Who:** A reviewer agent working independently, read-only.
- **Parser verdict:** No bugs. The agent verified the invariants: carry ≤ bound, `carry` and
  `bytesToSkip` never both set, guaranteed progress (no infinite loop), metadata detection only once
  the whole frame is available, and truncation only in `synced`. Its own chunk fuzz over 11
  additional synthetic cases (~110 chunkings each) matched.
- **Must-fix found:**
  1. No git commits yet (awaiting owner).
  2. Fastify's default JSON/text parsers buffered non-multipart bodies and returned 413/400 instead
     of 415.
  3. A bad URL bypassed the JSON error shape.
- **Should-fix found:** no idle timeout; 1 MB text fields; the error-handler type; the truncated-frame
  log level; chunk fuzz only on fixtures; a wall-clock assertion equal to the linger timeout; error
  mapping split across files; single-header confirmation strength.
- **Resolution:** All code findings fixed (D-012, D-013). New tests cover 415 for large text and
  invalid JSON, the bad URL, OPTIONS, long text fields, the truncated upload over HTTP, status-derived
  codes, and 2-header confirmation. Every counter scenario is now also checked under 3 extra
  chunkings. The streaming test asserts on bytes sent instead of wall-clock time.
- **After the fixes:** `npm run check` green, **179/179 tests, 100% coverage**. Live server vs
  mediainfo/ffprobe **24/24** (including the 1 GB upload with the default config).

## V-010b: Independent adversarial test campaign (2026-09-26)
- **Who:** An adversarial tester agent, read-only, with its own independent spec implementation.
  Its scripts lived in the session scratch folder (not part of the repo).
- **Passed:**
  - **Real encodes:** 186 files (lame and ffmpeg, 32–320 kbps, 32/44.1/48 kHz, every channel mode,
    V0–V9, ABR, `--nores`, CRC, `-t`, ISO-strict, every tag combination, 0.1 s to 11 min) match
    ffprobe, apart from the known mediainfo short-CBR +1. Free-format, MPEG-2/2.5 and Layer II are
    reported as UNSUPPORTED.
  - **Crafted files:** 69 edge cases all follow the spec.
  - **Differential fuzz:** 40,000 mutated files against an independent implementation, each also
    fed in random chunk sizes including 0 and 1 byte: **0 mismatches**.
  - **Cover art:** 28 MB of JPEG data produced 0 false frame chains.
  - **Load:** 50 parallel uploads all returned 6089. 700 aborts leaked nothing. Four concurrent
    1 GB uploads were exact, peaking at 83 MB RSS.
  - **Size limit:** exactly at the limit → 200, limit + 1 byte → 413.
- **Where the API beats the tools:** ID3v2 appended at the end, APEv2 with binary cover art, and
  random junk between frames. ffprobe and mediainfo over-count all three.
- **Defects found, and how each was resolved:**

  | # | Defect | Resolution |
  |---|---|---|
  | 1 | Epilogue ≥ ~48 KB after the closing boundary gets no response (@fastify/busboy Dicer never resumes a paused write) | Accepted and documented as an upstream bug. The idle timeout frees the socket (D-015) |
  | 2 | Protocol-level errors used Fastify's default body with no charset | **Fixed:** `clientErrorHandler`. Re-run: all JSON with a charset |
  | 3 | Field names `__proto__` / `constructor` rejected, contradicting D-006 | Doc amended. The guard is kept |
  | 4 | Slowloris body trickle held open | Documented (reverse-proxy min-rate) |
  | – | All-0xFF input parsed at 15.9 s/GB | **Fixed:** `findFrameSync`, now 2.8 s/GB |
  | – | ≤ 2 frames after a resync dropped | Documented in algorithm §4 (a consequence of D-012) |

- **After the fixes:** `npm run check` green, **192/192 tests, 100% coverage**. The adversarial HTTP
  suite was re-run against the new build: every protocol error is JSON; the remaining non-JSON
  replies are the documented edges (HEAD has no body by HTTP rule, Node's own 417, the upstream
  epilogue bug).

## V-011: Upload tester end-to-end (2026-09-26)
- **How:** Fresh `node dist/server.js` on :3000 and `npm run tester` on :5173. Every fixture was
  fetched from the tester's `/fixtures` route and uploaded through its proxy. Two ffmpeg-generated
  `.mp2` files were uploaded, plus a 305 MB file. The fixture route was probed with bad names.
- **Result:**
  - Fixtures: **16/16** match their expected results through the proxy (sample 6089;
    `mpeg2-layer3` → 422).
  - `.mp2` files (ffprobe: `mp2`): 422 `UNSUPPORTED_MP3_FORMAT`, "Unsupported audio format:
    MPEG-1 Layer II".
  - 305 MB: `{"frameCount":729600}` (exact) in 0.21 s. Tester RSS went from 51 to 134 MB, so it was
    not buffered.
  - `/fixtures/toString` and `..%2F` traversal both return 404.
  - `npm run check` stays green: 179 tests, 100% coverage.
- **Note:** The adversarial test agent (V-010b) was interrupted when the previous session ended and
  never reported. Its campaign is still outstanding.

## V-012: Correction to V-011 (2026-09-26)
- The V-011 note saying the adversarial campaign "never reported" is wrong. The campaign completed
  in the background and is recorded in V-010b (its fixes: `findFrameSync`, `clientErrorHandler`;
  192/192 tests, 100% coverage).

## V-013: Easy-run paths (2026-09-27)
- **`npm run demo`:** built, and started the API (:3000) and the tester (:5173). The sample returned
  6089 both directly and through the tester. A terminal Ctrl+C (SIGINT to the process group) and a
  SIGTERM to the launcher alone both stopped both servers.
- **Docker:** `docker compose build` then `up -d` on Docker 28.3.3. Results:
  - sample → 6089 via the API and via the tester
  - `.mp2` → 422 `UNSUPPORTED_MP3_FORMAT`
  - 1 GB upload → 2 572 800 (exact); API container at ~61 MiB afterwards
  - the API runs as `node` (non-root)
  - images: API 179 MB, tester 315 MB
- `npm run check` green: 192 tests, 100% coverage.

## V-014: Submission readiness (2026-09-28)
- **Owner's sample:** `shasum ~/Downloads/test-file.mp3` gives
  `91adcdcbe919177611009096ff961454c9914cdb`, identical to `test/fixtures/sample.mp3`. The expected
  answer (6089) therefore applies to the file the assessment provided.
- **Fresh clone:** `git clone` → `npm ci` → `npm audit` (0 vulnerabilities) → `npm run check`
  (192/192 tests, 100% coverage) → build OK.
- **CI:** green on Node 22 and 24 for every pushed commit.
- **Requirements register:** all 46 items marked verified, each with its evidence.
