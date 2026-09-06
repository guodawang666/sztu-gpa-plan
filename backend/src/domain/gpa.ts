import { DomainError } from './errors.js';
import { gradeFromScore, gradePointFor } from './grade-scale.js';
import type {
  AttemptContribution,
  CourseAttemptInput,
  Grade,
  LetterGrade,
} from './types.js';

export interface GpaSummary {
  attemptedCredits: number;
  earnedCredits: number;
  gpaCredits: number;
  qualityPoints: number;
  gpa: number | null;
  displayGpa: string | null;
  contributions: AttemptContribution[];
}

const PASS_FAIL_GRADES = new Set<Grade>(['P', 'NP']);

function isPassFailGrade(grade: Grade): grade is 'P' | 'NP' {
  return PASS_FAIL_GRADES.has(grade);
}

function assertCredits(attempt: CourseAttemptInput): void {
  if (!Number.isFinite(attempt.credits) || attempt.credits < 0) {
    throw new DomainError(
      'INVALID_CREDITS',
      `课程“${attempt.courseName}”的学分必须是大于或等于 0 的有限数字。`,
      { attemptId: attempt.id, credits: attempt.credits },
    );
  }
}

function resolveGrade(attempt: CourseAttemptInput): Grade {
  if (attempt.grade === undefined && attempt.score === undefined) {
    throw new DomainError(
      'MISSING_GRADE',
      `课程“${attempt.courseName}”缺少成绩或等级。`,
      { attemptId: attempt.id },
    );
  }

  if (attempt.grade === undefined) {
    return gradeFromScore(attempt.score as number).grade;
  }

  if (attempt.score !== undefined && !isPassFailGrade(attempt.grade)) {
    const gradeFromNumericScore = gradeFromScore(attempt.score).grade;
    if (gradeFromNumericScore !== attempt.grade) {
      throw new DomainError(
        'GRADE_SCORE_MISMATCH',
        `课程“${attempt.courseName}”的分数与等级不一致。`,
        {
          attemptId: attempt.id,
          score: attempt.score,
          grade: attempt.grade,
          expectedGrade: gradeFromNumericScore,
        },
      );
    }
  }

  return attempt.grade;
}

function resolveEarnedCredit(
  attempt: CourseAttemptInput,
  grade: Grade,
): number {
  const defaultEarnedCredit = grade === 'F' || grade === 'NP' ? 0 : attempt.credits;
  const earnedCredit = attempt.earnedCredit ?? defaultEarnedCredit;

  if (
    !Number.isFinite(earnedCredit)
    || earnedCredit < 0
    || earnedCredit > attempt.credits
  ) {
    throw new DomainError(
      'INVALID_EARNED_CREDIT',
      `课程“${attempt.courseName}”的已获得学分必须在 0 和课程学分之间。`,
      { attemptId: attempt.id, earnedCredit, credits: attempt.credits },
    );
  }

  return earnedCredit;
}

function contributionFor(attempt: CourseAttemptInput): AttemptContribution {
  assertCredits(attempt);
  const grade = resolveGrade(attempt);
  const earnedCredit = resolveEarnedCredit(attempt, grade);

  if (attempt.credits === 0) {
    return {
      id: attempt.id,
      courseName: attempt.courseName,
      semester: attempt.semester,
      credits: attempt.credits,
      grade,
      gradePoint: isPassFailGrade(grade) ? null : gradePointFor(grade),
      examType: attempt.examType,
      earnedCredit,
      includedInGpa: false,
      gpaCredits: 0,
      qualityPoints: 0,
      exclusionReason: 'ZERO_CREDIT',
      ...(attempt.courseCode === undefined ? {} : { courseCode: attempt.courseCode }),
      ...(attempt.score === undefined ? {} : { score: attempt.score }),
    };
  }

  if (isPassFailGrade(grade)) {
    return {
      id: attempt.id,
      courseName: attempt.courseName,
      semester: attempt.semester,
      credits: attempt.credits,
      grade,
      gradePoint: null,
      examType: attempt.examType,
      earnedCredit,
      includedInGpa: false,
      gpaCredits: 0,
      qualityPoints: 0,
      exclusionReason: 'PASS_FAIL',
      ...(attempt.courseCode === undefined ? {} : { courseCode: attempt.courseCode }),
      ...(attempt.score === undefined ? {} : { score: attempt.score }),
    };
  }

  const gradePoint = gradePointFor(grade as LetterGrade);
  if (attempt.gradePoint !== undefined && attempt.gradePoint !== gradePoint) {
    throw new DomainError(
      'GRADE_POINT_MISMATCH',
      `课程“${attempt.courseName}”的等级与绩点不一致。`,
      {
        attemptId: attempt.id,
        grade,
        gradePoint: attempt.gradePoint,
        expectedGradePoint: gradePoint,
      },
    );
  }

  const includedInGpa = attempt.includedInGpa ?? true;
  return {
    id: attempt.id,
    courseName: attempt.courseName,
    semester: attempt.semester,
    credits: attempt.credits,
    grade,
    gradePoint,
    examType: attempt.examType,
    earnedCredit,
    includedInGpa,
    gpaCredits: includedInGpa ? attempt.credits : 0,
    qualityPoints: includedInGpa ? attempt.credits * gradePoint : 0,
    ...(includedInGpa ? {} : { exclusionReason: 'POLICY_OVERRIDE' as const }),
    ...(attempt.courseCode === undefined ? {} : { courseCode: attempt.courseCode }),
    ...(attempt.score === undefined ? {} : { score: attempt.score }),
  };
}

export function calculateGpa(attempts: CourseAttemptInput[]): GpaSummary {
  const ids = new Set<string>();
  for (const attempt of attempts) {
    if (ids.has(attempt.id)) {
      throw new DomainError('DUPLICATE_ATTEMPT_ID', '考试记录 ID 不能重复。', {
        attemptId: attempt.id,
      });
    }
    ids.add(attempt.id);
  }

  const contributions = attempts.map(contributionFor);
  const attemptedCredits = contributions.reduce((sum, item) => sum + item.credits, 0);
  const earnedCredits = contributions.reduce((sum, item) => sum + item.earnedCredit, 0);
  const gpaCredits = contributions.reduce((sum, item) => sum + item.gpaCredits, 0);
  const qualityPoints = contributions.reduce((sum, item) => sum + item.qualityPoints, 0);
  const gpa = gpaCredits === 0 ? null : qualityPoints / gpaCredits;

  return {
    attemptedCredits,
    earnedCredits,
    gpaCredits,
    qualityPoints,
    gpa,
    displayGpa: gpa === null ? null : gpa.toFixed(2),
    contributions,
  };
}
