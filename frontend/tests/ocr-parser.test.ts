import { describe, expect, it } from 'vitest';

import { applyOcrConfidence, parseTranscriptOcrText } from '../src/lib/ocr-parser';

describe('transcript OCR parser', () => {
  it('turns a recognised normal-exam row into a reviewable course attempt', () => {
    const candidates = parseTranscriptOcrText(
      'IB00166 微积分2 4 53 F 0 正常考试',
      '2023-2024-2',
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        courseCode: 'IB00166',
        courseName: '微积分2',
        credits: 4,
        score: 53,
        grade: 'F',
        gradePoint: 0,
        examType: 'NORMAL',
        confirmed: false,
        needsReview: false,
      }),
    ]);
  });

  it('marks every parsed row for review when the recognised image confidence is low', () => {
    const candidates = parseTranscriptOcrText('IB00166 微积分2 4 53 F 0 正常考试', '2023-2024-2');
    const reviewed = applyOcrConfidence(candidates, 64);

    expect(reviewed[0]).toMatchObject({
      needsReview: true,
      confirmed: false,
      issues: expect.arrayContaining(['OCR 置信度较低（64%）']),
    });
  });

  it('keeps makeup attempts as separate review records and flags uncertain rows', () => {
    const candidates = parseTranscriptOcrText(
      'IB00166 微积分2 4 64 D 1 补考\nMachine Learning in Finance 1 通过',
      '2024-2025-2',
    );

    expect(candidates[0]).toMatchObject({
      courseCode: 'IB00166',
      examType: 'MAKEUP',
      grade: 'D',
      needsReview: false,
    });
    expect(candidates[1]).toMatchObject({
      courseName: 'Machine Learning in Finance',
      credits: 1,
      grade: 'P',
      examType: 'NORMAL',
      needsReview: true,
    });
  });
});
