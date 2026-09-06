import { describe, expect, it } from 'vitest';

import { parseBackupText } from '../src/lib/storage';

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
