import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ACME_DEMO_DESCRITORES,
  ACME_DEMO_DESCRITORES_POR_TRILHA,
  ACME_DEMO_EVOLUTION_MIX,
  ACME_DEMO_EVOLUTION_TARGETS,
  construirEvolucaoAcmeDemo,
  construirFechamentoAcmeDemo,
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

  it('produz o mix declarado APLICANDO a régua de produção, não o rótulo escolhido', () => {
    // O veredito de cada pessoa é a convergência da MAIORIA dos descritores
    // dela. Se alguém afrouxar os ganhos do fixture ou recalibrar os cortes da
    // régua, a contagem sai do lugar e este teste acusa.
    const vereditos = evolucaoDeTodas().map((e) => {
      const resumo = e.evolution_report.resumo;
      const maior = Math.max(resumo.confirmadas, resumo.parciais, resumo.estagnacoes, resumo.regressoes);
      if (resumo.confirmadas === maior) return 'confirmada';
      if (resumo.parciais === maior) return 'parcial';
      if (resumo.estagnacoes === maior) return 'estavel';
      return 'atencao';
    });

    expect(vereditos.filter((v) => v === 'confirmada')).toHaveLength(ACME_DEMO_EVOLUTION_TARGETS.confirmadas);
    expect(vereditos.filter((v) => v === 'parcial')).toHaveLength(ACME_DEMO_EVOLUTION_TARGETS.parciais);
    expect(vereditos.filter((v) => v === 'estavel')).toHaveLength(ACME_DEMO_EVOLUTION_TARGETS.estaveis);
    expect(vereditos.filter((v) => v === 'atencao')).toHaveLength(0);
  });

  it('não coloca nenhuma pessoa da demo em regressão', () => {
    // Decisão do dono (01/09/2026): a demo mostra estabilidade, não regressão.
    for (const evolucao of evolucaoDeTodas()) {
      expect(evolucao.evolution_report.resumo.regressoes).toBe(0);
      expect(evolucao.descritores.every((d) => d.convergencia !== CONVERGENCIA.ATENCAO)).toBe(true);
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
    expect(trecho).toContain('ACME_DEMO_DESCRITORES.slice(0, ACME_DEMO_DESCRITORES_POR_TRILHA)');
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
      expect(evolucao.descritores).toHaveLength(ACME_DEMO_DESCRITORES_POR_TRILHA);
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
