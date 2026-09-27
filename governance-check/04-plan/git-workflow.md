# Git Workflow

Reviewers score "Has the candidate used Git effectively?" (EV-A1). The history should read as a story of
a structured approach.

## Rules

1. **Branch:** `main` is the submission branch. Feature work may use short-lived branches
   (`feat/frame-parser`) that are merged with `--no-ff` or rebased. Never force-push `main`.
2. **Commit size:** one logical change per commit, e.g. scaffold, header parser + its tests, streaming
   counter + its tests, HTTP route, error handling, docs. Code and its tests go in the **same** commit.
3. **Message format:** [Conventional Commits](https://www.conventionalcommits.org/)

   ```
   <type>(<optional scope>): <imperative summary, ≤ 72 chars>

   <optional body: what & why, wrapped at 72>
   ```

   Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `build`, `ci`, `perf`, `style`.
   Scopes used in this repo: `mp3`, `http`, `config`, `governance`, `tooling`.
4. **Gates before commit:** all gates in [../05-quality/quality-gates.md](../05-quality/quality-gates.md)
   pass. Log the run in [../06-records/test-run-log.md](../06-records/test-run-log.md).
5. **Never commit:** `node_modules/`, `dist/`, `coverage/`, `.env*`, large media (> 1 MB), secrets.
6. **Identity:** no global git identity is configured on the dev machine. Set `user.name` and
   `user.email` (repo-local) before the first commit.

## Planned commit sequence (indicative)

1. `docs(governance): add requirements register, non-negotiables and plan`
2. `docs(governance): record architecture decision and counting algorithm`
3. `chore(tooling): scaffold TypeScript project with ESLint, Prettier and test runner`
4. `feat(mp3): decode MPEG-1 Layer III frame headers`
5. `feat(mp3): add streaming frame counter with ID3v2 skip and Xing detection`
6. `test(mp3): add fixture corpus and chunk-boundary fuzz tests`
7. `feat(http): add POST /file-upload endpoint streaming into the counter`
8. `feat(http): add central JSON error handling and upload limits`
9. `ci: run lint, typecheck, tests and build on push`
10. `docs: add README with run and test instructions`
