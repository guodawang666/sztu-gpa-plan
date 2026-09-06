import { z } from 'zod';

import { EXAM_TYPES, LETTER_GRADES, PASS_FAIL_GRADES } from '../domain/types.js';

const finiteNumber = z.number().finite();
const GRADES = [...LETTER_GRADES, ...PASS_FAIL_GRADES] as const;
const gradeSchema = z.enum(GRADES);
const examTypeSchema = z.enum(EXAM_TYPES);

export const gradeConversionSchema = z.strictObject({
  score: finiteNumber.min(0).max(100),
});

export const courseAttemptSchema = z.strictObject({
  id: z.string().trim().min(1),
  courseCode: z.string().trim().min(1).optional(),
  courseName: z.string().trim().min(1),
  semester: z.string().trim().min(1),
  credits: finiteNumber.min(0).max(100),
  score: finiteNumber.min(0).max(100).optional(),
  grade: gradeSchema.optional(),
  gradePoint: finiteNumber.min(0).max(4.5).optional(),
  examType: examTypeSchema,
  earnedCredit: finiteNumber.min(0).max(100).optional(),
  includedInGpa: z.boolean().optional(),
});

export const gpaCalculationSchema = z.strictObject({
  attempts: z.array(courseAttemptSchema).max(500),
});

export const targetGpaSchema = z.strictObject({
  currentQualityPoints: finiteNumber.min(0).max(450_000),
  currentGpaCredits: finiteNumber.positive().max(100_000),
  futureGpaCredits: finiteNumber.positive().max(100_000),
  targetGpa: finiteNumber.min(0).max(4.5),
});

export const courseScoreSchema = z.strictObject({
  targetScore: finiteNumber.min(0).max(100),
  components: z.array(z.strictObject({
    name: z.string().trim().min(1),
    weight: finiteNumber.positive().max(100),
    score: finiteNumber.min(0).max(100).optional(),
  })).min(1).max(30),
});
