# Testing Strategy

## Principles

1. **An external oracle, not self-agreement.** Expected counts come from mediainfo and ffprobe
   ([../03-domain-logic/ground-truth.md](../03-domain-logic/ground-truth.md)), never from our own
   code. Where a test helper computes a frame length, it uses its own implementation
   (`test/helpers/mp3-builder.ts` → `frameLengthOf`).
2. **Test behaviour, not implementation.** Tests use the public surface: `parseFrameHeader`,
   `readId3v2TagSize`, `detectMetadataFrame`, `Mp3FrameCounter`, `toApiError`,
   `discardRestOfUpload` and the HTTP endpoint.
3. **Synthetic edge cases are built in code, not stored as binaries.** Tags, junk, truncation, fake
   headers and concatenation are generated from small helpers, so each test shows exactly what it
   builds.
4. **Deterministic.** Random data uses seeded PRNGs, and timers use fake timers where possible.

## Layers

| Layer | File(s) | What it proves |
|---|---|---|
| Header decoding | `test/mp3/frame-header.test.ts` | Bit-field decoding, frame-length formula (min 96 / max 1441 over all 84 combinations), every reserved or invalid field rejected, unsupported formats named |
| ID3v2 | `test/mp3/id3v2.test.ts` | Syncsafe sizes (including the 2^28−1 maximum), v2.4 footer, invalid headers |
| Metadata frame | `test/mp3/metadata-frame.test.ts` | Xing/Info/VBRI at stereo, mono and CRC offsets, on synthetic and real encoder frames |
| Frame counter | `test/mp3/frame-counter.test.ts` | All 15 real fixtures + sample, MPEG-2 rejection, **chunk-boundary fuzzing** (8 fixed sizes + 25 seeded random splits per fixture), no retained chunk references, big/multiple/footer ID3v2, APE+ID3v1, concatenation, metadata-frame rules, junk and fake syncs, sample-rate change, truncation, invalid inputs, usage errors |
| Config | `test/config.test.ts` | Defaults, env parsing, validation messages |
| Error mapping | `test/http/error-mapping.test.ts` | Each framework/multipart error → status + code. The 500 path hides details |
| Lingering close | `test/http/lingering-close.test.ts` | Discards the remaining upload, destroys the socket only after the timeout (fake timers) |
| HTTP contract | `test/http/file-upload.test.ts` | Exact 200 body + JSON header, any field name, content-based validation, every error status (400/404/405/413/415/422/500) with JSON body and header |
| Real-socket streaming | `test/http/streaming.test.ts` | ~100 MB streamed upload counted exactly. A 1 GB upload over the limit gets 413 quickly (no hang). A client abort mid-upload is logged and the server stays healthy |
| End-to-end | `test/e2e/server.test.ts` | The real `src/server.ts` process starts, serves the sample (6089), exits 0 on SIGTERM, and refuses invalid config |

## Outside the unit suite (recorded in the validation log)

- The live production server compared with mediainfo and ffprobe on every fixture and edge case (V-008).
- 100 MB / 1 GB / 3 GB throughput and peak-RSS benchmark (V-009).
- An independent adversarial test campaign (V-010).
