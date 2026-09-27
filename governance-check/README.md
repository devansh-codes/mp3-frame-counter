# governance-check: Project Governance & AI Agent Context

This folder is the **long-term memory and rulebook** for this repository. Any AI agent or developer should
read it before changing code. It records what we must build, what we must never do, the decisions we
made and why, and evidence that every requirement has been verified.

## Project in one paragraph

A TypeScript HTTP API with one endpoint, `POST /file-upload`. It accepts an MP3 upload and returns
`{"frameCount": <number>}`, the number of MPEG-1 Layer III audio frames in the file. We write the frame
parsing ourselves; no MP3 parsing libraries are allowed. The upload is parsed **as a stream**, so memory
use stays flat whatever the file size. This is a technical assessment: correctness, code quality, error
handling, scalability and a structured, well-documented approach are all scored.

## Reading order for agents

| # | File | Why read it |
|---|---|---|
| 1 | [01-requirements/non-negotiables.md](01-requirements/non-negotiables.md) | Hard rules. Never break them |
| 2 | [01-requirements/requirements-register.md](01-requirements/requirements-register.md) | Every requirement with an ID, how it is verified, and its status |
| 3 | [01-requirements/original-brief.md](01-requirements/original-brief.md) | The verbatim brief (source of truth) |
| 4 | [02-architecture/architecture-decision.md](02-architecture/architecture-decision.md) | The chosen architecture and why |
| 5 | [02-architecture/tech-stack.md](02-architecture/tech-stack.md) | Runtime, framework, tooling, pinned versions |
| 6 | [02-architecture/alternatives-considered.md](02-architecture/alternatives-considered.md) | Options that were evaluated and rejected, with evidence |
| 7 | [03-domain-logic/mp3-frame-format.md](03-domain-logic/mp3-frame-format.md) | MPEG-1 Layer III frame format reference |
| 8 | [03-domain-logic/frame-counting-algorithm.md](03-domain-logic/frame-counting-algorithm.md) | The exact counting rules and state machine |
| 9 | [03-domain-logic/ground-truth.md](03-domain-logic/ground-truth.md) | Expected counts for every fixture, from mediainfo and ffprobe |
| 10 | [04-plan/task-breakdown.md](04-plan/task-breakdown.md) | Phased plan and current status |
| 11 | [04-plan/git-workflow.md](04-plan/git-workflow.md) | Commit conventions |
| 12 | [05-quality/quality-gates.md](05-quality/quality-gates.md) | Commands that must pass before any commit |
| 13 | [05-quality/testing-strategy.md](05-quality/testing-strategy.md) | What is tested and how |
| 14 | [06-records/](06-records/) | Append-only logs: decisions, validations, test runs |

## Folder structure

```
governance-check/
├── README.md                       ← you are here
├── 01-requirements/                ← WHAT we must build (immutable brief, rules)
│   ├── original-brief.md
│   ├── requirements-register.md
│   └── non-negotiables.md
├── 02-architecture/                ← HOW we build it at system level
│   ├── architecture-decision.md
│   ├── tech-stack.md
│   └── alternatives-considered.md
├── 03-domain-logic/                ← the MP3 knowledge and the counting algorithm
│   ├── mp3-frame-format.md
│   ├── frame-counting-algorithm.md
│   └── ground-truth.md
├── 04-plan/                        ← tasks, phases, git workflow
│   ├── task-breakdown.md
│   └── git-workflow.md
├── 05-quality/                     ← definition of done, gates, testing
│   ├── quality-gates.md
│   └── testing-strategy.md
└── 06-records/                     ← append-only evidence
    ├── decision-log.md
    ├── validation-log.md
    └── test-run-log.md
```

## Rules for maintaining this folder

1. **`01-requirements/original-brief.md` is immutable.** Everything else may change, but only with a
   matching entry in `06-records/decision-log.md`.
2. **Records are append-only.** Never delete or rewrite past entries in `06-records/`. Add a correcting
   entry instead.
3. **Update requirement status** in the register when a requirement is implemented (`done`) and when it
   is proven by a test or tool (`verified`, with a link to the evidence).
4. **Quality-gate runs** are logged in `06-records/test-run-log.md` before each commit.
5. When the code and these docs disagree, **stop and resolve it**. Fix whichever one is wrong and log the
   decision.
