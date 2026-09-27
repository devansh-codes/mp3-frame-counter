import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_LINGER_TIMEOUT_MS, discardRestOfUpload } from '../../src/http/lingering-close.js';

function fakeRequest() {
  const destroy = vi.fn();
  const resume = vi.fn();
  const request = Object.assign(new EventEmitter(), { socket: { destroy }, resume });
  return { request, destroy, resume };
}

describe('discardRestOfUpload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps reading (and discarding) the rest of the upload', () => {
    const { request, resume } = fakeRequest();
    discardRestOfUpload(request);
    expect(resume).toHaveBeenCalledOnce();
  });

  it('destroys the socket if the client is still sending after the timeout', () => {
    const { request, destroy } = fakeRequest();
    discardRestOfUpload(request);

    vi.advanceTimersByTime(DEFAULT_LINGER_TIMEOUT_MS - 1);
    expect(destroy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('leaves the socket alone once the request has closed', () => {
    const { request, destroy } = fakeRequest();
    discardRestOfUpload(request, 100);

    request.emit('close');
    vi.advanceTimersByTime(1000);

    expect(destroy).not.toHaveBeenCalled();
  });
});
