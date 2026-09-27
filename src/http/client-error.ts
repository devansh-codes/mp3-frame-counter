import { STATUS_CODES } from 'node:http';

import { ApiError } from './api-error.js';

/** The parts of a socket this module uses. `net.Socket` satisfies it. */
export interface ClientSocket {
  readonly writable: boolean;
  end(data: string): unknown;
  destroy(): unknown;
}

/**
 * Replies to requests that Node's HTTP parser rejects before Fastify sees them (a garbage request
 * line, invalid headers, headers that are too large), using the same JSON error shape as every
 * other response. There is no request object at this point, so the reply is written to the socket.
 */
export function handleClientError(error: Error & { code?: string }, socket: ClientSocket): void {
  if (error.code === 'ECONNRESET' || !socket.writable) {
    socket.destroy();
    return;
  }

  const [statusCode, message] =
    error.code === 'HPE_HEADER_OVERFLOW'
      ? [431, 'The request headers are too large.']
      : error.code === 'ERR_HTTP_REQUEST_TIMEOUT'
        ? [408, 'The request took too long to arrive.']
        : [400, 'The request is not valid HTTP.'];

  const body = JSON.stringify(new ApiError(statusCode, 'BAD_REQUEST', message).toResponseBody());
  socket.end(
    `HTTP/1.1 ${String(statusCode)} ${String(STATUS_CODES[statusCode])}\r\n` +
      'Content-Type: application/json; charset=utf-8\r\n' +
      `Content-Length: ${String(Buffer.byteLength(body))}\r\n` +
      'Connection: close\r\n\r\n' +
      body,
  );
}
