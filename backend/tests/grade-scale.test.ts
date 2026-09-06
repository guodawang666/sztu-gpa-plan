import { describe, expect, it } from 'vitest';

import { gradeFromScore } from '../src/domain/grade-scale.js';

describe('SZTU grade conversion', () => {
  it('maps every official boundary to the expected grade and grade point', () => {
    expect([
      gradeFromScore(100),
      gradeFromScore(93),
      gradeFromScore(92),
      gradeFromScore(85),
      gradeFromScore(84),
      gradeFromScore(80),
      gradeFromScore(79),
      gradeFromScore(60),
      gradeFromScore(59),
      gradeFromScore(0),
    ]).toEqual([
      { grade: 'A+', gradePoint: 4.5 },
      { grade: 'A+', gradePoint: 4.5 },
      { grade: 'A', gradePoint: 4 },
      { grade: 'A', gradePoint: 4 },
      { grade: 'B+', gradePoint: 3.5 },
      { grade: 'B+', gradePoint: 3.5 },
      { grade: 'B', gradePoint: 3 },
      { grade: 'D', gradePoint: 1 },
      { grade: 'F', gradePoint: 0 },
      { grade: 'F', gradePoint: 0 },
    ]);
  });
});

