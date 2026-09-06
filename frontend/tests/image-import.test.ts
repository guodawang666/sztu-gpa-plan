import { describe, expect, it } from 'vitest';

import { selectTranscriptImages } from '../src/lib/image-import';

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
});
