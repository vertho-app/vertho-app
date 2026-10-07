import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bancoEmMemoria, type Tabelas } from '../helpers/tabelas-em-memoria';

/**
 * Entrada da Jornada (revisão de 02/10/2026, lote 8): o que a tela do
 * Diagnóstico serve e o que o servidor aceita gravar.
 *
 *  · R-80: quem não tem Top 5 ouvia "faça o seu Perfil" antes de saber que não
 *    havia nada a responder; o bloqueio voltava sem código para a tela traduzir.
 *  · R-82: uma competência sem cenário (não gerado, ou abaixo da nota mínima)
 *    travava todas as seguintes.
 *  · R-81: `salvarRespostaDiagnostico` só reaplicava a ordem Perfil → Diagnóstico;
 *    gravava com os cenários bloqueados, fora do Top 5, em cenário que a pessoa
 *    nunca receberia, e por cima de uma resposta já avaliada.
 *
 * O banco é o em memória (filtros de verdade): "não gravou" se prova por
 * `sb.escritas`, não pela mensagem de retorno. Os dois gates (cenários e ordem)
 * são os REAIS, lendo a config e a pessoa.
 */

const TOP5 = ['Prospecção', 'Negociação', 'Pós-venda'];
const LIBERADO = { perfil_comportamental_liberado: true, mapeamento_cenarios_liberado: true };

let tabelas: Tabelas;
let sb: ReturnType<typeof bancoEmMemoria>;
const estado = { cfg: LIBERADO as any };

function montar(over: Partial<{ top5: string[]; perfil: string | null; cenarios: any[]; respostas: any[]; sysConfig: any }> = {}) {
  const top5 = over.top5 ?? TOP5;
  tabelas = {
    empresas: [{ id: 'emp', is_demo: false, sys_config: over.sysConfig ?? {} }],
    colaboradores: [{ id: 'colab-1', empresa_id: 'emp', perfil_dominante: over.perfil === undefined ? 'DI' : over.perfil, pref_video_curto: 3 }],
    cargos_empresa: [{ empresa_id: 'emp', nome: 'Vendedor', top5_workshop: top5 }],
    competencias: TOP5.map((nome, i) => ({ id: `c-${i + 1}`, empresa_id: 'emp', cargo: 'Vendedor', nome, cod_desc: null })),
    escolas: [],
    banco_cenarios: over.cenarios ?? TOP5.map((_, i) => cenario(`cen-${i + 1}`, `c-${i + 1}`)),
    respostas: over.respostas ?? [],
    relatorios: [],
  };
  sb = bancoEmMemoria(tabelas);
}

function cenario(id: string, compId: string, extra: Record<string, any> = {}) {
  return {
    id, empresa_id: 'emp', cargo: 'Vendedor', competencia_id: compId, ppp_escola_id: null,
    tipo_cenario: null, nota_check: 90, created_at: '2026-09-01T00:00:00Z',
    titulo: `Título ${id}`, descricao: 'Contexto', alternativas: [], ...extra,
  };
}

vi.mock('next/server', () => ({ after: () => {} }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: vi.fn(async () => ({ id: 'colab-1', nome_completo: 'Ana', cargo: 'Vendedor', role: 'colaborador', empresa_id: 'emp', escola_id: null, email: 'ana@cliente.com' })),
}));
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: vi.fn(async () => 'ana@cliente.com') }));
vi.mock('@/lib/turmas', () => ({ configEfetivaDoColaborador: vi.fn(async () => estado.cfg) }));
vi.mock('@/lib/degradacao', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/degradacao')>()),
  registrarDegradacao: vi.fn(async () => {}),
}));

import { getDiagnosticoDoDia, salvarRespostaDiagnostico } from '@/app/dashboard/assessment/assessment-actions';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

const registrar = vi.mocked(registrarDegradacao);
const valida = { r1: 'x'.repeat(30), r2: 'x'.repeat(30), r3: 'x'.repeat(30), r4: 'x'.repeat(30), repr: 7 };
const gravadas = () => sb.escritas.filter((e) => e.tabela === 'respostas');

beforeEach(() => {
  estado.cfg = LIBERADO;
  registrar.mockClear();
  montar();
});

describe('diagnóstico: pontuação sem texto não vira resposta', () => {
  it.each(['r1', 'r2', 'r3', 'r4'])('recusa pontos em %s mesmo com mais de 20 caracteres', async (campo) => {
    const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', 'Prospecção', {
      ...valida, [campo]: '.'.repeat(31),
    });
    expect(r).toMatchObject({ code: 'RESPOSTA_SEM_TEXTO' });
    expect(gravadas()).toHaveLength(0);
  });

  it.each(['!?—… '.repeat(8), '👍🙂'.repeat(10), '1234567890'.repeat(3)])('recusa símbolos ou números sem palavras: %s', async (texto) => {
    const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', 'Prospecção', { ...valida, r2: texto });
    expect(r).toMatchObject({ code: 'RESPOSTA_SEM_TEXTO' });
    expect(gravadas()).toHaveLength(0);
  });

  it('aceita texto com acentos, números e pontuação', async () => {
    const texto = 'Às 19:45, organizo a equipe e atendo o cliente.';
    const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', 'Prospecção', {
      r1: texto, r2: texto, r3: texto, r4: texto, repr: 7,
    });
    expect(r.success).toBe(true);
    expect(gravadas()).toHaveLength(1);
    expect(gravadas()[0].payload.r1).toBe(texto);
  });
});

describe('R-80: o bloqueio sai com código, e "sem competência" vem antes do Perfil', () => {
  it('sem Top 5 a pessoa sabe que não há o que responder ANTES de ouvir "faça o seu Perfil"', async () => {
    montar({ top5: [], perfil: null });
    const r: any = await getDiagnosticoDoDia();
    expect(r).toMatchObject({ code: 'SEM_COMPETENCIAS' });
  });

  it('com Top 5 e sem Perfil, o bloqueio é o da ordem, com o código que a tela traduz', async () => {
    montar({ perfil: null });
    const r: any = await getDiagnosticoDoDia();
    expect(r).toMatchObject({ code: 'PERFIL_PESSOAL_PENDENTE' });
    expect(r.cenarioDoDia).toBeUndefined();
  });

  it('cenários bloqueados na config voltam com o código do gate', async () => {
    estado.cfg = {};
    expect(await getDiagnosticoDoDia()).toMatchObject({ code: 'CENARIOS_BLOQUEADOS' });
  });
});

describe('R-82: competência sem cenário não trava as seguintes', () => {
  it('a 1ª pendente sem cenário: serve a próxima que tem, e registra o pulo', async () => {
    montar({ cenarios: [cenario('cen-2', 'c-2'), cenario('cen-3', 'c-3')] });
    const r: any = await getDiagnosticoDoDia();
    expect(r.error).toBeUndefined();
    expect(r.cenarioDoDia).toMatchObject({ cenarioId: 'cen-2', compId: 'c-2', compNome: 'Negociação' });
    // o progresso continua contando a que ficou para trás
    expect(r.progresso).toMatchObject({ total: 3, respondidas: 0 });
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({
      fluxo: 'assessment',
      tipo: DEGRADACAO.COMPETENCIA_SEM_CENARIO,
      chave: 'emp:Vendedor:Prospecção',
      empresaId: 'emp',
    }));
  });

  it('cenário abaixo da nota mínima conta como sem cenário', async () => {
    montar({
      sysConfig: { cenario_nota_minima: 80 },
      cenarios: [cenario('cen-1', 'c-1', { nota_check: 58 }), cenario('cen-2', 'c-2')],
    });
    const r: any = await getDiagnosticoDoDia();
    expect(r.cenarioDoDia).toMatchObject({ cenarioId: 'cen-2' });
  });

  it('nenhuma pendente com cenário: bloqueio com código, sem cenário servido', async () => {
    montar({ cenarios: [] });
    const r: any = await getDiagnosticoDoDia();
    expect(r).toMatchObject({ code: 'SEM_CENARIO_DISPONIVEL' });
    expect(registrar).toHaveBeenCalledTimes(3);
  });

  it('ao salvar, a "próxima competência" pula a que não tem cenário', async () => {
    // O banco em memória não aplica upsert: a resposta de c-1 já existe (sem
    // avaliação) e o envio é a edição dela; pendentes ficam c-2 (sem cenário) e c-3.
    montar({
      cenarios: [cenario('cen-1', 'c-1'), cenario('cen-3', 'c-3')],
      respostas: [{ id: 'r1', empresa_id: 'emp', colaborador_id: 'colab-1', competencia_id: 'c-1', competencia_nome: 'Prospecção', avaliacao_ia: null }],
    });
    const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', 'Prospecção', valida);
    expect(r.success).toBe(true);
    expect(r.proximaCompetencia).toBe('Pós-venda');
  });
});

describe('R-81: o servidor reaplica as portas da tela ao gravar', () => {
  it('caminho feliz: grava com o nome da competência do SERVIDOR, não o do browser', async () => {
    const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', 'Nome que o browser inventou', valida);
    expect(r.success).toBe(true);
    expect(gravadas()).toHaveLength(1);
    expect(gravadas()[0].payload).toMatchObject({ competencia_id: 'c-1', competencia_nome: 'Prospecção', cenario_id: 'cen-1' });
  });

  it('cenários bloqueados: recusa com código e NÃO grava', async () => {
    estado.cfg = {};
    const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', 'Prospecção', valida);
    expect(r).toMatchObject({ code: 'CENARIOS_BLOQUEADOS' });
    expect(gravadas()).toHaveLength(0);
  });

  it('votação aberta: recusa e NÃO grava', async () => {
    estado.cfg = { votacao_ativa: true };
    const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', 'Prospecção', valida);
    expect(r).toMatchObject({ code: 'VOTACAO_ATIVA' });
    expect(gravadas()).toHaveLength(0);
  });

  it('sem Perfil: recusa pela ordem e NÃO grava', async () => {
    montar({ perfil: null });
    const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', 'Prospecção', valida);
    expect(r).toMatchObject({ code: 'PERFIL_PESSOAL_PENDENTE' });
    expect(gravadas()).toHaveLength(0);
  });

  it('competência fora do Top 5 do cargo: recusa e NÃO grava', async () => {
    tabelas.competencias.push({ id: 'c-9', empresa_id: 'emp', cargo: 'Vendedor', nome: 'Fora do Top 5', cod_desc: null });
    tabelas.banco_cenarios.push(cenario('cen-9', 'c-9'));
    const r: any = await salvarRespostaDiagnostico('cen-9', 'c-9', 'Fora do Top 5', valida);
    expect(r).toMatchObject({ code: 'COMPETENCIA_FORA_DO_TRILHO' });
    expect(gravadas()).toHaveLength(0);
  });

  it('cenário que não é o servido para a competência (de outra competência): recusa e NÃO grava', async () => {
    const r: any = await salvarRespostaDiagnostico('cen-2', 'c-1', 'Prospecção', valida);
    expect(r).toMatchObject({ code: 'CENARIO_NAO_ELEGIVEL' });
    expect(gravadas()).toHaveLength(0);
  });

  it('cenário abaixo da nota mínima não é aceito nem por chamada direta', async () => {
    montar({ sysConfig: { cenario_nota_minima: 80 }, cenarios: [cenario('cen-1', 'c-1', { nota_check: 58 }), cenario('cen-2', 'c-2')] });
    const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', 'Prospecção', valida);
    expect(r).toMatchObject({ code: 'CENARIO_NAO_ELEGIVEL' });
    expect(gravadas()).toHaveLength(0);
  });

  it('resposta já avaliada pela IA4 não é sobrescrita', async () => {
    montar({ respostas: [{ id: 'r1', empresa_id: 'emp', colaborador_id: 'colab-1', competencia_id: 'c-1', competencia_nome: 'Prospecção', avaliacao_ia: { nivel: 2 } }] });
    const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', 'Prospecção', valida);
    expect(r).toMatchObject({ code: 'COMPETENCIA_JA_AVALIADA' });
    expect(gravadas()).toHaveLength(0);
  });

  it('reenviar antes da avaliação continua sendo edição', async () => {
    montar({ respostas: [{ id: 'r1', empresa_id: 'emp', colaborador_id: 'colab-1', competencia_id: 'c-1', competencia_nome: 'Prospecção', avaliacao_ia: null }] });
    const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', 'Prospecção', valida);
    expect(r.success).toBe(true);
    expect(gravadas()).toHaveLength(1);
  });

  it('resposta acima do teto: recusa com código antes de tocar o banco', async () => {
    const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', 'Prospecção', { ...valida, r3: 'y'.repeat(5001) });
    expect(r).toMatchObject({ code: 'RESPOSTA_LONGA' });
    expect(gravadas()).toHaveLength(0);
  });

  it('falha na leitura de "já avaliada" não vira gravação', async () => {
    sb.falharEm({ tabela: 'respostas', op: 'select', mensagem: 'pool esgotado' });
    const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', 'Prospecção', valida);
    expect(r.error).toBeTruthy();
    expect(gravadas()).toHaveLength(0);
  });
});
