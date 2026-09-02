import { describe, it, expect } from 'vitest';
import {
  COORDENACAO,
  DOCENCIA,
  REGUA_ESCOLAR,
  competenciasEscolaresPorCargo,
  construirEvolucaoEscolar,
  construirFechamentoEscolar,
  descritoresEscolares,
} from '@/lib/demo/escolar-evolucao-fixture';
import { DESCRITORES_POR_TRILHA } from '@/lib/demo/evolucao-nucleo';
import { CONVERGENCIA } from '@/lib/season-engine/convergencia';

const pessoaDocente = { email: 'ana.luiza.demo@vertho.ai', nome_completo: 'Ana Luiza Prado', cargo: DOCENCIA };
const pessoaCoord = { email: 'renata.demo@vertho.ai', nome_completo: 'Renata Coelho', cargo: COORDENACAO };

describe('Evolução da Rede de Escolas', () => {
  it('tira os comportamentos da RÉGUA REAL do segmento, não de uma lista digitada', () => {
    // O casamento entre o relatório e o mapeamento é por NOME. Uma lista
    // paralela aqui produziria um relatório que fala de um comportamento que a
    // pessoa não tem no diagnóstico, e nada acusaria.
    const competencias = competenciasEscolaresPorCargo(DOCENCIA);
    expect(competencias.length).toBeGreaterThanOrEqual(4);
    for (const competencia of competencias) {
      const comportamentos = descritoresEscolares(DOCENCIA, competencia);
      expect(comportamentos.length, `sem comportamentos: ${competencia}`).toBeGreaterThanOrEqual(DESCRITORES_POR_TRILHA);
    }
  });

  it('tem fala escrita para TODA competência que a vitrine pode usar', () => {
    // Texto faltando não quebra nada: a evidência sai `null` e o relatório
    // perde exatamente a parte que o coordenador lê em voz alta. Silencioso.
    for (const cargo of [DOCENCIA, COORDENACAO]) {
      for (const competencia of competenciasEscolaresPorCargo(cargo)) {
        const comportamento = descritoresEscolares(cargo, competencia)[0];
        expect(REGUA_ESCOLAR.textos.antes(cargo, competencia, comportamento), `antes: ${cargo}/${competencia}`).toBeTruthy();
        expect(REGUA_ESCOLAR.textos.depois(cargo, competencia, comportamento), `depois: ${cargo}/${competencia}`).toBeTruthy();
        expect(REGUA_ESCOLAR.textos.limiteEstavel(cargo, competencia, comportamento), `limite: ${cargo}/${competencia}`).toBeTruthy();
      }
    }
  });

  it('dá à coordenação a fala da coordenação, e não a do professor', () => {
    // "Gestão da Aprendizagem" existe nos DOIS cargos. Resolver a fala só pelo
    // nome da competência entregaria ao coordenador o relato de quem dá aula.
    const competencia = 'Gestão da Aprendizagem';
    expect(competenciasEscolaresPorCargo(DOCENCIA)).toContain(competencia);
    expect(competenciasEscolaresPorCargo(COORDENACAO)).toContain(competencia);

    const doProfessor = REGUA_ESCOLAR.textos.depois(DOCENCIA, competencia, 'x');
    const daCoordenacao = REGUA_ESCOLAR.textos.depois(COORDENACAO, competencia, 'x');
    expect(doProfessor).not.toBe(daCoordenacao);
    expect(daCoordenacao).toMatch(/observar aula|devolutiva/i);
  });

  it('fala como escola, sem vocabulário do elenco comercial', () => {
    // O roster escolar existe porque uma diretora dizendo "risco comercial"
    // entrega a demo errada. A evidência textual é onde isso apareceria.
    const proibidos = /stakeholder|cliente|margem|CRM|deal|vendas|comercial/i;
    for (const cargo of [DOCENCIA, COORDENACAO]) {
      for (const competencia of competenciasEscolaresPorCargo(cargo)) {
        const c = descritoresEscolares(cargo, competencia)[0];
        for (const texto of [
          REGUA_ESCOLAR.textos.antes(cargo, competencia, c),
          REGUA_ESCOLAR.textos.depois(cargo, competencia, c),
          REGUA_ESCOLAR.textos.limiteEstavel(cargo, competencia, c),
        ]) {
          expect(texto, `${cargo}/${competencia}`).not.toMatch(proibidos);
        }
      }
    }
  });

  it('monta a evolução com a forma que o motor grava', () => {
    const evolucao = construirEvolucaoEscolar(pessoaDocente, 'confirmada');
    expect(evolucao.descritores).toHaveLength(DESCRITORES_POR_TRILHA);
    for (const d of evolucao.descritores) {
      expect(d.nota_pre).toBeGreaterThanOrEqual(1);
      expect(d.nota_pos).toBeLessThanOrEqual(4);
      expect(d.antes).toBeTruthy();
      expect(d.depois).toBeTruthy();
      expect(Object.values(CONVERGENCIA)).toContain(d.convergencia);
    }
    const media = evolucao.descritores.reduce((t, d) => t + d.nota_pos, 0) / evolucao.descritores.length;
    expect(evolucao.evolution_report.nota_media_pos).toBeCloseTo(media, 2);
    expect(evolucao.evolution_report.demo_fixture).toBe(true);
  });

  it('fecha nas semanas da JORNADA (6 e 7), não nas do DUO', () => {
    // A rede roda `programaModo: 'jornada'`, de 7 semanas. Gravar o fechamento
    // em 13/14 poria a avaliação em semanas que esta trilha não tem, e o
    // relatório existiria sobre um progresso que ninguém encontra.
    const evolucao = construirEvolucaoEscolar(pessoaCoord, 'parcial');
    const [qualitativa, cenario] = construirFechamentoEscolar(evolucao, new Date().toISOString());
    expect(qualitativa.semana).toBe(6);
    expect(cenario.semana).toBe(7);
    expect(cenario.feedback?.avaliacao_por_descritor).toHaveLength(evolucao.descritores.length);
  });
});
