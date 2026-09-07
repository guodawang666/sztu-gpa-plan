import { calculateRequiredComponentScore } from '../../backend/src/domain/course-score.js';
import { calculateGpa } from '../../backend/src/domain/gpa.js';
import { GRADE_POINTS, gradeFromScore } from '../../backend/src/domain/grade-scale.js';
import { planTargetGpa } from '../../backend/src/domain/target-planner.js';
import {
  courseScoreSchema,
  gpaCalculationSchema,
  gradeConversionSchema,
  targetGpaSchema,
} from '../../backend/src/http/schemas.js';
import { errorResponse, jsonResponse, methodNotAllowed, readJson } from '../_shared/http.js';

export const RULES_VERSION = 'sztu-4.5-v1';

interface PagesContext {
  request: Request;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request } = context;
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '');

  if (pathname === '/api/v1/rules') {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    return jsonResponse({
      rulesVersion: RULES_VERSION,
      maximumGradePoint: 4.5,
      gradePoints: GRADE_POINTS,
      policies: {
        failedAttemptIncludedInGpa: true,
        passFailIncludedInGpa: false,
        makeupKeepsOriginalAttempt: true,
        formalRetakeRuleConfirmed: false,
      },
    });
  }

  if (request.method !== 'POST') return methodNotAllowed('POST');

  try {
    const body = await readJson(request);
    if (pathname === '/api/v1/grade/convert') {
      const input = gradeConversionSchema.parse(body);
      return jsonResponse(gradeFromScore(input.score));
    }
    if (pathname === '/api/v1/gpa/calculate') {
      const input = gpaCalculationSchema.parse(body);
      return jsonResponse(calculateGpa(input.attempts));
    }
    if (pathname === '/api/v1/gpa/target') {
      return jsonResponse(planTargetGpa(targetGpaSchema.parse(body)));
    }
    if (pathname === '/api/v1/course-score/required') {
      return jsonResponse(calculateRequiredComponentScore(courseScoreSchema.parse(body)));
    }
    return jsonResponse({
      error: { code: 'NOT_FOUND', message: '接口不存在。' },
    }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}
