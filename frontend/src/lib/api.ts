import type { UiExamType, UiGrade } from './ocr-parser';

export interface CourseAttempt {
  id: string;
  courseCode?: string;
  courseName: string;
  semester: string;
  credits: number;
  score?: number;
  grade?: UiGrade;
  gradePoint?: number;
  examType: UiExamType;
  earnedCredit?: number;
  includedInGpa?: boolean;
}

export interface GpaSummary {
  attemptedCredits: number;
  earnedCredits: number;
  gpaCredits: number;
  qualityPoints: number;
  gpa: number | null;
  displayGpa: string | null;
  contributions: Array<CourseAttempt & {
    grade: UiGrade;
    gradePoint: number | null;
    earnedCredit: number;
    includedInGpa: boolean;
    gpaCredits: number;
    qualityPoints: number;
    exclusionReason?: string;
    warnings?: string[];
  }>;
  policyWarnings: Array<{ code: string; message: string; attemptIds: string[] }>;
}

export interface TargetPlan {
  status: 'ACHIEVABLE' | 'IMPOSSIBLE' | 'ALREADY_ACHIEVED';
  currentGpa: number;
  targetGpa: number;
  requiredFutureGpa: number;
  displayRequiredFutureGpa: string;
  maximumReachableGpa: number;
  displayMaximumReachableGpa: string;
  futureGpaCredits: number;
}

export interface CourseScorePlan {
  status: 'ACHIEVABLE' | 'IMPOSSIBLE' | 'ALREADY_ACHIEVED';
  unknownComponent: string;
  knownWeightedScore: number;
  requiredScore: number;
  displayRequiredScore: string;
}

interface ApiErrorResponse {
  error?: { message?: string };
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as T & ApiErrorResponse;
  if (!response.ok) throw new Error(payload.error?.message ?? '后端暂时无法处理请求。');
  return payload;
}

export const calculateGpa = (attempts: CourseAttempt[]) => post<GpaSummary>(
  '/api/v1/gpa/calculate',
  { attempts },
);

export const planTargetGpa = (input: {
  currentQualityPoints: number;
  currentGpaCredits: number;
  futureGpaCredits: number;
  targetGpa: number;
}) => post<TargetPlan>('/api/v1/gpa/target', input);

export const calculateRequiredScore = (input: {
  targetScore: number;
  components: Array<{ name: string; weight: number; score?: number }>;
}) => post<CourseScorePlan>('/api/v1/course-score/required', input);
