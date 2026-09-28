# Test Run Log (lint / format / typecheck / test / build)

Append-only. Record every quality-gate run that comes before a commit, and every failure together with
its fix. Newest entries go at the bottom.

**Format**

```
### YYYY-MM-DD HH:MM — <short context> — commit <sha or "pre-commit">
| Gate | Command | Result | Notes |
|---|---|---|---|
| format | npm run format:check | ✅/❌ | |
| lint | npm run lint | ✅/❌ | |
| typecheck | npm run typecheck | ✅/❌ | |
| test | npm test | ✅/❌ (N passed / M failed, coverage X%) | |
| build | npm run build | ✅/❌ | |
```

---

### 2026-09-26 20:52: first install (Node-20 toolchain), pre-commit
| Gate | Command | Result | Notes |
|---|---|---|---|
| install | npm install (Node 20.13.1, npm 10.5.2) | ⚠️ | `npm audit`: 3 vulnerabilities (2 critical, Vitest ≤ 4.1.10 GHSA-82fw-gwwq-j7x9). ESLint 9 deprecated → **toolchain rejected** (D-007) |

### 2026-09-26 20:58: Node 24 toolchain, domain code only, pre-commit
| Gate | Command | Result | Notes |
|---|---|---|---|
| install | npm install (Node 24.21.0, npm 11.20.0) | ✅ | 0 vulnerabilities |
| typecheck | npx tsc --noEmit | ✅ | |
| lint | npx eslint . | ❌ → ✅ | 1 error: prefer-optional-chain in frame-header.ts, fixed |
| test | npx vitest run | ✅ | 109/109 (domain tests), 3.1 s |

### 2026-09-26 21:03: HTTP layer added, pre-commit
| Gate | Command | Result | Notes |
|---|---|---|---|
| test | npx vitest run | ❌ → ✅ | 148/149. The 413 streaming test got EPIPE (TCP reset on immediate close) → lingering close (D-008, V-007) → 149/149, 3 consecutive runs |

### 2026-09-26 21:06–21:09: full gate, pre-commit
| Gate | Command | Result | Notes |
|---|---|---|---|
| format | npm run format:check | ✅ | after `npm run format` |
| lint | npm run lint | ❌ → ✅ | Unnecessary non-null assertions (e2e test) and unbound-method (lingering-close test), fixed |
| typecheck | npm run typecheck | ❌ → ✅ | `ReturnType<inject>` picked the wrong overload → `Promise<LightMyRequestResponse>` |
| test | npm run test:coverage | ❌ → ✅ | Functions 94.59% < 95% threshold → refactored error mapping and lingering close into testable modules, added tests. The 413 inject test then exposed the plugin's own FST_REQ_FILE_TOO_LARGE path → restored the mapping + explicit `truncated` check. **Final: 167/167, coverage 100/100/100/100** |
| build | npm run build | ✅ | dist/ emitted |

### 2026-09-26 21:12: supply-chain gate
| Gate | Command | Result | Notes |
|---|---|---|---|
| audit | npm audit | ✅ | 0 vulnerabilities |
| no MP3 packages | npm ls --all \| tail -n +2 \| grep -Ei 'mp3\|id3\|audio…' | ✅ | no matches |
| runtime deps | npm ls --omit=dev --depth=0 | ✅ | fastify 5.12.5, @fastify/multipart 10.1.2 only |

### 2026-09-28: submission gate
| Gate | Command | Result | Notes |
|---|---|---|---|
| format | npm run format:check | ✅ | |
| lint | npm run lint | ✅ | |
| typecheck | npm run typecheck | ✅ | |
| test | npm run test:coverage | ✅ | 192/192, coverage 100% |
| build | npm run build | ✅ | |
| audit | npm audit | ✅ | 0 vulnerabilities |
| CI | GitHub Actions (Node 22, 24) | ✅ | |
