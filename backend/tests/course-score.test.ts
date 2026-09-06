import { describe, expect, it } from 'vitest';

import { calculateRequiredComponentScore } from '../src/domain/course-score.js';

describe('single-course score planning', () => {
  it('calculates the required final-exam score from known components', () => {
    const result = calculateRequiredComponentScore({
      targetScore: 85,
      components: [
        { name: '平时', weight: 20, score: 88 },
        { name: '项目', weight: 20, score: 92 },
        { name: '期中', weight: 20, score: 84 },
        { name: '期末', weight: 40 },
      ],
    });

    expect(result).toMatchObject({
      status: 'ACHIEVABLE',
      unknownComponent: '期末',
      knownWeightedScore: 52.8,
      requiredScore: 80.5,
      displayRequiredScore: '80.50',
    });
  });

  it('marks a target above the remaining possible score as impossible', () => {
    const result = calculateRequiredComponentScore({
      targetScore: 95,
      components: [
        { name: '平时', weight: 60, score: 80 },
        { name: '期末', weight: 40 },
      ],
    });

    expect(result.status).toBe('IMPOSSIBLE');
    expect(result.requiredScore).toBe(117.5);
  });
});
