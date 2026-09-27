import type { FrameCountResult } from '../mp3/frame-counter.js';
import {
  ApiError,
  type ApiErrorCode,
  fileTooLargeError,
  unsupportedMediaTypeError,
} from './api-error.js';

type FailedCount = Extract<FrameCountResult, { ok: false }>;

/** Turns a failed frame count into an error the client can act on. */
export function apiErrorFromCountFailure(failure: FailedCount): ApiError {
  switch (failure.reason) {
    case 'EMPTY_FILE':
      return new ApiError(422, 'EMPTY_FILE', 'The uploaded file is empty.');
    case 'NO_MPEG1_LAYER3_FRAMES':
      return new ApiError(
        422,
        'INVALID_MP3',
        'No MPEG-1 Layer III audio frames were found. The file is not a valid MP3, or it is corrupted.',
      );
    case 'UNSUPPORTED_FORMAT':
      return new ApiError(
        422,
        'UNSUPPORTED_MP3_FORMAT',
        `Unsupported audio format: ${failure.format}. Only MPEG-1 Layer III files (standard .mp3) are supported.`,
      );
  }
}

/** Busboy reports malformed multipart bodies with plain errors, identified only by their message. */
const MALFORMED_MULTIPART = /multipart data|boundary not found/i;

const CODE_BY_STATUS: Readonly<Partial<Record<number, ApiErrorCode>>> = {
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  413: 'FILE_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

/**
 * Maps any error raised while handling a request to a client-facing ApiError. Errors we raise
 * ourselves pass through unchanged. Framework and multipart errors get a clear code and message.
 * Anything unexpected becomes a generic 500 that reveals no internal details.
 */
export function toApiError(error: Error, maxFileSizeBytes: number): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  switch (errorCode(error)) {
    case 'FST_REQ_FILE_TOO_LARGE':
      return fileTooLargeError(maxFileSizeBytes);
    case 'FST_FILES_LIMIT':
      return new ApiError(400, 'TOO_MANY_FILES', 'Upload exactly one file per request.');
    case 'FST_FIELDS_LIMIT':
      return new ApiError(
        400,
        'BAD_REQUEST',
        'The form has too many fields. Send just the MP3 file.',
      );
    case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
      return unsupportedMediaTypeError();
    case 'ERR_STREAM_PREMATURE_CLOSE':
      return malformedMultipartError();
  }

  if (MALFORMED_MULTIPART.test(error.message)) {
    return malformedMultipartError();
  }

  // Any other client error raised by Fastify: its message is safe and useful to pass on.
  const statusCode = errorStatusCode(error);
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    return new ApiError(statusCode, CODE_BY_STATUS[statusCode] ?? 'BAD_REQUEST', error.message);
  }
  return new ApiError(
    500,
    'INTERNAL_SERVER_ERROR',
    'Something went wrong while processing the upload.',
  );
}

function malformedMultipartError(): ApiError {
  return new ApiError(400, 'BAD_REQUEST', 'The multipart body is malformed or incomplete.');
}

function errorCode(error: Error): string {
  return 'code' in error && typeof error.code === 'string' ? error.code : '';
}

function errorStatusCode(error: Error): number | undefined {
  return 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined;
}
