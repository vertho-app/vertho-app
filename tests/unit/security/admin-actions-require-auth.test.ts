import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

const ADMIN_ACTIONS = [
  'app/admin/dashboard/actions.ts',
  'app/admin/platform-admins/actions.ts',
  'app/admin/empresas/gerenciar/actions.ts',
  'app/admin/cargos/actions.ts',
  'app/admin/relatorios/actions.ts',
  'app/admin/competencias/actions.ts',
  'app/admin/empresas/[empresaId]/actions.ts',
  'app/admin/empresas/[empresaId]/configuracoes/actions.ts',
  'app/admin/empresas/nova/actions.ts',
  'app/admin/ppp/actions.ts',
  'app/admin/whatsapp/actions.ts',
  'app/admin/vertho/evidencias/actions.ts',
  'app/admin/vertho/avaliacao-acumulada/actions.ts',
  'app/admin/vertho/auditoria-sem14/actions.ts',
  'app/admin/vertho/knowledge-base/actions.ts',
];

describe('Admin actions devem ter requireAdminAction()', () => {
  for (const f of ADMIN_ACTIONS) {
    it(`${f} deve ter requireAdminAction`, () => {
      const code = readFileSync(f, 'utf-8');
      expect(code.includes('requireAdminAction')).toBe(true);
    });
  }
});

describe('Admin actions NAO devem receber email como parametro de auth', () => {
  for (const f of ADMIN_ACTIONS) {
    it(`${f} nao deve ter guardAdmin(callerEmail)`, () => {
      const code = readFileSync(f, 'utf-8');
      expect(code.includes('guardAdmin')).toBe(false);
      expect(code.includes('callerEmail')).toBe(false);
    });
  }
});
