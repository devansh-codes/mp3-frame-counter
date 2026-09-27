import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));

export function readFixture(name: string): Buffer {
  return readFileSync(`${FIXTURES_DIR}${name}`);
}

export interface HeaderOptions {
  /** 0b11 = MPEG-1, 0b10 = MPEG-2, 0b00 = MPEG-2.5 */
  readonly version?: number;
  /** 0b01 = Layer III, 0b10 = Layer II, 0b11 = Layer I */
  readonly layer?: number;
  readonly hasCrc?: boolean;
  readonly bitrateIndex?: number;
  /** 0 = 44.1 kHz, 1 = 48 kHz, 2 = 32 kHz */
  readonly sampleRateIndex?: number;
  readonly padding?: boolean;
  /** 0b00 stereo, 0b01 joint stereo, 0b10 dual channel, 0b11 mono */
  readonly channelMode?: number;
}

/** Builds a 4-byte frame header. Defaults: MPEG-1 Layer III, 128 kbps, 44.1 kHz, joint stereo. */
export function buildHeader(options: HeaderOptions = {}): Buffer {
  const {
    version = 0b11,
    layer = 0b01,
    hasCrc = false,
    bitrateIndex = 9,
    sampleRateIndex = 0,
    padding = false,
    channelMode = 0b01,
  } = options;

  const header =
    ((0x7ff << 21) |
      (version << 19) |
      (layer << 17) |
      ((hasCrc ? 0 : 1) << 16) |
      (bitrateIndex << 12) |
      (sampleRateIndex << 10) |
      ((padding ? 1 : 0) << 9) |
      (channelMode << 6)) >>>
    0;

  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(header);
  return bytes;
}

const BITRATES_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const SAMPLE_RATES_HZ = [44_100, 48_000, 32_000];

/** Length in bytes of an MPEG-1 Layer III frame, computed independently of the code under test. */
export function frameLengthOf(options: HeaderOptions = {}): number {
  const bitrate = (BITRATES_KBPS[options.bitrateIndex ?? 9] ?? 0) * 1000;
  const sampleRate = SAMPLE_RATES_HZ[options.sampleRateIndex ?? 0] ?? 1;
  return Math.floor((144 * bitrate) / sampleRate) + (options.padding === true ? 1 : 0);
}

/** A complete MPEG-1 Layer III frame: header followed by zeroed side info and main data. */
export function buildFrame(options: HeaderOptions = {}): Buffer {
  const frame = Buffer.alloc(frameLengthOf(options));
  buildHeader(options).copy(frame);
  return frame;
}

/** A metadata frame: a normal frame with a Xing/Info/VBRI tag written at `tagOffset`. */
export function buildMetadataFrame(
  tag: 'Xing' | 'Info' | 'VBRI',
  tagOffset: number,
  options: HeaderOptions = {},
): Buffer {
  const frame = buildFrame(options);
  frame.write(tag, tagOffset, 'latin1');
  return frame;
}

export function buildFrames(count: number, options: HeaderOptions = {}): Buffer {
  return Buffer.concat(Array.from({ length: count }, () => buildFrame(options)));
}

/** An ID3v2 tag whose body is `body` (syncsafe size encoding). */
export function buildId3v2Tag(
  body: Buffer,
  options: { majorVersion?: number; footer?: boolean } = {},
): Buffer {
  const { majorVersion = 3, footer = false } = options;
  const size = body.length;
  const header = Buffer.from([
    0x49,
    0x44,
    0x33, // "ID3"
    majorVersion,
    0,
    footer ? 0x10 : 0,
    (size >>> 21) & 0x7f,
    (size >>> 14) & 0x7f,
    (size >>> 7) & 0x7f,
    size & 0x7f,
  ]);
  const footerBytes = footer
    ? Buffer.from([0x33, 0x44, 0x49, ...header.subarray(3)])
    : Buffer.alloc(0);
  return Buffer.concat([header, body, footerBytes]);
}

/** A 128-byte ID3v1 tag. */
export function buildId3v1Tag(): Buffer {
  const tag = Buffer.alloc(128, 0x20);
  tag.write('TAG', 0, 'latin1');
  return tag;
}

/** An APEv2 tag with header and footer (as normally found before an ID3v1 tag). */
export function buildApeTag(): Buffer {
  const item = Buffer.concat([
    Buffer.from([11, 0, 0, 0, 0, 0, 0, 0]),
    Buffer.from('Artist\0Test Artist', 'latin1'),
  ]);
  const block = (flags: number): Buffer => {
    const b = Buffer.alloc(32);
    b.write('APETAGEX', 0, 'latin1');
    b.writeUInt32LE(2000, 8);
    b.writeUInt32LE(item.length + 32, 12);
    b.writeUInt32LE(1, 16);
    b.writeUInt32LE(flags >>> 0, 20);
    return b;
  };
  const HAS_HEADER = 0x80000000;
  const IS_HEADER = 0x20000000;
  return Buffer.concat([block(HAS_HEADER | IS_HEADER), item, block(HAS_HEADER)]);
}

/** Deterministic pseudo-random bytes (so tests are reproducible). */
export function seededRandomBytes(length: number, seed: number): Buffer {
  const bytes = Buffer.alloc(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    bytes[i] = state >>> 24;
  }
  return bytes;
}

/** Splits `data` into chunks whose sizes come from `nextSize` (0-byte chunks allowed). */
export function splitIntoChunks(data: Buffer, nextSize: () => number): Buffer[] {
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < data.length) {
    const size = Math.max(0, nextSize());
    chunks.push(data.subarray(offset, offset + size));
    offset += size;
  }
  return chunks;
}

/** A seeded random chunk-size generator producing sizes in [0, maxSize). */
export function randomChunkSizes(seed: number, maxSize: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    return Math.floor((state / 2 ** 32) * maxSize);
  };
}
