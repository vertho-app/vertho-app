import { describe, it, expect } from 'vitest';
import { agregarEvolucao, type TrilhaConcluida, type ParticipanteEvolucao } from '@/lib/relatorios/evolucao-center';
import { CONVERGENCIA } from '@/lib/season-engine/convergencia';

const participantes: ParticipanteEvolucao[] = [
  { id: 'p1', nome_completo: 'Ana Souza', cargo: 'Coordenadora', area_depto: 'Pedagógico' },
  { id: 'p2', nome_completo: 'Bruno Lima', cargo: 'Diretor', area_depto: 'Gestão' },
  { id: 'p3', nome_completo: 'Carla Dias', cargo: 'Coordenadora', area_depto: 'Pedagógico' },
  { id: 'p4', nome_completo: 'Sem jornada', cargo: 'Analista', area_depto: 'Apoio' },
];

function trilha(
  colaborador_id: string,
  descritores: any[],
  extra: Record<string, any> = {},
): TrilhaConcluida {
  return {
    colaborador_id,
    competencia_foco: 'Planejamento',
    evolution_generated_at: '2026-08-20T12:00:00Z',
    evolution_report: { descritores, insight_geral: 'insight', proximo_passo: 'passo', ...extra },
  };
}

const d = (descritor: string, pre: number, pos: number, convergencia: string | null, depois?: string) => ({
  competencia: 'Planejamento',
  descritor,
  nota_pre: pre,
  nota_pos: pos,
  convergencia,
  depois: depois ?? null,
});

describe('agregarEvolucao', () => {
  it('mostra a cobertura com o denominador, não só o resultado', () => {
    const r = agregarEvolucao(
      [trilha('p1', [d('Metas', 2, 3, CONVERGENCIA.CONFIRMADA)])],
      participantes,
      2,
    );
    expect(r.cobertura).toEqual({ participantes: 4, emJornada: 2, medidos: 1, percentual: 25 });
  });

  it('EXCLUI o relatório de piloto', () => {
    // O piloto grava `baseline`/`nota_avaliacao`. Entrando aqui, `nota_pre`
    // viria undefined, o delta sairia sobre zero e o painel diria que a pessoa
    // regrediu de 0 para 0 — sobre alguém que fez tudo certo.
    const r = agregarEvolucao(
      [
        trilha('p1', [d('Metas', 2, 3, CONVERGENCIA.CONFIRMADA)]),
        trilha('p2', [{ competencia: 'Comunicação', descritor: 'Clareza', baseline: 2, nota_avaliacao: 2.5 }], { modo: 'piloto' }),
      ],
      participantes,
      0,
    );
    expect(r.cobertura.medidos).toBe(1);
    expect(r.pessoas.map((p) => p.colaboradorId)).toEqual(['p1']);
  });

  it('NÃO transforma descritor sem veredito em estável', () => {
    // Ausência de medição não é medição de estabilidade: contar assim inflaria
    // o "estável" com dado que ninguém classificou.
    const r = agregarEvolucao([trilha('p1', [d('Metas', 2, 2.1, null)])], participantes, 0);
    expect(r.porDescritor[0].semVeredito).toBe(1);
    expect(r.porDescritor[0].estaveis).toBe(0);
    expect(r.resumo.semVeredito).toBe(1);
    expect(r.resumo.estaveis).toBe(0);
    expect(r.pessoas[0].veredito).toBeNull();
  });

  it('chama de estável quem não teve maioria de comportamentos avançando', () => {
    const r = agregarEvolucao(
      [trilha('p1', [
        d('Metas', 2, 2.1, CONVERGENCIA.ESTAVEL),
        d('Plano', 2, 2.05, CONVERGENCIA.ESTAVEL),
        d('Risco', 2.5, 2, CONVERGENCIA.ESTAVEL),
      ])],
      participantes,
      0,
    );
    // Queda não vira veredito próprio: a régua não tem regressão, então quem
    // não avançou aparece como estável — e entra em "precisa de apoio", que é
    // a informação acionável.
    expect(r.pessoas[0].veredito).toBe(CONVERGENCIA.ESTAVEL);
    expect(r.proximasAcoes.precisamApoio.map((p) => p.colaboradorId)).toContain('p1');
  });

  it('exige maioria de confirmadas para carimbar a pessoa como confirmada', () => {
    const uma = agregarEvolucao(
      [trilha('p1', [
        d('Metas', 2, 3, CONVERGENCIA.CONFIRMADA),
        d('Plano', 2, 2.3, CONVERGENCIA.PARCIAL),
        d('Risco', 2, 2.3, CONVERGENCIA.PARCIAL),
      ])],
      participantes,
      0,
    );
    expect(uma.pessoas[0].veredito).toBe(CONVERGENCIA.PARCIAL);

    const maioria = agregarEvolucao(
      [trilha('p1', [
        d('Metas', 2, 3, CONVERGENCIA.CONFIRMADA),
        d('Plano', 2, 3, CONVERGENCIA.CONFIRMADA),
        d('Risco', 2, 2.3, CONVERGENCIA.PARCIAL),
      ])],
      participantes,
      0,
    );
    expect(maioria.pessoas[0].veredito).toBe(CONVERGENCIA.CONFIRMADA);
  });

  it('agrega por competência e por descritor com o n de PESSOAS, não de linhas', () => {
    const r = agregarEvolucao(
      [
        trilha('p1', [d('Metas', 2, 3, CONVERGENCIA.CONFIRMADA), d('Plano', 2, 2.5, CONVERGENCIA.PARCIAL)]),
        trilha('p2', [d('Metas', 1.5, 2.5, CONVERGENCIA.CONFIRMADA), d('Plano', 2, 2.2, CONVERGENCIA.PARCIAL)]),
      ],
      participantes,
      0,
    );
    const competencia = r.porCompetencia[0];
    // 4 linhas, 2 pessoas. "N ocorrências" nunca é "N pessoas".
    expect(competencia.n).toBe(2);
    expect(r.resumo.descritoresMedidos).toBe(4);

    const metas = r.porDescritor.find((x) => x.chave === 'Metas')!;
    expect(metas.n).toBe(2);
    expect(metas.mediaPre).toBe(1.75);
    expect(metas.mediaPos).toBe(2.75);
    expect(metas.delta).toBe(1);
  });

  it('NÃO funde comportamentos de MESMO NOME em competências diferentes', () => {
    // A régua padrão repete os mesmos comportamentos em várias competências.
    // Agrupar só pelo nome fundia as linhas: a média saía de uma mistura, e o
    // grupo herdava a competência da primeira linha — então todos os
    // comportamentos ficavam pendurados numa competência só e as outras
    // apareciam vazias na tela. Foi o defeito visto em produção.
    const linha = (comp: string, desc: string, pre: number, pos: number) => ({
      competencia: comp, descritor: desc, nota_pre: pre, nota_pos: pos,
      convergencia: CONVERGENCIA.PARCIAL, depois: null,
    });
    const r = agregarEvolucao(
      [
        { colaborador_id: 'p1', competencia_foco: 'Comunicação', evolution_generated_at: null,
          evolution_report: { descritores: [linha('Comunicação', 'Execução com método', 2, 2.4)] } },
        { colaborador_id: 'p2', competencia_foco: 'Controle', evolution_generated_at: null,
          evolution_report: { descritores: [linha('Controle', 'Execução com método', 1, 1.4)] } },
      ],
      participantes,
      0,
    );

    // Dois grupos com o MESMO rótulo, um por competência.
    const grupos = r.porDescritor.filter((x) => x.chave === 'Execução com método');
    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.competencia).sort()).toEqual(['Comunicação', 'Controle']);
    // E cada média é a da sua competência, não a da mistura (que daria 1,5).
    expect(grupos.find((g) => g.competencia === 'Comunicação')!.mediaPre).toBe(2);
    expect(grupos.find((g) => g.competencia === 'Controle')!.mediaPre).toBe(1);

    // Toda competência da lista tem os seus comportamentos: é isso que a tela
    // usa para decidir quais linhas abrem.
    for (const competencia of r.porCompetencia) {
      expect(r.porDescritor.some((d) => d.competencia === competencia.chave)).toBe(true);
    }
  });

  it('converte a média em nível pela régua oficial, com o corte de 3,5', () => {
    const r = agregarEvolucao([trilha('p1', [d('Metas', 1.9, 3.6, CONVERGENCIA.CONFIRMADA)])], participantes, 0);
    // 1,9 é N1 (só conta quando consolida) e 3,6 é N4 (abre em 3,5, não em 4).
    expect(r.porDescritor[0].nivelPre).toBe(1);
    expect(r.porDescritor[0].nivelPos).toBe(4);
  });

  it('mantém no painel quem concluiu mas saiu da lista de participantes', () => {
    // Pessoa desligada, ou fora do recorte de turma: o número não pode sumir,
    // senão a cobertura mente para menos e o histórico perde gente.
    const r = agregarEvolucao([trilha('desconhecido', [d('Metas', 2, 3, CONVERGENCIA.CONFIRMADA)])], participantes, 0);
    expect(r.cobertura.medidos).toBe(1);
    expect(r.pessoas[0].nome).toBe('Participante');
  });

  it('sempre recomenda algo para o próximo ciclo, mesmo com todo mundo indo bem', () => {
    // Um filtro por corte fixo devolveria lista vazia justamente na turma que
    // foi bem, e a seção de ações ficaria muda.
    const r = agregarEvolucao(
      [trilha('p1', [
        d('Metas', 2, 3.2, CONVERGENCIA.CONFIRMADA),
        d('Plano', 2, 3.0, CONVERGENCIA.CONFIRMADA),
        d('Risco', 2, 2.9, CONVERGENCIA.CONFIRMADA),
        d('Rede', 2, 2.8, CONVERGENCIA.CONFIRMADA),
      ])],
      participantes,
      0,
    );
    expect(r.proximasAcoes.proximoCiclo).toHaveLength(3);
    // O de menor avanço vem primeiro na recomendação.
    expect(r.proximasAcoes.proximoCiclo[0].chave).toBe('Rede');
  });

  it('classifica a sustentação pela evidência presente, sem inventar nível inalcançável', () => {
    const comEvidencia = agregarEvolucao(
      [trilha('p1', [
        d('Metas', 2, 3, CONVERGENCIA.CONFIRMADA, 'Passei a escrever o critério antes de decidir.'),
        d('Plano', 2, 3, CONVERGENCIA.CONFIRMADA, 'Toda combinação sai com responsável e prazo.'),
      ])],
      participantes,
      0,
    );
    const semEvidencia = agregarEvolucao(
      [trilha('p2', [d('Metas', 2, 3, CONVERGENCIA.CONFIRMADA), d('Plano', 2, 3, CONVERGENCIA.CONFIRMADA)])],
      participantes,
      0,
    );
    expect(comEvidencia.pessoas[0].sustentacao).toBe('media');
    expect(semEvidencia.pessoas[0].sustentacao).toBe('baixa');
    // 'alta' exigiria uma terceira fonte, que hoje não existe em nenhum tenant.
    expect(comEvidencia.pessoas[0].sustentacao).not.toBe('alta');
  });

  it('devolve painel vazio COM o denominador quando ninguém concluiu', () => {
    const r = agregarEvolucao([], participantes, 3);
    expect(r.cobertura).toEqual({ participantes: 4, emJornada: 3, medidos: 0, percentual: 0 });
    expect(r.pessoas).toHaveLength(0);
    expect(r.indisponivel).toBe(false);
  });

  it('ignora relatório sem descritores em vez de contar a pessoa como medida', () => {
    const r = agregarEvolucao(
      [trilha('p1', []), trilha('p2', [d('Metas', 2, 3, CONVERGENCIA.CONFIRMADA)])],
      participantes,
      0,
    );
    expect(r.cobertura.medidos).toBe(1);
  });
});
