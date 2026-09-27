/**
 * Upload tester: a local page for trying the API by hand with real files. It is a dev tool, not part
 * of the API.
 *
 * This server does two things:
 *   GET  /             serves index.html
 *   *    /file-upload  forwards the request to the API and relays the response
 *
 * Because the page and /file-upload share one origin, the browser needs no CORS and the API stays
 * exactly as it is. The upload is streamed through with pipe(), so the proxy never holds the file.
 *
 *   npm run tester    (env: API_URL=http://127.0.0.1:3000, TESTER_PORT=5173, TESTER_HOST=127.0.0.1)
 */
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { pipeline } from 'node:stream';

const apiUrl = new URL(process.env.API_URL ?? 'http://127.0.0.1:3000');
const port = Number(process.env.TESTER_PORT ?? 5173);
// Local only by default. Docker sets 0.0.0.0 so the published port can reach it.
const host = process.env.TESTER_HOST ?? '127.0.0.1';

const INDEX_HTML = new URL('index.html', import.meta.url);

/** These headers describe one connection, so a proxy must not copy them onto the next one. */
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
]);

const server = http.createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://tester').pathname;

  if (path === '/' && request.method === 'GET') {
    // Read on every request, so edits to the page show up on refresh.
    readFile(INDEX_HTML).then(
      (html) =>
        response
          .writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
          })
          .end(html),
      (error: unknown) =>
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(error)),
    );
  } else if (path === '/file-upload') {
    forwardToApi(request, response);
  } else {
    response
      .writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      .end('Not found. Open / for the upload tester.\n');
  }
});

function forwardToApi(request: http.IncomingMessage, response: http.ServerResponse): void {
  const upstream = http.request(new URL(request.url ?? '/', apiUrl), {
    method: request.method,
    headers: { ...withoutHopByHopHeaders(request.headers), host: apiUrl.host },
  });

  // Relay the API's status, headers and body as they arrive. The API may answer before the upload
  // has finished (e.g. 413 as soon as the size limit is crossed), and that is relayed straight away.
  upstream.on('response', (apiResponse) => {
    response.writeHead(apiResponse.statusCode ?? 502, withoutHopByHopHeaders(apiResponse.headers));
    // pipeline() destroys the browser response if the API connection breaks mid-body.
    pipeline(apiResponse, response, () => undefined);
  });

  upstream.on('error', (error) => {
    // Stop forwarding and quietly discard the rest of the upload, so the client still gets a reply.
    request.unpipe(upstream);
    request.resume();
    if (!response.headersSent) {
      sendProxyError(response, error);
    } else if (!response.writableEnded) {
      response.destroy();
    }
  });

  // If the browser disconnects before we have replied, cancel the request to the API too.
  response.on('close', () => {
    if (!response.writableFinished) {
      upstream.destroy();
    }
  });

  // Stream the upload to the API chunk by chunk. pipe() applies backpressure: when the API reads
  // slowly, reading from the browser pauses, so memory use stays flat whatever the file size.
  request.pipe(upstream);
}

/** The API could not be reached (e.g. it isn't running). The code makes clear the proxy said this. */
function sendProxyError(response: http.ServerResponse, error: Error): void {
  const body = {
    error: {
      code: 'TESTER_PROXY_ERROR',
      message: `The upload tester could not reach the API at ${apiUrl.origin}: ${error.message}`,
    },
  };
  response
    .writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
    .end(JSON.stringify(body));
}

function withoutHopByHopHeaders(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !HOP_BY_HOP_HEADERS.has(name)),
  );
}

server.listen(port, host, () => {
  console.log(`Upload tester: http://localhost:${String(port)}`);
  console.log(`Forwarding /file-upload to ${apiUrl.origin}`);
});
