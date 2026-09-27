# ADR-001: Streaming frame counter behind a Fastify multipart endpoint

- **Status:** Accepted (2026-09-26)
- **Deciders:** owner + main agent, validated by 4 independent agents (research, 2 prototypes, HTTP benchmark)
- **Satisfies:** API-01..06, REQ-01..04, EV-S1/S2, EV-E1..3, EV-Q1..3, NN-01..11

## Context

We need `POST /file-upload` to accept an MP3 upload and return `{"frameCount": n}` for MPEG-1 Layer
III. The brief scores correctness, error handling, code quality and **scalability for large files**.
Frame counting has to parse every frame header, so all the bytes must be looked at once. The
question is **where the bytes live while we do it**.

## Decision

1. **Parse the upload as a stream, in a single pass, while it arrives.** The multipart file stream
   is fed chunk by chunk into a pure, I/O-free state machine (`Mp3FrameCounter.push()` /
   `finish()`). No buffering of the whole file, and no temp files.
2. **Fastify 5 + `@fastify/multipart`** is the HTTP layer. The file part is consumed as an async
   iterable.
3. **Layered modules**, with dependencies pointing inward:

```
src/server.ts ──▶ src/http/app.ts ──▶ src/http/file-upload-route.ts ──▶ src/mp3/frame-counter.ts
     │                 │                        │                              │
  config.ts     error-mapping.ts          api-error.ts               frame-header.ts, id3v2.ts,
                lingering-close.ts                                   metadata-frame.ts
```

- `src/mp3/*` knows nothing about HTTP. It is testable with plain Buffers and reusable (CLI, worker,
  another framework).
- `src/http/*` knows nothing about MP3 internals. It only maps a `FrameCountResult` to HTTP.

4. **Errors:** the domain returns a discriminated union (`{ ok: true, frameCount } | { ok: false,
   reason }`). The HTTP layer turns failures into `ApiError(status, code, message)`. A **single
   error handler** maps everything, including framework, multipart and unexpected errors, to
   `{"error":{"code","message"}}` with the right status. Unexpected errors never leak details.
5. **Contract enforcement:** the 200 response goes through a JSON schema with
   `additionalProperties: false`, so it is always exactly `{"frameCount": n}`.
6. **Early rejection** (file over the size limit) uses a **lingering close**. The server replies,
   discards the rest of the upload, and destroys the socket after 5 s if the client keeps sending.

## Consequences

- ✅ Memory is O(1) per request. Measured: 116 MB (100 MB upload), 118 MB (1 GB) and 145 MB (3 GB)
  peak RSS of the server process.
- ✅ Latency is about the upload time. Parsing (~0.3–0.5 s CPU/GB, 2.8 s/GB worst case) overlaps the network transfer.
- ✅ Stateless: scales horizontally behind a load balancer, with no shared disk or session.
- ✅ The counter's correctness doesn't depend on chunking. This is proven by a fuzz test.
- ⚠️ The whole body must be read before answering, because a count is only known at the end. That
  is inherent to the problem.
- ⚠️ `multipart/form-data` only. Raw bodies get a helpful 415. A documented future extension.

## Evidence

See [alternatives-considered.md](alternatives-considered.md) for the rejected options with numbers,
and [../06-records/validation-log.md](../06-records/validation-log.md) V-003..V-010.
