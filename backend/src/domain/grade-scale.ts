import { DomainError } from './errors.js';
import type { LetterGrade } from './types.js';

export interface GradeResult {
  grade: LetterGrade;
  gradePoint: number;
}

export const GRADE_POINTS: Readonly<Record<LetterGrade, number>> = {
  'A+': 4.5,
  A: 4,
  'B+': 3.5,
  B: 3,
  'C+': 2.5,
  C: 2,
  D: 1,
  F: 0,
};

export function gradePointFor(grade: LetterGrade): number {
  return GRADE_POINTS[grade];
}

export function gradeFromScore(score: number): GradeResult {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new DomainError(
      'INVALID_SCORE',
      '成绩必须是 0 到 100 之间的有限数字。',
      { score },
    );
  }

  if (score >= 93) return { grade: 'A+', gradePoint: 4.5 };
  if (score >= 85) return { grade: 'A', gradePoint: 4 };
  if (score >= 80) return { grade: 'B+', gradePoint: 3.5 };
  if (score >= 75) return { grade: 'B', gradePoint: 3 };
  if (score >= 70) return { grade: 'C+', gradePoint: 2.5 };
  if (score >= 65) return { grade: 'C', gradePoint: 2 };
  if (score >= 60) return { grade: 'D', gradePoint: 1 };
  return { grade: 'F', gradePoint: 0 };
}
