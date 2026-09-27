/**
 * ID3v2 tags sit in front of the audio and can be megabytes long (embedded cover art). We never
 * parse their contents: we only read the 10-byte header to learn how many bytes to skip.
 *
 *   "ID3" | major version | revision | flags | size (4 bytes, syncsafe: 7 bits per byte)
 */

export const ID3V2_HEADER_SIZE = 10;

const FOOTER_SIZE = 10;
const FOOTER_FLAG = 0x10; // ID3v2.4 only
const ID3V2_4 = 4;

/**
 * Returns the total size in bytes (header + body + optional footer) of the ID3v2 tag starting at
 * `offset`, or `undefined` if there isn't one. The caller must make sure at least
 * ID3V2_HEADER_SIZE bytes are available.
 */
export function readId3v2TagSize(bytes: Buffer, offset: number): number | undefined {
  if (bytes.toString('latin1', offset, offset + 3) !== 'ID3') {
    return undefined;
  }

  const majorVersion = bytes.readUInt8(offset + 3);
  const revision = bytes.readUInt8(offset + 4);
  const flags = bytes.readUInt8(offset + 5);
  if (majorVersion === 0xff || revision === 0xff) {
    return undefined;
  }

  let size = 0;
  for (let i = 6; i < ID3V2_HEADER_SIZE; i++) {
    const byte = bytes.readUInt8(offset + i);
    if (byte >= 0x80) {
      return undefined; // Not syncsafe, so this isn't a real tag header.
    }
    size = (size << 7) | byte;
  }

  const hasFooter = majorVersion === ID3V2_4 && (flags & FOOTER_FLAG) !== 0;
  return ID3V2_HEADER_SIZE + size + (hasFooter ? FOOTER_SIZE : 0);
}
