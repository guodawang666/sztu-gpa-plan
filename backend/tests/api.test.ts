import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('HTTP API', () => {
  it('exposes the service health and rules version', async () => {
    app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'sztu-gpa-planner-api',
      rulesVersion: 'sztu-4.5-v1',
    });
  });

  it('calculates GPA through the public endpoint', async () => {
    app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/gpa/calculate',
      payload: {
        attempts: [
          {
            id: 'normal-f',
            courseName: '微积分2',
            semester: '2023-2024-2',
            credits: 4,
            score: 53,
            grade: 'F',
            examType: 'NORMAL',
          },
          {
            id: 'makeup-d',
            courseName: '微积分2',
            semester: '2024-2025-2',
            credits: 4,
            score: 64,
            grade: 'D',
            examType: 'MAKEUP',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      attemptedCredits: 8,
      earnedCredits: 4,
      gpaCredits: 8,
      qualityPoints: 4,
      displayGpa: '0.50',
    });
  });

  it('returns a structured validation error instead of calculating invalid weights', async () => {
    app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/course-score/required',
      payload: {
        targetScore: 85,
        components: [
          { name: '平时', weight: 20, score: 88 },
          { name: '期末', weight: 40 },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'INVALID_TOTAL_WEIGHT',
      },
    });
  });

  it('does not allow the SZTU 4.5 scale to be overridden', async () => {
    app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/gpa/target',
      payload: {
        currentQualityPoints: 392,
        currentGpaCredits: 130,
        futureGpaCredits: 60,
        targetGpa: 3.5,
        maximumGradePoint: 10,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('keeps malformed JSON as a client error', async () => {
    app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/gpa/calculate',
      headers: { 'content-type': 'application/json' },
      payload: '{"attempts":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'INVALID_JSON' },
    });
  });
});
