export const LETTER_GRADES = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'] as const;
export const PASS_FAIL_GRADES = ['P', 'NP'] as const;
export const EXAM_TYPES = ['NORMAL', 'MAKEUP', 'RETAKE', 'DEFERRED', 'TRANSFER'] as const;

export type LetterGrade = (typeof LETTER_GRADES)[number];
export type PassFailGrade = (typeof PASS_FAIL_GRADES)[number];
export type Grade = LetterGrade | PassFailGrade;

export type ExamType = (typeof EXAM_TYPES)[number];

export interface CourseAttemptInput {
  id: string;
  courseCode?: string | undefined;
  courseName: string;
  semester: string;
  credits: number;
  score?: number | undefined;
  grade?: Grade | undefined;
  gradePoint?: number | undefined;
  examType: ExamType;
  earnedCredit?: number | undefined;
  includedInGpa?: boolean | undefined;
}

export interface AttemptContribution {
  id: string;
  courseCode?: string | undefined;
  courseName: string;
  semester: string;
  credits: number;
  score?: number | undefined;
  grade: Grade;
  gradePoint: number | null;
  examType: ExamType;
  earnedCredit: number;
  includedInGpa: boolean;
  gpaCredits: number;
  qualityPoints: number;
  exclusionReason?: 'PASS_FAIL' | 'ZERO_CREDIT' | 'POLICY_OVERRIDE' | undefined;
  reportedGradePoint?: number | undefined;
  warnings?: Array<
    | 'GRADE_POINT_MISMATCH'
    | 'FAILED_CREDIT_OVERRIDDEN'
    | 'FAILED_GPA_EXCLUSION_OVERRIDDEN'
  > | undefined;
}
