# Decision Log

Append-only and chronological. Each entry records the decision, the alternatives, the evidence and the
status. Later entries may supersede earlier ones; they never delete them.

---

### D-001: Governance folder name uses the correct spelling `governance-check`
- **Date:** 2026-09-26
- **Context:** The owner's request spelled it both "governence-check" and "governance-check".
- **Decision:** `governance-check/`, the correct spelling, because this repo is a submission reviewed by
  an employer.
- **Status:** Accepted (owner may override).

### D-002: "Frame count" means audio frames; the Xing/Info/VBRI metadata frame is excluded
- **Date:** 2026-09-26
- **Context:** LAME and FFmpeg put a Xing (VBR) or Info (CBR) frame first. It has a valid MPEG frame
  header but no audio. The brief says the count must be "correct" and suggests verifying with mediainfo.
- **Evidence:** On every LAME/FFmpeg fixture, mediainfo `--Full` "Frame count", ffprobe audio packets,
  the Xing frames field and mediainfo's duration all agree on N. The file physically holds N+1 syncable
  frames. `mediainfo --ParseSpeed=1` is inconsistent: N+1 for CBR "Info" files, N for VBR "Xing" files.
  See [../03-domain-logic/ground-truth.md](../03-domain-logic/ground-truth.md).
- **Decision:** Exclude the metadata frame (DER-04 / NN-05).
- **Alternatives:** Count every syncable frame (N+1). Rejected: it disagrees with mediainfo's reported
  "Frame count", ffprobe and the encoder's own count.
- **Status:** Accepted, pending confirmation from the independent spec researcher and the provided
  sample file.

### D-003: Test fixtures are synthetic, generated with lame and FFmpeg
- **Date:** 2026-09-26
- **Context:** Only one real sample is provided (not yet received). We need controlled coverage of edge
  cases.
- **Decision:** Generate a corpus of 22 files covering CBR/VBR, mono/stereo, CRC, 32/44.1/48 kHz,
  ID3v1/v2/APEv2 tags, a large album-art tag, junk with a fake sync, a truncated file, MPEG-2 and
  non-MP3 inputs. Ground truth comes from mediainfo and ffprobe.
- **Status:** Accepted.

### D-004: Dev tooling installed on the machine
- **Date:** 2026-09-26
- **Decision:** Installed `mediainfo` 26.05 via Homebrew (brief tip TIP-01). ffmpeg, ffprobe and lame
  were already present. They are used **only** for verification and fixture generation, never by the
  application at runtime (NN-07).
- **Status:** Done.

### D-005: Streaming single-pass parser; Fastify 5 + @fastify/multipart
- **Date:** 2026-09-26
- **Decision:** Parse the multipart file stream chunk by chunk in an I/O-free state machine. No
  whole-file buffering and no temp files. Fastify 5 + @fastify/multipart for HTTP.
- **Evidence:** V-003, V-004, V-006. See
  [../02-architecture/alternatives-considered.md](../02-architecture/alternatives-considered.md).
- **Status:** Accepted, recorded as ADR-001.

### D-006: Accept multipart/form-data only (one file, any field name)
- **Date:** 2026-09-26
- **Decision:** `multipart/form-data` is the standard meaning of "file upload". Any file field name is
  accepted and extra text fields are ignored (Postman-friendly). A second file → 400
  `TOO_MANY_FILES` (explicit, not silently ignored). Raw bodies → 415 with a message showing the
  correct `curl -F` usage.
- **Alternatives:** Also accept raw `audio/mpeg` bodies (~15 lines). Deferred (YAGNI, NN-16) and
  listed in the README's future improvements.
- **Status:** Accepted.

### D-007: Target Node 24 LTS (engines ≥ 22.13) with current tooling
- **Date:** 2026-09-26
- **Context:** The dev machine has Node 20.13.1, which has been EOL since 2026-04-30. The
  Node-20-compatible toolchain (Vitest 4.0.18 + Vite 6, ESLint 9) installed with `npm audit`
  reporting 3 vulnerabilities (2 critical; GHSA-82fw-gwwq-j7x9 in Vitest ≤ 4.1.10). ESLint 9 is
  marked unsupported. The npm that ships with Node 20.13 crashes installing Vitest ≥ 4.1.
- **Decision:** Node 24 LTS (`.nvmrc` = 24, `engines` ≥ 22.13), Vitest 5.0.2, ESLint 10.11,
  TypeScript 6.0.3, typescript-eslint 8.70.1. Result: **0 vulnerabilities**. CI matrix: Node 22 and 24.
- **Impact on owner:** Install Node 24 locally to run the project (e.g. `brew install node@24`). This
  session validated with a scratchpad Node 24.21.0 binary; the system was not changed.
- **Status:** Accepted (owner may override).

### D-008: Lingering close for early error replies
- **Date:** 2026-09-26
- **Decision:** When replying before the upload has finished (e.g. 413), drain and discard the rest
  of the request, and destroy the socket after 5 s if the client keeps sending. Don't send
  `Connection: close`, which triggers Node's immediate `destroySoon()` and risks a TCP reset.
- **Evidence:** V-007.
- **Status:** Accepted.

### D-009: Count a truncated final frame (header intact)
- **Date:** 2026-09-26
- **Decision:** If the last frame's 4-byte header is valid and consistent but its body is cut short,
  count it and log `truncatedFinalFrame: true`.
- **Evidence:** ffprobe counts it at any truncation length. mediainfo counts it on the fixture.
  FFmpeg's decoder outputs its 1152 samples. mpg123 drops it (the documented alternative). Both
  prototypes and the research agent recommended counting it.
- **Status:** Accepted.

### D-010: Error contract
- **Date:** 2026-09-26
- **Decision:** Every error is `{"error":{"code","message"}}` with `application/json`. The code is
  stable and machine-readable; the message is human-readable and actionable.
  - 400: `MISSING_FILE`, `TOO_MANY_FILES`, `BAD_REQUEST`
  - 404: `NOT_FOUND`
  - 405: `METHOD_NOT_ALLOWED`, with `Allow: POST`
  - 413: `FILE_TOO_LARGE`
  - 415: `UNSUPPORTED_MEDIA_TYPE`
  - 422: `EMPTY_FILE`, `INVALID_MP3`, `UNSUPPORTED_MP3_FORMAT`. 422 because the request is well-formed
    but its content can't be processed.
  - 500: `INTERNAL_SERVER_ERROR`, with a generic message that never leaks internals.
- **Alternative:** RFC 9457 `application/problem+json`. Rejected to keep one media type
  (`application/json`) across all responses, as the brief asks for "the correct response headers".
- **Status:** Accepted.

### D-011: Fixtures = encoder-generated files + synthetic edge cases built in tests
- **Date:** 2026-09-26
- **Decision:** Commit 15 small encoder-produced files (40–400 KB, regenerable with
  `scripts/generate-fixtures.sh`, fixed noise seed) plus the provided sample. Tag, junk, truncation,
  big-tag and concatenation cases are built programmatically in the tests.
- **Status:** Accepted.

### D-012: Confirm a searched candidate with 2 following headers (was 1)
- **Date:** 2026-09-26
- **Context:** The V-010 audit estimated a false-confirmation rate of ~1e-10 per byte with one
  following header. That is about a 13% chance that a 1 GB random upload gets a small count instead
  of 422, and an MPEG-2 file could be miscounted in the same way.
- **Decision:** `CONFIRMING_HEADERS = 2` (MediaInfo's 3-frame chain). Reaching exactly end-of-stream
  still confirms. The carry bound rises from 1445 to 2886 bytes.
- **Trade-off:** A file of only 1–2 frames followed by 1–3 junk bytes is now reported as invalid.
  Pathological, and documented.
- **Status:** Accepted. All fixtures, the sample and the live-server comparison (24/24) are unchanged.

### D-013: HTTP hardening from the V-010 audit
- **Date:** 2026-09-26
- **Decision:**
  - `removeAllContentTypeParsers()`, so non-multipart bodies get a 415 without being buffered (was:
    a 1.4 MB text body was buffered and got a 413 labelled `BAD_REQUEST`).
  - `frameworkErrors` sends the JSON error shape for pre-routing errors (e.g. a bad URL).
  - Generic 4xx codes are derived from the status (413 → `FILE_TOO_LARGE`, 415 →
    `UNSUPPORTED_MEDIA_TYPE`, …).
  - `connectionTimeout: 30 s` (idle only; slow active uploads are unaffected).
  - `limits.fieldSize: 1 KB` (ignored text fields no longer buffer up to 1 MB each).
  - A truncated final frame is logged at `warn`.
  - `OPTIONS` → 405.
  - The shutdown grace timer is 10 s, with a `.catch`.
  - The error handler is typed `Error` and narrowed safely.
  - Count-failure mapping moved into `error-mapping.ts`.
  - `BYTES_PER_MEGABYTE` is defined once.
  - `LogLevel` is a literal union type.
  - The default `MAX_FILE_SIZE_MB` is raised from 1024 to 2048. A 1.075 GB test upload exceeded
    1 GiB, and memory is flat regardless.
- **Not done (documented):** a `clientErrorHandler` for malformed HTTP at Node's parser level (a
  garbage request line or oversized headers). Those never reach the application, and Fastify's
  default reply there is still JSON.
- **Status:** Accepted.

### D-014a: Manual upload tester as a separate dev tool
- **Date:** 2026-09-26
- **Context:** The owner asked for a frontend to test the algorithm with real MP3 (and MP2) files.
- **Decision:** `tools/upload-tester/` holds a static page plus a small node:http server
  (TypeScript, no new dependencies) that serves the page, streams `POST /file-upload` through to the
  API, and serves the repo fixtures for a one-click "Run all fixtures" check. The API is not modified
  (no CORS, no new routes), so the graded contract stays exact. The tester is type-checked and
  linted with the rest of the repo but excluded from coverage (it isn't `src/`). Run it with
  `npm run tester`.
- **Status:** Accepted.

### D-014b: Local upload tester (dev tool) in tools/upload-tester/
- **Date:** 2026-09-26
- **Context:** The owner asked for a frontend to test the algorithm by hand, including with .mp2 files.
- **Decision:** A standalone TypeScript node:http server plus an inline-HTML page. It serves the page,
  streams `/file-upload` through to the API (a same-origin proxy, so no CORS change), and offers a
  "run all fixtures" view that serves only allowlisted fixture names. **Nothing in `src/` changed.**
  The graded API contract is untouched. `npm run tester`.
- **Verified:** Proxy results are byte-identical to calling the API directly for 6 generated .mp2
  files (422 `UNSUPPORTED_MP3_FORMAT`, "MPEG-1 Layer II" / "MPEG-2 Layer II") and all 16 fixtures.
  The proxy stays flat at 155–170 MB RSS on 300 MB and 1.2 GB uploads. A path-traversal attempt
  gets 404. `npm run check` is green (179 tests, 100% coverage).
- **Known gap:** The fixture table in `server.ts` duplicates `test/fixtures/README.md` and must be
  kept in sync by hand. Drag and drop and keyboard-only use were not browser-tested.
- **Status:** Accepted. Not required by the brief; the owner may drop `tools/` from the submission.

### D-015a: Upload tester simplified at the owner's request
- **Date:** 2026-09-26
- **Decision:**
  - "Run all fixtures" is removed, with its server routes. The page now shows results only for the
    file(s) just uploaded: the frame count plus file details (size, type, last modified, processing
    time, raw response). Each new upload replaces the previous result.
  - The file input declares `accept=".mp3,.mp2,.mpga,audio/mpeg,audio/mp3,audio/*"`, so the macOS
    file dialog enables MP3 files.
  - Drag and drop from Finder works anywhere on the page: `dragenter` and `dragover` are both
    cancelled, `dropEffect = copy`, and an overlay appears while dragging.
  - The page is read on each request, so a running tester never serves a stale page.
- **Supersedes:** the fixture-runner part of D-014a/D-014b.
- **Status:** Accepted.

### D-015b: Fixes and accepted limitations from the adversarial campaign (V-010b)
- **Date:** 2026-09-26
- **Fixed:**
  1. Protocol-level errors (garbage request line, bad headers, CL+TE, negative length, 431) now get
     the JSON error shape with a charset, via `clientErrorHandler` in `src/http/client-error.ts`.
  2. Worst-case search cost on all-0xFF input went from 15.9 to 2.8 s/GB. `findFrameSync()` only
     decodes positions where `0xFF` is followed by `0xFA`/`0xFB`.
- **Amended D-006:** "Any field name" excludes JavaScript prototype names (`__proto__`,
  `constructor`, `hasOwnProperty`). @fastify/multipart rejects them with 400 as a
  prototype-pollution guard. We keep the guard.
- **Accepted, documented limitations:**
  - An epilogue over ~48 KB after the closing boundary gets no response (a flow-control bug in
    @fastify/busboy's Dicer; the idle timeout frees the socket; to be fixed upstream).
  - Slow-trickle bodies are held open (min-rate enforcement belongs in a reverse proxy).
  - `Expect: <not 100-continue>` gets Node's bare 417.
  - Fewer than 3 frames after a resync point are not counted (a consequence of D-012; never
    affects normal files).
- **Status:** Accepted.

### D-016: Numbering correction
- **Date:** 2026-09-26
- **Context:** Two agents appended entries in parallel, which produced two D-014s and two D-015s.
- **Decision:** They are relabelled D-014a/D-014b and D-015a/D-015b; their content is unchanged.
  References to "D-015" in V-010b mean D-015b.
- **Status:** Done.

### D-017: Easy local run: Docker Compose + one-command `npm run demo`
- **Date:** 2026-09-27
- **Context:** The owner wants anyone who clones the repo to run it easily. The project needs Node
  ≥ 22.13, which many machines don't have.
- **Decision:** Offer both, each tested:
  - **Docker:** a multi-stage `Dockerfile` with an `api` target (slim, runtime dependencies only,
    non-root `node` user, 179 MB) and a `tester` target. `compose.yaml` wires them together:
    `docker compose up --build` gives the API on :3000 and the tester on :5173 with no local Node.
  - **Native:** `npm run demo` builds and starts both servers via `tools/demo.ts` (child processes,
    cross-platform, stops both on Ctrl+C). `.npmrc` sets `engine-strict=true`, so an old Node fails
    at `npm ci` with the required version instead of a confusing error later.
- **Why not Docker only:** tests, lint and live reload are the everyday developer loop and are
  faster natively. Docker is for "just run it".
- **Status:** Accepted.

### D-018: One-time history rewrite before submission (exception to NN-13)
- **Date:** 2026-09-28
- **Context:** The owner asked for the AI co-author trailer to be removed from every commit message.
  Messages can only be changed by rewriting history.
- **Decision:** Rewrite `main` once, removing only that trailer line from each message. Authors,
  dates, order and file contents are unchanged, and the final tree is identical (verified by tree
  hash). A local backup ref was kept, and the push used `--force-with-lease`. Future commits carry
  no trailer.
- **Why this is allowed:** NN-13 forbids rewriting shared history. The repo had no other
  contributors and nothing depends on the old commit IDs. The owner explicitly requested it.
- **Status:** Pending. The rewrite is a destructive git operation, so the owner runs it themselves.
