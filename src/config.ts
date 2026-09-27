export interface AppConfig {
  readonly host: string;
  readonly port: number;
  /** Uploads larger than this are rejected with 413. Parsing is streamed, so this is not a memory limit. */
  readonly maxFileSizeBytes: number;
  readonly logLevel: LogLevel;
}

export const BYTES_PER_MEGABYTE = 1024 * 1024;

const DEFAULTS = {
  host: '0.0.0.0',
  port: 3000,
  maxFileSizeMegabytes: 2048,
  logLevel: 'info',
} as const;

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

/** Reads configuration from environment variables. Throws on invalid values, so bad config fails at startup. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const logLevel = env.LOG_LEVEL ?? DEFAULTS.logLevel;
  if (!isLogLevel(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}. Got "${logLevel}".`);
  }

  return {
    host: env.HOST ?? DEFAULTS.host,
    port: readInteger(env, 'PORT', DEFAULTS.port, { min: 0, max: 65_535 }),
    maxFileSizeBytes:
      readInteger(env, 'MAX_FILE_SIZE_MB', DEFAULTS.maxFileSizeMegabytes, { min: 1 }) *
      BYTES_PER_MEGABYTE,
    logLevel,
  };
}

function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
  { min, max = Number.MAX_SAFE_INTEGER }: { min: number; max?: number },
): number {
  const raw = env[name];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `${name} must be an integer between ${String(min)} and ${String(max)}. Got "${raw}".`,
    );
  }
  return value;
}
