import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { registrarDegradacao } from '@/lib/degradacao';

/**
 * `salvarPerfilComportamental` — toda saída SEM gravar deixa rastro.
 *
 * 06/10/2026: uma pessoa da 4Life disse que tinha feito o DISC e o banco não tinha
 * nada, sem erro no Sentry, sem log e sem rascunho (as respostas só vivem no
 * navegador). A falha de gravação volta como `{ success: false }`, que não é exceção
 * e portanto não chega ao Sentry. O que estes testes protegem é o rastro em
 * `degradacao_log` (`disc-nao-salvo`): quem, em que empresa, por que motivo, e
 * com que severidade. E que nem as respostas nem o e-mail vão parar lá.
 */

const registrarSpy = vi.mocked(registrarDegradacao);

vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: vi.fn(async () => {}) };
});

const EMAIL = 'priscilla@exemplo.com';
let email: string | null = EMAIL;
let espera: number | null = null;
let colab: any = { id: 'colab-1', empresa_id: 'emp-1' };
let cfg: any = {};
let gate: any = { allowed: true };

const sb = criarSupabaseMock({});

vi.mock('next/server', () => ({ after: () => {} }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: async () => email }));
vi.mock('@/lib/authz', () => ({ findColabByEmail: async () => colab }));
vi.mock('@/lib/access-gates', () => ({ canAccessPerfilComportamental: () => gate }));
vi.mock('@/lib/turmas', () => ({ configEfetivaDoColaborador: async () => cfg }));
vi.mock('@/lib/rate-limit', () => ({ heavyLimiter: {}, limitarAcao: async () => espera }));
vi.mock('@/lib/demo/acme-prospect-tracking', () => ({ recordAcmeProspectDiscCompletion: async () => {} }));

import { salvarPerfilComportamental } from '@/app/dashboard/perfil-comportamental/mapeamento/mapeamento-actions';

const respostas = () => ({
  disc: { D: 40, I: 55, S: 60, C: 45 },
  lead: { Executivo: 3, Motivador: 4, Metodico: 5, Sistematico: 6 },
  profile: 'SI',
  learnPrefs: null,
  rawData: { rank1: [['segredo-das-respostas']], formName: 'Priscilla' },
});

beforeEach(() => {
  sb.reset();
  registrarSpy.mockClear();
  email = EMAIL; espera = null; colab = { id: 'colab-1', empresa_id: 'emp-1' }; cfg = {}; gate = { allowed: true };
});

describe('disc-nao-salvo · o que fica registrado', () => {
  it('gravou: não registra nada', async () => {
    expect(await salvarPerfilComportamental(respostas())).toEqual({ success: true });
    expect(registrarSpy).not.toHaveBeenCalled();
  });

  it('erro de gravação no banco: CRÍTICO, com a pessoa, a empresa e a mensagem', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'update', mensagem: 'timeout no pool' });
    expect(await salvarPerfilComportamental(respostas())).toEqual({ success: false, error: 'timeout no pool' });
    expect(registrarSpy).toHaveBeenCalledTimes(1);
    expect(registrarSpy).toHaveBeenCalledWith(expect.objectContaining({
      fluxo: 'assessment',
      tipo: 'disc-nao-salvo',
      chave: 'colab-1:erro-de-gravacao',
      empresaId: 'emp-1',
      colaboradorId: 'colab-1',
      severidade: 'critico',
      detalhe: { motivo: 'erro-de-gravacao', mensagem: 'timeout no pool' },
    }));
  });

  it('exceção: registra CRÍTICO e RELANÇA, a tela continua vendo o mesmo erro de antes', async () => {
    // Resposta sem `disc`: o cálculo das competências lança antes de qualquer gravação.
    const quebrada: any = { ...respostas(), disc: undefined };
    await expect(salvarPerfilComportamental(quebrada)).rejects.toThrow();
    expect(registrarSpy).toHaveBeenCalledTimes(1);
    expect(registrarSpy).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'disc-nao-salvo',
      chave: 'colab-1:excecao',
      colaboradorId: 'colab-1',
      severidade: 'critico',
    }));
    expect(registrarSpy.mock.calls[0][0].detalhe).toMatchObject({ motivo: 'excecao' });
  });

  it('perfil ainda não liberado pela empresa: aviso, com o código do gate', async () => {
    gate = { allowed: false, message: 'Aguarde a liberação', code: 'PERFIL_NAO_LIBERADO' };
    expect((await salvarPerfilComportamental(respostas())).success).toBe(false);
    expect(registrarSpy).toHaveBeenCalledWith(expect.objectContaining({
      chave: 'colab-1:perfil-nao-liberado',
      severidade: 'aviso',
      detalhe: { motivo: 'perfil-nao-liberado', code: 'PERFIL_NAO_LIBERADO' },
    }));
  });

  it('empresa com fonte externa de perfil: aviso', async () => {
    cfg = { perfil_externo_fonte: 'opq32' };
    expect((await salvarPerfilComportamental(respostas())).success).toBe(false);
    expect(registrarSpy).toHaveBeenCalledWith(expect.objectContaining({
      chave: 'colab-1:fonte-externa',
      severidade: 'aviso',
    }));
  });

  it('pessoa ainda sem identificação: a chave é só o motivo e não leva colaborador', async () => {
    espera = 12;
    expect((await salvarPerfilComportamental(respostas())).success).toBe(false);
    expect(registrarSpy).toHaveBeenCalledWith(expect.objectContaining({
      chave: 'limite-de-taxa',
      empresaId: null,
      colaboradorId: null,
      severidade: 'aviso',
      detalhe: { motivo: 'limite-de-taxa', espera_s: 12 },
    }));

    registrarSpy.mockClear();
    espera = null; email = null;
    expect((await salvarPerfilComportamental(respostas())).success).toBe(false);
    expect(registrarSpy).toHaveBeenCalledWith(expect.objectContaining({
      chave: 'dados-incompletos',
      detalhe: { motivo: 'dados-incompletos', sem_sessao: true, sem_resultados: false },
    }));

    registrarSpy.mockClear();
    email = EMAIL; colab = null;
    expect((await salvarPerfilComportamental(respostas())).success).toBe(false);
    expect(registrarSpy).toHaveBeenCalledWith(expect.objectContaining({ chave: 'colaborador-nao-encontrado' }));
  });

  it('nunca leva as respostas nem o e-mail para o log', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'update', mensagem: 'timeout no pool' });
    await salvarPerfilComportamental(respostas());
    const registrado = JSON.stringify(registrarSpy.mock.calls);
    expect(registrado).not.toContain('segredo-das-respostas');
    expect(registrado).not.toContain(EMAIL);
    expect(registrado).not.toContain('rawData');
  });
});
