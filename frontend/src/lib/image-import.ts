const supportedImageTypes = new Set([
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const supportedImageExtension = /\.(?:bmp|gif|jpe?g|png|webp)$/i;
export const MAX_TRANSCRIPT_IMAGES = 8;
export const MAX_TRANSCRIPT_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_TRANSCRIPT_BATCH_BYTES = 60 * 1024 * 1024;

export function selectTranscriptImages(files: Iterable<File>): {
  accepted: File[];
  rejected: File[];
} {
  const accepted: File[] = [];
  const rejected: File[] = [];

  let acceptedBytes = 0;
  for (const file of files) {
    const supported =
      supportedImageTypes.has(file.type.toLowerCase()) ||
      supportedImageExtension.test(file.name);
    const withinLimits =
      file.size <= MAX_TRANSCRIPT_IMAGE_BYTES &&
      accepted.length < MAX_TRANSCRIPT_IMAGES &&
      acceptedBytes + file.size <= MAX_TRANSCRIPT_BATCH_BYTES;
    if (supported && withinLimits) {
      accepted.push(file);
      acceptedBytes += file.size;
    } else {
      rejected.push(file);
    }
  }

  return { accepted, rejected };
}

function hasSupportedImageSignature(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 12));
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));

  return (
    (bytes[0] === 0x89 && ascii(1, 3) === "PNG") ||
    (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    ascii(0, 2) === "BM" ||
    ascii(0, 6) === "GIF87a" ||
    ascii(0, 6) === "GIF89a" ||
    (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP")
  );
}

function contentFingerprint(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `${bytes.byteLength}:${hash >>> 0}`;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((byte, index) => byte === right[index]);
}

export async function deduplicateTranscriptImages(files: File[]): Promise<{
  unique: File[];
  duplicateCount: number;
}> {
  const fingerprints = new Map<string, Uint8Array[]>();
  const unique: File[] = [];

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fingerprint = contentFingerprint(bytes);
    const matches = fingerprints.get(fingerprint) ?? [];
    if (matches.some((candidate) => sameBytes(candidate, bytes))) continue;
    fingerprints.set(fingerprint, [...matches, bytes]);
    unique.push(file);
  }

  return { unique, duplicateCount: files.length - unique.length };
}

export async function prepareTranscriptImages(files: File[]): Promise<{
  unique: File[];
  rejected: File[];
  duplicateCount: number;
}> {
  const fingerprints = new Map<string, Uint8Array[]>();
  const unique: File[] = [];
  const rejected: File[] = [];
  let duplicateCount = 0;

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    if (!hasSupportedImageSignature(buffer)) {
      rejected.push(file);
      continue;
    }
    const bytes = new Uint8Array(buffer);
    const fingerprint = contentFingerprint(bytes);
    const matches = fingerprints.get(fingerprint) ?? [];
    if (matches.some((candidate) => sameBytes(candidate, bytes))) {
      duplicateCount += 1;
      continue;
    }
    fingerprints.set(fingerprint, [...matches, bytes]);
    unique.push(file);
  }

  return { unique, rejected, duplicateCount };
}
