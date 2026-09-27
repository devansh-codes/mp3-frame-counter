import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('uses defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({
      host: '0.0.0.0',
      port: 3000,
      maxFileSizeBytes: 2048 * 1024 * 1024,
      logLevel: 'info',
    });
  });

  it('reads values from the environment', () => {
    const env = { HOST: '127.0.0.1', PORT: '8080', MAX_FILE_SIZE_MB: '50', LOG_LEVEL: 'debug' };
    expect(loadConfig(env)).toEqual({
      host: '127.0.0.1',
      port: 8080,
      maxFileSizeBytes: 50 * 1024 * 1024,
      logLevel: 'debug',
    });
  });

  it('treats empty strings as unset', () => {
    expect(loadConfig({ PORT: '', MAX_FILE_SIZE_MB: '' }).port).toBe(3000);
  });

  it.each([
    [{ PORT: 'abc' }, 'PORT must be an integer between 0 and 65535. Got "abc".'],
    [{ PORT: '70000' }, 'PORT must be an integer'],
    [{ PORT: '30.5' }, 'PORT must be an integer'],
    [{ MAX_FILE_SIZE_MB: '0' }, 'MAX_FILE_SIZE_MB must be an integer'],
    [{ MAX_FILE_SIZE_MB: '-5' }, 'MAX_FILE_SIZE_MB must be an integer'],
    [{ LOG_LEVEL: 'loud' }, 'LOG_LEVEL must be one of'],
  ])('rejects invalid values: %o', (env, message) => {
    expect(() => loadConfig(env)).toThrow(message);
  });
});
