import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/http/app.js';
import { readFixture, seededRandomBytes } from '../helpers/mp3-builder.js';
import { formWithFile } from '../helpers/multipart.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

describe('POST /file-upload', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ maxFileSizeBytes: 5 * 1024 * 1024 });
  });

  afterAll(async () => {
    await app.close();
  });

  function upload(body: FormData): Promise<LightMyRequestResponse> {
    return app.inject({ method: 'POST', url: '/file-upload', body });
  }

  describe('success', () => {
    it('returns exactly {"frameCount": 6089} for the provided sample, as JSON', async () => {
      const response = await upload(
        formWithFile(readFixture('sample.mp3'), { filename: 'sample.mp3' }),
      );

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe(JSON_CONTENT_TYPE);
      expect(response.body).toBe('{"frameCount":6089}');
    });

    it.each([
      ['cbr128-info.mp3', 384],
      ['vbr-xing.mp3', 384],
      ['mono-cbr.mp3', 384],
      ['cbr320-48khz.mp3', 418],
      ['cbr32-32khz.mp3', 279],
      ['id3v1.mp3', 384],
    ])('counts the frames in %s', async (fixture, frameCount) => {
      const response = await upload(formWithFile(readFixture(fixture)));
      expect(response.json()).toEqual({ frameCount });
    });

    it('accepts any file field name and ignores other form fields', async () => {
      const form = formWithFile(readFixture('cbr128-info.mp3'), { fieldName: 'audio' });
      form.append('description', 'a text field');

      const response = await upload(form);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ frameCount: 384 });
    });

    it('counts a truncated final frame, as ffprobe and mediainfo do', async () => {
      const truncated = readFixture('cbr128-no-info.mp3').subarray(0, -200);
      expect((await upload(formWithFile(truncated))).json()).toEqual({ frameCount: 384 });
    });

    it('ignores text fields, however long', async () => {
      const form = formWithFile(readFixture('cbr128-info.mp3'));
      form.append('notes', 'x'.repeat(2 * 1024 * 1024)); // truncated to 1 KB by the parser

      expect((await upload(form)).json()).toEqual({ frameCount: 384 });
    });

    it('does not trust the file extension or declared type', async () => {
      const form = new FormData();
      form.append(
        'file',
        new Blob([readFixture('vbr-xing.mp3')], { type: 'application/octet-stream' }),
        'x.bin',
      );

      expect((await upload(form)).json()).toEqual({ frameCount: 384 });
    });
  });

  describe('client errors', () => {
    it.each([
      {
        name: 'an empty file',
        content: Buffer.alloc(0),
        code: 'EMPTY_FILE',
        message: 'The uploaded file is empty.',
      },
      {
        name: 'a file that is not an MP3',
        content: seededRandomBytes(50_000, 9),
        code: 'INVALID_MP3',
        message: expect.stringContaining('No MPEG-1 Layer III audio frames were found') as string,
      },
      {
        name: 'an MPEG-2 file (out of scope)',
        content: readFixture('mpeg2-layer3.mp3'),
        code: 'UNSUPPORTED_MP3_FORMAT',
        message: expect.stringContaining('MPEG-2 Layer III') as string,
      },
    ])('rejects $name with 422 $code', async ({ content, code, message }) => {
      const response = await upload(formWithFile(content));

      expect(response.statusCode).toBe(422);
      expect(response.headers['content-type']).toBe(JSON_CONTENT_TYPE);
      expect(response.json()).toEqual({ error: { code, message } });
    });

    it('rejects a form without a file with 400 MISSING_FILE', async () => {
      const form = new FormData();
      form.append('name', 'no file here');

      const response = await upload(form);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'MISSING_FILE' } });
    });

    it('rejects more than one file with 400 TOO_MANY_FILES', async () => {
      const form = formWithFile(readFixture('cbr128-info.mp3'));
      form.append('second', new Blob([readFixture('cbr128-info.mp3')]), 'second.mp3');

      const response = await upload(form);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'TOO_MANY_FILES' } });
    });

    it('rejects a file over the size limit with 413 FILE_TOO_LARGE', async () => {
      const smallLimitApp = await buildApp({ maxFileSizeBytes: 1024 * 1024 });
      try {
        const response = await smallLimitApp.inject({
          method: 'POST',
          url: '/file-upload',
          body: formWithFile(readFixture('sample.mp3')), // 1.4 MB
        });

        expect(response.statusCode).toBe(413);
        expect(response.headers['content-type']).toBe(JSON_CONTENT_TYPE);
        expect(response.json()).toEqual({
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'The file is larger than the 1 MB upload limit.',
          },
        });
      } finally {
        await smallLimitApp.close();
      }
    });

    it.each([
      ['a JSON body', 'application/json', '{"file":"song.mp3"}'],
      ['a raw audio body', 'audio/mpeg', readFixture('cbr128-info.mp3')],
      ['a urlencoded form', 'application/x-www-form-urlencoded', 'file=song.mp3'],
      ['invalid JSON', 'application/json', '{not json'],
      ['a large text body (not read into memory)', 'text/plain', 'x'.repeat(1_500_000)],
    ])('rejects %s with 415 UNSUPPORTED_MEDIA_TYPE', async (_name, contentType, payload) => {
      const response = await app.inject({
        method: 'POST',
        url: '/file-upload',
        headers: { 'content-type': contentType },
        payload,
      });

      expect(response.statusCode).toBe(415);
      expect(response.headers['content-type']).toBe(JSON_CONTENT_TYPE);
      expect(response.json()).toMatchObject({
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: expect.stringContaining('multipart/form-data') as string,
        },
      });
    });

    it('rejects a request with no body with 415', async () => {
      const response = await app.inject({ method: 'POST', url: '/file-upload' });
      expect(response.statusCode).toBe(415);
    });

    it.each([
      [
        'is cut off before the end',
        'multipart/form-data; boundary=XYZ',
        '--XYZ\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\n\r\nabc',
      ],
      ['has no boundary', 'multipart/form-data', 'irrelevant'],
    ])('rejects a multipart body that %s with 400', async (_name, contentType, payload) => {
      const response = await app.inject({
        method: 'POST',
        url: '/file-upload',
        headers: { 'content-type': contentType },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toBe(JSON_CONTENT_TYPE);
      expect(response.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    });
    it('rejects a form with too many fields with 400', async () => {
      const form = formWithFile(readFixture('cbr128-info.mp3'));
      for (let i = 0; i < 11; i++) {
        form.append(`field${String(i)}`, 'value');
      }

      const response = await upload(form);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    });

    it('rejects a prototype-polluting field name with 400', async () => {
      const response = await upload(
        formWithFile(readFixture('cbr128-info.mp3'), { fieldName: '__proto__' }),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    });
  });

  describe('routing', () => {
    it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const)(
      'answers %s /file-upload with 405 and an Allow header',
      async (method) => {
        const response = await app.inject({ method, url: '/file-upload' });

        expect(response.statusCode).toBe(405);
        expect(response.headers.allow).toBe('POST');
        expect(response.headers['content-type']).toBe(JSON_CONTENT_TYPE);
        expect(response.json()).toMatchObject({ error: { code: 'METHOD_NOT_ALLOWED' } });
      },
    );

    it('answers a malformed URL with the same JSON error shape', async () => {
      const response = await app.inject({ method: 'POST', url: '/file-upload%E0%A4%A' });

      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toBe(JSON_CONTENT_TYPE);
      expect(response.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    });

    it('answers unknown routes with a JSON 404', async () => {
      const response = await app.inject({ method: 'POST', url: '/upload' });

      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toBe(JSON_CONTENT_TYPE);
      expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });
  });

  describe('unexpected errors', () => {
    it('returns a generic JSON 500 without leaking details', async () => {
      const failingApp = await buildApp({ maxFileSizeBytes: 1024 });
      failingApp.get('/boom', () => {
        throw new Error('database password is hunter2');
      });
      try {
        const response = await failingApp.inject({ method: 'GET', url: '/boom' });

        expect(response.statusCode).toBe(500);
        expect(response.headers['content-type']).toBe(JSON_CONTENT_TYPE);
        expect(response.json()).toEqual({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Something went wrong while processing the upload.',
          },
        });
      } finally {
        await failingApp.close();
      }
    });
  });
});
