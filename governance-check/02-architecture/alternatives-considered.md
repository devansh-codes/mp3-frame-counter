# Alternatives Considered

Every option below was **prototyped and measured**, not just reasoned about. Numbers are from Node
20.13 and 24.21 on an Apple M2 with a warm page cache (V-003, V-004, V-006).

## 1. Where the bytes live while counting

| Option | 1 GB peak memory | 1 GB time | Verdict |
|---|---|---|---|
| **Streaming parser fed by the upload stream** ✅ | **55–62 MB RSS (3.2 MB live heap, same after 10.7 GB)** | 0.13–0.35 s parse (overlaps the upload) | **Chosen.** O(1) memory, single pass, no disk |
| Buffer the whole upload, then parse | 1.04–1.07 GB | 1.06–1.38 s | Rejected: memory grows with file size (DoS risk), and parsing waits for the full upload |
| Buffer via an HTTP memory store (e.g. multer memoryStorage) | 1.6–2.05 GB | 1.26–1.65 s | Rejected: about 2× the file size in RAM |
| Spool to a temp file, then seek-read headers only | ~90 MB | 2.6–2.8 s (the spool alone is 1.4–1.9 s) | Rejected: full disk write, cleanup and quota handling, and parsing only starts after the upload |
| Seek-read with async FileHandle, 4 bytes per frame | 51 MB | **23–26 s** | Rejected: one threadpool round-trip per frame. Frames (~418 B) are smaller than a disk page, so skipping bodies saves no I/O |

## 2. HTTP stack (1 GB multipart upload, byte-counting handler)

| Stack | Streams? | 1 GB peak RSS / ArrayBuffers | 1 GB time | Notes |
|---|---|---|---|---|
| **Fastify 5 + @fastify/multipart** ✅ | Yes | 115–197 MB / 36 MB | **0.30–0.65 s** | Errors thrown in the async iterator reach the error handler. First-class TS, `inject()` testing |
| Express 5 + busboy | Yes | 107–187 MB / 32 MB | 0.46–0.72 s | A throw inside a busboy callback **crashed the process** in testing. About 55 lines of manual state handling vs 25 |
| node:http + busboy | Yes | 99–129 MB / 31 MB | 0.64–0.78 s | busboy's `fileSize` limit **truncates silently** (a 5 GB upload returned 200). Much boilerplate |
| Express + multer (memory) | **No** | ~2.1 GB / 2 GB | 0.6–1.5 s | Buffers everything |
| Hono `parseBody()` | **No** | ~2.5 GB / 3 GB | 2.9–4.1 s | Holds about 3× the file size |

## 3. Counting-logic variants

| Question | Options | Decision | Why |
|---|---|---|---|
| Count the Xing/Info/VBRI frame? | Count all syncable frames (6090) / audio frames only (6089) | **Audio only** | mediainfo, ffprobe, the encoder's Xing field and the duration all say 6089. The frame is metadata and decodes to silence (D-002) |
| Where to look for the Xing tag with CRC | `4+2+sideInfo` / `4+sideInfo` | **`4+sideInfo`, also accept `+2`** | LAME writes it at 36 even with CRC. FFmpeg, mpg123 and MediaInfo ignore the CRC |
| Consistency check between frames | Lock channel mode + bitrate / lock sample rate only | **Sample rate only** (version/layer are fixed by validation) | FFmpeg's Xing frame is `stereo` with a different bitrate from its `joint` audio frames |
| How to confirm a sync candidate | 1 next header / 2 next headers (MediaInfo's 3-frame chain) | **2 next headers, or the chain ends exactly at end of stream** | 1 header gave 0 false frames on 100 MB of random data, but the V-010 audit estimated ~1e-10 per byte (~13% for 1 GB of random data). 2 headers take this to about 1e-15 per byte, for at most 2.9 KB of carry (D-012) |
| Trailing tags | Strip by reading from the end / walk forward only | **Walk forward only** | Stripping from the end needs random access (can't stream). A malformed APE footer made the backward approach drop real audio in prototype A |
| Truncated final frame | Count / drop | **Count** (flagged in logs) | Matches ffprobe always, and mediainfo on the fixture. Decoders output its samples |
| Early reply on 413 | `Connection: close` + immediate close / drain everything / lingering close | **Lingering close (5 s)** | Immediate close can reset the connection before the client reads the reply (reproduced in-process). Lingering close delivered the 413 in ~23 ms to curl and fetch |

## 4. Node.js version and tooling

| Option | Verdict | Why |
|---|---|---|
| Node 20-compatible toolchain (Vitest 4.0.18 + Vite 6, ESLint 9) | Rejected | Node 20 has been EOL since 2026-04-30. Vitest 4.0.18 carries advisory GHSA-82fw-gwwq-j7x9 (`npm audit`: 3 vulnerabilities, 2 critical). ESLint 9 is marked unsupported. The npm that ships with Node 20.13 crashes installing fixed Vitest versions |
| **Node 24 LTS target (engines ≥ 22.13), latest tooling** ✅ | Chosen | 0 vulnerabilities, supported tool majors, CI on Node 22 and 24 |
