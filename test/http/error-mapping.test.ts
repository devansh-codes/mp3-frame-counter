import type { FastifyError } from 'fastify';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../../src/http/api-error.js';
import { toApiError } from '../../src/http/error-mapping.js';

function fastifyError(fields: {
  message: string;
  code?: string;
  statusCode?: number;
}): FastifyError {
  return Object.assign(new Error(fields.message), { code: fields.code ?? '', ...fields });
}

const LIMIT = 2 * 1024 * 1024;

describe('toApiError', () => {
  it('passes our own errors through unchanged', () => {
    const error = new ApiError(422, 'INVALID_MP3', 'bad file');
    expect(toApiError(error, LIMIT)).toBe(error);
  });

  it("maps the multipart plugin's file-size error to 413 with the configured limit", () => {
    const error = fastifyError({
      message: 'request file too large',
      code: 'FST_REQ_FILE_TOO_LARGE',
    });
    expect(toApiError(error, LIMIT)).toMatchObject({
      statusCode: 413,
      code: 'FILE_TOO_LARGE',
      message: 'The file is larger than the 2 MB upload limit.',
    });
  });

  it.each([
    [{ code: 'FST_FILES_LIMIT', statusCode: 413 }, 400, 'TOO_MANY_FILES'],
    [{ code: 'FST_FIELDS_LIMIT', statusCode: 413 }, 400, 'BAD_REQUEST'],
    [{ code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE', statusCode: 415 }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [{ code: 'ERR_STREAM_PREMATURE_CLOSE' }, 400, 'BAD_REQUEST'],
  ])('maps %o to %i %s', (fields, statusCode, code) => {
    const apiError = toApiError(fastifyError({ message: 'original', ...fields }), LIMIT);
    expect(apiError).toMatchObject({ statusCode, code });
  });

  it.each([
    'Unexpected end of multipart data',
    'Part terminated early due to unexpected end of multipart data',
    'Multipart: Boundary not found',
  ])('maps the busboy error "%s" to 400 with a clear message', (message) => {
    expect(toApiError(fastifyError({ message }), LIMIT)).toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'The multipart body is malformed or incomplete.',
    });
  });

  it.each([
    [404, 'NOT_FOUND'],
    [405, 'METHOD_NOT_ALLOWED'],
    [413, 'FILE_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'],
    [431, 'BAD_REQUEST'],
  ])('derives the code of other client errors from status %i', (statusCode, code) => {
    const error = fastifyError({ message: 'from the framework', statusCode });
    expect(toApiError(error, LIMIT)).toMatchObject({
      statusCode,
      code,
      message: 'from the framework',
    });
  });

  it('keeps the status and message of other client errors', () => {
    const error = fastifyError({ message: 'prototype property is not allowed', statusCode: 400 });
    expect(toApiError(error, LIMIT)).toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'prototype property is not allowed',
    });
  });

  it('hides the details of unexpected errors behind a generic 500', () => {
    const apiError = toApiError(fastifyError({ message: 'secret stack detail' }), LIMIT);
    expect(apiError).toMatchObject({ statusCode: 500, code: 'INTERNAL_SERVER_ERROR' });
    expect(apiError.message).not.toContain('secret');
  });
});
