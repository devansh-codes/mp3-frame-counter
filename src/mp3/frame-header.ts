/**
 * MPEG audio frame header decoding, MPEG-1 Layer III only.
 *
 * A frame header is 32 bits, big-endian:
 *
 *   AAAAAAAA AAABBCCD EEEEFFGH IIJJKLMM
 *
 *   A sync (all ones)   B version    C layer      D protection (0 = CRC follows)
 *   E bitrate index     F sample rate index        G padding     H private
 *   I channel mode      J mode ext   K copyright  L original    M emphasis
 */

export const HEADER_SIZE = 4;

/** Largest possible MPEG-1 Layer III frame: 320 kbps at 32 kHz, padded. */
export const MAX_FRAME_LENGTH = 1441;

// Index 0 is "free format" and 15 is invalid: neither gives a frame length.
// prettier-ignore
const BITRATES_KBPS: readonly (number | undefined)[] = [
  undefined, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, undefined,
];
const SAMPLE_RATES_HZ: readonly (number | undefined)[] = [44_100, 48_000, 32_000, undefined];

const VERSION_NAMES: readonly (string | undefined)[] = ['MPEG-2.5', undefined, 'MPEG-2', 'MPEG-1'];
const LAYER_NAMES: readonly (string | undefined)[] = [
  undefined,
  'Layer III',
  'Layer II',
  'Layer I',
];

const SYNC_WORD = 0x7ff;
const MPEG_1 = 0b11;
const LAYER_3 = 0b01;
const FREE_FORMAT_BITRATE_INDEX = 0b0000;
const INVALID_BITRATE_INDEX = 0b1111;
const RESERVED_SAMPLE_RATE_INDEX = 0b11;
const MONO = 0b11;

/** MPEG-1 Layer III: bytes per frame = 144 * bitrate / sampleRate (+ 1 if padded). */
const BYTES_PER_FRAME_FACTOR = 144;

export interface FrameHeader {
  readonly bitrateKbps: number;
  readonly sampleRate: number;
  readonly hasCrc: boolean;
  readonly isMono: boolean;
  /** The whole frame in bytes: header, optional CRC, side info and main data. */
  readonly frameLength: number;
}

interface HeaderFields {
  readonly version: number;
  readonly layer: number;
  readonly protectionBit: number;
  readonly bitrateIndex: number;
  readonly sampleRateIndex: number;
  readonly padding: number;
  readonly channelMode: number;
}

function readHeaderFields(bytes: Buffer, offset: number): HeaderFields | undefined {
  const header = bytes.readUInt32BE(offset);
  if (header >>> 21 !== SYNC_WORD) {
    return undefined;
  }
  return {
    version: (header >>> 19) & 0b11,
    layer: (header >>> 17) & 0b11,
    protectionBit: (header >>> 16) & 0b1,
    bitrateIndex: (header >>> 12) & 0b1111,
    sampleRateIndex: (header >>> 10) & 0b11,
    padding: (header >>> 9) & 0b1,
    channelMode: (header >>> 6) & 0b11,
  };
}

/**
 * Finds the next position at or after `from` where an MPEG-1 Layer III frame could start: a 0xFF
 * byte followed by 0xFA or 0xFB (sync, MPEG-1, Layer III, with or without CRC). Returns the last
 * index if the buffer ends in 0xFF (the next byte hasn't arrived yet), or `bytes.length` if there is
 * no candidate. Checking two bytes first keeps junk and hostile input (e.g. all 0xFF) cheap to skip.
 */
export function findFrameSync(bytes: Buffer, from: number): number {
  let position = bytes.indexOf(0xff, from);
  while (position !== -1) {
    const next = bytes[position + 1];
    if (next === undefined || (next & 0xfe) === 0xfa) {
      return position;
    }
    // A run of 0xFF bytes is stepped through directly; otherwise jump to the next 0xFF.
    position = next === 0xff ? position + 1 : bytes.indexOf(0xff, position + 2);
  }
  return bytes.length;
}

/**
 * Decodes the MPEG-1 Layer III frame header at `offset`. Returns `undefined` if the bytes there are
 * not one. The caller must make sure at least HEADER_SIZE bytes are available.
 */
export function parseFrameHeader(bytes: Buffer, offset: number): FrameHeader | undefined {
  const fields = readHeaderFields(bytes, offset);
  if (fields?.version !== MPEG_1 || fields.layer !== LAYER_3) {
    return undefined;
  }

  const bitrateKbps = BITRATES_KBPS[fields.bitrateIndex];
  const sampleRate = SAMPLE_RATES_HZ[fields.sampleRateIndex];
  if (bitrateKbps === undefined || sampleRate === undefined) {
    return undefined;
  }

  return {
    bitrateKbps,
    sampleRate,
    hasCrc: fields.protectionBit === 0,
    isMono: fields.channelMode === MONO,
    frameLength:
      Math.floor((BYTES_PER_FRAME_FACTOR * bitrateKbps * 1000) / sampleRate) + fields.padding,
  };
}

/**
 * If the bytes at `offset` form a well-formed MPEG audio header that this service does not support
 * (another MPEG version or layer, or a free-format bitrate), returns a readable name for it, such as
 * "MPEG-2 Layer III". Only the header bits are checked: other formats are deliberately not parsed.
 */
export function describeUnsupportedHeader(bytes: Buffer, offset: number): string | undefined {
  const fields = readHeaderFields(bytes, offset);
  if (
    fields === undefined ||
    fields.bitrateIndex === INVALID_BITRATE_INDEX ||
    fields.sampleRateIndex === RESERVED_SAMPLE_RATE_INDEX
  ) {
    return undefined;
  }

  const version = VERSION_NAMES[fields.version];
  const layer = LAYER_NAMES[fields.layer];
  if (version === undefined || layer === undefined) {
    return undefined;
  }

  if (fields.version === MPEG_1 && fields.layer === LAYER_3) {
    return fields.bitrateIndex === FREE_FORMAT_BITRATE_INDEX
      ? 'MPEG-1 Layer III with a free-format bitrate'
      : undefined;
  }
  return `${version} ${layer}`;
}
