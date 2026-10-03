import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-63 (revisão de 02/10/2026): o Admin Sócio ("vê tudo, sem ação destrutiva
 * nem geradora", `lib/permissions.ts`) alcançava ações que só pediam "ser da
 * plataforma": responder colaboradores pelo WhatsApp e reassociar mensagens,
 * resetar a demo e gerar acesso temporário, gerar DNA e Perfil Organizacional.
 *
 * Os gates aqui são os REAIS (`requireAdminAction`, `requirePlataformaSupabase`,
 * `can` com `BASE_ROLE_PERMISSIONS`). Só a sessão e o contexto são simulados,
 * e `permission_overrides` volta vazio: o teste mede o CÓDIGO. Em produção o
 * papel `socio` tem overrides que devolvem estas permissões (R-70, decisão
 * pendente do dono), e enquanto eles existirem este gate não muda nada lá.
 */
const estado = vi.hoisted(() => ({ ctx: null as any }));

const sb = criarSupabaseMock({ lista: () => [], resolver: () => null });

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { email: estado.ctx?.email } }, error: null }) },
  }),
}));
vi.mock('@/lib/authz', () => ({
  getUserContext: async () => estado.ctx,
  isPlatformAdmin: async () => !!estado.ctx?.isPlatformAdmin,
}));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn(async () => {}) }));

// Efeitos que o gate tem que impedir (spies), e o resto das dependências.
const efeitos = vi.hoisted(() => ({
  tenantDb: vi.fn(() => { throw new Error('PASSOU_DO_GATE'); }),
  cleanup: vi.fn(async () => {}),
  resetDemoTenant: vi.fn(async () => ({ ok: true, counts: {} })),
  gerarMagicLinksDemo: vi.fn(async () => ({ ok: true, acessos: [] })),
  prepararAcessosDemo: vi.fn(async () => ({ ok: true, url: 'u', senha: 's', acessos: [] })),
  aggregateDna: vi.fn(async () => ({ semDados: true, avaliados: 0 })),
  aggregatePerfilOrg: vi.fn(async () => ({ semDados: true, avaliados: 0 })),
}));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: efeitos.tenantDb }));
vi.mock('@/lib/whatsapp/cloud-api', () => ({ enviarTextoCloud: vi.fn(), enviarMidiaCloud: vi.fn() }));
vi.mock('@/lib/degradacao', () => ({ registrarDegradacao: vi.fn(), DEGRADACAO: {} }));
vi.mock('@/lib/demo/reset-acme-demo', () => ({
  gerarMagicLinksDemo: efeitos.gerarMagicLinksDemo,
  prepararAcessosDemo: efeitos.prepararAcessosDemo,
  prepararAcessosApresentacaoDemo: vi.fn(async () => ({ ok: true, acessos: [] })),
  resetDemoTenant: efeitos.resetDemoTenant,
  resetPausadoAte: () => null,
  DEMO_TENANT_PROFILES: { 'acme-demo': {} },
}));
vi.mock('@/lib/demo/acme-prospect-tracking', () => ({
  cleanupExpiredDemoProspects: efeitos.cleanup,
  listDemoGuestProgress: vi.fn(async () => []),
}));
vi.mock('@/lib/dna-organizacional/aggregate', () => ({ aggregateDna: efeitos.aggregateDna }));
vi.mock('@/lib/dna-organizacional/narrative', () => ({ gerarNarrativaDna: vi.fn() }));
vi.mock('@/lib/dna-organizacional-pdf', () => ({ renderDnaPDF: vi.fn() }));
vi.mock('@/lib/perfil-organizacional/aggregate', () => ({ aggregatePerfilOrg: efeitos.aggregatePerfilOrg }));
vi.mock('@/lib/perfil-organizacional-pdf', () => ({ renderPerfilOrgPDF: vi.fn() }));

import { responderConversa, responderComAnexo } from '@/app/admin-v2/cliente/inbox-actions';
import { associarTelefone, reprocessarNaoIdentificadas } from '@/app/admin-v2/inbox/inbox-actions';
import { resetarDemo, gerarMagicLinksTemporariosDemo, prepararAcessosTemporariosDemo } from '@/actions/demo';
import { gerarDnaOrganizacional } from '@/actions/dna-organizacional';
import { gerarPerfilOrganizacional } from '@/actions/perfil-organizacional';

const admin = (role: 'socio' | 'master') => ({
  email: `${role}@vertho.ai`,
  colaborador: null,
  role: 'colaborador',
  empresaId: null,
  isPlatformAdmin: true,
  platformAdminRole: role,
});

const FORBIDDEN = /FORBIDDEN/;

describe('Admin Sócio não faz ação de domínio sem a permissão do domínio (R-63)', () => {
  beforeEach(() => {
    sb.reset();
    for (const f of Object.values(efeitos)) f.mockClear();
  });

  describe('mensagens: assessments.dispatch', () => {
    it('🔴 sócio não responde conversa nem manda anexo', async () => {
      estado.ctx = admin('socio');
      await expect(responderConversa({ empresaId: 'e1', telefone: '5511999999999', texto: 'oi' })).rejects.toThrow(FORBIDDEN);
      await expect(responderComAnexo({ empresaId: 'e1', telefone: '5511999999999', path: 'e1/x.pdf', nome: 'x.pdf' })).rejects.toThrow(FORBIDDEN);
      expect(efeitos.tenantDb).not.toHaveBeenCalled();
    });

    it('🔴 sócio não reassocia mensagens', async () => {
      estado.ctx = admin('socio');
      await expect(associarTelefone({ telefone: '5511999999999', colaboradorId: 'c1', empresaId: 'e1' })).rejects.toThrow(FORBIDDEN);
      await expect(reprocessarNaoIdentificadas()).rejects.toThrow(FORBIDDEN);
      // A única leitura permitida é a do próprio gate (overrides de permissão).
      expect(sb.chamadas.filter((c) => c.tabela !== 'permission_overrides')).toHaveLength(0);
    });

    it('master passa do gate (controle positivo)', async () => {
      estado.ctx = admin('master');
      await expect(responderConversa({ empresaId: 'e1', telefone: '5511999999999', texto: 'oi' })).rejects.toThrow('PASSOU_DO_GATE');
      const r: any = await associarTelefone({ telefone: '', colaboradorId: 'c1', empresaId: 'e1' });
      expect(r).toBeTruthy(); // validação do argumento, depois do gate
    });
  });

  describe('demonstração: companies.manage', () => {
    it('🔴 sócio não reseta a demo nem gera acesso temporário', async () => {
      estado.ctx = admin('socio');
      await expect(resetarDemo('acme-demo' as any)).rejects.toThrow(FORBIDDEN);
      await expect(gerarMagicLinksTemporariosDemo('acme-demo' as any)).rejects.toThrow(FORBIDDEN);
      await expect(prepararAcessosTemporariosDemo('acme-demo' as any)).rejects.toThrow(FORBIDDEN);
      expect(efeitos.cleanup).not.toHaveBeenCalled();
      expect(efeitos.resetDemoTenant).not.toHaveBeenCalled();
      expect(efeitos.gerarMagicLinksDemo).not.toHaveBeenCalled();
      expect(efeitos.prepararAcessosDemo).not.toHaveBeenCalled();
    });

    it('master reseta (controle positivo)', async () => {
      estado.ctx = admin('master');
      const r: any = await resetarDemo('acme-demo' as any);
      expect(r.success).toBe(true);
      expect(efeitos.resetDemoTenant).toHaveBeenCalledTimes(1);
    });
  });

  describe('DNA e Perfil Organizacional: ai.audit.regenerate', () => {
    it('🔴 sócio não gera DNA nem Perfil Organizacional', async () => {
      estado.ctx = admin('socio');
      const dna: any = await gerarDnaOrganizacional('e1');
      const perfil: any = await gerarPerfilOrganizacional('e1');
      expect(dna.success).toBe(false);
      expect(dna.error).toMatch(FORBIDDEN);
      expect(perfil.success).toBe(false);
      expect(perfil.error).toMatch(FORBIDDEN);
      expect(efeitos.aggregateDna).not.toHaveBeenCalled();
      expect(efeitos.aggregatePerfilOrg).not.toHaveBeenCalled();
    });

    it('master passa do gate (controle positivo: cai em "empresa não encontrada")', async () => {
      estado.ctx = admin('master');
      const dna: any = await gerarDnaOrganizacional('e1');
      expect(dna.error).toMatch(/Empresa não encontrada/);
    });

    it('RH de empresa não gera DNA (o gate é de plataforma)', async () => {
      estado.ctx = { email: 'rh@cliente.com', colaborador: { id: 'c1' }, role: 'rh', empresaId: 'e1', isPlatformAdmin: false, platformAdminRole: null };
      const dna: any = await gerarDnaOrganizacional('e1');
      expect(dna.success).toBe(false);
      expect(efeitos.aggregateDna).not.toHaveBeenCalled();
    });
  });
});
