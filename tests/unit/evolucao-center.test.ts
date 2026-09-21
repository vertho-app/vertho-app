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

  it('mantém o veredito como sinal interno e prioriza pelo avanço exibido', () => {
    const r = agregarEvolucao(
      [trilha('p1', [
        d('Metas', 2, 2.1, CONVERGENCIA.ESTAVEL),
        d('Plano', 2, 2.05, CONVERGENCIA.ESTAVEL),
        d('Risco', 2.5, 2, CONVERGENCIA.ESTAVEL),
      ])],
      participantes,
      0,
    );
    // A leitura processual continua disponível internamente, mas a prioridade
    // externa considera a comparação numérica que o relatório exibe. As médias
    // 2,17 → 2,22 viram 2,2 → 2,2 e, portanto, não afirmam avanço.
    expect(r.pessoas[0].veredito).toBe(CONVERGENCIA.ESTAVEL);
    expect(r.pessoas[0]).toMatchObject({ mediaPre: 2.17, mediaPos: 2.22, delta: 0 });
    expect(r.porCompetencia[0]).toMatchObject({ mediaPre: 2.17, mediaPos: 2.22, delta: 0 });
    expect(r.proximasAcoes.precisamApoio.map((p) => p.colaboradorId)).toContain('p1');
  });

  it('usa a nota do cenário final e ignora a nota processual na evolução externa', () => {
    const comAvanco = {
      ...trilha('p1', [d('Metas', 2, 3.6, CONVERGENCIA.CONFIRMADA, 'evidência forte')]),
      notasCenarioFinal: { metas: 2.4 },
    };
    const semAvanco = {
      ...trilha('p2', [d('Metas', 2, 3.6, CONVERGENCIA.CONFIRMADA, 'evidência forte')]),
      notasCenarioFinal: { metas: 2 },
    };

    const r = agregarEvolucao([comAvanco, semAvanco], participantes, 0);
    expect(r.pessoas.find((p) => p.colaboradorId === 'p1')).toMatchObject({ mediaPre: 2, mediaPos: 2.4, delta: 0.4 });
    expect(r.pessoas.find((p) => p.colaboradorId === 'p2')).toMatchObject({ mediaPre: 2, mediaPos: 2, delta: 0 });
    expect(r.proximasAcoes.precisamApoio.map((p) => p.colaboradorId)).toEqual(['p2']);
  });

  it('separa a leitura nominal por competência e mantém a cobertura por pessoa', () => {
    const linha = (competencia: string, descritor: string, pre: number, pos: number) => ({
      competencia, descritor, nota_pre: pre, nota_pos: pos,
      convergencia: CONVERGENCIA.PARCIAL, depois: 'evidência',
    });
    const r = agregarEvolucao(
      [trilha('p1', [
        linha('Planejamento', 'Metas', 1.5, 2.5),
        linha('Colaboração', 'Trabalho em rede', 2, 2.4),
      ])],
      participantes,
      0,
    );

    expect(r.cobertura.medidos).toBe(1);
    expect(r.pessoas).toHaveLength(2);
    expect(r.pessoas.map((p) => p.competencia).sort()).toEqual(['Colaboração', 'Planejamento']);
    expect(r.pessoas.find((p) => p.competencia === 'Planejamento')).toMatchObject({ mediaPre: 1.5, mediaPos: 2.5, delta: 1 });
    expect(r.pessoas.find((p) => p.competencia === 'Colaboração')).toMatchObject({ mediaPre: 2, mediaPos: 2.4, delta: 0.4 });
  });

  it('mantém a nota inicial quando o fechamento vem menor', () => {
    const r = agregarEvolucao(
      [trilha('p1', [d('Metas', 2, 1.6, CONVERGENCIA.ESTAVEL)])],
      participantes,
      0,
    );
    expect(r.pessoas[0]).toMatchObject({ mediaPre: 2, mediaPos: 2, delta: 0 });
    expect(r.porCompetencia[0]).toMatchObject({ mediaPre: 2, mediaPos: 2, delta: 0 });
    expect(r.porDescritor[0]).toMatchObject({ mediaPre: 2, mediaPos: 2, delta: 0 });
    expect(r.porCompetencia[0].nivelPos).toBe(r.porCompetencia[0].nivelPre);
  });

  it('faz o avanço bater com a diferença exata entre as médias exibidas', () => {
    const r = agregarEvolucao(
      [trilha('p1', [
        d('Metas', 1, 0.5, CONVERGENCIA.ESTAVEL),
        d('Plano', 2, 2.4, CONVERGENCIA.PARCIAL),
      ])],
      participantes,
      0,
    );

    expect(r.pessoas[0]).toMatchObject({ mediaPre: 1.5, mediaPos: 1.7, delta: 0.2 });
    expect(r.porCompetencia[0]).toMatchObject({ mediaPre: 1.5, mediaPos: 1.7, delta: 0.2 });
    expect(r.porDescritor.find((item) => item.chave === 'Metas')).toMatchObject({ mediaPre: 1, mediaPos: 1, delta: 0 });
  });

  it('trata como zero uma diferença interna que desaparece com uma casa decimal', () => {
    const r = agregarEvolucao(
      [trilha('p1', [
        d('Metas', 2.3, 2.34, CONVERGENCIA.PARCIAL),
        d('Plano', 2.4, 2.44, CONVERGENCIA.PARCIAL),
      ])],
      participantes,
      0,
    );

    // As médias internas continuam com duas casas para preservar o dado. No
    // relatório, ambas são 2,4; logo o avanço é 0,0 e a pessoa entra na pauta.
    expect(r.pessoas[0]).toMatchObject({ mediaPre: 2.35, mediaPos: 2.39, delta: 0 });
    expect(r.porCompetencia[0]).toMatchObject({ mediaPre: 2.35, mediaPos: 2.39, delta: 0 });
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

  it('produz agregados independentes por cargo', () => {
    const r = agregarEvolucao(
      [
        trilha('p1', [d('Metas', 1, 3, CONVERGENCIA.CONFIRMADA)]),
        trilha('p2', [d('Metas', 3, 3.2, CONVERGENCIA.PARCIAL)]),
        trilha('p3', [d('Metas', 2, 2.5, CONVERGENCIA.PARCIAL)]),
      ],
      participantes,
      0,
    );

    expect(r.porCargo.map((recorte) => recorte.cargo)).toEqual(['Coordenadora', 'Diretor']);
    const coordenadoras = r.porCargo.find((recorte) => recorte.cargo === 'Coordenadora')!;
    const diretores = r.porCargo.find((recorte) => recorte.cargo === 'Diretor')!;
    expect(coordenadoras.pessoasMedidas).toBe(2);
    expect(coordenadoras.porCompetencia[0]).toMatchObject({ n: 2, mediaPre: 1.5, mediaPos: 2.75, delta: 1.3 });
    expect(diretores.pessoasMedidas).toBe(1);
    expect(diretores.porCompetencia[0]).toMatchObject({ n: 1, mediaPre: 3, mediaPos: 3.2, delta: 0.2 });
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

  it('remove o código interno do descritor na projeção de leitura', () => {
    const r = agregarEvolucao(
      [trilha('p1', [d('COO03_D4 — Sustentabilidade pessoal', 1.5, 2, CONVERGENCIA.PARCIAL)])],
      participantes,
      0,
    );
    expect(r.porDescritor[0].chave).toBe('Sustentabilidade pessoal');
    expect(r.pessoas[0].descritores[0].descritor).toBe('Sustentabilidade pessoal');
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

  it('recomenda COMPETÊNCIAS para o próximo ciclo, não descritores', () => {
    const linha = (competencia: string, descritor: string, pos: number) => ({
      competencia, descritor, nota_pre: 2, nota_pos: pos,
      convergencia: CONVERGENCIA.CONFIRMADA, depois: null,
    });
    const r = agregarEvolucao(
      [trilha('p1', [
        linha('Planejamento', 'Metas', 3.2),
        linha('Execução', 'Plano', 3.0),
        linha('Riscos', 'Análise de riscos', 2.9),
        linha('Colaboração', 'Trabalho em rede', 2.8),
      ])],
      participantes,
      0,
    );
    expect(r.proximasAcoes.proximoCiclo).toHaveLength(3);
    expect(r.proximasAcoes.proximoCiclo[0].chave).toBe('Colaboração');
    expect(r.proximasAcoes.proximoCiclo.map((x) => x.chave)).not.toContain('Trabalho em rede');
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
