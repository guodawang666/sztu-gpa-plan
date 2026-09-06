import { DomainError } from './errors.js';

export interface TargetGpaInput {
  currentQualityPoints: number;
  currentGpaCredits: number;
  futureGpaCredits: number;
  targetGpa: number;
}

export type TargetPlanStatus = 'ACHIEVABLE' | 'IMPOSSIBLE' | 'ALREADY_ACHIEVED';

export interface TargetGpaPlan {
  status: TargetPlanStatus;
  currentGpa: number;
  targetGpa: number;
  requiredFutureGpa: number;
  displayRequiredFutureGpa: string;
  maximumReachableGpa: number;
  displayMaximumReachableGpa: string;
  futureGpaCredits: number;
}

export const MAXIMUM_GRADE_POINT = 4.5;

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new DomainError('INVALID_NUMBER', `${name}必须是有限数字。`, {
      field: name,
      value,
    });
  }
}

export function planTargetGpa(input: TargetGpaInput): TargetGpaPlan {
  const maximumGradePoint = MAXIMUM_GRADE_POINT;
  assertFinite('当前质量分', input.currentQualityPoints);
  assertFinite('当前 GPA 学分', input.currentGpaCredits);
  assertFinite('未来 GPA 学分', input.futureGpaCredits);
  assertFinite('目标 GPA', input.targetGpa);

  if (input.currentQualityPoints < 0 || input.currentGpaCredits <= 0) {
    throw new DomainError(
      'INVALID_CURRENT_GPA_BASE',
      '当前质量分不能为负数，当前 GPA 学分必须大于 0。',
    );
  }
  if (input.futureGpaCredits <= 0) {
    throw new DomainError('INVALID_FUTURE_CREDITS', '未来 GPA 学分必须大于 0。');
  }
  if (maximumGradePoint <= 0 || input.targetGpa < 0 || input.targetGpa > maximumGradePoint) {
    throw new DomainError(
      'INVALID_TARGET_GPA',
      `目标 GPA 必须在 0 到 ${maximumGradePoint} 之间。`,
    );
  }

  const currentGpa = input.currentQualityPoints / input.currentGpaCredits;
  if (currentGpa > maximumGradePoint) {
    throw new DomainError(
      'INVALID_CURRENT_QUALITY_POINTS',
      '当前质量分超出满绩点在当前学分下可能的范围。',
    );
  }

  const totalCredits = input.currentGpaCredits + input.futureGpaCredits;
  const requiredFutureGpa = (
    input.targetGpa * totalCredits - input.currentQualityPoints
  ) / input.futureGpaCredits;
  const maximumReachableGpa = (
    input.currentQualityPoints + maximumGradePoint * input.futureGpaCredits
  ) / totalCredits;
  if (![currentGpa, requiredFutureGpa, maximumReachableGpa].every(Number.isFinite)) {
    throw new DomainError('NUMERIC_OVERFLOW', 'GPA 规划数据超出可安全计算的范围。');
  }

  let status: TargetPlanStatus = 'ACHIEVABLE';
  if (requiredFutureGpa <= 0) status = 'ALREADY_ACHIEVED';
  else if (requiredFutureGpa > maximumGradePoint) status = 'IMPOSSIBLE';

  return {
    status,
    currentGpa,
    targetGpa: input.targetGpa,
    requiredFutureGpa,
    displayRequiredFutureGpa: requiredFutureGpa.toFixed(2),
    maximumReachableGpa,
    displayMaximumReachableGpa: maximumReachableGpa.toFixed(2),
    futureGpaCredits: input.futureGpaCredits,
  };
}
