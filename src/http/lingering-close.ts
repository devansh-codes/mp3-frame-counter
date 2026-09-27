/** The parts of an incoming request this module uses. `http.IncomingMessage` satisfies it. */
export interface UnfinishedRequest {
  readonly socket: { destroy(): void };
  once(event: 'close', listener: () => void): unknown;
  resume(): unknown;
}

export const DEFAULT_LINGER_TIMEOUT_MS = 5000;

/**
 * Call this when replying before the client has finished uploading (e.g. the file is too large).
 *
 * Closing the socket straight away can make TCP reset the connection, and the client may never see
 * our reply. Instead we keep reading and discarding the upload so the reply gets through, then give
 * up after a timeout so a client that keeps sending can't hold the connection open. This is the
 * "lingering close" technique nginx and Apache use.
 */
export function discardRestOfUpload(
  request: UnfinishedRequest,
  timeoutMs: number = DEFAULT_LINGER_TIMEOUT_MS,
): void {
  const giveUp = setTimeout(() => {
    request.socket.destroy();
  }, timeoutMs).unref();

  request.once('close', () => {
    clearTimeout(giveUp);
  });
  request.resume();
}
