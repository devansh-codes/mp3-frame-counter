import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { afterEach, describe, expect, it } from 'vitest';

import { readFixture } from '../helpers/mp3-builder.js';
import { formWithFile } from '../helpers/multipart.js';

/** Starts the real server process (src/server.ts) on a random port and waits until it's listening. */
async function startServer(): Promise<{ process: ChildProcess; baseUrl: string }> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', LOG_LEVEL: 'info' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  for await (const line of createInterface({ input: child.stdout })) {
    const match = /Server listening at (http:\/\/127\.0\.0\.1:\d+)/.exec(line);
    if (match?.[1] !== undefined) {
      child.stdout.resume(); // keep draining logs so the child never blocks on a full pipe
      return { process: child, baseUrl: match[1] };
    }
  }
  throw new Error('Server exited before it started listening');
}

describe('server process', () => {
  let server: ChildProcess | undefined;

  afterEach(() => {
    server?.kill('SIGKILL');
  });

  it('starts, serves the sample and shuts down cleanly on SIGTERM', async () => {
    const started = await startServer();
    server = started.process;

    const response = await fetch(`${started.baseUrl}/file-upload`, {
      method: 'POST',
      body: formWithFile(readFixture('sample.mp3'), { filename: 'sample.mp3' }),
    });
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await response.json()).toEqual({ frameCount: 6089 });

    server.kill('SIGTERM');
    const [exitCode] = (await once(server, 'exit')) as [number | null];
    expect(exitCode).toBe(0);
  });

  it('refuses to start with invalid configuration', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
      env: { ...process.env, PORT: 'not-a-port' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    server = child;

    const [exitCode] = (await once(child, 'exit')) as [number | null];
    expect(exitCode).not.toBe(0);
  });
});
