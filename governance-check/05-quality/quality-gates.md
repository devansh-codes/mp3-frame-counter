# Quality Gates (Definition of Done)

**No commit** unless every gate below passes (NN-12). Record each run in
[../06-records/test-run-log.md](../06-records/test-run-log.md).

## Gate 1: automated (one command)

```bash
npm run check
```

| # | Gate | Command | Pass criteria |
|---|---|---|---|
| 1 | Format | `npm run format:check` | "All matched files use Prettier code style!" |
| 2 | Lint | `npm run lint` | 0 errors, 0 warnings (typescript-eslint strict-type-checked) |
| 3 | Types | `npm run typecheck` | `tsc --noEmit` exits 0 |
| 4 | Tests + coverage | `npm run test:coverage` | All tests pass. Coverage ≥ 95% lines/statements/functions and ≥ 90% branches (currently 100%) |
| 5 | Build | `npm run build` | `dist/` emitted with no errors |

CI (`.github/workflows/ci.yml`) runs the same command on Node 22 and 24 for every push and PR.

## Gate 2: supply chain

| Check | Command | Pass criteria |
|---|---|---|
| Vulnerabilities | `npm audit` | `found 0 vulnerabilities` |
| No MP3-parsing packages (REQ-03 / NN-07) | `npm ls --all \| tail -n +2 \| grep -Ei 'mp3\|id3\|audio\|music\|mpeg\|ffmpeg\|ffprobe\|mediainfo'` (skips the root line, which is this project's own name) | no output |
| Only allowed runtime deps | `npm ls --omit=dev --depth=0` | only `fastify`, `@fastify/multipart` |

## Gate 3: behavioural verification against reference tools (before submission)

| Check | How | Pass criteria |
|---|---|---|
| Provided sample | `curl -F file=@test/fixtures/sample.mp3 localhost:3000/file-upload` | `{"frameCount":6089}`, equal to `mediainfo --Full` "Frame count" |
| Fixture corpus via live server | Loop over `test/fixtures/*.mp3`, compare with mediainfo (full-parse fallback) and ffprobe | All match (see V-008) |
| Large-file streaming | 1 GB and 3 GB uploads through `node dist/server.js` | Exact counts, peak RSS stays ~120–150 MB (see V-009) |
| Fresh-clone run | `git clone` → `npm ci` → `npm run check` → `npm start` → curl the sample | All pass |

## Gate 4: review

- The requirements register has no MUST left in `todo`.
- Non-negotiables re-read and confirmed.
- An independent code-quality and requirements audit (V-010) has no open must-fix items.
