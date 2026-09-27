import { connect } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/http/app.js';
import { handleClientError } from '../../src/http/client-error.js';

function fakeSocket(writable = true) {
  const end = vi.fn();
  const destroy = vi.fn();
  return { socket: { writable, end, destroy }, end, destroy };
}

describe('handleClientError', () => {
  it.each([
    ['HPE_INVALID_METHOD', 'HTTP/1.1 400 Bad Request', 'The request is not valid HTTP.'],
    ['HPE_HEADER_OVERFLOW', 'HTTP/1.1 431 Request Header Fields Too Large', 'too large'],
    ['ERR_HTTP_REQUEST_TIMEOUT', 'HTTP/1.1 408 Request Timeout', 'too long'],
  ])('answers %s with a JSON error', (code, statusLine, message) => {
    const { socket, end } = fakeSocket();
    handleClientError(Object.assign(new Error('parse error'), { code }), socket);

    const response = String(end.mock.calls[0]?.[0]);
    expect(response.startsWith(statusLine)).toBe(true);
    expect(response).toContain('Content-Type: application/json; charset=utf-8');
    expect(response).toContain('"code":"BAD_REQUEST"');
    expect(response).toContain(message);
  });

  it('just closes a socket that was reset or can no longer be written to', () => {
    const reset = fakeSocket();
    handleClientError(Object.assign(new Error('reset'), { code: 'ECONNRESET' }), reset.socket);
    expect(reset.destroy).toHaveBeenCalledOnce();
    expect(reset.end).not.toHaveBeenCalled();

    const closed = fakeSocket(false);
    handleClientError(new Error('closed'), closed.socket);
    expect(closed.destroy).toHaveBeenCalledOnce();
  });
});

describe('malformed HTTP over a real socket', () => {
  let app: FastifyInstance;
  let port: number;

  beforeAll(async () => {
    app = await buildApp({ maxFileSizeBytes: 1024 * 1024 });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    port = typeof address === 'object' && address !== null ? address.port : 0;
  });

  afterAll(async () => {
    await app.close();
  });

  function sendRaw(request: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => socket.end(request));
      let response = '';
      socket.on('data', (chunk: Buffer) => (response += chunk.toString()));
      socket.on('end', () => {
        resolve(response);
      });
      socket.on('error', reject);
    });
  }

  it('answers a garbage request line with the JSON error shape', async () => {
    const response = await sendRaw('THIS IS NOT HTTP\r\n\r\n');

    expect(response.startsWith('HTTP/1.1 400')).toBe(true);
    expect(response).toContain('Content-Type: application/json; charset=utf-8');
    expect(response).toContain(
      '{"error":{"code":"BAD_REQUEST","message":"The request is not valid HTTP."}}',
    );
  });
});
