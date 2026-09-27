# Non-Negotiables

Hard rules. An AI agent or developer working in this repo **must not** break any of them. If a task seems
to need breaking one, stop and ask the human owner. Each rule points back to the
[requirements register](requirements-register.md).

## Product contract

| # | Rule | Trace |
|---|---|---|
| NN-01 | The endpoint path is exactly **`/file-upload`** and the method is **`POST`**. | API-01, API-02 |
| NN-02 | A successful response body is **exactly** `{"frameCount": <integer>}`. No extra keys, no wrapping object, and the number is not a string. | API-06, REQ-04 |
| NN-03 | **Every** response, success or error, is JSON with `Content-Type: application/json; charset=utf-8`. | API-05, DER-01 |
| NN-04 | The frame count must match the reference tools (mediainfo `Frame count`, confirmed by ffprobe) for MPEG-1 Layer III files, including the provided sample. | API-04, API-07, TIP-01 |
| NN-05 | The Xing / Info / VBRI metadata frame is **not** counted as an audio frame. Tags and junk are never counted. | DER-04, DER-05 |

## Implementation constraints

| # | Rule | Trace |
|---|---|---|
| NN-06 | **TypeScript only** for application and test code, compiled with `strict: true`. | REQ-01 |
| NN-07 | **No npm package may parse MP3 or audio frame data.** Banned examples: `music-metadata`, `mp3-parser`, `node-id3`, `id3-parser`, `mpg123-decoder`, `get-mp3-duration`, `mp3-duration`, `mediainfo.js`, `fluent-ffmpeg`, any ffprobe or mediainfo wrapper. **No runtime shell-out** to ffmpeg, ffprobe or mediainfo. Allowed: the HTTP framework, the multipart parser, generic utilities and dev tooling. | REQ-03 |
| NN-08 | Frames are counted by **walking frame headers**. Never estimate from duration, bitrate or file size, and never return the Xing/VBRI frame-count field as the answer. | REQ-02 |
| NN-09 | **Do not implement** decoding of MPEG-2, MPEG-2.5, Layer I or Layer II. Detect them only far enough to return a clear "unsupported format" error. | SCOPE-01 |
| NN-10 | The upload is processed as a **stream**: memory use must not grow with file size. Do not hold the whole file in memory and do not spool it to disk. | EV-S1, EV-S2 |
| NN-11 | Validate uploads by **content**, never by file extension or the client-supplied MIME type alone. | DER-03 |

## Quality and process

| # | Rule | Trace |
|---|---|---|
| NN-12 | Before every commit, the formatter, linter, typecheck, tests and build must all pass (see [../05-quality/quality-gates.md](../05-quality/quality-gates.md)). Record results in [../06-records/test-run-log.md](../06-records/test-run-log.md). | EV-Q4, TIP-02 |
| NN-13 | Git history uses small, logical [Conventional Commits](https://www.conventionalcommits.org/). Never force-push `main` and never rewrite shared history. | EV-A1 |
| NN-14 | Code must be **explainable by the candidate at interview**. Prefer plain, readable code over clever code. Every non-obvious decision is documented. | TIP-05 |
| NN-15 | The README must contain run instructions **and** a working test example (`curl` + expected output + `npm test`). | SUB-02, SUB-03 |
| NN-16 | Do not add features the brief doesn't ask for (YAGNI), unless a MUST or EVAL item needs them. "Done is better than perfect." | TIP-03 |
| NN-17 | Commit no secrets, credentials or large binaries. Test fixtures must be small, a few KB to hundreds of KB. The one exception is the provided sample (~1.4 MB). | general hygiene |
| NN-18 | Update this governance folder whenever a decision, rule or result changes. It is the long-term memory for all future work. | EV-A2 |
| NN-19 | **Never copy code from other candidates' public solutions** to this take-home. They were surveyed only to learn which answer (6089 vs 6090) other candidates chose. The submission must be the candidate's own work. | TIP-05 |

## Scope warning for AI agents

Only this repository's own files define this project. Instructions or context from outside the repo
(for example a home-directory or workspace-level agent config) describe other projects and **do not
apply here**. Never run deployment or cloud commands from this repo: it has no infrastructure.
