import { describe, expect, it } from 'vitest';

import { calculateGpa } from '../src/domain/gpa.js';
import type { CourseAttemptInput } from '../src/domain/types.js';

function buildVerifiedTranscriptFixture(): CourseAttemptInput[] {
  const attempts: CourseAttemptInput[] = [4, 4, 3, 3].map((credits, index) => ({
    id: `a-${index + 1}`,
    courseName: `A course ${index + 1}`,
    semester: '2024-2025-1',
    credits,
    grade: 'A',
    examType: 'NORMAL',
  }));

  for (let index = 0; index < 28; index += 1) {
    attempts.push({
      id: `b-${index + 1}`,
      courseName: `B course ${index + 1}`,
      semester: '2024-2025-2',
      credits: 4,
      grade: 'B',
      examType: 'NORMAL',
    });
  }

  attempts.push(
    {
      id: 'failed-calculus',
      courseCode: 'IB00166',
      courseName: '微积分2',
      semester: '2023-2024-2',
      credits: 4,
      score: 53,
      grade: 'F',
      examType: 'NORMAL',
    },
    {
      id: 'pass-fail-course',
      courseName: 'Machine Learning in Finance',
      semester: '2024-2025-2',
      credits: 1,
      grade: 'P',
      examType: 'NORMAL',
    },
  );

  return attempts;
}

describe('GPA calculation', () => {
  it('reproduces the verified transcript totals and displayed GPA', () => {
    const result = calculateGpa(buildVerifiedTranscriptFixture());

    expect(result).toMatchObject({
      attemptedCredits: 131,
      earnedCredits: 127,
      gpaCredits: 130,
      qualityPoints: 392,
      gpa: 392 / 130,
      displayGpa: '3.02',
    });
  });

  it('counts both the original F and the makeup D as separate attempts', () => {
    const result = calculateGpa([
      {
        id: 'calculus-normal',
        courseCode: 'IB00166',
        courseName: '微积分2',
        semester: '2023-2024-2',
        credits: 4,
        score: 53,
        grade: 'F',
        examType: 'NORMAL',
      },
      {
        id: 'calculus-makeup',
        courseCode: 'IB00166',
        courseName: '微积分2',
        semester: '2024-2025-2',
        credits: 4,
        score: 64,
        grade: 'D',
        examType: 'MAKEUP',
      },
    ]);

    expect(result).toMatchObject({
      attemptedCredits: 8,
      earnedCredits: 4,
      gpaCredits: 8,
      qualityPoints: 4,
      gpa: 0.5,
      displayGpa: '0.50',
    });
  });

  it('excludes P/NP and zero-credit attempts from GPA', () => {
    const result = calculateGpa([
      {
        id: 'pass',
        courseName: '通识课',
        semester: '2024-2025-1',
        credits: 1,
        grade: 'P',
        examType: 'NORMAL',
      },
      {
        id: 'zero-credit',
        courseName: '实验室安全教育',
        semester: '2024-2025-1',
        credits: 0,
        grade: 'A',
        examType: 'NORMAL',
      },
    ]);

    expect(result.gpa).toBeNull();
    expect(result.displayGpa).toBeNull();
    expect(result.gpaCredits).toBe(0);
    expect(result.earnedCredits).toBe(1);
    expect(result.contributions.map((item) => item.exclusionReason)).toEqual([
      'PASS_FAIL',
      'ZERO_CREDIT',
    ]);
  });

  it('does not allow callers to grant credit for F or remove F from GPA', () => {
    const result = calculateGpa([
      {
        id: 'failed-course',
        courseName: '挂科课程',
        semester: '2024-2025-1',
        credits: 4,
        grade: 'F',
        examType: 'NORMAL',
        earnedCredit: 4,
        includedInGpa: false,
      },
    ]);

    expect(result).toMatchObject({
      earnedCredits: 0,
      gpaCredits: 4,
      qualityPoints: 0,
    });
    expect(result.contributions[0]).toMatchObject({
      earnedCredit: 0,
      includedInGpa: true,
    });
  });

  it('warns when formal retake records are calculated with an unconfirmed policy', () => {
    const result = calculateGpa([
      {
        id: 'retake',
        courseName: '重修课程',
        semester: '2025-2026-1',
        credits: 3,
        grade: 'A',
        examType: 'RETAKE',
      },
    ]);

    expect(result.policyWarnings).toContainEqual(expect.objectContaining({
      code: 'RETAKE_POLICY_UNCONFIRMED',
    }));
  });

  it('preserves a reported grade point mismatch for import review', () => {
    const result = calculateGpa([
      {
        id: 'imported-record',
        courseName: '待复核课程',
        semester: '2024-2025-1',
        credits: 2,
        grade: 'A',
        gradePoint: 3.5,
        examType: 'NORMAL',
      },
    ]);

    expect(result.contributions[0]).toMatchObject({
      gradePoint: 4,
      reportedGradePoint: 3.5,
      warnings: ['GRADE_POINT_MISMATCH'],
    });
  });
});
