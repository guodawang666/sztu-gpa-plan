import { describe, expect, it } from 'vitest';

import {
  deduplicateTranscriptImages,
  prepareTranscriptImages,
  selectTranscriptImages,
} from '../src/lib/image-import';

describe('transcript image selection', () => {
  it('keeps multiple supported screenshots and reports rejected files', () => {
    const files = [
      new File(['png'], 'grades-1.png', { type: 'image/png' }),
      new File(['jpg'], 'grades-2.jpg', { type: 'image/jpeg' }),
      new File(['text'], 'notes.txt', { type: 'text/plain' }),
    ];

    expect(selectTranscriptImages(files)).toEqual({
      accepted: [files[0], files[1]],
      rejected: [files[2]],
    });
  });

  it('accepts a valid extension with a generic mobile MIME type', () => {
    const mobileScreenshot = new File(['png'], 'Screenshot.png', { type: 'application/octet-stream' });
    expect(selectTranscriptImages([mobileScreenshot]).accepted).toEqual([mobileScreenshot]);
  });

  it('limits oversized or excessive mobile batches before reading image bytes', () => {
    const files = Array.from({ length: 9 }, (_, index) => new File(['x'], `${index}.png`, { type: 'image/png' }));
    const selected = selectTranscriptImages(files);
    expect(selected.accepted).toHaveLength(8);
    expect(selected.rejected).toEqual([files[8]]);
  });

  it('detects identical image content even when duplicate files have different names', async () => {
    const files = [
      new File(['same-image'], 'grades.png', { type: 'image/png' }),
      new File(['same-image'], 'copy.png', { type: 'image/png' }),
      new File(['different-image'], 'other.png', { type: 'image/png' }),
    ];

    const result = await deduplicateTranscriptImages(files);

    expect(result.duplicateCount).toBe(1);
    expect(result.unique).toEqual([files[0], files[2]]);
  });

  it('rejects a renamed non-image by its file signature before OCR', async () => {
    const validPng = new File([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ], 'valid.png', { type: 'image/png' });
    const renamedText = new File(['not really an image'], 'fake.png', { type: 'image/png' });

    const result = await prepareTranscriptImages([validPng, renamedText]);

    expect(result.unique).toEqual([validPng]);
    expect(result.rejected).toEqual([renamedText]);
  });
});
