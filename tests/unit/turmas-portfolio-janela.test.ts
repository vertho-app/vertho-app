import { describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { levantarPortfolioTurmas, proximaAcaoDaTurma } from '@/lib/turmas/portfolio';

/**
 * Ibipeba, 07/10/2026: o painel da turma NOVA mostrava 41/53 · 40/53 · 39/53 (a vida
 * inteira de cada pessoa) e a turma ANTIGA, com os membros `removido`, mostrava 0.
 * Aqui a mesma situação em miniatura, contra o levantamento de verdade (o banco é
 * falso, a conta é a do código): a antiga guarda os números do período, a nova nasce
 * zerada, e uma empresa SEM marco (Macaé) não muda de número.
 */

const EMP = '10000000-0000-4000-8000-000000000001';
const MARCO = '2026-10-07T12:22:33.000Z';
const AGORA = new Date('2026-10-07T13:00:00Z');

type Tabelas = Record<string, any[]>;
const banco = (t: Tabelas) => criarSupabaseMock({
  lista: (tabela) => t[tabela] || [],
  contagem: (tabela) => (t[tabela] || []).length,
});

const turmas = [
  { id: 'T1', nome: 'Turma 1', status: 'em_jornada', data_inicio: '2026-07-13', sys_config: {} },
  { id: 'T2', nome: 'Temporada 2', status: 'diagnostico', data_inicio: '2026-10-26', sys_config: {} },
];

/** 3 pessoas; as três já tinham resposta, IA4 e trilha na jornada 1. */
function ibipeba(extra: { respostasNovas?: any[]; trilhasNovas?: any[] } = {}): Tabelas {
  const pessoas = ['ana', 'bia', 'caio'];
  return {
    turmas,
    colaboradores: pessoas.map((id) => ({ id })),
    turma_membros: pessoas.flatMap((id) => [
      { id: `a-${id}`, turma_id: 'T1', colaborador_id: id, status: 'concluido', created_at: '2026-08-13T03:24:44Z', marco_jornada: null },
      { id: `n-${id}`, turma_id: 'T2', colaborador_id: id, status: 'ativo', created_at: MARCO, marco_jornada: MARCO },
    ]),
    respostas: [
      ...pessoas.map((id) => ({ colaborador_id: id, nivel_ia4: 3, timestamp_resposta: '2026-09-04T16:18:00Z' })),
      ...(extra.respostasNovas || []),
    ],
    trilhas: [
      ...pessoas.map((id) => ({ id: `tr-${id}`, colaborador_id: id, turma_membro_id: `a-${id}`, status: 'ativa', data_inicio: '2026-07-13', criado_em: '2026-07-13T00:00:00Z' })),
      ...(extra.trilhasNovas || []),
    ],
  };
}

const resumo = (p: Awaited<ReturnType<typeof levantarPortfolioTurmas>>, id: string) => p.turmas.find((t) => t.id === id)!;

describe('portfólio de turmas: reentrada com jornada nova', () => {
  it('a turma ANTIGA guarda os números do período; a NOVA nasce zerada', async () => {
    const p = await levantarPortfolioTurmas(banco(ibipeba()).client, EMP, AGORA);
    const antiga = resumo(p, 'T1');
    const nova = resumo(p, 'T2');

    // O que o dono viu na tela: antiga zerada e nova com os números da antiga. Agora o contrário.
    expect([antiga.membros, antiga.encerrados, antiga.participantes]).toEqual([0, 3, 3]);
    expect([antiga.comResposta, antiga.comIa4, antiga.comTrilha]).toEqual([3, 3, 3]);

    expect([nova.membros, nova.encerrados, nova.participantes]).toEqual([3, 0, 3]);
    expect([nova.comResposta, nova.comIa4, nova.comTrilha]).toEqual([0, 0, 0]);
  });

  it('a próxima ação de cada uma fala do que ela tem (histórico não é "vazia"; zerada pede mobilização)', async () => {
    const p = await levantarPortfolioTurmas(banco(ibipeba()).client, EMP, AGORA);
    expect(resumo(p, 'T1').proximaAcao).toBeNull();
    expect(resumo(p, 'T2').proximaAcao).toBe('mobilizar: 0 de 3 responderam o diagnóstico');
  });

  it('resposta DEPOIS do marco conta só na turma nova; a antiga não muda', async () => {
    const p = await levantarPortfolioTurmas(banco(ibipeba({
      respostasNovas: [{ colaborador_id: 'ana', nivel_ia4: null, timestamp_resposta: '2026-10-08T10:00:00Z' }],
    })).client, EMP, AGORA);
    expect(resumo(p, 'T2').comResposta).toBe(1);
    expect(resumo(p, 'T2').comIa4).toBe(0);
    expect(resumo(p, 'T1').comResposta).toBe(3);
  });

  it('trilha nova carimbada com a participação nova conta na nova, e só nela', async () => {
    const p = await levantarPortfolioTurmas(banco(ibipeba({
      trilhasNovas: [{ id: 'tr-n', colaborador_id: 'ana', turma_membro_id: 'n-ana', status: 'ativa', data_inicio: '2026-10-26', criado_em: '2026-10-20T00:00:00Z' }],
    })).client, EMP, AGORA);
    expect(resumo(p, 'T2').comTrilha).toBe(1);
    expect(resumo(p, 'T1').comTrilha).toBe(3);
  });

  it('as pessoas encerradas não voltam a contar como "sem turma" nem como membros operacionais', async () => {
    const p = await levantarPortfolioTurmas(banco(ibipeba()).client, EMP, AGORA);
    expect(p.semTurma).toBe(0);
    expect(resumo(p, 'T1').membros).toBe(0);
  });
});

describe('portfólio de turmas: CONTROLE sem marco (Macaé) não muda de número', () => {
  it('desmembramento: removido some da antiga e a conta segue por pessoa na nova', async () => {
    const t: Tabelas = {
      turmas,
      colaboradores: [{ id: 'ana' }, { id: 'bia' }],
      turma_membros: [
        { id: 'a-ana', turma_id: 'T1', colaborador_id: 'ana', status: 'removido', created_at: '2026-08-13T03:24:44Z', marco_jornada: null },
        { id: 'n-ana', turma_id: 'T2', colaborador_id: 'ana', status: 'ativo', created_at: '2026-09-22T12:00:00Z', marco_jornada: null },
        { id: 'a-bia', turma_id: 'T1', colaborador_id: 'bia', status: 'ativo', created_at: '2026-08-13T03:24:44Z', marco_jornada: null },
      ],
      // A Ana respondeu ANTES do desmembramento: continua contando na turma nova.
      respostas: [{ colaborador_id: 'ana', nivel_ia4: 3, timestamp_resposta: '2026-09-04T16:18:00Z' }],
      trilhas: [{ id: 'tr-ana', colaborador_id: 'ana', turma_membro_id: 'a-ana', status: 'ativa', data_inicio: '2026-09-07', criado_em: '2026-09-07T00:00:00Z' }],
    };
    const p = await levantarPortfolioTurmas(banco(t).client, EMP, AGORA);
    const nova = resumo(p, 'T2');
    expect([nova.membros, nova.encerrados, nova.participantes]).toEqual([1, 0, 1]);
    expect([nova.comResposta, nova.comIa4, nova.comTrilha]).toEqual([1, 1, 1]);
    const antiga = resumo(p, 'T1');
    expect([antiga.membros, antiga.encerrados, antiga.participantes]).toEqual([1, 0, 1]);
    expect(antiga.comResposta).toBe(0);
  });
});

describe('proximaAcaoDaTurma: turma só com histórico', () => {
  it('sem ativos e com encerrados não é "vazia": não há ação a tomar', () => {
    expect(proximaAcaoDaTurma({ membros: 0, comResposta: 0, comIa4: 0, comTrilha: 0, encerrados: 53 })).toBeNull();
  });

  it('sem ativos e sem histórico continua sendo pendência visível', () => {
    expect(proximaAcaoDaTurma({ membros: 0, comResposta: 0, comIa4: 0, comTrilha: 0 })).toBe('turma vazia — atribua pessoas');
    expect(proximaAcaoDaTurma({ membros: 0, comResposta: 0, comIa4: 0, comTrilha: 0, encerrados: 0 })).toBe('turma vazia — atribua pessoas');
  });
});
