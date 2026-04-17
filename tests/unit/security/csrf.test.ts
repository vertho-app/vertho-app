import { describe, it, expect } from 'vitest';
import { csrfCheck } from '@/lib/csrf';

function makeRequest(method: string, headers: Record<string, string> = {}): Request {
  return new Request('https://app.vertho.com.br/api/test', {
    method,
    headers,
  });
}

describe('csrfCheck', () => {
  it('GET request -> null (skip)', () => {
    const req = makeRequest('GET');
    expect(csrfCheck(req)).toBeNull();
  });

  it('POST com Bearer -> null (skip)', () => {
    const req = makeRequest('POST', { Authorization: 'Bearer some-token' });
    expect(csrfCheck(req)).toBeNull();
  });

  it('POST sem Origin nem Referer -> 403', () => {
    const req = makeRequest('POST');
    const res = csrfCheck(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it('POST com Origin=https://evil.com -> 403', () => {
    const req = makeRequest('POST', { Origin: 'https://evil.com' });
    const res = csrfCheck(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it('POST com Origin=https://empresa.vertho.com.br -> null (pass)', () => {
    const req = makeRequest('POST', { Origin: 'https://empresa.vertho.com.br' });
    expect(csrfCheck(req)).toBeNull();
  });

  it('POST com Origin=http://localhost:3000 -> null (pass)', () => {
    const req = makeRequest('POST', { Origin: 'http://localhost:3000' });
    expect(csrfCheck(req)).toBeNull();
  });

  it('POST com Referer=https://app.vertho.com.br/admin -> null (pass)', () => {
    const req = makeRequest('POST', { Referer: 'https://app.vertho.com.br/admin' });
    expect(csrfCheck(req)).toBeNull();
  });
});
