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

  it('parses the real SZTU table column order without treating the row number as credits', () => {
    const candidates = parseTranscriptOcrText(
      '2 2024-2025-1 BS00232 行业 认 知 (英文 课程 ) 75 B 1 18 3 考试 正常 考试 必修 学 科 课程',
      '2024-2025-1',
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        courseCode: 'BS00232',
        courseName: '行业认知（英文课程）',
        credits: 1,
        score: 75,
        grade: 'B',
        gradePoint: 3,
        examType: 'NORMAL',
        needsReview: false,
      }),
    ]);
  });

  it('repairs common I/1 course-code confusion and recognises spaced makeup text', () => {
    const candidates = parseTranscriptOcrText(
      '27 2024-2025-2 1B00166 微 积 分 2 64 D 4 72 1 2024-2025-2 考试 补 考 必修 通 识 课程',
      '2024-2025-2',
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        courseCode: 'IB00166',
        courseName: '微积分2',
        credits: 4,
        score: 64,
        grade: 'D',
        gradePoint: 1,
        examType: 'MAKEUP',
        needsReview: false,
      }),
    ]);
  });

  it('does not mistake a course-name suffix for the grade column', () => {
    const candidates = parseTranscriptOcrText(
      '11 2024-2025-1 1B00101 大 学 计算 机 B 67 C 人 4 72 2 考试 正常 考试 必修 通 识 课程',
      '2024-2025-1',
    );

    expect(candidates[0]).toMatchObject({
      courseCode: 'IB00101',
      courseName: '大学计算机 B',
      credits: 4,
      score: 67,
      grade: 'C',
      gradePoint: 2,
    });
  });

  it('uses the official grade mapping when OCR drops a decimal point from GPA', () => {
    const candidates = parseTranscriptOcrText(
      '5 2024-2025-1 BS00298 Python 数据 科学 基础 (英文 课程 ) 70 C+ 3 54 25 考试 正常 考试 选修 学 科 课程',
      '2024-2025-1',
    );

    expect(candidates[0]).toMatchObject({
      courseCode: 'BS00298',
      credits: 3,
      score: 70,
      grade: 'C+',
      gradePoint: 2.5,
      needsReview: true,
      issues: expect.arrayContaining(['OCR 绩点 25 已按 SZTU 映射纠正为 2.5']),
    });
  });

  it('uses the semester recognised from each row instead of the form fallback', () => {
    const candidates = parseTranscriptOcrText(
      '46 2025-2026-2 BS00242 管理沟通 76 B 3 54 3 考试 正常考试 必修 学科课程',
      '2024-2025-1',
    );

    expect(candidates[0]?.semester).toBe('2025-2026-2');
  });

  it('does not blanket-flag structurally valid rows at normal screenshot confidence', () => {
    const candidates = parseTranscriptOcrText('IB00166 微积分2 4 53 F 0 正常考试', '2023-2024-2');
    const reviewed = applyOcrConfidence(candidates, 79);

    expect(reviewed[0]?.needsReview).toBe(false);
  });
});
