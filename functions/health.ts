import { jsonResponse, methodNotAllowed } from './_shared/http.js';

interface PagesContext {
  request: Request;
}

export function onRequest(context: PagesContext): Response {
  if (context.request.method !== 'GET') return methodNotAllowed('GET');
  return jsonResponse({
    status: 'ok',
    service: 'sztu-gpa-planner-api',
    rulesVersion: 'sztu-4.5-v1',
  });
}
