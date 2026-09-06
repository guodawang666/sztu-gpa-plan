import { z } from 'zod';

const finiteNumber = z.number().finite();
const gradeSchema = z.enum(['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F', 'P', 'NP']);
const examTypeSchema = z.enum(['NORMAL', 'MAKEUP', 'RETAKE', 'DEFERRED', 'TRANSFER']);

export const gradeConversionSchema = z.strictObject({
  score: finiteNumber.min(0).max(100),
});

export const courseAttemptSchema = z.strictObject({
  id: z.string().trim().min(1),
  courseCode: z.string().trim().min(1).optional(),
  courseName: z.string().trim().min(1),
  semester: z.string().trim().min(1),
  credits: finiteNumber.min(0),
  score: finiteNumber.min(0).max(100).optional(),
  grade: gradeSchema.optional(),
  gradePoint: finiteNumber.min(0).max(4.5).optional(),
  examType: examTypeSchema,
  earnedCredit: finiteNumber.min(0).optional(),
  includedInGpa: z.boolean().optional(),
});

export const gpaCalculationSchema = z.strictObject({
  attempts: z.array(courseAttemptSchema).max(500),
});

export const targetGpaSchema = z.strictObject({
  currentQualityPoints: finiteNumber.min(0),
  currentGpaCredits: finiteNumber.positive(),
  futureGpaCredits: finiteNumber.positive(),
  targetGpa: finiteNumber.min(0).max(4.5),
  maximumGradePoint: finiteNumber.positive().max(10).optional(),
});

export const courseScoreSchema = z.strictObject({
  targetScore: finiteNumber.min(0).max(100),
  components: z.array(z.strictObject({
    name: z.string().trim().min(1),
    weight: finiteNumber.positive().max(100),
    score: finiteNumber.min(0).max(100).optional(),
  })).min(1).max(30),
});
