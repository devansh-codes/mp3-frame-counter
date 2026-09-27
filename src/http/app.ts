import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import type { AppConfig } from '../config.js';
import { ApiError, sendApiError } from './api-error.js';
import { handleClientError } from './client-error.js';
import { toApiError } from './error-mapping.js';
import { registerFileUploadRoute } from './file-upload-route.js';
import { discardRestOfUpload } from './lingering-close.js';

export type AppOptions = Pick<AppConfig, 'maxFileSizeBytes'> & {
  readonly logger?: FastifyServerOptions['logger'];
};

/** Extra text fields are allowed (and ignored) so forms from tools like Postman still work. */
const MAX_FORM_FIELDS = 10;
const MAX_FORM_FIELD_BYTES = 1024;

/** Close connections that send nothing for this long. Slow but active uploads are unaffected. */
const IDLE_CONNECTION_TIMEOUT_MS = 30_000;

/**
 * Builds the HTTP app without starting it, so tests can drive it in-process with `app.inject()`.
 */
export async function buildApp({
  maxFileSizeBytes,
  logger = false,
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    connectionTimeout: IDLE_CONNECTION_TIMEOUT_MS,
    // Errors Fastify raises before routing (e.g. a malformed URL) get the same JSON error shape.
    frameworkErrors: (error, _request, reply) => {
      void sendApiError(reply, toApiError(error, maxFileSizeBytes));
    },
    // Malformed HTTP that Node rejects before routing gets the same JSON shape too.
    clientErrorHandler: handleClientError,
  });

  // Fastify parses JSON and text bodies into memory by default. This endpoint only takes
  // multipart uploads, so remove those parsers: other content types get a 415 without being read.
  app.removeAllContentTypeParsers();
  await app.register(multipart, {
    limits: {
      fileSize: maxFileSizeBytes,
      files: 1,
      fields: MAX_FORM_FIELDS,
      fieldSize: MAX_FORM_FIELD_BYTES,
    },
  });

  app.setErrorHandler((error: Error, request, reply) => {
    if (reply.raw.destroyed) {
      request.log.info({ reason: error.message }, 'Client disconnected before the upload finished');
      return;
    }

    const apiError = toApiError(error, maxFileSizeBytes);
    if (apiError.statusCode >= 500) {
      request.log.error({ err: error }, 'Request failed');
    } else {
      request.log.info({ code: apiError.code, reason: error.message }, 'Request rejected');
    }

    if (!request.raw.readableEnded) {
      discardRestOfUpload(request.raw);
    }
    return sendApiError(reply, apiError);
  });

  app.setNotFoundHandler((request, reply) =>
    sendApiError(
      reply,
      new ApiError(
        404,
        'NOT_FOUND',
        `${request.method} ${request.url} does not exist. Use POST /file-upload.`,
      ),
    ),
  );

  registerFileUploadRoute(app, { maxFileSizeBytes });
  return app;
}
