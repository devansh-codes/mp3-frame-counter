import { describe, expect, it } from 'vitest';

import {
  describeUnsupportedHeader,
  findFrameSync,
  MAX_FRAME_LENGTH,
  parseFrameHeader,
} from '../../src/mp3/frame-header.js';
import { buildHeader, frameLengthOf } from '../helpers/mp3-builder.js';

describe('parseFrameHeader', () => {
  it('decodes a 128 kbps / 44.1 kHz joint-stereo header', () => {
    // FF FB 90 64 is the header LAME writes for 128 kbps CBR at 44.1 kHz.
    const header = parseFrameHeader(Buffer.from([0xff, 0xfb, 0x90, 0x64]), 0);

    expect(header).toEqual({
      bitrateKbps: 128,
      sampleRate: 44_100,
      hasCrc: false,
      isMono: false,
      frameLength: 417,
    });
  });

  it('adds one byte when the padding bit is set', () => {
    expect(parseFrameHeader(buildHeader({ padding: true }), 0)?.frameLength).toBe(418);
  });

  it.each([
    { bitrateIndex: 1, sampleRateIndex: 1, padding: false, expected: 96 }, // smallest: 32 kbps @ 48 kHz
    { bitrateIndex: 14, sampleRateIndex: 2, padding: true, expected: 1441 }, // largest: 320 kbps @ 32 kHz
    { bitrateIndex: 14, sampleRateIndex: 1, padding: false, expected: 960 },
    { bitrateIndex: 1, sampleRateIndex: 0, padding: true, expected: 105 },
  ])(
    'computes frame length $expected for bitrate index $bitrateIndex, sample-rate index $sampleRateIndex',
    ({ expected, ...options }) => {
      expect(parseFrameHeader(buildHeader(options), 0)?.frameLength).toBe(expected);
    },
  );

  it('uses MAX_FRAME_LENGTH as the true maximum over every bitrate, sample rate and padding', () => {
    const lengths = [];
    for (let bitrateIndex = 1; bitrateIndex <= 14; bitrateIndex++) {
      for (let sampleRateIndex = 0; sampleRateIndex <= 2; sampleRateIndex++) {
        for (const padding of [false, true]) {
          const options = { bitrateIndex, sampleRateIndex, padding };
          const length = parseFrameHeader(buildHeader(options), 0)?.frameLength;
          expect(length).toBe(frameLengthOf(options));
          lengths.push(length ?? 0);
        }
      }
    }
    expect(Math.max(...lengths)).toBe(MAX_FRAME_LENGTH);
  });

  it('reports CRC protection and mono channel mode', () => {
    expect(parseFrameHeader(buildHeader({ hasCrc: true }), 0)?.hasCrc).toBe(true);
    expect(parseFrameHeader(buildHeader({ channelMode: 0b11 }), 0)?.isMono).toBe(true);
  });

  it('reads the header at the given offset', () => {
    const bytes = Buffer.concat([Buffer.from([0x00, 0x01, 0x02]), buildHeader()]);
    expect(parseFrameHeader(bytes, 3)?.frameLength).toBe(417);
  });

  it.each([
    ['a missing sync word', Buffer.from([0xff, 0x1b, 0x90, 0x64])],
    ['MPEG-2', buildHeader({ version: 0b10 })],
    ['MPEG-2.5', buildHeader({ version: 0b00 })],
    ['the reserved version', buildHeader({ version: 0b01 })],
    ['Layer II', buildHeader({ layer: 0b10 })],
    ['Layer I', buildHeader({ layer: 0b11 })],
    ['the reserved layer', buildHeader({ layer: 0b00 })],
    ['a free-format bitrate', buildHeader({ bitrateIndex: 0 })],
    ['the invalid bitrate index', buildHeader({ bitrateIndex: 15 })],
    ['the reserved sample rate', buildHeader({ sampleRateIndex: 3 })],
  ])('rejects %s', (_description, bytes) => {
    expect(parseFrameHeader(bytes, 0)).toBeUndefined();
  });
});

describe('describeUnsupportedHeader', () => {
  it.each([
    ['MPEG-2 Layer III', buildHeader({ version: 0b10 })],
    ['MPEG-2.5 Layer III', buildHeader({ version: 0b00 })],
    ['MPEG-1 Layer II', buildHeader({ layer: 0b10 })],
    ['MPEG-1 Layer I', buildHeader({ layer: 0b11 })],
    ['MPEG-1 Layer III with a free-format bitrate', buildHeader({ bitrateIndex: 0 })],
  ])('names %s', (expected, bytes) => {
    expect(describeUnsupportedHeader(bytes, 0)).toBe(expected);
  });

  it.each([
    ['a supported MPEG-1 Layer III header', buildHeader()],
    ['bytes without a sync word', Buffer.from('RIFF', 'latin1')],
    ['a reserved version', buildHeader({ version: 0b01 })],
    ['a reserved layer', buildHeader({ layer: 0b00 })],
    ['an invalid bitrate', buildHeader({ version: 0b10, bitrateIndex: 15 })],
    ['a reserved sample rate', buildHeader({ version: 0b10, sampleRateIndex: 3 })],
  ])('returns undefined for %s', (_description, bytes) => {
    expect(describeUnsupportedHeader(bytes, 0)).toBeUndefined();
  });
});

describe('findFrameSync', () => {
  it.each([
    ['a header at the start', [0xff, 0xfb, 0x90, 0x64], 0, 0],
    ['a CRC-protected header after junk', [0x00, 0x12, 0xff, 0xfa, 0x90], 0, 2],
    ['a header after a run of 0xFF bytes', [0xff, 0xff, 0xff, 0xfb, 0x90], 0, 2],
    ['the search start offset', [0xff, 0xfb, 0x00, 0xff, 0xfb], 1, 3],
    ['a trailing 0xFF whose next byte has not arrived', [0x00, 0x00, 0xff], 0, 2],
  ])('finds %s', (_name, bytes, from, expected) => {
    expect(findFrameSync(Buffer.from(bytes), from)).toBe(expected);
  });

  it.each([
    ['no 0xFF at all', [0x00, 0x11, 0x22]],
    ['0xFF followed by a non-Layer-III byte', [0xff, 0xf3, 0xff, 0xe0, 0x00]],
    ['an empty buffer', []],
  ])('returns the buffer length for %s', (_name, bytes) => {
    expect(findFrameSync(Buffer.from(bytes), 0)).toBe(bytes.length);
  });
});
