/**
 * One command to try the project locally: starts the built API (dist/server.js) and the upload
 * tester together, and stops both on Ctrl+C or if either one exits.
 *
 *   npm run demo     (builds first, then open http://localhost:5173)
 *
 * It uses child processes instead of a shell `&`, so it works the same on macOS, Linux and Windows.
 */
import { type ChildProcess, spawn } from 'node:child_process';

const API_PORT = process.env.PORT ?? '3000';

const children: ChildProcess[] = [
  start('api', ['dist/server.js'], { PORT: API_PORT, HOST: process.env.HOST ?? '127.0.0.1' }),
  start('tester', ['--import', 'tsx', 'tools/upload-tester/server.ts'], {
    API_URL: `http://127.0.0.1:${API_PORT}`,
  }),
];

function start(name: string, args: string[], env: Record<string, string>): ChildProcess {
  const child = spawn(process.execPath, args, {
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    console.log(`[demo] ${name} exited (code ${String(code)}), stopping everything`);
    stopAll(code ?? 1);
  });
  return child;
}

let stopping = false;
function stopAll(exitCode: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  process.exitCode = exitCode;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopAll(0);
  });
}
