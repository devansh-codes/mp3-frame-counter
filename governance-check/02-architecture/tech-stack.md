# Tech Stack (pinned)

Exact versions are pinned in `package.json`, so installs are reproducible. Run `npm audit` after any
change: it must report **0 vulnerabilities**.

## Runtime

| Component | Version | Why |
|---|---|---|
| Node.js | **24 LTS** (`.nvmrc`), `engines: >=22.13` | Active LTS until 2028-04. 22 is in maintenance until 2027-04. 20 is EOL |
| TypeScript | 6.0.3 | Latest release supported by typescript-eslint (<6.1). TS 7.x breaks the typescript-eslint peer range |
| Module system | ESM (`"type": "module"`, `module: NodeNext`) | Native Node ESM. Top-level await in `server.ts` |

## Dependencies (production)

| Package | Version | Role | NN-07 check |
|---|---|---|---|
| fastify | 5.12.5 | HTTP framework | ✅ generic HTTP framework |
| @fastify/multipart | 10.1.2 | Streaming multipart parser (wraps @fastify/busboy) | ✅ generic form parser, knows nothing about MP3 |

**No other runtime dependencies.** No package parses MP3, audio or ID3 data (REQ-03). Check with:
`npm ls --all | tail -n +2 | grep -Ei 'mp3|id3|audio|music|mpeg|ffmpeg|ffprobe|mediainfo'` (skips the root line), which must print
nothing.

## Dev tooling

| Package | Version | Role |
|---|---|---|
| vitest + @vitest/coverage-v8 | 5.0.2 | Test runner and V8 coverage (thresholds in `vitest.config.ts`) |
| eslint + @eslint/js | 10.11.0 / 10.0.1 | Linting (flat config via `defineConfig` from `eslint/config`) |
| typescript-eslint | 8.70.1 | `strictTypeChecked` + `stylisticTypeChecked`, with the project service |
| prettier | 3.9.9 | Formatting (`singleQuote`, `printWidth: 100`, `trailingComma: all`) |
| tsx | 4.23.15 | `npm run dev` (watch mode) and the e2e test's server process |
| @types/node | 24.19.0 | Node 24 typings |

## TypeScript strictness (`tsconfig.json`)

`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
`noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`,
`useUnknownInCatchVariables`, `verbatimModuleSyntax`, `isolatedModules`. TS 6 no longer loads
`@types/*` automatically, so `types: ["node"]` is set explicitly.

## Verification tools (never used at runtime; NN-07)

| Tool | Version | Use |
|---|---|---|
| mediainfo | 26.05 (Homebrew) | Ground truth ("Frame count") |
| ffprobe / ffmpeg | Homebrew 8.x | Ground truth (`-count_packets`) and fixture generation |
| lame | 3.100 | Fixture generation |

## Local-machine note

The dev machine's system Node is 20.13.1 (EOL). Validation in this session used a local Node
24.21.0 binary and npm 11 from the session scratchpad. To run the project, the owner should install
Node 24, e.g. `brew install node@24` or an nvm/fnm install that honours `.nvmrc`.
