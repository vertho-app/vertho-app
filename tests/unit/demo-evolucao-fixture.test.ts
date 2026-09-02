import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ACME_DEMO_DESCRITORES,
  descritoresDaVitrineAcme,
  ACME_DEMO_EVOLUTION_MIX,
  ACME_DEMO_EVOLUTION_TARGETS,
  ACME_DEMO_MINIMO_POR_COMPETENCIA,
  competenciaFocoDaDemo,
  construirEvolucaoAcmeDemo,
  construirFechamentoAcmeDemo,
  distribuicaoPorCargo,
  notaDePartida,
} from '@/lib/demo/acme-evolucao-fixture';
import {
  ACME_DEMO_BEHIND_KEYS,
  ACME_DEMO_CONCLUDED_KEYS,
  ACME_DEMO_FUNNEL_TARGETS,
  ACME_DEMO_JOURNEY_KEYS,
  ACME_DEMO_JOURNEY_SHOWCASE_KEY,
  ACME_DEMO_REPORT_DIRECTORY,
} from '@/lib/demo/acme-rh-report-fixture';
import { CONVERGENCIA } from '@/lib/season-engine/convergencia';
import { PERSONAS } from '@/lib/demo/reset-acme-demo';

const pessoaPorChave = new Map<string, any>([
  ...PERSONAS.map((p) => [p.key, p] as const),
  ...ACME_DEMO_REPORT_DIRECTORY.map((p) => [p.key, p] as const),
]);

function distribuicao() {
  return distribuicaoPorCargo(
    ACME_DEMO_CONCLUDED_KEYS.map((chave) => ({
      chave,
      cargo: pessoaPorChave.get(chave)?.cargo || '',
    })),
  );
}

function evolucaoDeTodas() {
  return ACME_DEMO_CONCLUDED_KEYS.map((key, index) => {
    const pessoa = pessoaPorChave.get(key);
    expect(pessoa, `pessoa ausente para a chave ${key}`).toBeTruthy();
    return construirEvolucaoAcmeDemo(pessoa, ACME_DEMO_EVOLUTION_MIX[index]);
  });
}

/**
 * A vitrine da ACME é o que o comercial mostra. Um número incoerente aqui não
 * quebra nada em produção — quebra a conversa com o cliente, que é onde não há
 * como consertar depois.
 */
describe('Evolução da ACME Demo', () => {
  it('conclui 16 jornadas sem tocar na persona navegável nem nas atrasadas', () => {
    expect(ACME_DEMO_CONCLUDED_KEYS).toHaveLength(ACME_DEMO_FUNNEL_TARGETS.concluded);
    expect(ACME_DEMO_CONCLUDED_KEYS).not.toContain(ACME_DEMO_JOURNEY_SHOWCASE_KEY);
    for (const key of ACME_DEMO_BEHIND_KEYS) {
      expect(ACME_DEMO_CONCLUDED_KEYS).not.toContain(key);
    }
    // Concluída é subconjunto de quem está em jornada: um funil em que alguém
    // conclui sem ter entrado é a contradição que o cliente enxerga primeiro.
    expect(ACME_DEMO_CONCLUDED_KEYS.every((key) => ACME_DEMO_JOURNEY_KEYS.includes(key))).toBe(true);
    expect(ACME_DEMO_EVOLUTION_MIX).toHaveLength(ACME_DEMO_FUNNEL_TARGETS.concluded);
  });

  it('espalha um cargo numeroso por VÁRIAS competências, não só a primeira', () => {
    // ⚠️ Este caso existe porque o teste do mínimo abaixo passava VERDE com a
    // distribuição desligada: trocar quem está atrasado já garantia o piso de
    // pessoas, então o mínimo sozinho não prova que a distribuição funciona.
    // Aqui a função é exercitada direto.
    const cargo = 'Representante Comercial';
    const nove = Array.from({ length: 9 }, (_, i) => competenciaFocoDaDemo(cargo, i, 9));
    expect(new Set(nove).size).toBe(3);          // 9 pessoas ÷ piso de 3
    for (const competencia of new Set(nove)) {
      expect(nove.filter((c) => c === competencia)).toHaveLength(3);
    }

    // Grupos pequenos não se fragmentam: 2 pessoas ficam juntas.
    expect(new Set([0, 1].map((i) => competenciaFocoDaDemo(cargo, i, 2))).size).toBe(1);
    // E o teto é o número de competências do cargo, não o de pessoas.
    const cem = Array.from({ length: 100 }, (_, i) => competenciaFocoDaDemo(cargo, i, 100));
    expect(new Set(cem).size).toBe(5);
  });

  it('distribui as pessoas entre competências, sem nenhuma com uma pessoa só', () => {
    // Com todo mundo do mesmo cargo focando a primeira competência, o painel
    // exibia duas linhas de n=1 ao lado de uma de n=9 — médias de uma pessoa
    // com o mesmo peso visual de médias de nove. É leitura que um painel de
    // evolução não pode induzir, ainda mais numa demonstração comercial.
    const porCompetencia = new Map<string, number>();
    for (const [indice, chave] of ACME_DEMO_CONCLUDED_KEYS.entries()) {
      const pessoa = pessoaPorChave.get(chave);
      const evolucao = construirEvolucaoAcmeDemo(
        pessoa,
        ACME_DEMO_EVOLUTION_MIX[indice],
        distribuicao().get(chave),
      );
      porCompetencia.set(evolucao.competencia, (porCompetencia.get(evolucao.competencia) || 0) + 1);
    }

    expect(porCompetencia.size).toBeGreaterThan(1);
    for (const [competencia, pessoas] of porCompetencia) {
      expect(pessoas, `competência com poucas pessoas: ${competencia}`)
        .toBeGreaterThanOrEqual(ACME_DEMO_MINIMO_POR_COMPETENCIA);
    }
    // A soma continua sendo todo mundo: distribuir não pode perder ninguém.
    expect([...porCompetencia.values()].reduce((a, b) => a + b, 0))
      .toBe(ACME_DEMO_CONCLUDED_KEYS.length);
  });

  it('produz o mix declarado APLICANDO a régua de produção, não o rótulo escolhido', () => {
    // O veredito de cada pessoa é a convergência da MAIORIA dos descritores
    // dela. Se alguém afrouxar os ganhos do fixture ou recalibrar os cortes da
    // régua, a contagem sai do lugar e este teste acusa.
    const vereditos = evolucaoDeTodas().map((e) => {
      const resumo = e.evolution_report.resumo;
      const maior = Math.max(resumo.confirmadas, resumo.parciais, resumo.estagnacoes);
      if (resumo.confirmadas === maior) return 'confirmada';
      if (resumo.parciais === maior) return 'parcial';
      return 'estavel';
    });

    expect(vereditos.filter((v) => v === 'confirmada')).toHaveLength(ACME_DEMO_EVOLUTION_TARGETS.confirmadas);
    expect(vereditos.filter((v) => v === 'parcial')).toHaveLength(ACME_DEMO_EVOLUTION_TARGETS.parciais);
    expect(vereditos.filter((v) => v === 'estavel')).toHaveLength(ACME_DEMO_EVOLUTION_TARGETS.estaveis);
  });

  it('não produz veredito fora dos três da régua', () => {
    // A régua não tem regressão (ninguém desaprende uma competência), e a demo
    // não pode inventar um quarto rótulo por conta própria.
    const validos = Object.values(CONVERGENCIA) as string[];
    for (const evolucao of evolucaoDeTodas()) {
      for (const d of evolucao.descritores) {
        expect(validos).toContain(d.convergencia);
      }
    }
  });

  /**
   * ⚠️ A versão anterior deste teste comparava `d.nota_pre` com
   * `notaDePartida(...)` e passava verde mesmo com a função MUTADA — os dois
   * lados da igualdade saíam da mesma função, então a asserção era circular e
   * não provava coerência nenhuma. As duas asserções abaixo a substituem: uma
   * fixa os VALORES, a outra prova que o reset semeia o baseline pela mesma
   * função. Só as duas juntas sustentam a afirmação.
   */
  it('congela a nota de partida em valores conhecidos', () => {
    expect(notaDePartida('lucas.demo@vertho.ai', 'Leitura do contexto e identificação do problema')).toBe(1.8);
    expect(notaDePartida('lucas.demo@vertho.ai', 'Critério de priorização e tomada de decisão')).toBe(2);
    expect(notaDePartida('lucas.demo@vertho.ai', 'Execução com método e acompanhamento')).toBe(1.6);
    expect(notaDePartida('lucas.demo@vertho.ai', 'Comunicação com stakeholders')).toBe(1.9);
  });

  it('reflete a nota de partida no relatório sem recalcular por outro caminho', () => {
    const evolucao = construirEvolucaoAcmeDemo(
      { email: 'lucas.demo@vertho.ai', nome_completo: 'Lucas Almeida', cargo: 'Representante Comercial' },
      'confirmada',
    );
    const porDescritor = new Map(evolucao.descritores.map((d) => [d.descritor, d.nota_pre]));
    expect(porDescritor.get('Leitura do contexto e identificação do problema')).toBe(1.8);
    expect(porDescritor.get('Execução com método e acompanhamento')).toBe(1.6);
  });

  it('o reset semeia o baseline pela MESMA função que o relatório usa', () => {
    // O elo real entre as duas telas vive no reset, não aqui: é ele que grava
    // `descriptor_assessments`. Se alguém trocar a nota do baseline por uma
    // expressão própria, as telas divergem e nenhum teste de unidade do fixture
    // veria — porque o fixture continuaria coerente consigo mesmo.
    const reset = readFileSync('lib/demo/reset-acme-demo.ts', 'utf8');
    const trecho = reset.slice(
      reset.indexOf('const assessmentsDaJornada'),
      reset.indexOf('const todosAssessments'),
    );
    expect(trecho).toContain('notaDePartida(pessoa.email, descritor)');
    // O reset semeia a MESMA lista que a vitrine exibe. A checagem é pelo nome
    // da função porque foi o corte por índice (`slice(0, CONSTANTE)`) que
    // silenciosamente virou lista vazia quando a constante mudou de tipo.
    expect(trecho).toContain('descritoresDaVitrineAcme(ACME_DEMO_DESCRITORES)');
  });

  it('grava a média que o painel do gestor usa para calcular o delta', () => {
    // O painel faz `delta = nota_media_pos - média(descritores.nota_pre)`. Uma
    // `nota_media_pos` que não seja a média real dos `nota_pos` faz o delta da
    // tela discordar do delta do relatório, sem erro nenhum.
    for (const evolucao of evolucaoDeTodas()) {
      const media = evolucao.descritores.reduce((t, d) => t + d.nota_pos, 0) / evolucao.descritores.length;
      expect(evolucao.evolution_report.nota_media_pos).toBeCloseTo(media, 2);
    }
  });

  it('mantém as notas dentro da escala 1 a 4 do produto', () => {
    for (const evolucao of evolucaoDeTodas()) {
      for (const d of evolucao.descritores) {
        expect(d.nota_pre).toBeGreaterThanOrEqual(1);
        expect(d.nota_pos).toBeLessThanOrEqual(4);
        expect(d.descritor).toSatisfy((valor: string) => ACME_DEMO_DESCRITORES.includes(valor as any));
      }
      // A vitrine cobre a competência inteira: mostrar 4 de 6 comportamentos
      // deixava o leitor sem saber se os outros não evoluíram ou não foram
      // medidos.
      expect(evolucao.descritores).toHaveLength(descritoresDaVitrineAcme(ACME_DEMO_DESCRITORES).length);
    }
  });

  it('é determinístico entre execuções do reset', () => {
    const pessoa = pessoaPorChave.get(ACME_DEMO_CONCLUDED_KEYS[0]);
    const a = construirEvolucaoAcmeDemo(pessoa, 'confirmada');
    const b = construirEvolucaoAcmeDemo(pessoa, 'confirmada');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('monta o fechamento na forma que o motor grava nas semanas 13 e 14', () => {
    const evolucao = construirEvolucaoAcmeDemo(pessoaPorChave.get(ACME_DEMO_CONCLUDED_KEYS[0]), 'confirmada');
    const [semana13, semana14] = construirFechamentoAcmeDemo(evolucao, new Date().toISOString());

    expect(semana13.semana).toBe(13);
    expect(semana13.status).toBe('concluido');
    expect(semana13.reflexao?.evolucao_percebida).toHaveLength(evolucao.descritores.length);

    // `gerarEvolutionReportCore` recusa gerar sem `avaliacao_por_descritor` na
    // semana do cenário. O fixture tem que satisfazer a mesma pré-condição,
    // senão a demo fica com um relatório que o motor não teria produzido.
    expect(semana14.semana).toBe(14);
    expect(semana14.status).toBe('concluido');
    expect(semana14.feedback?.avaliacao_por_descritor).toHaveLength(evolucao.descritores.length);
    expect(semana14.feedback?.avaliacao_por_descritor[0]).toHaveProperty('nota_pre');
    expect(semana14.feedback?.avaliacao_por_descritor[0]).toHaveProperty('nota_pos');
  });

  it('marca a origem como fixture para nunca ser confundido com dado real', () => {
    for (const evolucao of evolucaoDeTodas()) {
      expect(evolucao.evolution_report.demo_fixture).toBe(true);
    }
  });
});
