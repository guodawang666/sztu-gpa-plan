import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { calculateRequiredComponentScore } from './domain/course-score.js';
import { DomainError } from './domain/errors.js';
import { calculateGpa } from './domain/gpa.js';
import { GRADE_POINTS, gradeFromScore } from './domain/grade-scale.js';
import { planTargetGpa } from './domain/target-planner.js';
import type { CourseAttemptInput } from './domain/types.js';
import {
  courseScoreSchema,
  gpaCalculationSchema,
  gradeConversionSchema,
  targetGpaSchema,
} from './http/schemas.js';

export const RULES_VERSION = 'sztu-4.5-v1';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST'],
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求数据格式不正确。',
          details: error.issues,
        },
      });
    }

    if (error instanceof DomainError) {
      return reply.status(400).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器处理失败。',
      },
    });
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'sztu-gpa-planner-api',
    rulesVersion: RULES_VERSION,
  }));

  app.get('/api/v1/rules', async () => ({
    rulesVersion: RULES_VERSION,
    maximumGradePoint: 4.5,
    gradePoints: GRADE_POINTS,
    policies: {
      failedAttemptIncludedInGpa: true,
      passFailIncludedInGpa: false,
      makeupKeepsOriginalAttempt: true,
      formalRetakeRuleConfirmed: false,
    },
  }));

  app.post('/api/v1/grade/convert', async (request) => {
    const input = gradeConversionSchema.parse(request.body);
    return gradeFromScore(input.score);
  });

  app.post('/api/v1/gpa/calculate', async (request) => {
    const input = gpaCalculationSchema.parse(request.body);
    return calculateGpa(input.attempts as CourseAttemptInput[]);
  });

  app.post('/api/v1/gpa/target', async (request) => {
    const input = targetGpaSchema.parse(request.body);
    return planTargetGpa(input);
  });

  app.post('/api/v1/course-score/required', async (request) => {
    const input = courseScoreSchema.parse(request.body);
    return calculateRequiredComponentScore(input);
  });

  return app;
}
