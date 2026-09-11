const encoder = new TextEncoder();
const ZIP_32_LIMIT = 0xffffffff;

export type ZipSource = {
  name: string;
  size: number;
  modifiedAt: string | null;
  open: () => Promise<ReadableStream<Uint8Array> | null>;
};

type ZipEntry = ZipSource & {
  filename: Uint8Array;
  dosDate: number;
  dosTime: number;
};

type CentralEntry = ZipEntry & {
  crc32: number;
  localOffset: number;
};

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}

function updateCrc32(current: number, bytes: Uint8Array) {
  let value = current;
  for (const byte of bytes)
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

function zipBytes(length: number, write: (view: DataView) => void) {
  const bytes = new Uint8Array(length);
  write(new DataView(bytes.buffer));
  return bytes;
}

function zipDate(value: string | null) {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.valueOf()) ? new Date() : parsed;
  const year = Math.min(2107, Math.max(1980, date.getUTCFullYear()));
  return {
    dosDate:
      ((year - 1980) << 9) |
      ((date.getUTCMonth() + 1) << 5) |
      date.getUTCDate(),
    dosTime:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      Math.floor(date.getUTCSeconds() / 2),
  };
}

function cleanFilename(value: string) {
  const clean = Array.from(value.normalize('NFC'), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return character === '/' || character === '\\' || code <= 31 || code === 127
      ? '_'
      : character;
  })
    .join('')
    .trim()
    .slice(0, 180);
  return clean && clean !== '.' && clean !== '..' ? clean : 'tour-memory';
}

function uniqueFilename(value: string, used: Set<string>) {
  const clean = cleanFilename(value);
  let candidate = clean;
  let suffix = 2;
  const dot = clean.lastIndexOf('.');
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  const extension = dot > 0 ? clean.slice(dot) : '';
  while (used.has(candidate.toLocaleLowerCase('en'))) {
    candidate = `${base} (${suffix})${extension}`;
    suffix += 1;
  }
  used.add(candidate.toLocaleLowerCase('en'));
  return candidate;
}

function localHeader(entry: ZipEntry) {
  const header = zipBytes(30, (view) => {
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0808, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, entry.dosTime, true);
    view.setUint16(12, entry.dosDate, true);
    view.setUint16(26, entry.filename.length, true);
  });
  const bytes = new Uint8Array(header.length + entry.filename.length);
  bytes.set(header);
  bytes.set(entry.filename, header.length);
  return bytes;
}

function dataDescriptor(crc32: number, size: number) {
  return zipBytes(16, (view) => {
    view.setUint32(0, 0x08074b50, true);
    view.setUint32(4, crc32, true);
    view.setUint32(8, size, true);
    view.setUint32(12, size, true);
  });
}

function centralHeader(entry: CentralEntry) {
  const header = zipBytes(46, (view) => {
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0808, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, entry.dosTime, true);
    view.setUint16(14, entry.dosDate, true);
    view.setUint32(16, entry.crc32, true);
    view.setUint32(20, entry.size, true);
    view.setUint32(24, entry.size, true);
    view.setUint16(28, entry.filename.length, true);
    view.setUint32(42, entry.localOffset, true);
  });
  const bytes = new Uint8Array(header.length + entry.filename.length);
  bytes.set(header);
  bytes.set(entry.filename, header.length);
  return bytes;
}

function endOfCentralDirectory(
  entryCount: number,
  centralSize: number,
  centralOffset: number,
) {
  return zipBytes(22, (view) => {
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, entryCount, true);
    view.setUint16(10, entryCount, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
  });
}

function streamFrom(iterator: AsyncGenerator<Uint8Array>) {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
}

export function createZipArchive(sources: ZipSource[]) {
  if (sources.length > 0xffff) throw new Error('ARCHIVE_TOO_LARGE');
  const used = new Set<string>();
  const entries = sources.map((source) => {
    if (
      !Number.isSafeInteger(source.size) ||
      source.size < 0 ||
      source.size > ZIP_32_LIMIT
    )
      throw new Error('ARCHIVE_TOO_LARGE');
    const filename = encoder.encode(uniqueFilename(source.name, used));
    if (filename.length > 0xffff) throw new Error('ARCHIVE_TOO_LARGE');
    return { ...source, filename, ...zipDate(source.modifiedAt) };
  });
  const contentLength = entries.reduce(
    (total, entry) =>
      total +
      30 +
      entry.filename.length +
      entry.size +
      16 +
      46 +
      entry.filename.length,
    22,
  );
  if (contentLength > ZIP_32_LIMIT) throw new Error('ARCHIVE_TOO_LARGE');

  async function* chunks() {
    const centralEntries: CentralEntry[] = [];
    let offset = 0;
    for (const entry of entries) {
      const local = localHeader(entry);
      const localOffset = offset;
      yield local;
      offset += local.length;

      const body = await entry.open();
      if (!body) throw new Error(`MISSING_ARCHIVE_ITEM:${entry.name}`);
      const reader = body.getReader();
      let crc32 = 0xffffffff;
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          crc32 = updateCrc32(crc32, chunk.value);
          size += chunk.value.length;
          yield chunk.value;
        }
      } finally {
        reader.releaseLock();
      }
      if (size !== entry.size)
        throw new Error(`ARCHIVE_SIZE_MISMATCH:${entry.name}`);
      crc32 = (crc32 ^ 0xffffffff) >>> 0;
      const descriptor = dataDescriptor(crc32, size);
      yield descriptor;
      offset += size + descriptor.length;
      centralEntries.push({ ...entry, crc32, localOffset });
    }

    const centralOffset = offset;
    for (const entry of centralEntries) {
      const central = centralHeader(entry);
      yield central;
      offset += central.length;
    }
    yield endOfCentralDirectory(
      centralEntries.length,
      offset - centralOffset,
      centralOffset,
    );
  }

  return { body: streamFrom(chunks()), contentLength };
}
