import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCO_EVIDENCIA_E_RELATO } from '@/lib/season-engine/kit/regra-evidencia';
import { promptSocratic } from '@/lib/season-engine/prompts/socratic';

/**
 * **A evidência é sempre o RELATO — falado ou digitado. Nunca um arquivo.**
 *
 * Decisão de produto, confirmada no código em 27/08/2026: a tela da semana não
 * tem input de arquivo, só `textarea` e microfone. A pessoa pode precisar
 * produzir ou enviar algo no trabalho dela; o que nunca acontece é isso chegar
 * ao app.
 *
 * Os prompts de geração não sabiam disso e escreviam critérios como *"o
 * documento existe fisicamente (papel ou arquivo)"* — verificação que não existe
 * em lugar nenhum do produto. Medido antes da correção: 19 de 308 tarefas.
 */

const RAIZ = process.cwd();
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf-8');

describe('a regra é FONTE ÚNICA dos dois geradores de tarefa', () => {
  const PAR = ler('lib/season-engine/kit/desafio-par.ts');
  const KIT = ler('lib/season-engine/kit/brief.ts');

  it('o gerador do PAR declara a regra', () => {
    expect(PAR).toContain('${BLOCO_EVIDENCIA_E_RELATO}');
  });

  it('o gerador do KIT por descritor declara a MESMA regra', () => {
    // Duas cópias divergiriam no primeiro ajuste de uma delas — foi o que
    // aconteceu com todas as réguas desta camada.
    expect(KIT).toContain('${BLOCO_EVIDENCIA_E_RELATO}');
  });

  it('a regra proíbe explicitamente o que não é verificável', () => {
    for (const proibido of ['anexar', 'print', 'captura de tela']) {
      expect(BLOCO_EVIDENCIA_E_RELATO.toLowerCase()).toContain(proibido);
    }
  });

  it('🔑 a regra NÃO proíbe a tarefa pedir que a pessoa produza algo', () => {
    // O erro fácil seria banir artefato: produzir um documento na escola é a
    // AÇÃO, e é legítima — 78 das 308 tarefas citam artefato e estão certas.
    // O que não pode é o CRITÉRIO depender de alguém ver esse material.
    expect(BLOCO_EVIDENCIA_E_RELATO).toMatch(/PODE envolver produzir, preencher ou compartilhar/i);
  });

  it('os dois pedem o critério como "o que consegue CONTAR"', () => {
    expect(PAR).toContain('o que a pessoa vai conseguir CONTAR');
    expect(KIT).toContain('o que a pessoa vai conseguir CONTAR');
  });
});

describe('o critério chega a quem COBRA a evidência', () => {
  const base = {
    nomeColab: 'Marina', cargo: 'Coordenadora', perfilDominante: 'S',
    competencia: 'Gestão de Pessoas', descritor: 'Sustentação do combinado',
    desafio: 'Retome um combinado', historico: [], turnIA: 2,
  };
  const CRITERIO = 'A pessoa consegue nomear quem estava envolvido e o que mudou na semana seguinte';

  it('🔴 o critério entra no prompt — antes ele era escrito, exibido, e nunca chegava aqui', () => {
    const { system } = promptSocratic({
      ...base,
      desafios: [{ competencia: 'Gestão de Pessoas', desafio_texto: 'Retome um combinado', criterio_de_execucao: CRITERIO }],
    });
    expect(system).toContain(CRITERIO);
  });

  it('vem marcado como uso da IA, com a proibição de ler em voz alta', () => {
    const { system } = promptSocratic({
      ...base,
      desafios: [{ competencia: 'Gestão de Pessoas', desafio_texto: 'Retome um combinado', criterio_de_execucao: CRITERIO }],
    });
    expect(system).toMatch(/não repita como cobrança/i);
    // `\s+` porque o prompt quebra linha no meio da frase — asserção que
    // depende de ONDE a linha quebra falha na primeira reformatação inocente.
    expect(system).toMatch(/NUNCA leia a régua em voz\s+alta/i);
  });

  it('o prompt diz que a pessoa não envia arquivo — é pelo relato que se distingue', () => {
    const { system } = promptSocratic({
      ...base,
      desafios: [{ competencia: 'Gestão de Pessoas', desafio_texto: 'Retome um combinado', criterio_de_execucao: CRITERIO }],
    });
    expect(system).toMatch(/NÃO envia arquivo/i);
  });

  it('sem critério, o bloco inteiro some — nada de cabeçalho vazio', () => {
    const { system } = promptSocratic({
      ...base,
      desafios: [{ competencia: 'Gestão de Pessoas', desafio_texto: 'Retome um combinado' }],
    });
    expect(system).not.toContain('O QUE CONTA COMO FEITO');
  });

  it('🔑 a rota entrega o critério ao prompt — a fonte única já o carrega', () => {
    // `resolverDesafiosDaSemana` devolve `criterio_de_execucao`; a rota passa a
    // lista inteira em `desafios`. Se alguém reduzir o objeto no caminho, o
    // critério volta a não chegar — e nada mais falharia.
    const ROTA = ler('app/api/temporada/reflection/route.ts');
    expect(ROTA).toContain('desafios: desafiosLista');
    const FONTE = ler('lib/season-engine/kit/entrega-semana.ts');
    expect(FONTE).toContain('criterio_de_execucao: e.conteudo.criterio_de_execucao');
  });
});

describe('o critério NÃO aparece mais para a pessoa', () => {
  const TELA = ler('app/dashboard/temporada/semana/[week]/page.tsx');

  it('a tela não renderiza `criterio_de_execucao`', () => {
    // Decisão do dono (27/08): ele virou instrumento de avaliação. Exibir e
    // avaliar pelo mesmo texto convida a escrever PARA o critério, e o que a
    // conversa precisa colher é o que aconteceu.
    expect(TELA).not.toContain('{entrega.conteudo.criterio_de_execucao}');
  });

  it('a ação observável continua na tela — ela é a tarefa, não a régua', () => {
    expect(TELA).toContain('{entrega.conteudo.acao_observavel}');
  });
});
