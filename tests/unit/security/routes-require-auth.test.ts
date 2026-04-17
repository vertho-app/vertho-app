import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

const ROUTES_REQUIRING_AUTH = [
  'app/api/chat/route.ts',
  'app/api/chat-simulador/route.ts',
  'app/api/temporada/missao/route.ts',
  'app/api/temporada/reflection/route.ts',
  'app/api/temporada/tira-duvidas/route.ts',
  'app/api/temporada/evaluation/route.ts',
  'app/api/upload/signed-url/route.ts',
  'app/api/colaboradores/route.ts',
  'app/api/assessment/route.ts',
  'app/api/upload-logo/route.ts',
];

describe('Rotas criticas devem ter auth', () => {
  for (const route of ROUTES_REQUIRING_AUTH) {
    it(`${route} deve ter requireUser ou requireRole`, () => {
      const code = readFileSync(route, 'utf-8');
      expect(
        code.includes('requireUser') || code.includes('requireRole') || code.includes('requireAdmin')
      ).toBe(true);
    });
  }
});

const ROUTES_REQUIRING_CSRF = [
  'app/api/chat/route.ts',
  'app/api/chat-simulador/route.ts',
  'app/api/temporada/missao/route.ts',
  'app/api/temporada/reflection/route.ts',
  'app/api/temporada/tira-duvidas/route.ts',
  'app/api/temporada/evaluation/route.ts',
  'app/api/upload/signed-url/route.ts',
  'app/api/colaboradores/route.ts',
  'app/api/assessment/route.ts',
  'app/api/upload-logo/route.ts',
];

describe('Rotas mutativas devem ter CSRF check', () => {
  for (const route of ROUTES_REQUIRING_CSRF) {
    it(`${route} deve ter csrfCheck`, () => {
      const code = readFileSync(route, 'utf-8');
      expect(code.includes('csrfCheck')).toBe(true);
    });
  }
});

const ROUTES_REQUIRING_RATE_LIMIT = [
  'app/api/chat/route.ts',
  'app/api/chat-simulador/route.ts',
  'app/api/temporada/missao/route.ts',
  'app/api/temporada/reflection/route.ts',
  'app/api/temporada/tira-duvidas/route.ts',
  'app/api/temporada/evaluation/route.ts',
  'app/api/upload/signed-url/route.ts',
];

describe('Rotas de IA devem ter rate limiting', () => {
  for (const route of ROUTES_REQUIRING_RATE_LIMIT) {
    it(`${route} deve ter aiLimiter ou heavyLimiter`, () => {
      const code = readFileSync(route, 'utf-8');
      expect(code.includes('aiLimiter') || code.includes('heavyLimiter')).toBe(true);
    });
  }
});
