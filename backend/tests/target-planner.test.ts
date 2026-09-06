import { describe, expect, it } from 'vitest';

import { planTargetGpa } from '../src/domain/target-planner.js';

describe('target GPA planning', () => {
  it('calculates the future GPA needed to reach 3.30', () => {
    const result = planTargetGpa({
      currentQualityPoints: 392,
      currentGpaCredits: 130,
      futureGpaCredits: 60,
      targetGpa: 3.3,
    });

    expect(result.status).toBe('ACHIEVABLE');
    expect(result.requiredFutureGpa).toBeCloseTo(3.9166666667, 8);
    expect(result.displayRequiredFutureGpa).toBe('3.92');
    expect(result.maximumReachableGpa).toBeCloseTo(662 / 190, 8);
  });

  it('marks 3.50 as impossible and reports the maximum reachable GPA', () => {
    const result = planTargetGpa({
      currentQualityPoints: 392,
      currentGpaCredits: 130,
      futureGpaCredits: 60,
      targetGpa: 3.5,
    });

    expect(result.status).toBe('IMPOSSIBLE');
    expect(result.requiredFutureGpa).toBeCloseTo(4.55, 8);
    expect(result.maximumReachableGpa).toBeCloseTo(3.4842105263, 8);
    expect(result.displayMaximumReachableGpa).toBe('3.48');
  });
});
