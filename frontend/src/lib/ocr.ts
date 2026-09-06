import { createWorker } from 'tesseract.js';

export interface OcrProgress {
  status: string;
  progress: number;
}

export async function recogniseTranscriptImage(
  file: File,
  onProgress: (progress: OcrProgress) => void,
): Promise<{ text: string; confidence: number }> {
  const worker = await createWorker(['chi_sim', 'eng'], 1, {
    logger: (message) => onProgress({
      status: message.status,
      progress: Math.round(message.progress * 100),
    }),
  });

  try {
    const result = await worker.recognize(file);
    return { text: result.data.text, confidence: result.data.confidence };
  } finally {
    await worker.terminate();
  }
}
