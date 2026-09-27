import type { FastifyReply } from 'fastify';

import { BYTES_PER_MEGABYTE } from '../config.js';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'MISSING_FILE'
  | 'TOO_MANY_FILES'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'EMPTY_FILE'
  | 'INVALID_MP3'
  | 'UNSUPPORTED_MP3_FORMAT'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'INTERNAL_SERVER_ERROR';

/** Every error response has this shape. */
export interface ErrorResponseBody {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
  };
}

/** An error we expect and can explain to the client. The message is safe to send back. */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toResponseBody(): ErrorResponseBody {
    return { error: { code: this.code, message: this.message } };
  }
}

export function sendApiError(reply: FastifyReply, error: ApiError): FastifyReply {
  return reply.code(error.statusCode).send(error.toResponseBody());
}

export function fileTooLargeError(maxFileSizeBytes: number): ApiError {
  const megabytes = Math.round((maxFileSizeBytes / BYTES_PER_MEGABYTE) * 100) / 100;
  return new ApiError(
    413,
    'FILE_TOO_LARGE',
    `The file is larger than the ${String(megabytes)} MB upload limit.`,
  );
}

export function unsupportedMediaTypeError(): ApiError {
  return new ApiError(
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    'Send the MP3 as multipart/form-data, for example: curl -F "file=@song.mp3" <host>/file-upload',
  );
}
