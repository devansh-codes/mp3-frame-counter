import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/http/app.js';
import { readFixture } from '../helpers/mp3-builder.js';
import { multipartStream, repeat } from '../helpers/multipart.js';

/**
 * These tests go over a real socket with streamed request bodies, which `inject()` can't simulate.
 * The uploads are generated lazily, so neither the client nor the server holds the whole file.
 */
describe('POST /file-upload over the network', () => {
  const BOUNDARY = 'mp3-frame-counter-boundary';
  const audio = readFixture('cbr128-no-info.mp3'); // 384 frames, ~160 KB, no tags
  let app: FastifyInstance;
  let url: string;

  beforeAll(async () => {
    app = await buildApp({ maxFileSizeBytes: 150 * 1024 * 1024 });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    url = `${address}/file-upload`;
  });

  afterAll(async () => {
    await app.close();
  });

  /** Streams `copies` copies of the audio as one upload, counting how many have been sent. */
  function streamUpload(copies: number, progress = { sent: 0 }): Promise<Response> {
    function* countedAudio(): Generator<Buffer> {
      for (const chunk of repeat(audio, copies)) {
        progress.sent++;
        yield chunk;
      }
    }
    const body = multipartStream(BOUNDARY, {
      fieldName: 'file',
      filename: 'long.mp3',
      content: countedAudio(),
    });
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      body: ReadableStream.from(body),
      duplex: 'half',
    });
  }

  it('counts the frames of a ~100 MB upload streamed in chunks', async () => {
    const copies = 640; // 640 × 160 KB ≈ 100 MB
    const response = await streamUpload(copies);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ frameCount: 384 * copies });
  });

  it('rejects an upload over the limit with 413 before the client finishes sending it', async () => {
    const copies = 6400; // ~1 GB, far over the 150 MB limit
    const progress = { sent: 0 };

    const response = await streamUpload(copies, progress);

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'FILE_TOO_LARGE' } });
    // The reply arrived once the limit was crossed (~940 copies), long before the whole file was sent.
    expect(progress.sent).toBeLessThan(copies / 2);
  });

  it('handles a client that aborts mid-upload without crashing', async () => {
    const logLines: string[] = [];
    const loggedApp = await buildApp({
      maxFileSizeBytes: 150 * 1024 * 1024,
      logger: { level: 'info', stream: { write: (line: string) => logLines.push(line) } },
    });
    const loggedUrl = `${await loggedApp.listen({ host: '127.0.0.1', port: 0 })}/file-upload`;

    try {
      // A slow upload, so the abort lands while the server is part-way through the file.
      async function* slowAudio(): AsyncGenerator<Buffer> {
        for (let i = 0; i < 1000; i++) {
          yield audio;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      const controller = new AbortController();
      const aborted = fetch(loggedUrl, {
        method: 'POST',
        headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
        body: ReadableStream.from(
          multipartStream(BOUNDARY, { fieldName: 'file', filename: 'a.mp3', content: slowAudio() }),
        ),
        duplex: 'half',
        signal: controller.signal,
      });
      setTimeout(() => {
        controller.abort();
      }, 150);
      await expect(aborted).rejects.toThrow();

      await expect
        .poll(() =>
          logLines.some((line) => line.includes('Client disconnected before the upload finished')),
        )
        .toBe(true);

      // The server is still healthy.
      const response = await fetch(loggedUrl, {
        method: 'POST',
        body: (() => {
          const form = new FormData();
          form.append('file', new Blob([audio]), 'ok.mp3');
          return form;
        })(),
      });
      expect(await response.json()).toEqual({ frameCount: 384 });
    } finally {
      await loggedApp.close();
    }
  });
});
