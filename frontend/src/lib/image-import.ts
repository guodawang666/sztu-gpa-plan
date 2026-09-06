const supportedImageTypes = new Set([
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const supportedImageExtension = /\.(?:bmp|gif|jpe?g|png|webp)$/i;

export function selectTranscriptImages(files: Iterable<File>): {
  accepted: File[];
  rejected: File[];
} {
  const accepted: File[] = [];
  const rejected: File[] = [];

  for (const file of files) {
    const supported = supportedImageTypes.has(file.type.toLowerCase())
      || (!file.type && supportedImageExtension.test(file.name));
    (supported ? accepted : rejected).push(file);
  }

  return { accepted, rejected };
}
