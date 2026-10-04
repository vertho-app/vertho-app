/**
 * A-8 da revisão de 27/09/2026: ler só as colunas usadas.
 *
 * `select('*')` trazia o `estado` inteiro da sessão (46,6 KB em média, medido nas
 * sessões desde 18/09): 20 sessões a cada GET da tela, que faz um GET depois de
 * cada envio (cerca de 1 MB por turno), e páginas de 500 linhas no painel da
 * equipe (cerca de 23 MB por página).
 *
 * Duas provas: (1) as leituras de LISTA pedem projeção, e o que volta é uma
 * fração do estado; (2) a tela e o painel saem IGUAIS aos calculados sobre as
 * linhas inteiras, ou seja, a projeção não perdeu nada que alguém lê. Banco em
 * memória sobre o `criarSupabaseMock` oficial, com sessões de tamanho real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bancoEmMemoria, projetar, type BancoEmMemoria } from '../helpers/tabelas-em-memoria';

vi.mock('@/lib/permissions', () => ({ can: async () => true }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => { throw new Error('sem banco no teste'); } }));
vi.mock('@/lib/recepcao/cenarios', () => ({ catalogo: async () => [] }));

import { abrirSessao, consolidar } from '@/lib/recepcao/core';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { aplicarMatrizAtendimento } from '@/lib/recepcao/matriz-avaliacao';
import { COLUNAS_RESUMO, consultar } from '@/lib/recepcao/service';
import { COLUNAS_PAINEL, painelEquipe, resumirEquipe, pessoasDaEquipe } from '@/lib/recepcao/equipe';
import { visaoPorCompetencia } from '@/lib/recepcao/painel';
import { competenciasAtendimento } from '@/lib/recepcao/matriz';
import type { Insumos } from '@/lib/recepcao/model';

const EMPRESA = '10000000-0000-4000-8000-000000000001';
const FALA = 'Entendo o impacto das duas alterações. Qual horário funciona para você?';

/** Sessão com a forma real: matriz no snapshot, conversa de 5 turnos e relatório de 30 descritores. */
function sessaoReal(id: string, dono: string, data: string, tipo: 'matriz' | 'legado' | 'aberta') {
  const c = aplicarMatrizAtendimento(structuredClone(catalogoLimites[0]));
  const s: any = abrirSessao(c, 0);
  s.id = id;
  for (let i = 0; i < 5; i++)
    s.historico.push(
      { id: `m${s.historico.length}`, role: 'user', content: `${FALA} (${i})` },
      { id: `m${s.historico.length + 1}`, role: 'assistant', content: 'Eu quero garantia de sair às três. Não aceito espera.' },
    );
  s.respostas = 5;
  if (tipo !== 'aberta') {
    const insumos: Insumos = {
      dimensoes: c.matriz!.competencias.flatMap((comp, ci) =>
        comp.descritores.map((d) => ({
          id: d.codigo,
          classificacao: ci === 2 ? ('n2' as const) : ('n3' as const),
          justificativa: 'Você perguntou pela disponibilidade antes de propor a alternativa autorizada, e confirmou o combinado no fim.',
          evidencias: [{ mensagemId: 'm1', trecho: 'Qual horário funciona para você?' }],
          oportunidades: [{ mensagemId: 'm0', trecho: s.historico[0].content.slice(0, 30) }],
        })),
      ),
      ocorrencias: [],
      desfecho: { tipo: 'nao_resolvido', justificativa: 'Você sustentou o limite.', evidencias: [] },
      feedback: { acerto: 'Você sustentou o limite com respeito.', melhoria: 'Ofereça o registro de reclamação.', novaTentativa: 'Repita o caso.' },
    };
    s.relatorio = consolidar(s, insumos);
    s.status = 'concluida';
    if (tipo === 'legado') {
      // Relatório anterior à matriz: nota 0-100, sem `escalaNota` nem competências.
      delete s.relatorio.escalaNota;
      delete s.relatorio.competencias;
      s.relatorio.nota = 62.5;
    }
  }
  return { id, empresa_id: EMPRESA, colaborador_id: dono, owner_key: `colab:${dono}`, owner_email: `${dono}@exemplo.test`, created_at: data, revisao: 3, lock_token: null, lock_until: null, chamadas: [], estado: s };
}
const tamanho = (x: unknown) => JSON.stringify(x).length;

let banco: BancoEmMemoria;
let linhas: any[];
beforeEach(() => {
  linhas = [
    sessaoReal('s-matriz-1', 'ana', '2026-09-20T12:00:00.000Z', 'matriz'),
    sessaoReal('s-matriz-2', 'ana', '2026-09-21T12:00:00.000Z', 'matriz'),
    sessaoReal('s-legado', 'ana', '2026-09-10T12:00:00.000Z', 'legado'),
    sessaoReal('s-aberta', 'ana', '2026-09-22T12:00:00.000Z', 'aberta'),
    sessaoReal('s-bruno', 'bruno', '2026-09-19T12:00:00.000Z', 'matriz'),
  ];
  banco = bancoEmMemoria({
    recepcao_sessoes: linhas,
    empresas: [{ id: EMPRESA, nome: 'Fictícia', sys_config: { simuladores_por_cargo: { 'c-rec': { atendimento: true } } } }],
    cargos_empresa: [{ id: 'c-rec', nome: 'Recepção', empresa_id: EMPRESA }],
    colaboradores: ['ana', 'bruno'].map((id) => ({ id, empresa_id: EMPRESA, nome_completo: id.toUpperCase(), email: `${id}@exemplo.test`, gestor_email: 'rh@exemplo.test', cargo: 'Recepção', role: 'colaborador' })),
    recepcao_tentativas: [],
    ia_usage_log: [],
  });
});

describe('A-8: a tela de quem treina lê a lista projetada', () => {
  const ctx = () => ({
    empresaId: EMPRESA, ownerKey: 'colab:ana', owner: 'ana@exemplo.test', empresaNome: 'Fictícia', habilitado: true, dominio: 'recepcao_medica', sb: banco.client,
    auth: { isPlatformAdmin: false, role: 'colaborador', empresaId: EMPRESA, email: 'ana@exemplo.test', colaborador: { id: 'ana', empresa_id: EMPRESA } },
  }) as any;

  it('nenhuma leitura da sessão pede `*`; a lista pede o resumo, e só a sessão da tela vem inteira', async () => {
    await consultar(ctx());
    const pedidas = banco.selects('recepcao_sessoes');
    expect(pedidas).not.toContain('*');
    expect(pedidas.filter((s) => s === COLUNAS_RESUMO).length).toBeGreaterThanOrEqual(2); // página e abertos
    expect(pedidas.filter((s) => s.includes(',estado'))).toHaveLength(1); // a sessão na tela
    expect(pedidas.some((s) => /chamadas/.test(s))).toBe(false);
  });

  it('o resumo é uma fração do estado inteiro', () => {
    const inteiro = linhas.reduce((n, l) => n + tamanho(l), 0);
    const resumo = linhas.reduce((n, l) => n + tamanho(projetar(l, COLUNAS_RESUMO)), 0);
    console.log(`[A-8] tela: ${inteiro} bytes inteiros contra ${resumo} projetados (${linhas.length} sessões)`);
    expect(resumo).toBeLessThan(inteiro / 10);
  });

  it('histórico, sugestão e evolução saem iguais aos lidos das linhas inteiras', async () => {
    const d = await consultar(ctx());
    const porId = Object.fromEntries(d.historico.map((h: any) => [h.id, h]));
    expect(porId['s-matriz-2']).toMatchObject({ status: 'concluida', titulo: linhas[0].estado.cenario.publico.titulo, nivel: 'limite', escalaOriginal: null, situacao: 'avaliado' });
    expect(porId['s-matriz-2'].nota).toBe(linhas[1].estado.relatorio.nota);
    // Legado: nota 0-100 convertida para 1-4 e marcada como escala anterior.
    expect(porId['s-legado']).toMatchObject({ nota: 1 + (3 * 62.5) / 100, escalaOriginal: '0-100' });
    expect(porId['s-aberta']).toMatchObject({ status: 'em_andamento', nota: null, escalaOriginal: null, situacao: null });
    expect(d.abertos.map((h: any) => h.id)).toEqual(['s-aberta']);
    // Duas sessões com matriz: a evolução existe e tem o nível de cada competência.
    expect(d.evolucao?.competencias.find((c: any) => c.codigo === 'clareza')).toMatchObject({ nivelAlcancado: 2 });
    // A sessão na tela é a mais recente, inteira.
    expect(d.sessao.id).toBe('s-aberta');
    expect(d.sessao.historico).toHaveLength(11);
  });

  it('sugestão e evolução leem as avaliações concluídas, não a página do histórico (04/10/2026)', async () => {
    // Vinte atendimentos abertos, todos mais novos que as avaliações: a página 0
    // do histórico fica só com eles, e as avaliações vão para a página seguinte.
    const inicio = Date.parse('2026-09-23T00:00:00.000Z');
    for (let i = 0; i < 20; i++)
      linhas.push(sessaoReal(`s-aberta-${i}`, 'ana', new Date(inicio + i * 3_600_000).toISOString(), 'aberta'));
    const d = await consultar(ctx());
    expect(d.historico.every((h: any) => h.status === 'em_andamento')).toBe(true);
    expect(d.evolucao?.competencias.find((c: any) => c.codigo === 'clareza')).toMatchObject({ nivelAlcancado: 2 });
    // Antes, a página sem conclusões fazia a sugestão dizer "sem histórico".
    expect(d.sugestao.motivo).not.toBe('sem_historico');
    // A segunda leitura pede só as concluídas, na projeção do resumo.
    expect(banco.selects('recepcao_sessoes').filter((s) => s === COLUNAS_RESUMO).length).toBe(3);
  });

  it('sem outra página, as avaliações saem da própria página, sem segunda leitura', async () => {
    await consultar(ctx());
    // Página e atendimentos abertos; nenhuma leitura a mais para as avaliações.
    expect(banco.selects('recepcao_sessoes').filter((s) => s === COLUNAS_RESUMO)).toHaveLength(2);
  });
});

describe('A-8: o painel da equipe lê a projeção', () => {
  const ctx = () => ({
    empresaId: EMPRESA, dominio: 'recepcao_medica', sb: banco.client,
    auth: { isPlatformAdmin: false, role: 'rh', empresaId: EMPRESA, email: 'rh@exemplo.test', colaborador: { id: 'rh', empresa_id: EMPRESA, email: 'rh@exemplo.test' } },
  }) as any;

  it('pede só as colunas do painel, uma fração do estado', async () => {
    await painelEquipe(ctx(), 30);
    expect(banco.selects('recepcao_sessoes')).toEqual([COLUNAS_PAINEL]);
    const inteiro = linhas.reduce((n, l) => n + tamanho(l), 0);
    const projetado = linhas.reduce((n, l) => n + tamanho(projetar(l, COLUNAS_PAINEL)), 0);
    console.log(`[A-8] painel: ${inteiro} bytes inteiros contra ${projetado} projetados`);
    expect(projetado).toBeLessThan(inteiro / 10);
  });

  it('resumo, lista a acompanhar e visão por competência iguais aos das linhas inteiras', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-27T12:00:00.000Z'), toFake: ['Date'] });
    try {
      const c = ctx();
      const painel = await painelEquipe(c, 30);
      const inteiras = [...linhas].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const pessoas = await pessoasDaEquipe(c);
      const esperado = resumirEquipe(inteiras, pessoas);
      expect(painel.sessoes).toEqual(esperado.sessoes);
      expect(painel.grupos).toEqual(esperado.grupos);
      expect(painel.pessoas).toEqual(esperado.pessoas);
      const codigos = competenciasAtendimento('recepcao_medica').map((x) => x.codigo);
      const populacao = pessoas.map((p: any) => ({ id: p.id, nome: p.nome_completo, cargo: 'Recepção' }));
      const visao = visaoPorCompetencia(inteiras, populacao, codigos);
      expect(painel.visao.pessoas).toEqual(visao.pessoas);
      expect(painel.visao.competencias).toEqual(visao.competencias);
      // Pré-condição: o painel viu as cinco sessões.
      expect(painel.sessoes).toHaveLength(5);
    } finally {
      vi.useRealTimers();
    }
  });
});
