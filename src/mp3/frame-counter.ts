import {
  describeUnsupportedHeader,
  findFrameSync,
  type FrameHeader,
  HEADER_SIZE,
  parseFrameHeader,
} from './frame-header.js';
import { ID3V2_HEADER_SIZE, readId3v2TagSize } from './id3v2.js';
import { detectMetadataFrame, type MetadataFrameTag } from './metadata-frame.js';

export type FrameCountResult =
  | {
      readonly ok: true;
      /** Audio frames only. A Xing/Info/VBRI metadata frame is not counted. */
      readonly frameCount: number;
      readonly metadataFrame: MetadataFrameTag | undefined;
      /** The last frame's header was present but the file ended before the frame did. It is counted. */
      readonly truncatedFinalFrame: boolean;
    }
  | { readonly ok: false; readonly reason: 'EMPTY_FILE' }
  | { readonly ok: false; readonly reason: 'NO_MPEG1_LAYER3_FRAMES' }
  | { readonly ok: false; readonly reason: 'UNSUPPORTED_FORMAT'; readonly format: string };

/** Counts the frames in a stream of chunks, e.g. a file upload or `fs.createReadStream()`. */
export async function countFramesInStream(
  source: AsyncIterable<Buffer>,
): Promise<FrameCountResult> {
  const counter = new Mp3FrameCounter();
  for await (const chunk of source) {
    counter.push(chunk);
  }
  return counter.finish();
}

/**
 * - leading-tags: skipping ID3v2 tag(s) at the start of the file.
 * - searching: looking for a frame, confirmed by the frames after it (skips junk and false syncs).
 * - synced: walking frame to frame, one header per frame.
 */
type State = 'leading-tags' | 'searching' | 'synced';

/** Returned by a step when it can't decide until more bytes arrive. */
const NEED_MORE_DATA = -1;

/** How many following frame headers must confirm a candidate found by searching. */
const CONFIRMING_HEADERS = 2;

const EMPTY = Buffer.alloc(0);

/**
 * Counts MPEG-1 Layer III audio frames in a byte stream fed in chunks of any size. Memory use does
 * not depend on file size: tags and frame bodies are skipped without being stored, and at most two
 * frames plus a header (under 3 KB) are carried between chunks.
 *
 * Usage: call `push()` for each chunk, then `finish()` once at the end.
 * The algorithm is specified in governance-check/03-domain-logic/frame-counting-algorithm.md.
 */
export class Mp3FrameCounter {
  #state: State = 'leading-tags';
  #bytesReceived = 0;
  #frameCount = 0;
  /** Bytes still to skip (a tag or frame body continuing into later chunks). */
  #bytesToSkip = 0;
  /** Unprocessed bytes kept from the previous chunk because a decision needed more data. */
  #carry: Buffer = EMPTY;
  /** Locked from the first confirmed frame. Later frames must match it. */
  #sampleRate: number | undefined;
  #metadataFrame: MetadataFrameTag | undefined;
  #unsupportedFormat: string | undefined;
  #finished = false;

  push(chunk: Buffer): void {
    if (this.#finished) {
      throw new Error('push() called after finish()');
    }
    this.#bytesReceived += chunk.length;

    let data = chunk;
    if (this.#bytesToSkip > 0) {
      const skipped = Math.min(this.#bytesToSkip, data.length);
      this.#bytesToSkip -= skipped;
      data = data.subarray(skipped);
    }
    if (this.#carry.length > 0) {
      data = Buffer.concat([this.#carry, data]);
    }
    this.#consume(data, false);
  }

  finish(): FrameCountResult {
    if (this.#finished) {
      throw new Error('finish() called twice');
    }
    this.#finished = true;

    // A frame body that runs past the end of the stream means the last counted frame was cut short.
    const truncatedFinalFrame = this.#state === 'synced' && this.#bytesToSkip > 0;
    this.#consume(this.#carry, true);
    return this.#result(truncatedFinalFrame);
  }

  #result(truncatedFinalFrame: boolean): FrameCountResult {
    if (this.#bytesReceived === 0) {
      return { ok: false, reason: 'EMPTY_FILE' };
    }
    if (this.#sampleRate === undefined) {
      return this.#unsupportedFormat === undefined
        ? { ok: false, reason: 'NO_MPEG1_LAYER3_FRAMES' }
        : { ok: false, reason: 'UNSUPPORTED_FORMAT', format: this.#unsupportedFormat };
    }
    return {
      ok: true,
      frameCount: this.#frameCount,
      metadataFrame: this.#metadataFrame,
      truncatedFinalFrame,
    };
  }

  /** Processes as much of `data` as possible, then keeps what's left over for the next chunk. */
  #consume(data: Buffer, isEndOfStream: boolean): void {
    let position = 0;
    while (position < data.length) {
      const next = this.#step(data, position, isEndOfStream);
      if (next === NEED_MORE_DATA) {
        break;
      }
      position = next;
    }

    if (position >= data.length) {
      this.#bytesToSkip += position - data.length;
      this.#carry = EMPTY;
    } else {
      // Copy, so we don't keep the caller's whole chunk alive through a view.
      this.#carry = Buffer.from(data.subarray(position));
    }
  }

  /** Runs one state-machine step at `position`. Returns the next position, or NEED_MORE_DATA. */
  #step(data: Buffer, position: number, isEndOfStream: boolean): number {
    switch (this.#state) {
      case 'leading-tags':
        return this.#skipLeadingTag(data, position, isEndOfStream);
      case 'searching':
        return this.#search(data, position, isEndOfStream);
      case 'synced':
        return this.#readNextFrame(data, position, isEndOfStream);
    }
  }

  #skipLeadingTag(data: Buffer, position: number, isEndOfStream: boolean): number {
    const available = data.length - position;
    if (available < ID3V2_HEADER_SIZE && !isEndOfStream) {
      return NEED_MORE_DATA;
    }

    const tagSize = available >= ID3V2_HEADER_SIZE ? readId3v2TagSize(data, position) : undefined;
    if (tagSize !== undefined) {
      return position + tagSize; // Stay in this state: several tags can follow each other.
    }

    // The audio should start here. If it's another MPEG format, remember it for the error message.
    if (available >= HEADER_SIZE) {
      this.#unsupportedFormat = describeUnsupportedHeader(data, position);
    }
    this.#state = 'searching';
    return position;
  }

  #search(data: Buffer, position: number, isEndOfStream: boolean): number {
    // Skip straight to the next position whose first two bytes could start a frame.
    const candidate = findFrameSync(data, position);
    if (candidate !== position) {
      return candidate;
    }
    if (data.length - position < HEADER_SIZE) {
      return isEndOfStream ? data.length : NEED_MORE_DATA;
    }

    const header = parseFrameHeader(data, position);
    if (header === undefined || !this.#matchesStream(header)) {
      return position + 1;
    }

    switch (this.#confirm(data, position, header, isEndOfStream)) {
      case 'confirmed':
        return this.#acceptConfirmedFrame(data, position, header);
      case 'rejected':
        return position + 1;
      case 'need-more-data':
        return NEED_MORE_DATA;
    }
  }

  /**
   * Random bytes can look like a frame header. A candidate is only accepted if the next
   * CONFIRMING_HEADERS frames follow it back to back with the same sample rate, or the chain reaches
   * exactly the end of the stream. This is the same check mediainfo uses.
   */
  #confirm(
    data: Buffer,
    position: number,
    header: FrameHeader,
    isEndOfStream: boolean,
  ): 'confirmed' | 'rejected' | 'need-more-data' {
    let frameEnd = position + header.frameLength;
    for (let confirmed = 0; confirmed < CONFIRMING_HEADERS; confirmed++) {
      if (isEndOfStream && frameEnd === data.length) {
        return 'confirmed';
      }
      if (data.length < frameEnd + HEADER_SIZE) {
        return isEndOfStream ? 'rejected' : 'need-more-data';
      }
      const next = parseFrameHeader(data, frameEnd);
      if (next?.sampleRate !== header.sampleRate) {
        return 'rejected';
      }
      frameEnd += next.frameLength;
    }
    return 'confirmed';
  }

  #acceptConfirmedFrame(data: Buffer, position: number, header: FrameHeader): number {
    const isFirstFrame = this.#sampleRate === undefined;
    if (isFirstFrame) {
      this.#sampleRate = header.sampleRate;
      this.#metadataFrame = detectMetadataFrame(data, position, header);
    }
    if (!isFirstFrame || this.#metadataFrame === undefined) {
      this.#frameCount++;
    }
    this.#state = 'synced';
    return position + header.frameLength;
  }

  #readNextFrame(data: Buffer, position: number, isEndOfStream: boolean): number {
    const available = data.length - position;
    if (available < HEADER_SIZE) {
      // 1-3 trailing bytes at the very end can't be a frame. Otherwise wait for the rest of the header.
      return isEndOfStream ? data.length : NEED_MORE_DATA;
    }

    const header = parseFrameHeader(data, position);
    if (header !== undefined && this.#matchesStream(header)) {
      this.#frameCount++;
      return position + header.frameLength; // Jump over the body without reading it.
    }

    // Sync lost: trailing tags, junk, or an ID3v2 tag between two joined files.
    if (available < ID3V2_HEADER_SIZE && !isEndOfStream) {
      return NEED_MORE_DATA;
    }
    this.#state = 'searching';
    const tagSize = available >= ID3V2_HEADER_SIZE ? readId3v2TagSize(data, position) : undefined;
    return tagSize === undefined ? position : position + tagSize;
  }

  #matchesStream(header: FrameHeader): boolean {
    return this.#sampleRate === undefined || header.sampleRate === this.#sampleRate;
  }
}
