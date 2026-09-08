import { describe, expect, it } from 'vitest';

import {
  createDirectGpaBaseText,
  parseBackupText,
  parseDirectGpaBaseText,
} from '../src/lib/storage';

describe('local JSON backup validation', () => {
  it('accepts a versioned backup with valid attempts', () => {
    const attempts = parseBackupText(JSON.stringify({
      version: 1,
      attempts: [{
        id: 'attempt-1', courseName: '微积分2', semester: '2024-2025-1', credits: 4, grade: 'F', examType: 'NORMAL',
      }],
    }));

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ courseName: '微积分2', grade: 'F' });
  });

  it('rejects malformed backups before they enter local state', () => {
    expect(() => parseBackupText(JSON.stringify({
      version: 1,
      attempts: [{ id: 'bad', courseName: '错误课程', semester: '2024', credits: -1, grade: 'A', examType: 'NORMAL' }],
    }))).toThrow('备份文件格式不正确');
  });
});

describe('direct cumulative GPA storage', () => {
  it('round-trips a validated official cumulative GPA base', () => {
    const restored = parseDirectGpaBaseText(createDirectGpaBaseText({
      gpa: 3.02,
      gpaCredits: 130,
      earnedCredits: 127,
      attemptedCredits: 131,
      updatedAt: '2026-09-08T00:00:00.000Z',
    }));

    expect(restored).toEqual({
      gpa: 3.02,
      gpaCredits: 130,
      earnedCredits: 127,
      attemptedCredits: 131,
      updatedAt: '2026-09-08T00:00:00.000Z',
    });
  });

  it('rejects a GPA above the SZTU 4.5 maximum', () => {
    expect(() => parseDirectGpaBaseText(JSON.stringify({
      version: 1,
      base: { gpa: 4.6, gpaCredits: 10, updatedAt: '2026-09-08T00:00:00.000Z' },
    }))).toThrow('累计 GPA 数据格式不正确');
  });
});
