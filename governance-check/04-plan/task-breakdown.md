# Task Breakdown & Phased Plan

Each task says which requirement IDs it satisfies (see
[../01-requirements/requirements-register.md](../01-requirements/requirements-register.md)) and when it
counts as done. A phase does not start until the previous phase's exit gate passes.

Status legend: ☐ todo · ◐ in progress · ☑ done

---

## Phase 0: Requirements & governance

| # | Task | Satisfies | Done when | Status |
|---|---|---|---|---|
| 0.1 | Record the verbatim brief | all | `original-brief.md` exists | ☑ |
| 0.2 | Break the brief into small, traceable requirements | all | `requirements-register.md` covers every sentence | ☑ |
| 0.3 | Write the non-negotiables | all | `non-negotiables.md` | ☑ |
| 0.4 | Initialise the git repo (`main`) | SUB-01 | `git init` done | ☑ |
| 0.5 | Obtain the **provided sample MP3** | OBJ-02 | File placed in the repo and its mediainfo values recorded | ☑ in `test/fixtures/sample.mp3`; the owner's copy has the identical SHA-1 (V-014) |

## Phase 1: Architecture & counting logic (validated)

| # | Task | Satisfies | Done when | Status |
|---|---|---|---|---|
| 1.1 | Build a fixture corpus plus ground truth (mediainfo/ffprobe) | TIP-01, DER-07 | `03-domain-logic/ground-truth.md` | ☑ |
| 1.2 | Research the spec and reference-tool behaviour (independent agent) | OBJ-03, API-07 | Findings in `03-domain-logic/` | ☑ |
| 1.3 | Prototype the non-streaming parsers (buffered, seek) and benchmark them | EV-S1/S2 | Numbers in `06-records/validation-log.md` | ☑ |
| 1.4 | Prototype the streaming parser: chunk fuzzing and memory/throughput | EV-S1/S2 | Same | ☑ |
| 1.5 | Evaluate the HTTP stack: streaming proof, error behaviour, versions | EV-S1, EV-E* | Same | ☑ |
| 1.6 | Write the ADR, tech stack, alternatives considered and algorithm spec | EV-A2 | `02-architecture/`, `03-domain-logic/` | ☑ |
| 1.7 | Adversarial review of the chosen design | all | Review recorded and objections resolved | ☑ (V-010a audit, V-010b adversarial campaign) |
| **Gate** | Human owner approves the architecture and logic | — | — | ☑ owner instructed to proceed with implementation and validation |

## Phase 2: Scaffold & tooling ☑

| # | Task | Satisfies | Done when |
|---|---|---|---|
| 2.1 | `package.json` (scripts, `engines`), `.nvmrc`, `.gitignore`, `.editorconfig` | EV-Q4 | `npm ci` works on a fresh clone |
| 2.2 | `tsconfig.json`: strict plus extra flags, build output in `dist/` | REQ-01, EV-Q2 | `npm run typecheck` passes |
| 2.3 | ESLint (flat config + typescript-eslint strict-type-checked) and Prettier | EV-Q4 | `npm run lint` and `npm run format:check` pass |
| 2.4 | Test runner configured, with a coverage script | EV-Q4 | `npm test` runs |
| 2.5 | CI workflow running lint, typecheck, test and build | EV-Q4 | Workflow file present |

## Phase 3: Domain, frame header decoding (pure functions) ☑

| # | Task | Satisfies | Done when |
|---|---|---|---|
| 3.1 | Header lookup tables (bitrate, sample rate) as `readonly` constants | API-04, EV-Q3 | Unit-tested |
| 3.2 | `parseFrameHeader(bytes, offset)` returns a typed header or an invalid reason. Validates sync, version, layer, bitrate, sample rate and emphasis | API-04, SCOPE-01 | Unit tests: valid, each invalid field, MPEG-2 detection |
| 3.3 | Frame length and side-info size helpers | API-04 | Unit tests against known values (e.g. 128k/44.1k is 417/418 bytes) |
| 3.4 | ID3v2 tag size parsing (syncsafe integer, footer flag) | DER-05 | Unit tests |
| 3.5 | Xing/Info/VBRI detection in the first frame | DER-04 | Unit tests: stereo, mono and CRC offsets |

## Phase 4: Domain, streaming frame counter ☑

| # | Task | Satisfies | Done when |
|---|---|---|---|
| 4.1 | Incremental counter (`push(chunk)` / `finish()`) with bounded carry-over buffer | EV-S1, NN-10 | Unit tests |
| 4.2 | Skip ID3v2 by counting bytes, never buffering the tag | DER-05, EV-S1 | `id3v2_bigart` fixture passes |
| 4.3 | First-frame confirmation and resync with confirmation (rejects false syncs) | DER-05 | `junk_after_id3` fixture passes |
| 4.4 | End-of-stream handling: trailing tags, truncated final frame policy | DER-05 | `apev2_id3v1` and `truncated` fixtures pass |
| 4.5 | Typed result: success, `NO_FRAMES` or `UNSUPPORTED_FORMAT` | EV-Q3, EV-E3 | Unit tests |
| 4.6 | Chunk-boundary fuzz test: same result for every chunking | EV-C2 | Fuzz test in suite |

## Phase 5: HTTP layer ☑

| # | Task | Satisfies | Done when |
|---|---|---|---|
| 5.1 | App factory, `buildApp(config)`, kept separate from `server.ts` (the listen step) | EV-Q1 | App is testable in-process |
| 5.2 | Typed config from env (port, host, max file size) with validation | DER-02 | Unit test |
| 5.3 | `POST /file-upload`: streams the multipart file part into the counter and returns `{frameCount}` | API-01..06 | Integration tests |
| 5.4 | Central error handler: domain and HTTP errors mapped to JSON `{error:{code,message}}` with correct status | EV-E*, DER-01 | Tests for 400/405/413/415/422/404 |
| 5.5 | Abort and oversize handling, no leaks | DER-06 | Tests |

## Phase 6: Verification ☑

| # | Task | Satisfies | Done when |
|---|---|---|---|
| 6.1 | Provided sample returns the same count as mediainfo `--Full` "Frame count" | OBJ-02, NN-04 | Logged in `06-records/validation-log.md` |
| 6.2 | Whole fixture corpus matches the ground truth | EV-C2 | Test suite green |
| 6.3 | Large-file run (≥1 GB) shows flat memory | EV-S1 | Logged |
| 6.4 | Fresh-clone gate: `npm ci`, all gates, start, curl | TIP-02 | Logged |
| 6.5 | Dependency audit: no MP3 parsing packages | REQ-03 | Logged |

## Phase 7: Documentation & submission ☑

| # | Task | Satisfies | Done when |
|---|---|---|---|
| 7.1 | README: overview, run, test (curl + expected output), config, design, error codes, future improvements | SUB-02, SUB-03, TIP-04 | Reviewed |
| 7.2 | Final requirements register pass: every MUST `verified` | EV-C1 | Register updated |
| 7.3 | Clean history check and final commit | EV-A1 | `git log` reviewed |
