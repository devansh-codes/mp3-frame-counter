import { describe, expect, it } from 'vitest';

import { type FrameCountResult, Mp3FrameCounter } from '../../src/mp3/frame-counter.js';
import {
  buildApeTag,
  buildFrame,
  buildFrames,
  buildHeader,
  buildId3v1Tag,
  buildId3v2Tag,
  buildMetadataFrame,
  randomChunkSizes,
  readFixture,
  seededRandomBytes,
  splitIntoChunks,
} from '../helpers/mp3-builder.js';

function countFrames(chunks: readonly Buffer[]): FrameCountResult {
  const counter = new Mp3FrameCounter();
  for (const chunk of chunks) {
    counter.push(chunk);
  }
  return counter.finish();
}

/**
 * Counts the frames in `data` fed as one chunk, and checks that a few other chunkings give the same
 * result, so every scenario in this file is also a chunk-boundary test.
 */
function countFramesIn(data: Buffer): FrameCountResult {
  const result = countFrames([data]);
  const chunkings = [
    splitIntoChunks(data, () => 3),
    splitIntoChunks(data, () => 1441),
    splitIntoChunks(data, randomChunkSizes(data.length, 5000)),
  ];
  for (const chunks of chunkings) {
    expect(countFrames(chunks)).toEqual(result);
  }
  return result;
}

function frameCountOf(data: Buffer): number | undefined {
  const result = countFramesIn(data);
  return result.ok ? result.frameCount : undefined;
}

/**
 * Expected counts come from mediainfo 26.05 (`--Full` "Frame count") and ffprobe `-count_packets`,
 * which agree for every fixture. See test/fixtures/README.md.
 */
const FIXTURES = [
  { file: 'sample.mp3', frameCount: 6089, metadataFrame: 'Xing' },
  { file: 'cbr128-info.mp3', frameCount: 384, metadataFrame: 'Info' },
  { file: 'cbr128-no-info.mp3', frameCount: 384, metadataFrame: undefined },
  { file: 'cbr128-crc.mp3', frameCount: 384, metadataFrame: 'Info' },
  { file: 'vbr-xing.mp3', frameCount: 384, metadataFrame: 'Xing' },
  { file: 'vbr-no-xing.mp3', frameCount: 384, metadataFrame: undefined },
  { file: 'mono-cbr.mp3', frameCount: 384, metadataFrame: 'Info' },
  { file: 'mono-vbr.mp3', frameCount: 384, metadataFrame: 'Xing' },
  { file: 'cbr320-48khz.mp3', frameCount: 418, metadataFrame: 'Info' },
  { file: 'cbr32-32khz.mp3', frameCount: 279, metadataFrame: undefined },
  { file: 'ffmpeg-cbr.mp3', frameCount: 384, metadataFrame: 'Info' },
  { file: 'ffmpeg-vbr.mp3', frameCount: 384, metadataFrame: 'Xing' },
  { file: 'ffmpeg-bare.mp3', frameCount: 384, metadataFrame: undefined },
  { file: 'id3v2.mp3', frameCount: 384, metadataFrame: 'Info' },
  { file: 'id3v1.mp3', frameCount: 384, metadataFrame: 'Info' },
] as const;

describe('Mp3FrameCounter', () => {
  describe('real encoder output (matches mediainfo and ffprobe)', () => {
    it.each(FIXTURES)(
      'counts $frameCount frames in $file',
      ({ file, frameCount, metadataFrame }) => {
        expect(countFramesIn(readFixture(file))).toEqual({
          ok: true,
          frameCount,
          metadataFrame,
          truncatedFinalFrame: false,
        });
      },
    );

    it('rejects MPEG-2 Layer III as unsupported and names the format', () => {
      expect(countFramesIn(readFixture('mpeg2-layer3.mp3'))).toEqual({
        ok: false,
        reason: 'UNSUPPORTED_FORMAT',
        format: 'MPEG-2 Layer III',
      });
    });
  });

  describe('chunk boundaries', () => {
    const FIXED_CHUNK_SIZES = [1, 2, 3, 5, 13, 1441, 4096, 65_536];
    const RANDOM_SPLITS_PER_FILE = 25;
    // Splitting the 1.4 MB sample into 1-byte chunks takes ~2 s warm and can pass the default 5 s
    // timeout on a cold or slow machine (seen on a fresh clone), so this group gets more room.
    const CHUNKING_TIMEOUT_MS = 30_000;

    it.each(FIXTURES)(
      'gives the same result however $file is split',
      ({ file }) => {
        const data = readFixture(file);
        const expected = countFramesIn(data);

        for (const size of FIXED_CHUNK_SIZES) {
          expect(countFrames(splitIntoChunks(data, () => size))).toEqual(expected);
        }
        for (let seed = 1; seed <= RANDOM_SPLITS_PER_FILE; seed++) {
          const maxChunkSize = [4, 64, 2048, 100_000][seed % 4] ?? 64;
          const chunks = splitIntoChunks(data, randomChunkSizes(seed, maxChunkSize));
          expect(countFrames(chunks)).toEqual(expected);
        }
      },
      CHUNKING_TIMEOUT_MS,
    );

    it('does not keep references to chunks after push() returns', () => {
      const data = readFixture('vbr-xing.mp3');
      const counter = new Mp3FrameCounter();
      for (const chunk of splitIntoChunks(data, randomChunkSizes(7, 3000))) {
        const copy = Buffer.from(chunk);
        counter.push(copy);
        copy.fill(0); // The caller may reuse its buffer straight away.
      }
      expect(counter.finish()).toMatchObject({ ok: true, frameCount: 384 });
    });
  });

  describe('tags', () => {
    const audio = readFixture('cbr128-no-info.mp3'); // 384 frames, no tags

    it('skips a large ID3v2 tag without scanning inside it', () => {
      // The body is full of valid-looking frame headers. A parser that scanned inside the tag
      // instead of skipping it by size would count them.
      const decoyFrames = buildFrames(7000); // ~2.9 MB
      const data = Buffer.concat([buildId3v2Tag(decoyFrames), audio]);
      expect(frameCountOf(data)).toBe(384);
    });

    it('skips several ID3v2 tags in a row', () => {
      const tags = [buildId3v2Tag(Buffer.alloc(100)), buildId3v2Tag(Buffer.alloc(50))];
      expect(frameCountOf(Buffer.concat([...tags, audio]))).toBe(384);
    });

    it('skips an ID3v2.4 tag with a footer', () => {
      const tag = buildId3v2Tag(buildFrames(3), { majorVersion: 4, footer: true });
      expect(frameCountOf(Buffer.concat([tag, audio]))).toBe(384);
    });

    it('does not count trailing APEv2 and ID3v1 tags', () => {
      const data = Buffer.concat([audio, buildApeTag(), buildId3v1Tag()]);
      expect(frameCountOf(data)).toBe(384);
    });

    it('counts both halves of two files joined with an ID3v2 tag in between', () => {
      const tag = buildId3v2Tag(buildFrames(50)); // decoy frames inside the tag must not be counted
      expect(frameCountOf(Buffer.concat([audio, tag, audio]))).toBe(768);
    });
  });

  describe('metadata frame (Xing / Info / VBRI)', () => {
    it('does not count a metadata frame at the start', () => {
      const data = Buffer.concat([buildMetadataFrame('Xing', 36), buildFrames(10)]);
      expect(countFramesIn(data)).toMatchObject({
        ok: true,
        frameCount: 10,
        metadataFrame: 'Xing',
      });
    });

    it('only treats the first frame as a metadata frame, as FFmpeg and mediainfo do', () => {
      const data = Buffer.concat([buildFrames(5), buildMetadataFrame('Info', 36), buildFrames(5)]);
      expect(frameCountOf(data)).toBe(11);
    });

    it('accepts a metadata frame whose channel mode and bitrate differ from the audio', () => {
      // FFmpeg writes its Xing frame as stereo with its own bitrate; the audio is joint stereo.
      const xing = buildMetadataFrame('Xing', 36, { channelMode: 0b00, bitrateIndex: 5 });
      const data = Buffer.concat([xing, buildFrames(10, { channelMode: 0b01, bitrateIndex: 9 })]);
      expect(frameCountOf(data)).toBe(10);
    });

    it('returns 0 for a file that holds only a metadata frame', () => {
      expect(frameCountOf(buildMetadataFrame('Info', 36))).toBe(0);
    });
  });

  describe('junk and false sync', () => {
    const audio = readFixture('cbr128-info.mp3');

    it('skips junk with a fake frame header between the ID3v2 tag and the audio', () => {
      // The fake header claims a 105-byte frame, but no valid header follows it.
      const fakeHeader = Buffer.concat([
        buildHeader({ bitrateIndex: 1, padding: true }),
        Buffer.from('garbage'),
      ]);
      const data = Buffer.concat([
        buildId3v2Tag(Buffer.alloc(100)),
        Buffer.alloc(1000),
        fakeHeader,
        audio,
      ]);
      expect(countFramesIn(data)).toMatchObject({
        ok: true,
        frameCount: 384,
        metadataFrame: 'Info',
      });
    });

    it('resynchronises after zero padding or junk in the middle of the stream', () => {
      const frames = buildFrames(20);
      const data = Buffer.concat([
        frames,
        Buffer.alloc(500),
        frames,
        seededRandomBytes(3000, 1),
        frames,
      ]);
      expect(frameCountOf(data)).toBe(60);
    });

    it('needs two following frames to confirm a candidate found in junk', () => {
      // A fake frame followed by one more fake header, then zeros: only one header confirms it.
      const fakes = Buffer.concat([buildFrame(), buildHeader(), Buffer.alloc(2000)]);
      const data = Buffer.concat([buildFrames(10), Buffer.alloc(100), fakes]);
      expect(frameCountOf(data)).toBe(10);
    });

    it('does not count a lone valid-looking header in trailing junk', () => {
      const junk = Buffer.concat([Buffer.alloc(10), buildHeader(), Buffer.alloc(50)]);
      expect(frameCountOf(Buffer.concat([buildFrames(10), junk]))).toBe(10);
    });

    it('does not count frames whose sample rate differs from the stream', () => {
      const data = Buffer.concat([
        buildFrames(10),
        buildFrames(5, { sampleRateIndex: 1 }),
        buildFrames(10),
      ]);
      expect(frameCountOf(data)).toBe(20);
    });
  });

  describe('end of stream', () => {
    const audio = readFixture('cbr128-no-info.mp3'); // 384 frames of 417/418 bytes

    it('counts a final frame whose body is cut short, and flags it', () => {
      expect(countFramesIn(audio.subarray(0, -200))).toMatchObject({
        ok: true,
        frameCount: 384,
        truncatedFinalFrame: true,
      });
    });

    it('does not count a final frame whose header is incomplete', () => {
      const lastFrameStart = audio.length - 418;
      expect(audio.readUInt16BE(lastFrameStart)).toBe(0xfffb); // sanity check
      const data = audio.subarray(0, lastFrameStart + 2);
      expect(countFramesIn(data)).toMatchObject({
        ok: true,
        frameCount: 383,
        truncatedFinalFrame: false,
      });
    });

    it('ignores a few junk bytes after the last frame', () => {
      expect(frameCountOf(Buffer.concat([audio, Buffer.from('JUNK!!')]))).toBe(384);
    });

    it('accepts a single frame that ends exactly at the end of the stream', () => {
      expect(frameCountOf(buildFrame())).toBe(1);
    });
  });

  describe('invalid input', () => {
    it('reports an empty file', () => {
      expect(countFrames([])).toEqual({ ok: false, reason: 'EMPTY_FILE' });
      expect(countFramesIn(Buffer.alloc(0))).toEqual({ ok: false, reason: 'EMPTY_FILE' });
    });

    it.each([
      ['random bytes', seededRandomBytes(200_000, 42)],
      [
        'a WAV file',
        Buffer.concat([
          Buffer.from('RIFF\x24\x08\x00\x00WAVEfmt ', 'latin1'),
          seededRandomBytes(5000, 3),
        ]),
      ],
      ['a text file', Buffer.from('this is not an mp3 file\n'.repeat(100))],
      ['an ID3v2 tag with no audio', buildId3v2Tag(Buffer.alloc(1000))],
      ['fewer bytes than a header', Buffer.from([0xff, 0xfb])],
    ])('finds no MPEG-1 Layer III frames in %s', (_description, data) => {
      expect(countFramesIn(data)).toEqual({ ok: false, reason: 'NO_MPEG1_LAYER3_FRAMES' });
    });

    it('names the unsupported format when a free-format stream is uploaded', () => {
      const data = Buffer.concat([buildHeader({ bitrateIndex: 0 }), Buffer.alloc(1000)]);
      expect(countFramesIn(data)).toEqual({
        ok: false,
        reason: 'UNSUPPORTED_FORMAT',
        format: 'MPEG-1 Layer III with a free-format bitrate',
      });
    });
  });

  describe('usage errors', () => {
    it('throws if push() is called after finish()', () => {
      const counter = new Mp3FrameCounter();
      counter.finish();
      expect(() => {
        counter.push(Buffer.alloc(1));
      }).toThrow('push() called after finish()');
    });

    it('throws if finish() is called twice', () => {
      const counter = new Mp3FrameCounter();
      counter.finish();
      expect(() => counter.finish()).toThrow('finish() called twice');
    });
  });
});
