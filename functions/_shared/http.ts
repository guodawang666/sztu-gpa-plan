import { ZodError } from 'zod';

import { DomainError } from '../../backend/src/domain/errors.js';

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
} as const;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DomainError('INVALID_JSON', '请求不是有效的 JSON。');
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ZodError) {
    return jsonResponse({
      error: {
        code: 'VALIDATION_ERROR',
        message: '请求数据格式不正确。',
        details: error.issues,
      },
    }, 400);
  }

  if (error instanceof DomainError) {
    return jsonResponse({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    }, 400);
  }

  return jsonResponse({
    error: { code: 'INTERNAL_ERROR', message: '服务器处理失败。' },
  }, 500);
}

export function methodNotAllowed(allowed: string): Response {
  const response = jsonResponse({
    error: { code: 'METHOD_NOT_ALLOWED', message: '此接口不支持当前请求方式。' },
  }, 405);
  response.headers.set('allow', allowed);
  return response;
}
