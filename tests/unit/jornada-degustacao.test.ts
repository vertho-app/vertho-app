import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { FASE_FORA_DA_DEGUSTACAO } from '@/lib/status';

/**
 * A jornada do convidado da degustação tem que concordar com o resultado.
 *
 * `Medido 22/09/2026`: um convidado real (passaporte do ACME) respondeu a única
 * competência da degustação, leu "1 de 1 competências com análise concluída" na
 * tela do resultado e mandou o print da jornada, que dizia "Fase 2 em curso",
 * "Iniciar mapeamento de competências" e "Concluir avaliação". O corte de uma
 * competência vivia só no assessment; home, jornada e PDI contavam o Top 5.
 *
 * O risco do conserto é o inverso: o corte vazar para cliente real e mostrar a
 * avaliação de alguém como concluída com 1 de 5.
 */

const TOP5 = ['C1', 'C2', 'C3', 'C4', 'C5'];
let empresaDemo = true;
let respondidas = 1;

const sb = criarSupabaseMock({
  resolver: (tabela) => {
    if (tabela === 'cargos_empresa') return { top5_workshop: TOP5 };
    if (tabela === 'empresas') return { sys_config: {}, is_demo: empresaDemo };
    return null;
  },
  contagem: (tabela) => (tabela === 'respostas' ? respondidas : null),
  lista: () => [],
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({ getDashboardView: () => 'colaborador' }));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: vi.fn(async () => {}) };
});

import { carregarDashboardData, carregarHomeKpis, carregarJornada } from '@/lib/home/loaders';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

const registrarSpy = vi.mocked(registrarDegradacao);

const CONVIDADO = 'convidado.acme.aaaaaaaaaaaaaaaaaaaa@vertho.ai';
const colab = (email: string): any => ({
  id: 'colab-1', empresa_id: 'emp-demo', nome_completo: 'Pedro', email,
  cargo: 'Representante Comercial', perfil_dominante: 'CS',
});
const status = (jornada: any) => jornada.fases.map((f: any) => `${f.fase}:${f.status}`);

beforeEach(() => {
  sb.reset();
  registrarSpy.mockClear();
  empresaDemo = true;
  respondidas = 1;
});

describe('jornada do convidado da degustação', () => {
  it('uma competência respondida conclui a fase 2, e PDI, temporada e reavaliação ficam fora', async () => {
    const jornada: any = await carregarJornada(colab(CONVIDADO));
    expect(jornada.degustacao).toBe(true);
    expect(status(jornada)).toEqual([
      '1:completed', '2:completed',
      `3:${FASE_FORA_DA_DEGUSTACAO}`, `4:${FASE_FORA_DA_DEGUSTACAO}`, `5:${FASE_FORA_DA_DEGUSTACAO}`,
    ]);
    expect(jornada.fases[1].descricao).toBe('Competências avaliadas: 1/1');
    // As fases que não existem para ele não custam consulta.
    expect(sb.usou('relatorios', 'select')).toBe(false);
    expect(sb.usou('trilhas', 'select')).toBe(false);
  });

  it('sem resposta ainda, a fase 2 está pendente e as de fora continuam fora', async () => {
    respondidas = 0;
    const jornada: any = await carregarJornada(colab(CONVIDADO));
    expect(status(jornada).slice(0, 2)).toEqual(['1:completed', '2:pending']);
    expect(jornada.fases[2].status).toBe(FASE_FORA_DA_DEGUSTACAO);
  });

  it('🔴 o mesmo e-mail de gente de fora num tenant de CLIENTE conta o Top 5 inteiro', async () => {
    empresaDemo = false;
    const jornada: any = await carregarJornada(colab('pedro@cliente.com.br'));
    expect(jornada.degustacao).toBe(false);
    // (a fase 5 conta respostas de rodada 2, e o mock devolve a mesma contagem
    // para toda consulta em `respostas`: fica fora da asserção)
    expect(status(jornada).slice(0, 4)).toEqual(['1:completed', '2:current', '3:pending', '4:pending']);
    expect(jornada.fases.some((f: any) => f.status === FASE_FORA_DA_DEGUSTACAO)).toBe(false);
    expect(jornada.fases[1].descricao).toBe('Competências avaliadas: 1/5');
  });

  it('persona do elenco no tenant de demo não é convidada: faz as cinco', async () => {
    const jornada: any = await carregarJornada(colab('bruna.demo@vertho.ai'));
    expect(jornada.degustacao).toBe(false);
    expect(jornada.fases[1].status).toBe('current');
  });

  it('is_demo vem na mesma leitura da config: nenhuma consulta a mais', async () => {
    await carregarJornada(colab(CONVIDADO));
    const selectsEmEmpresas = sb.chamadas.filter((c) => c.tabela === 'empresas' && c.metodo === 'select');
    expect(selectsEmEmpresas).toHaveLength(1);
    expect(selectsEmEmpresas[0].args[0]).toContain('is_demo');
  });

  it('falha ao ler is_demo conta o Top 5 e fica REGISTRADA', async () => {
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout no pool' });
    const jornada: any = await carregarJornada(colab(CONVIDADO));
    expect(jornada.degustacao).toBe(false);
    expect(jornada.fases[1].status).toBe('current');
    expect(registrarSpy).toHaveBeenCalledWith(expect.objectContaining({
      fluxo: 'demo',
      tipo: DEGRADACAO.DEGUSTACAO_REGUA_INDISPONIVEL,
      empresaId: 'emp-demo',
      severidade: 'aviso',
    }));
  });
});

describe('home do convidado da degustação', () => {
  it('o progresso é 1 de 1, e o botão principal passa a ser o do resultado', async () => {
    const ctx: any = { colaborador: colab(CONVIDADO), role: 'colaborador', isPlatformAdmin: false };
    const data: any = await carregarDashboardData(ctx, { trilha: null, sysConfig: {}, empresaIsDemo: true });
    expect(data.colaborador.totalComp).toBe(1);
    expect(data.colaborador.respondidas).toBe(1);
    expect(data.colaborador.progresso).toBe(100);
    // A home já leu is_demo na pré-busca: o loader não pergunta de novo.
    expect(sb.usou('empresas', 'select')).toBe(false);
  });

  it('persona do elenco e staff não pagam a consulta de is_demo', async () => {
    for (const email of ['bruna.demo@vertho.ai', 'rodrigo@vertho.ai']) {
      sb.reset();
      const ctx: any = { colaborador: colab(email), role: 'colaborador', isPlatformAdmin: false };
      const data: any = await carregarDashboardData(ctx, { trilha: null, sysConfig: {} });
      expect(data.colaborador.totalComp, email).toBe(5);
      expect(sb.usou('empresas', 'select'), email).toBe(false);
    }
  });

  it('cliente real segue medindo contra o Top 5', async () => {
    const ctx: any = { colaborador: colab('pedro@cliente.com.br'), role: 'colaborador', isPlatformAdmin: false };
    const data: any = await carregarDashboardData(ctx, { trilha: null, sysConfig: {}, empresaIsDemo: false });
    expect(data.colaborador.totalComp).toBe(5);
    expect(data.colaborador.progresso).toBe(20);
  });

  it('a fase atual da home é a 2, concluída, e não a primeira fase de fora', async () => {
    const jornada = await carregarJornada(colab(CONVIDADO));
    const kpis: any = await carregarHomeKpis(colab(CONVIDADO), jornada, { trilha: null });
    expect(kpis.fase).toMatchObject({ numero: 2, concluida: true });
  });
});

describe('tela da jornada', () => {
  const fonte = readFileSync('app/dashboard/jornada/page.tsx', 'utf8');
  const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];

  it('fase fora da degustação não conta como etapa nem vira a fase atual', () => {
    expect(fonte).toMatch(/findIndex\(\(f: any\) => f\.status !== 'completed' && !foraDaDegustacao\(f\)\)/);
    expect(fonte).toMatch(/if \(foraDaDegustacao\(fase\)\) return null;/);
  });

  it('todo texto novo da jornada e do PDI existe nos 4 idiomas', () => {
    const chavesJornada = [...fonte.matchAll(/t\('(degustacao\.\w+|timeline\.outsideTasting)'/g)].map((m) => m[1]);
    const fontePdi = readFileSync('app/dashboard/pdi/page.tsx', 'utf8');
    const chavesPdi = [...fontePdi.matchAll(/t\('(empty\.(?:tasting\w+|viewResult))'/g)].map((m) => m[1]);
    expect(chavesJornada.length).toBeGreaterThanOrEqual(8);
    expect(chavesPdi).toEqual(expect.arrayContaining(['empty.tastingTitle', 'empty.tastingSubtitle', 'empty.viewResult']));

    const ler = (obj: any, caminho: string) => caminho.split('.').reduce((o, k) => o?.[k], obj);
    for (const locale of LOCALES) {
      const msgs = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
      for (const chave of chavesJornada) {
        expect(String(ler(msgs.DashboardJourney, chave) || '').trim(), `${locale}: DashboardJourney.${chave}`).not.toBe('');
      }
      for (const chave of chavesPdi) {
        expect(String(ler(msgs.Pdi, chave) || '').trim(), `${locale}: Pdi.${chave}`).not.toBe('');
      }
    }
  });
});
