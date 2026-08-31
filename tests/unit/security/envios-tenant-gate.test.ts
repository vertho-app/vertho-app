import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Auditoria 23/07 (Grupo A): as 3 actions de ENVIO com efeito externo
 * (WhatsApp/email) recebiam `empresaId` do CLIENTE e gatavam só permissão
 * (`requireAdminSupabase('assessments.dispatch')`) — um RH do tenant A
 * disparava convites/PDFs/e-mails reais para o roster do tenant B.
 * Fix: guard tenant-scoped `requireEmpresaSupabase(empresaId, perm)`
 * (platform admin global; senão exige role=rh E ctx.empresaId === empresaId).
 *
 * Estas ações jogam FORBIDDEN (throw), não retornam { ok: false }.
 */

let sessao: any = null;

function makeClient() {
  const from = () => {
    const b: any = {
      select: () => b, eq: () => b, in: () => b, not: () => b, order: () => b, limit: () => b,
      // `sys_config.modulos.pulso` presente de propósito: o gate de MÓDULO
      // (mig 210) roda antes do de tenant, e sem ele o teste passaria a provar
      // "módulo não contratado" em vez do cross-check de ciclo que ele existe
      // para provar. O caso do módulo ausente tem teste próprio, abaixo.
      single: async () => ({ data: { id: 'x', nome: 'Empresa', slug: 'emp', status: 'ativo', empresa_id: 'emp-B', sys_config: { modulos: { pulso: true } } }, error: null }),
      maybeSingle: async () => ({ data: { id: 'x', empresa_id: 'emp-B', sys_config: { modulos: { pulso: true } } }, error: null }),
      then: undefined,
    };
    return b;
  };
  return { from };
}
function makeClientSemModulo() {
  const from = () => {
    const b: any = {
      select: () => b, eq: () => b, in: () => b, not: () => b, order: () => b, limit: () => b,
      single: async () => ({ data: { id: 'x', nome: 'Empresa', slug: 'emp', status: 'ativo', empresa_id: 'emp-A', sys_config: {} }, error: null }),
      maybeSingle: async () => ({ data: { id: 'x', empresa_id: 'emp-A', sys_config: {} }, error: null }),
      then: undefined,
    };
    return b;
  };
  return { from };
}
const client = makeClient();
let clientAtual: any = client;

/**
 * Pulso é bloco OFF-LINE desde 31/08/2026 (`lib/blocos-offline.ts`) e
 * `assertBlocoOnline` lança na entrada de `enviarConvitesPulso`, antes do gate
 * de tenant. Ligado de propósito neste arquivo: o caso "RH NÃO dispara Pulse
 * com cicloId de outro tenant" é sobre DISPARO EXTERNO real (WhatsApp/e-mail) e
 * precisa continuar provado — desligar um módulo não pode ser o jeito acidental
 * de apagar a prova de que ele não vazava.
 *
 * As outras actions cobertas aqui não pertencem a bloco off-line e seguem
 * exercitando o código real.
 */
vi.mock('@/lib/blocos-offline', () => ({
  assertBlocoOnline: () => {},
  blocoEstaOffline: () => false,
  BLOCOS_OFFLINE: {},
}));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => clientAtual }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => clientAtual }));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => {
    if (!sessao) throw new Error('UNAUTHORIZED');
    return sessao;
  },
  getAuthenticatedEmailFromAction: async () => sessao?.email || null,
}));
vi.mock('@/lib/permissions', () => ({ can: async () => true }));
vi.mock('@/lib/demo/envio-guard', () => ({ gateEnvioDemo: async () => ({ blocked: false }) }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({ sendWhatsapp: vi.fn(), whatsappHealth: vi.fn() }));
vi.mock('@/actions/whatsapp', () => ({ enviarPDF: vi.fn(), enviarWhatsApp: vi.fn(), enviarAudio: vi.fn() }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: vi.fn() }));
vi.mock('@/components/pdf/RelatorioIndividual', () => ({ default: () => null }));
vi.mock('@/lib/pdf-assets', () => ({ getLogoCoverBase64: () => '' }));

import { enviarConvitesPulso } from '@/actions/pulse/envio';
import { enviarLinksPerfil } from '@/actions/fase5/relatorios-envios';
import { enviarPDFsLote } from '@/actions/automacao-envios';

const OUTRO_TENANT = 'emp-B';
const rhEmpA = { role: 'rh', empresaId: 'emp-A', email: 'rh@a.com', colaborador: { id: 'rh-1' }, isPlatformAdmin: false };

beforeEach(() => { sessao = null; });

describe('gate de tenant nos envios com efeito externo', () => {
  it('RH NÃO dispara convites Pulse (WhatsApp/email) em outro tenant', async () => {
    sessao = rhEmpA;
    await expect(
      enviarConvitesPulso(OUTRO_TENANT, 'ciclo-1', { pulse_moment: 'T0', canal: 'email' }),
    ).rejects.toThrow(/acesso restrito|FORBIDDEN/i);
  });

  it('RH NÃO dispara Pulse com cicloId de outro tenant (mesmo passando o PRÓPRIO empresaId)', async () => {
    // O gate de empresaId passa (emp-A === sessão), mas o ciclo pertence a emp-B.
    // Sem o cross-check ciclo.empresa_id === empresaId, os convites (magic links +
    // WhatsApp/email) iriam pro roster de B. Auditoria 23/07, resíduo do Grupo A.
    sessao = rhEmpA;
    const r: any = await enviarConvitesPulso('emp-A', 'ciclo-de-B', { pulse_moment: 'T0', canal: 'email' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Ciclo não encontrado/i);
  });

  it('Pulse NÃO dispara quando o módulo não está contratado (mig 210)', async () => {
    // Sem contrato, nada de Pulso — nem para o próprio tenant. É o pedágio que
    // faltava: um ciclo rascunho chegou a servir card na home de 40 diretores
    // por 3 meses porque criar ciclo/assignment não tinha régua nenhuma.
    sessao = rhEmpA;
    const semModulo = makeClientSemModulo();
    clientAtual = semModulo;
    const r: any = await enviarConvitesPulso('emp-A', 'ciclo-1', { pulse_moment: 'T0', canal: 'email' });
    clientAtual = client;
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/não está contratado/i);
  });

  it('RH NÃO envia links de perfil pro roster de outro tenant', async () => {
    sessao = rhEmpA;
    await expect(enviarLinksPerfil(OUTRO_TENANT)).rejects.toThrow(/acesso restrito|FORBIDDEN/i);
  });

  it('RH NÃO dispara PDFs DISC via WhatsApp em outro tenant', async () => {
    sessao = rhEmpA;
    await expect(enviarPDFsLote(OUTRO_TENANT)).rejects.toThrow(/acesso restrito|FORBIDDEN/i);
  });

  it('colaborador (mesmo tenant) segue barrado — envio é função de RH', async () => {
    sessao = { role: 'colaborador', empresaId: 'emp-A', email: 'c@a.com', colaborador: { id: 'c-1' }, isPlatformAdmin: false };
    await expect(enviarLinksPerfil('emp-A')).rejects.toThrow(/acesso restrito|FORBIDDEN/i);
  });

  it('RH passa do gate no PRÓPRIO tenant (erro, se houver, é de dado)', async () => {
    sessao = rhEmpA;
    const r: any = await enviarLinksPerfil('emp-A');
    expect(r.error).not.toMatch(/acesso restrito|FORBIDDEN/i);
  });

  it('platform admin PASSA do gate de tenant (é global por definição)', async () => {
    sessao = { role: null, empresaId: null, email: 'admin@vertho.ai', colaborador: null, isPlatformAdmin: true };
    const r: any = await enviarLinksPerfil(OUTRO_TENANT);
    expect(r.error).not.toMatch(/acesso restrito|FORBIDDEN/i);
  });
});
