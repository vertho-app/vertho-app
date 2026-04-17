/**
 * Cria Request mock pra testar route handlers Next.js.
 */
export function mockRequest(
  url: string = 'http://localhost:3000/api/test',
  init: RequestInit & { headers?: Record<string, string> } = {},
): Request {
  const headers = new Headers(init.headers || {});
  if (!headers.has('origin')) headers.set('origin', 'http://localhost:3000');
  return new Request(url, { ...init, headers });
}

export function mockPOST(url: string, body: any, headers: Record<string, string> = {}): Request {
  return mockRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000', ...headers },
    body: JSON.stringify(body),
  });
}
