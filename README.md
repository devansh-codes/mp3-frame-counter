# MP3 Frame Counter

A TypeScript HTTP API that accepts an MP3 upload and responds with the number of audio frames it
contains.

```
POST /file-upload  (multipart/form-data, one file)  →  200 {"frameCount": 6089}
```

- **Parses the file itself.** The frame headers are decoded by hand, with no MP3 or audio libraries.
- **Streams.** The upload is counted as it arrives. It is never buffered in memory or written to disk,
  so a 3 GB upload uses the same ~120–150 MB of memory as a 1 MB one.
- **Verified against `mediainfo` and `ffprobe`** on the provided sample (6089) and a corpus of 16
  encoder-generated files, plus synthetic edge cases (tags, junk, truncation, invalid input).

---

## Quick start

Two ways to run it after cloning. Both start the **API** on http://localhost:3000 and the
**upload tester** (a small browser UI) on http://localhost:5173.

### Option A: Docker (nothing else to install)

```bash
docker compose up --build        # Ctrl+C to stop, `docker compose down` to clean up
```

This builds two images from one `Dockerfile`: a slim production image for the API (runtime
dependencies only, runs as a non-root user) and one for the tester.

### Option B: Node.js 22.13+ (24 LTS recommended)

```bash
nvm install                      # optional: installs the version in .nvmrc (24)
npm ci
npm run demo                     # builds, then starts the API and the tester together
```

To run just the API: `npm run build && npm start`. For development, `npm run dev` runs the
TypeScript source with auto-reload. On an older Node, `npm ci` stops straight away with the
required version (`.npmrc` sets `engine-strict`).

### Try it

```bash
curl -F "file=@test/fixtures/sample.mp3" http://localhost:3000/file-upload
```

```json
{ "frameCount": 6089 }
```

Any file field name works. Errors are JSON with a stable code and a readable message:

```bash
curl -F "file=@README.md" http://localhost:3000/file-upload
```

```json
{
  "error": {
    "code": "INVALID_MP3",
    "message": "No MPEG-1 Layer III audio frames were found. The file is not a valid MP3, or it is corrupted."
  }
}
```

### Configuration

| Variable           | Default   | Meaning                                                                                     |
| ------------------ | --------- | ------------------------------------------------------------------------------------------- |
| `PORT`             | `3000`    | Port to listen on                                                                           |
| `HOST`             | `0.0.0.0` | Interface to bind                                                                           |
| `MAX_FILE_SIZE_MB` | `2048`    | Uploads larger than this get `413`. Parsing is streamed, so this caps bandwidth, not memory |
| `LOG_LEVEL`        | `info`    | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`                              |

Invalid values stop the server at startup with a clear message.

---

## Testing

```bash
npm test                  # 192 tests, about 6 s
npm run check             # everything CI runs: format, lint, typecheck, tests with coverage, build
```

The suite includes:

- **Unit tests** for header decoding, ID3v2 tag sizing and Xing/Info/VBRI detection.
- **Frame counter tests** on every fixture, including the provided sample.
- **A chunk-boundary fuzz test**: every fixture is split at 1, 2, 3, 5, 13, 1441, 4096 and 65 536
  bytes plus 25 random splits, and must give the same result every time.
- **Adversarial inputs**: a 2.9 MB ID3v2 tag full of fake frame headers, junk containing a fake sync,
  concatenated files, and trailing APE/ID3v1 tags.
- **HTTP tests**: the success contract, every error status, headers and routing.
- **Real-socket streaming tests**: a ~100 MB streamed upload, a 1 GB upload rejected with `413`
  mid-stream, and a client aborting mid-upload.
- **An end-to-end test** that starts the actual server process.

Coverage is 100% (statements, branches, functions, lines), and CI enforces a minimum.

### Manual testing in the browser

Open http://localhost:5173 (after `npm run demo` or `docker compose up`). Click **Upload an MP3**,
or drag files straight from Finder onto the page. The page shows the frame count for the file you
uploaded, with its size, type, processing time and the raw JSON response.

- `.mp2` files are MPEG Layer II, which is out of scope, so they correctly return
  `422 UNSUPPORTED_MP3_FORMAT` ("Unsupported audio format: MPEG-1 Layer II").
- The tester (`tools/upload-tester/`) is a dev tool, separate from the API. Its tiny server serves the
  page and streams uploads through to the API, so the API needs no CORS or other changes.
  `API_URL`, `TESTER_PORT` and `TESTER_HOST` override the defaults.

The fixtures in `test/fixtures/` are regenerated with `scripts/generate-fixtures.sh` (needs `lame`
and `ffmpeg`). [`test/fixtures/README.md`](test/fixtures/README.md) lists each one's expected
count, checked with `mediainfo --Full` and `ffprobe -count_packets`.

---

## API

### `POST /file-upload`

Send the file as `multipart/form-data`, e.g. `curl -F "file=@song.mp3"`. The file is validated by
its **content**, not its name or declared type.

| Status  | `error.code`             | When                                                                                          |
| ------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| **200** | –                        | `{"frameCount": <integer>}`                                                                   |
| 400     | `MISSING_FILE`           | The form has no file                                                                          |
| 400     | `TOO_MANY_FILES`         | More than one file                                                                            |
| 400     | `BAD_REQUEST`            | Malformed or incomplete multipart body, or too many form fields                               |
| 404     | `NOT_FOUND`              | Unknown route                                                                                 |
| 405     | `METHOD_NOT_ALLOWED`     | Anything other than `POST` on `/file-upload` (includes an `Allow: POST` header)               |
| 413     | `FILE_TOO_LARGE`         | Over `MAX_FILE_SIZE_MB`. Rejected as soon as the limit is crossed, not after the whole upload |
| 415     | `UNSUPPORTED_MEDIA_TYPE` | The body isn't `multipart/form-data`                                                          |
| 422     | `EMPTY_FILE`             | The file is empty                                                                             |
| 422     | `INVALID_MP3`            | No MPEG-1 Layer III frames found                                                              |
| 422     | `UNSUPPORTED_MP3_FORMAT` | MPEG-2/2.5, Layer I/II or free-format audio (the message names the format)                    |
| 500     | `INTERNAL_SERVER_ERROR`  | Unexpected error. No internal details are exposed                                             |

Every response, including errors, has `Content-Type: application/json; charset=utf-8`.

---

## How it works

### Counting frames

An MP3 file is a sequence of self-contained **frames**, each starting with a 4-byte header. It has
no global index, so the only reliable way to count frames is to walk them:

1. **Skip ID3v2 tags** at the start by reading their declared size. A tag can hold megabytes of
   cover art, so it is skipped, never scanned.
2. **Find the first frame.** Scan for the 11-bit sync pattern, decode the header, and accept it only
   if **the next two frames follow it back to back** (or the chain reaches exactly the end of the
   file). This rejects junk bytes that happen to look like a header; mediainfo uses the same check.
3. **Walk frame to frame.** Frame length = `floor(144 × bitrate / sampleRate) + padding`, so each
   step reads 4 header bytes and jumps over the ~400-byte body without reading it.
4. **If sync is lost** (trailing ID3v1/APE tags, junk, or a tag between joined files), go back to
   step 2. A header is only trusted again once it is confirmed the same way.

Only MPEG-1 Layer III is counted, as the brief specifies. Other MPEG versions and layers are
recognised just far enough to return a clear `UNSUPPORTED_MP3_FORMAT` error.

### Why the sample returns 6089, not 6090

The sample contains **6090** frames with a valid header. The first one is a **Xing metadata frame**:
encoders (here FFmpeg) write it in place of audio to store the frame count and a seek table. It
decodes to silence and is not part of the audio, so this API doesn't count it. This agrees with
every reference:

| Source                                                          | Count |
| --------------------------------------------------------------- | ----- |
| `mediainfo --Full`, "Frame count" (the tool the brief suggests) | 6089  |
| `ffprobe -count_packets` / `-count_frames`                      | 6089  |
| The encoder's own count, stored in the Xing frame               | 6089  |
| Duration: 159.06 s × 44 100 Hz ÷ 1152 samples per frame         | 6089  |

### Streaming architecture

```
client ──multipart──▶ Fastify + @fastify/multipart ──file stream (chunks)──▶ Mp3FrameCounter.push(chunk)
                                                                                  │
                                                     { frameCount } ◀── finish() ─┘
```

- `Mp3FrameCounter` (`src/mp3/frame-counter.ts`) is a small state machine with no I/O and no HTTP
  knowledge. It works with chunks of any size.
- Across chunk boundaries it keeps at most two frames plus a header (≤ 2886 bytes). Everything else
  is either skipped by counting bytes or processed straight away.
- Memory per request is O(1) and time is O(n). Parsing a real MP3 costs about 0.3–0.5 s of CPU per GB,
  and hostile input (all `0xFF` bytes) about 2.8 s/GB.
  Counting overlaps the upload, so the response is ready as soon as the last byte arrives.

Measured through the production server (`node dist/server.js`) with `curl` on an M2:

| Upload | Frames    | Total time | Server peak RSS |
| ------ | --------- | ---------- | --------------- |
| 100 MB | 245 760   | 0.10 s     | 116 MB          |
| 1 GB   | 2 572 800 | 0.65 s     | 118 MB          |
| 3 GB   | 7 718 400 | 1.95 s     | 145 MB          |

### Key decisions

- **Fastify + `@fastify/multipart`.** It streams file parts without buffering, and errors thrown
  while reading the stream reach a single error handler. It also has solid TypeScript types and
  in-process testing via `inject()`. Express + multer and Hono both buffered whole uploads in memory
  (2–3 GB for a 1 GB file) when benchmarked.
- **Early rejection without hanging the client.** When an upload crosses the size limit, the server
  replies `413` straight away. It then keeps reading and discarding the rest of the upload for up to
  5 s (a "lingering close", as nginx and Apache do), so the client's TCP stack doesn't discard the
  reply.
- **One file, any field name**, except JavaScript prototype names (`__proto__`, `constructor`), which
  the multipart plugin rejects as a prototype-pollution guard. Extra text fields are ignored, so forms from Postman and similar
  tools still work. A second file is an explicit error rather than being silently ignored.
- **Only multipart bodies are parsed.** Fastify's default JSON and text parsers are removed, so any
  other content type gets a `415` without being read into memory. Text form fields are capped at
  1 KB each, and connections idle for 30 s are closed.
- **A strict success schema.** Fastify serialises the response through a JSON schema with
  `additionalProperties: false`, so the body is always exactly `{"frameCount": n}`.

---

## Project structure

```
src/
  server.ts                 process entry point: config, listen, graceful shutdown
  config.ts                 typed, validated environment config
  http/
    app.ts                  buildApp(): Fastify setup, error and 404 handlers
    file-upload-route.ts    POST /file-upload: streams the file part into the counter
    api-error.ts            ApiError, the error response shape, error factories
    error-mapping.ts        maps framework and multipart errors to ApiErrors
    lingering-close.ts      reply early without the client losing the response
    client-error.ts         JSON replies for malformed HTTP rejected before routing
  mp3/
    frame-header.ts         decodes the 32-bit MPEG-1 Layer III frame header
    id3v2.ts                reads ID3v2 tag sizes (so tags can be skipped)
    metadata-frame.ts       detects Xing/Info/VBRI metadata frames
    frame-counter.ts        streaming frame-counting state machine
test/                       unit, HTTP, streaming and end-to-end tests, plus fixtures
tools/
  upload-tester/            browser UI for manual testing + its streaming proxy server
  demo.ts                   `npm run demo`: starts the API and the tester together
scripts/generate-fixtures.sh
Dockerfile, compose.yaml    `docker compose up --build`: API + tester without a local Node
governance-check/           requirements, decisions, algorithm spec and validation records
```

---

## Limitations and future improvements

These were left out deliberately to keep the scope right for the exercise:

- **Raw-body uploads** (`curl -T song.mp3`, `Content-Type: audio/mpeg`) would take about 15 lines
  on top of the same counter. Today they get a `415` explaining how to send multipart.
- **Other MPEG versions and layers** (MPEG-2/2.5, Layer I/II) are out of scope by the brief. The
  header decoder and state machine would extend to them with extra length formulas.
- **Free-format bitrate** streams (very rare) are reported as unsupported, because their frame length
  can't be derived from the header.
- **A sample-rate change mid-stream** is treated as lost sync. Such a stream isn't valid MPEG audio,
  but a lenient mode could count both parts.
- **Truncated final frame:** counted if its header is intact, which matches `ffprobe` and decoders.
  An alternative policy would count only complete frames.
- **Found by adversarial testing, and left as known limitations:**
  - A multipart body followed by an epilogue larger than about 48 KB (bytes after the closing
    boundary, which RFC 2046 allows but no mainstream client sends) gets no response. This is a
    flow-control bug in `@fastify/busboy`'s Dicer parser: the paused write is never resumed after the
    final boundary. The 30 s idle timeout frees the socket. The right fix is upstream.
  - A client that trickles the body a byte every few seconds is held open. A hard request timeout
    would also cut off legitimately slow large uploads, so a minimum-rate rule belongs in a reverse
    proxy (e.g. nginx `client_body_timeout`).
  - `Expect:` values other than `100-continue` are answered by Node itself with a bare `417`.
- **Operations:** rate limiting, request timeouts tuned for slow clients, metrics, a health-check
  endpoint and a Helm chart would come next for production use. The service is stateless, so it
  scales horizontally: run more API containers behind a load balancer.

## Project governance

[`governance-check/`](governance-check/) holds the working record behind this solution:

- the verbatim brief broken into traceable requirement IDs
- non-negotiable rules
- the algorithm specification
- the architecture decision and the alternatives that were benchmarked
- a log of every validation run
