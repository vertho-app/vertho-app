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
      single: async () => ({ data: { id: 'x', nome: 'Empresa', slug: 'emp', status: 'ativo' }, error: null }),
      maybeSingle: async () => ({ data: { id: 'x', empresa_id: 'emp-B' }, error: null }),
      then: undefined,
    };
    return b;
  };
  return { from };
}
const client = makeClient();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => client }));
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
