import { describe, expect, it } from 'vitest';

import { onRequest as apiRequest } from '../../functions/api/[[path]].js';
import { onRequest as healthRequest } from '../../functions/health.js';

function post(path: string, body: unknown): Promise<Response> {
  return apiRequest({
    request: new Request(`https://gpa.gzkang.com${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
}

describe('Cloudflare Pages Functions', () => {
  it('serves a public health check', async () => {
    const response = healthRequest({
      request: new Request('https://gpa.gzkang.com/health'),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      rulesVersion: 'sztu-4.5-v1',
    });
  });

  it('uses the same verified GPA calculation as the local Fastify API', async () => {
    const response = await post('/api/v1/gpa/calculate', {
      attempts: [
        {
          id: 'course-1',
          courseName: '高等英语',
          semester: '2025-2026-1',
          credits: 2,
          score: 81,
          grade: 'B+',
          examType: 'NORMAL',
        },
        {
          id: 'course-2',
          courseName: '大学英语 A1',
          semester: '2025-2026-1',
          credits: 4,
          score: 75,
          grade: 'B',
          examType: 'NORMAL',
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      gpaCredits: 6,
      qualityPoints: 19,
      displayGpa: '3.17',
    });
  });

  it('keeps validation and malformed JSON as client errors', async () => {
    const invalidPayload = await post('/api/v1/gpa/target', {
      currentQualityPoints: 392,
      currentGpaCredits: 130,
      futureGpaCredits: 60,
      targetGpa: 3.5,
      maximumGradePoint: 10,
    });
    expect(invalidPayload.status).toBe(400);
    expect(await invalidPayload.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });

    const malformed = await apiRequest({
      request: new Request('https://gpa.gzkang.com/api/v1/gpa/calculate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"attempts":',
      }),
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      error: { code: 'INVALID_JSON' },
    });
  });
});
