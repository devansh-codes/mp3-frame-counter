import { describe, expect, it } from 'vitest';

import { readId3v2TagSize } from '../../src/mp3/id3v2.js';
import { buildId3v2Tag } from '../helpers/mp3-builder.js';

describe('readId3v2TagSize', () => {
  it('returns header + body size, decoding the syncsafe size', () => {
    // 300 needs more than 7 bits, so this exercises the syncsafe encoding.
    const tag = buildId3v2Tag(Buffer.alloc(300));
    expect(readId3v2TagSize(tag, 0)).toBe(310);
  });

  it('handles the largest syncsafe size (2^28 - 1)', () => {
    const header = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0x7f, 0x7f, 0x7f, 0x7f]);
    expect(readId3v2TagSize(header, 0)).toBe(10 + (2 ** 28 - 1));
  });

  it('includes the 10-byte footer of an ID3v2.4 tag that has one', () => {
    const tag = buildId3v2Tag(Buffer.alloc(20), { majorVersion: 4, footer: true });
    expect(readId3v2TagSize(tag, 0)).toBe(40);
    expect(tag.length).toBe(40);
  });

  it('ignores the footer flag bit in versions before 2.4', () => {
    const header = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0x10, 0, 0, 0, 20]);
    expect(readId3v2TagSize(header, 0)).toBe(30);
  });

  it('reads the tag at the given offset', () => {
    const bytes = Buffer.concat([Buffer.alloc(5), buildId3v2Tag(Buffer.alloc(7))]);
    expect(readId3v2TagSize(bytes, 5)).toBe(17);
  });

  it.each([
    [
      'bytes that do not start with "ID3"',
      Buffer.from('ID4\x03\x00\x00\x00\x00\x00\x0a', 'latin1'),
    ],
    ['a size byte with the high bit set', Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0x80, 0])],
    ['version 0xFF', Buffer.from([0x49, 0x44, 0x33, 0xff, 0, 0, 0, 0, 0, 1])],
    ['revision 0xFF', Buffer.from([0x49, 0x44, 0x33, 3, 0xff, 0, 0, 0, 0, 1])],
  ])('returns undefined for %s', (_description, bytes) => {
    expect(readId3v2TagSize(bytes, 0)).toBeUndefined();
  });
});
