import { type FrameHeader, HEADER_SIZE } from './frame-header.js';

/**
 * Encoders (LAME, FFmpeg) usually make the first frame a metadata frame. It has a valid MPEG header,
 * but instead of audio it carries a "Xing"/"Info" or "VBRI" tag (VBR frame count, seek table,
 * encoder info). It is not an audio frame: encoders leave it out of their own frame count, and
 * decoders and analysers (FFmpeg, mpg123, mediainfo) skip it. We don't count it either.
 */
export type MetadataFrameTag = 'Xing' | 'Info' | 'VBRI';

const TAG_LENGTH = 4;
const CRC_LENGTH = 2;

/** Side information follows the header (and CRC) and its size depends on the channel mode. */
const SIDE_INFO_SIZE_MONO = 17;
const SIDE_INFO_SIZE_STEREO = 32;

/** VBRI always sits 32 bytes after the header, whatever the channel mode. */
const VBRI_OFFSET = HEADER_SIZE + 32;

/**
 * Checks whether the frame at `offset` is a Xing/Info/VBRI metadata frame. The caller must make sure
 * the whole frame is available in `bytes`.
 */
export function detectMetadataFrame(
  bytes: Buffer,
  offset: number,
  header: FrameHeader,
): MetadataFrameTag | undefined {
  const xingOffset =
    offset + HEADER_SIZE + (header.isMono ? SIDE_INFO_SIZE_MONO : SIDE_INFO_SIZE_STEREO);

  // The Xing spec puts the tag straight after the side info and ignores the CRC. LAME, FFmpeg and
  // mediainfo all do the same. We also accept it 2 bytes later in CRC-protected frames, in case an
  // encoder read the spec the other way.
  const xingCandidates = header.hasCrc ? [xingOffset, xingOffset + CRC_LENGTH] : [xingOffset];
  for (const candidate of xingCandidates) {
    const tag = readTag(bytes, candidate);
    if (isXingTag(tag)) {
      return tag;
    }
  }

  return readTag(bytes, offset + VBRI_OFFSET) === 'VBRI' ? 'VBRI' : undefined;
}

function isXingTag(tag: string): tag is 'Xing' | 'Info' {
  return tag === 'Xing' || tag === 'Info';
}

function readTag(bytes: Buffer, offset: number): string {
  return bytes.toString('latin1', offset, offset + TAG_LENGTH);
}
