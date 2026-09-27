import type { MultipartFile } from '@fastify/multipart';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { countFramesInStream } from '../mp3/frame-counter.js';
import {
  ApiError,
  fileTooLargeError,
  sendApiError,
  unsupportedMediaTypeError,
} from './api-error.js';
import { apiErrorFromCountFailure } from './error-mapping.js';

export interface FrameCountResponseBody {
  readonly frameCount: number;
}

/**
 * The response schema makes the contract exact. Fastify serialises only these properties, so no
 * extra keys can leak into the response.
 */
const frameCountResponseSchema = {
  type: 'object',
  properties: { frameCount: { type: 'integer', minimum: 0 } },
  required: ['frameCount'],
  additionalProperties: false,
} as const;

export function registerFileUploadRoute(
  app: FastifyInstance,
  { maxFileSizeBytes }: { maxFileSizeBytes: number },
): void {
  app.post(
    '/file-upload',
    { schema: { response: { 200: frameCountResponseSchema } } },
    async (request): Promise<FrameCountResponseBody> => {
      if (!request.isMultipart()) {
        throw unsupportedMediaTypeError();
      }

      // Any file field name is accepted. Ordinary form fields are ignored. A second file makes the
      // parts iterator throw FST_FILES_LIMIT (see the `files: 1` limit in app.ts).
      let frameCount: number | undefined;
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          frameCount = await countFramesInUpload(request, part, maxFileSizeBytes);
        }
      }

      if (frameCount === undefined) {
        throw new ApiError(
          400,
          'MISSING_FILE',
          'The request contains no file. Attach the MP3 as a form-data file field.',
        );
      }
      return { frameCount };
    },
  );

  app.route({
    method: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    url: '/file-upload',
    handler: methodNotAllowed,
  });
}

/**
 * Streams the uploaded file straight into the frame counter as it arrives. The file is never
 * buffered in memory or written to disk, so memory use doesn't depend on file size.
 */
async function countFramesInUpload(
  request: FastifyRequest,
  upload: MultipartFile,
  maxFileSizeBytes: number,
): Promise<number> {
  // When the limit is hit, busboy just truncates the stream. Fail straight away instead, so the
  // client isn't left uploading the rest of a file we are going to reject.
  upload.file.once('limit', () => {
    upload.file.destroy(fileTooLargeError(maxFileSizeBytes));
  });

  const result = await countFramesInStream(upload.file);
  // If the whole body arrived at once, busboy may truncate the file before our listener runs.
  if (upload.file.truncated) {
    throw fileTooLargeError(maxFileSizeBytes);
  }
  if (!result.ok) {
    throw apiErrorFromCountFailure(result);
  }

  const summary = {
    filename: upload.filename,
    frameCount: result.frameCount,
    metadataFrame: result.metadataFrame,
    truncatedFinalFrame: result.truncatedFinalFrame,
  };
  if (result.truncatedFinalFrame) {
    request.log.warn(summary, 'Counted MP3 frames; the last frame is truncated');
  } else {
    request.log.info(summary, 'Counted MP3 frames');
  }
  return result.frameCount;
}

function methodNotAllowed(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  const error = new ApiError(
    405,
    'METHOD_NOT_ALLOWED',
    `${request.method} is not supported on /file-upload. Use POST.`,
  );
  return sendApiError(reply.header('allow', 'POST'), error);
}
