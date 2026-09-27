import { describe, expect, it } from 'vitest';

import { parseFrameHeader } from '../../src/mp3/frame-header.js';
import { detectMetadataFrame } from '../../src/mp3/metadata-frame.js';
import {
  buildFrame,
  buildMetadataFrame,
  type HeaderOptions,
  readFixture,
} from '../helpers/mp3-builder.js';

function detect(frame: Buffer): ReturnType<typeof detectMetadataFrame> {
  const header = parseFrameHeader(frame, 0);
  if (header === undefined) {
    throw new Error('test frame has an invalid header');
  }
  return detectMetadataFrame(frame, 0, header);
}

const STEREO: HeaderOptions = { channelMode: 0b00 };
const MONO: HeaderOptions = { channelMode: 0b11 };

describe('detectMetadataFrame', () => {
  it('detects "Xing" after the 32-byte side info of a stereo frame (offset 36)', () => {
    expect(detect(buildMetadataFrame('Xing', 36, STEREO))).toBe('Xing');
  });

  it('detects "Info" after the 17-byte side info of a mono frame (offset 21)', () => {
    expect(detect(buildMetadataFrame('Info', 21, MONO))).toBe('Info');
  });

  it('detects "VBRI" at its fixed offset of 36', () => {
    expect(detect(buildMetadataFrame('VBRI', 36, MONO))).toBe('VBRI');
  });

  it('finds the tag at offset 36 in CRC-protected frames, where LAME writes it', () => {
    expect(detect(buildMetadataFrame('Info', 36, { ...STEREO, hasCrc: true }))).toBe('Info');
  });

  it('also accepts the tag 2 bytes later in CRC-protected frames', () => {
    expect(detect(buildMetadataFrame('Xing', 38, { ...STEREO, hasCrc: true }))).toBe('Xing');
  });

  it('does not look 2 bytes later when there is no CRC', () => {
    expect(detect(buildMetadataFrame('Xing', 38, STEREO))).toBeUndefined();
  });

  it('does not use the stereo offset for mono frames', () => {
    expect(detect(buildMetadataFrame('Xing', 36, MONO))).toBeUndefined();
  });

  it('returns undefined for an ordinary audio frame', () => {
    expect(detect(buildFrame())).toBeUndefined();
  });

  it.each([
    ['cbr128-info.mp3', 'Info'],
    ['cbr128-crc.mp3', 'Info'],
    ['mono-cbr.mp3', 'Info'],
    ['vbr-xing.mp3', 'Xing'],
    ['cbr128-no-info.mp3', undefined],
  ])('finds the metadata frame written by a real encoder in %s', (fixture, expected) => {
    expect(detect(readFixture(fixture))).toBe(expected);
  });
});
