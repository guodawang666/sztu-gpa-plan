export const LETTER_GRADES = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'] as const;
export const PASS_FAIL_GRADES = ['P', 'NP'] as const;

export type LetterGrade = (typeof LETTER_GRADES)[number];
export type PassFailGrade = (typeof PASS_FAIL_GRADES)[number];
export type Grade = LetterGrade | PassFailGrade;

export type ExamType = 'NORMAL' | 'MAKEUP' | 'RETAKE' | 'DEFERRED' | 'TRANSFER';

export interface CourseAttemptInput {
  id: string;
  courseCode?: string;
  courseName: string;
  semester: string;
  credits: number;
  score?: number;
  grade?: Grade;
  gradePoint?: number;
  examType: ExamType;
  earnedCredit?: number;
  includedInGpa?: boolean;
}

export interface AttemptContribution {
  id: string;
  courseCode?: string;
  courseName: string;
  semester: string;
  credits: number;
  score?: number;
  grade: Grade;
  gradePoint: number | null;
  examType: ExamType;
  earnedCredit: number;
  includedInGpa: boolean;
  gpaCredits: number;
  qualityPoints: number;
  exclusionReason?: 'PASS_FAIL' | 'ZERO_CREDIT' | 'POLICY_OVERRIDE';
}
