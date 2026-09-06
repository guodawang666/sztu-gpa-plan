import { z } from 'zod';

import type { CourseAttempt } from './api';
import { UI_EXAM_TYPES, UI_LETTER_GRADES, UI_PASS_FAIL_GRADES } from './ocr-parser';

const gradeSchema = z.enum([...UI_LETTER_GRADES, ...UI_PASS_FAIL_GRADES]);
const courseAttemptSchema = z.strictObject({
  id: z.string().trim().min(1),
  courseCode: z.string().trim().min(1).optional(),
  courseName: z.string().trim().min(1),
  semester: z.string().trim().min(1),
  credits: z.number().finite().min(0).max(100),
  score: z.number().finite().min(0).max(100).optional(),
  grade: gradeSchema.optional(),
  gradePoint: z.number().finite().min(0).max(4.5).optional(),
  examType: z.enum(UI_EXAM_TYPES),
  earnedCredit: z.number().finite().min(0).max(100).optional(),
  includedInGpa: z.boolean().optional(),
});
const backupSchema = z.strictObject({
  version: z.literal(1),
  attempts: z.array(courseAttemptSchema).max(500),
});

function asCourseAttempt(value: z.infer<typeof courseAttemptSchema>): CourseAttempt {
  return {
    id: value.id,
    courseName: value.courseName,
    semester: value.semester,
    credits: value.credits,
    examType: value.examType,
    ...(value.courseCode === undefined ? {} : { courseCode: value.courseCode }),
    ...(value.score === undefined ? {} : { score: value.score }),
    ...(value.grade === undefined ? {} : { grade: value.grade }),
    ...(value.gradePoint === undefined ? {} : { gradePoint: value.gradePoint }),
    ...(value.earnedCredit === undefined ? {} : { earnedCredit: value.earnedCredit }),
    ...(value.includedInGpa === undefined ? {} : { includedInGpa: value.includedInGpa }),
  };
}

export function parseBackupText(text: string): CourseAttempt[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('备份文件格式不正确：不是有效 JSON。');
  }

  const result = backupSchema.safeParse(parsed);
  if (!result.success) throw new Error('备份文件格式不正确：内容未通过校验。');
  return result.data.attempts.map(asCourseAttempt);
}

export function createBackupText(attempts: CourseAttempt[]): string {
  return JSON.stringify({ version: 1, attempts }, null, 2);
}
