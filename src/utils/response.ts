export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/activity+json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function jrdResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/jrd+json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=3600',
    },
  });
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

export function errorResponse(message: string, status = 500): Response {
  return new Response(message, { status });
}

export function acceptedResponse(): Response {
  return new Response('Accepted', { status: 202 });
}

export function notFoundResponse(): Response {
  return new Response('Not Found', { status: 404 });
}

export function unauthorizedResponse(message = 'Unauthorized'): Response {
  return new Response(message, { status: 401 });
}

export function badRequestResponse(message = 'Bad Request'): Response {
  return new Response(message, { status: 400 });
}
