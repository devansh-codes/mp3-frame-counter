/** Builds a multipart/form-data body as a lazy stream, so large uploads never sit in memory. */
export async function* multipartStream(
  boundary: string,
  file: { fieldName: string; filename: string; content: AsyncIterable<Buffer> | Iterable<Buffer> },
): AsyncGenerator<Buffer> {
  yield Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n` +
      'Content-Type: audio/mpeg\r\n\r\n',
  );
  yield* file.content;
  yield Buffer.from(`\r\n--${boundary}--\r\n`);
}

/** Yields `data` `times` times, without allocating the combined buffer. */
export function* repeat(data: Buffer, times: number): Generator<Buffer> {
  for (let i = 0; i < times; i++) {
    yield data;
  }
}

/** A multipart request body holding the given file, for use with `app.inject()`. */
export function formWithFile(
  content: Buffer,
  { fieldName = 'file', filename = 'upload.mp3' }: { fieldName?: string; filename?: string } = {},
): FormData {
  const form = new FormData();
  form.append(fieldName, new Blob([content], { type: 'audio/mpeg' }), filename);
  return form;
}
