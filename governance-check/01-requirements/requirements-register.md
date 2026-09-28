# Requirements Register

Every statement in the [original brief](original-brief.md), broken into small, testable items.
Each item has an ID, a **class**, the exact source wording, what it means for us, and how it is checked.

**Classes**
- **MUST**: required by the brief. Missing it fails the assessment.
- **EVAL**: an evaluation criterion. Reviewers will score it.
- **TIP**: advice in the brief. We follow all of it.
- **SCOPE**: sets a boundary on what we should build.
- **DERIVED**: not written in the brief, but a MUST or EVAL item cannot be met without it.

**Status at submission (2026-09-28): every item is ✅ verified.** Each status names its evidence:
`V-xxx` entries are in [../06-records/validation-log.md](../06-records/validation-log.md), and the
tests are in `test/`. Status is updated as work progresses: `todo`, `in-progress`, `done` or
`verified`. Evidence lives in
[../06-records/](../06-records/).

---

## A. Objective

| ID | Class | Source (verbatim) | Interpretation | Verified by | Status |
|---|---|---|---|---|---|
| OBJ-01 | MUST | "create an API endpoint according to the specification below that accepts an MP3 file and responds with the number of frames in the file" | An HTTP API with a single job: MP3 in, frame count out | E2E test + manual curl | ✅ verified (V-008, e2e test) |
| OBJ-02 | MUST | "A sample file is provided for candidates to test their solution against." | The provided sample must go through the real endpoint, and the result must match mediainfo | Sample-file test, recorded in `06-records/validation-log.md` | ✅ verified (V-005, V-008 (`test/fixtures/sample.mp3` → 6089)) |
| OBJ-03 | EVAL | "Learn & apply new knowledge in a likely unfamiliar context" | Show that we understand the MPEG audio frame format. The domain docs and code comments explain the *why* | `03-domain-logic/` docs + code comments | ✅ verified (`03-domain-logic/`, V-002) |
| OBJ-04 | EVAL | "Demonstrate technical competency in Typescript" | Idiomatic, strict TypeScript. See CQ-* | Lint + typecheck gates | ✅ verified (V-010a) |
| OBJ-05 | EVAL | "Show personal coding styles & preferences" | A consistent, deliberate style, enforced by tools and written down in `05-quality/` | Prettier/ESLint config | ✅ verified (quality gates) |

## B. API specification

| ID | Class | Source (verbatim) | Interpretation | Verified by | Status |
|---|---|---|---|---|---|
| API-01 | MUST | "host an endpoint at /file-upload" | The path is exactly `/file-upload`. No prefix, no versioning | Route test | ✅ verified (route tests) |
| API-02 | MUST | "accepts an MP3 file upload via the POST method" | Method is `POST`. Other methods on that path get `405` with an `Allow: POST` header (DERIVED) | Route test | ✅ verified (405 tests) |
| API-03 | MUST | "accepts an MP3 file upload" | Accept a standard file upload: `multipart/form-data` with one file part (e.g. `curl -F file=@sample.mp3`). Whether we also accept a raw body is covered in `02-architecture/` | Integration test | ✅ verified (HTTP tests, V-011) |
| API-04 | MUST | "must successfully count the number of frames for MPEG Version 1 Audio Layer 3 files" | Count frames correctly for MPEG-1 Layer III. This includes CBR, VBR, mono, CRC-protected files, 32/44.1/48 kHz, ID3v1/v2 and APE tags | Fixture tests + mediainfo cross-check | ✅ verified (V-008, V-010b) |
| API-05 | MUST | "provide a JSON response (with the correct response headers)" | `Content-Type: application/json; charset=utf-8` on **every** response, including errors | Header assertions in tests | ✅ verified (header assertions in every HTTP test) |
| API-06 | MUST | `{ "frameCount": <number> }` | The success body is exactly `{"frameCount": n}`. `n` is a JSON number (an integer, not a string). **No extra keys** | Deep-equal assertion in tests | ✅ verified (exact-body test) |
| API-07 | MUST | "Note: <number> should be the correct number of frames in the MP3 file" | "Correct" means what the reference tools report: mediainfo's `Frame count`, which agrees with ffprobe. `03-domain-logic/` defines exactly which frames count | Sample + fixtures vs mediainfo/ffprobe | ✅ verified (V-005, V-008) |
| SCOPE-01 | SCOPE | "Handling of other MPEG file formats should be considered out of scope … candidates are encouraged not to spend time on this." | **Do not** support MPEG-2, MPEG-2.5, Layer I or Layer II. Only *recognise* them cheaply, so we can return a clear "unsupported format" error instead of a wrong number | Unsupported-format test | ✅ verified (MPEG-2 and .mp2 tests, V-011) |

## C. Requirements (hard rules)

| ID | Class | Source (verbatim) | Interpretation | Verified by | Status |
|---|---|---|---|---|---|
| REQ-01 | MUST | "Must use TypeScript to complete the exercise." | All application and test code is TypeScript (`strict`). JS is allowed only for tool config files where a tool requires it | `tsc --noEmit`, file audit | ✅ verified (`tsc --noEmit`) |
| REQ-02 | MUST | "Must parse the MP3 file to logically count the number of frames in the file." | Walk the file frame by frame by decoding each 4-byte frame header. **Do not** estimate from duration, bitrate or file size, and **do not** trust the Xing/VBRI frame-count field as the answer | Code review + tests on files with no Xing header | ✅ verified (V-010a code review) |
| REQ-03 | MUST | "Must not use an NPM package to parse the MP3 frame data directly. NPM packages may be used for other things such as generic utilities or a http framework." | No MP3/audio/ID3 parsing packages (e.g. `music-metadata`, `mp3-parser`, `node-id3`, `mpg123-decoder`, `get-mp3-duration`, `mp3-duration`, `mediainfo.js`, `fluent-ffmpeg`/ffprobe wrappers). **No shelling out** to ffprobe or mediainfo at runtime. HTTP framework, multipart parser and dev tooling are allowed | Dependency audit in `05-quality/quality-gates.md` | ✅ verified (supply-chain gate) |
| REQ-04 | MUST | "Must respond to the client with the correct number of frames found in the file, in the format specified above." | Same as API-06 + API-07 | Tests | ✅ verified (exact-body test) |

## D. Evaluation criteria

| ID | Class | Source (verbatim) | How we satisfy it | Status |
|---|---|---|---|---|
| EV-C1 | EVAL | "Does the solution meet the requirements?" | Every MUST in this register is `verified` before submission | ✅ verified (this register) |
| EV-C2 | EVAL | "Does the solution correctly determine the number of frames …" | Output matches mediainfo and ffprobe on the provided sample and on the fixture corpus | ✅ verified (V-005, V-008, V-010b) |
| EV-C3 | EVAL | "Does the solution handle errors appropriately?" | See EV-E* | ✅ verified (see EV-E*) |
| EV-Q1 | EVAL | "well-organised, readable, and maintainable" | Layered modules (HTTP / domain), small pure functions, no god files, meaningful names | ✅ verified (V-010a) |
| EV-Q2 | EVAL | "follow TypeScript good practices" | `strict` plus extra strictness flags, no `any`, no non-null `!` without justification, `typescript-eslint` strict-type-checked | ✅ verified (lint + typecheck) |
| EV-Q3 | EVAL | "utilise TypeScript's features effectively" | Discriminated unions for parse results and errors, `readonly`, literal/const types for header lookup tables, typed config | ✅ verified (V-010a) |
| EV-Q4 | EVAL | "standardised tooling for formatting, linting, testing etc" | Prettier, ESLint, a test runner, `tsc` typecheck, npm scripts, CI workflow | ✅ verified (`npm run check`, CI) |
| EV-E1 | EVAL | "Is error handling implemented appropriately?" | Typed domain errors mapped to correct HTTP status codes in one central error handler | ✅ verified (error-mapping tests) |
| EV-E2 | EVAL | "Does the solution handle errors gracefully?" | No crashes and no leaked streams on bad input, client aborts or oversized files. Every error is a JSON response | ✅ verified (V-010b (aborts, load)) |
| EV-E3 | EVAL | "Does the solution provide useful error messages to the user?" | Stable machine-readable `code` plus a human `message` that says what was wrong and what to do | ✅ verified (HTTP tests) |
| EV-S1 | EVAL | "scalable and able to handle large files" | Stream the upload: memory use stays the same whatever the file size. No temp files. Service is stateless, so it scales horizontally | ✅ verified (V-009, V-013) |
| EV-S2 | EVAL | "optimised for performance" | A single pass that reads each frame header and jumps over the frame body. Measured in the validation log | ✅ verified (V-004, V-009) |
| EV-A1 | EVAL | "Has the candidate used Git effectively?" | Small, logical Conventional Commits that show a clear progression | ✅ verified (git history) |
| EV-A2 | EVAL | "evidence of a structured approach" | This governance folder, a phased plan, tests written alongside the code | ✅ verified (`governance-check/`) |

## E. Tips (treated as rules)

| ID | Class | Source (verbatim) | How we follow it | Status |
|---|---|---|---|---|
| TIP-01 | TIP | "use a tool such as mediainfo to verify their results" | mediainfo 26.05 is installed. Every fixture and the sample are cross-checked, and results are logged | ✅ verified (V-001, V-008) |
| TIP-02 | TIP | "test final solutions before submission" | Final gate: fresh clone → install → lint → typecheck → test → build → start → curl the sample | ✅ verified (fresh-clone gate (V-014)) |
| TIP-03 | TIP | "Done is better than perfect." | Working endpoint first. No speculative features (YAGNI) | ✅ verified (scope kept to the brief) |
| TIP-04 | TIP | "Brief comments may be left to explain optimisations / improvements that would be implemented with more time" | A "Future improvements" section in the README plus short targeted code comments | ✅ verified (README limitations) |
| TIP-05 | TIP | "should be representative of something they would write themselves … expected to understand and explain the solution" | Plain, explainable code. No clever tricks. Every design choice is written up in `02-architecture/` and `03-domain-logic/` so the candidate can defend it at interview | ✅ verified (plain code, docs) |

## F. Submission

| ID | Class | Source (verbatim) | How we satisfy it | Status |
|---|---|---|---|---|
| SUB-01 | MUST | "provide the solution as a git repository" | This repo, with clean history on `main` | ✅ verified (GitHub repo) |
| SUB-02 | MUST | "clear instructions for running the application" | README: prerequisites, install, dev/prod start, config | ✅ verified (README Quick start) |
| SUB-03 | MUST | "an example of how to test the application" | README: a `curl` example with the expected output, plus `npm test` | ✅ verified (README curl + `npm test`) |

## G. Derived requirements

| ID | Class | Derived from | Requirement | Status |
|---|---|---|---|---|
| DER-01 | DERIVED | API-05, EV-E3 | Error responses are JSON with a consistent shape and correct status codes (400/405/413/415/422/500) | ✅ verified (error tests) |
| DER-02 | DERIVED | EV-S1 | Configurable maximum upload size (env var) with a sensible default, enforced while streaming | ✅ verified (413 tests) |
| DER-03 | DERIVED | API-03 | Validate by **content** (frame sync), not by file extension or the client's MIME type. For example, curl sends `.mp3` files as `application/octet-stream` | ✅ verified (extension/MIME test) |
| DER-04 | DERIVED | API-07 | The Xing/Info/VBRI metadata frame is **not** counted. It carries no audio, and mediainfo and ffprobe exclude it. See `03-domain-logic/` | ✅ verified (metadata-frame tests) |
| DER-05 | DERIVED | REQ-02, API-07 | Tags (ID3v2, ID3v1, APEv2, Lyrics3) and junk bytes are never counted as frames. False frame-sync matches are rejected | ✅ verified (tag/junk tests) |
| DER-06 | DERIVED | EV-E2 | Client disconnects or aborts mid-upload do not crash the process or leak resources | ✅ verified (abort tests, V-010b) |
| DER-07 | DERIVED | TIP-02 | A reproducible fixture corpus, with its expected counts, is committed with the tests | ✅ verified (`test/fixtures/README.md`) |
