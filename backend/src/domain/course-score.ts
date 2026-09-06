import { DomainError } from './errors.js';

export interface ScoreComponent {
  name: string;
  weight: number;
  score?: number | undefined;
}

export interface RequiredComponentScoreInput {
  targetScore: number;
  components: ScoreComponent[];
}

export type RequiredScoreStatus = 'ACHIEVABLE' | 'IMPOSSIBLE' | 'ALREADY_ACHIEVED';

export interface RequiredComponentScoreResult {
  status: RequiredScoreStatus;
  unknownComponent: string;
  knownWeightedScore: number;
  requiredScore: number;
  displayRequiredScore: string;
}

function cleanNumber(value: number): number {
  return Number(value.toFixed(12));
}

export function calculateRequiredComponentScore(
  input: RequiredComponentScoreInput,
): RequiredComponentScoreResult {
  if (!Number.isFinite(input.targetScore) || input.targetScore < 0 || input.targetScore > 100) {
    throw new DomainError('INVALID_TARGET_SCORE', '目标总评成绩必须在 0 到 100 之间。');
  }
  if (input.components.length === 0) {
    throw new DomainError('EMPTY_COMPONENTS', '至少需要一个考核项。');
  }

  let totalWeight = 0;
  let knownWeightedScore = 0;
  const unknownComponents: ScoreComponent[] = [];

  for (const component of input.components) {
    if (
      !component.name.trim()
      || !Number.isFinite(component.weight)
      || component.weight <= 0
      || component.weight > 100
    ) {
      throw new DomainError(
        'INVALID_COMPONENT',
        '每个考核项都必须有名称，且权重必须在 0 到 100 之间。',
        { component },
      );
    }

    totalWeight += component.weight;
    if (component.score === undefined) {
      unknownComponents.push(component);
      continue;
    }
    if (!Number.isFinite(component.score) || component.score < 0 || component.score > 100) {
      throw new DomainError(
        'INVALID_COMPONENT_SCORE',
        `考核项“${component.name}”的成绩必须在 0 到 100 之间。`,
      );
    }
    knownWeightedScore += component.score * component.weight / 100;
  }

  if (Math.abs(totalWeight - 100) > 1e-9) {
    throw new DomainError(
      'INVALID_TOTAL_WEIGHT',
      '所有考核项的权重合计必须为 100%。',
      { totalWeight },
    );
  }
  if (unknownComponents.length !== 1) {
    throw new DomainError(
      'INVALID_UNKNOWN_COMPONENT_COUNT',
      '精确反推时必须恰好有一个未知成绩的考核项。',
      { count: unknownComponents.length },
    );
  }

  const unknownComponent = unknownComponents[0] as ScoreComponent;
  knownWeightedScore = cleanNumber(knownWeightedScore);
  const requiredScore = cleanNumber(
    (input.targetScore - knownWeightedScore) / (unknownComponent.weight / 100),
  );

  let status: RequiredScoreStatus = 'ACHIEVABLE';
  if (requiredScore <= 0) status = 'ALREADY_ACHIEVED';
  else if (requiredScore > 100) status = 'IMPOSSIBLE';

  return {
    status,
    unknownComponent: unknownComponent.name,
    knownWeightedScore,
    requiredScore,
    displayRequiredScore: requiredScore.toFixed(2),
  };
}
