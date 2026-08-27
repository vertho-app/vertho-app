import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pareceFechamento, reforcoDeFechamento } from '@/lib/season-engine/fechamento-conversa';
import { promptSocratic } from '@/lib/season-engine/prompts/socratic';

/**
 * A conversa da semana era encerrada por CONTAGEM, e o contador não olha o que
 * a IA escreveu. Medido em 27/08/2026, nas 86 conversas de Evidências
 * concluídas: **63 (73%) terminaram com a IA falando** — 45 abrindo o segundo
 * desafio da semana, 18 no meio de um aprofundamento —, e a tela imprimia
 * "✓ Conversa concluída" logo abaixo. Nas cortadas, `compromisso_proxima` saiu
 * vazio em 48 de 63 (76%), contra 3 de 23 (13%) nas que fecharam.
 *
 * Três invariantes, cada uma validada por mutação:
 *   1. `pareceFechamento` distingue fechamento de fala cortada;
 *   2. o turno 6 do roteiro socrático diz que a pessoa NÃO pode responder;
 *   3. a rota chama a rede de segurança antes de gravar `finished`.
 */

// Amostras reais (anonimizadas) dos dois lados da classificação medida.
const FECHOU = `Você deu um passo concreto essa semana.

✅ **Desafio**: realizado
📝 **Insight**: registrar o combinado mudou a conversa de lugar.
🎯 **Compromisso**: levar o registro para a próxima reunião de equipe.

Bom trabalho no que você sustentou aqui.`;

const CORTOU_PERGUNTA = `Entendo. E quando isso acontece — você com o registro em mãos, ela ciente do acordo — o que você percebe que ainda falta pra que o combinado de fato se sustente?`;

const CORTOU_ABRINDO_O_SEGUNDO = `Agora, sobre o outro foco da semana — Planejamento e Organização.

O desafio era identificar um risco recorrente e definir um gatilho observável.

O que aconteceu com esse?`;

describe('pareceFechamento', () => {
  it('reconhece o bloco de fechamento', () => {
    expect(pareceFechamento(FECHOU)).toBe(true);
  });

  it('🔴 recusa a fala que termina em pergunta — o caso do print', () => {
    expect(pareceFechamento(CORTOU_PERGUNTA)).toBe(false);
  });

  it('🔴 recusa a transição para o segundo desafio (52% dos cortes)', () => {
    expect(pareceFechamento(CORTOU_ABRINDO_O_SEGUNDO)).toBe(false);
  });

  it('recusa texto sem os marcadores, mesmo afirmativo', () => {
    // Sem ✅/🎯 não há veredito nem próximo passo — o extrator não tem o que ler.
    expect(pareceFechamento('Foi bom conversar com você. Até semana que vem.')).toBe(false);
  });

  it('recusa marcadores com pergunta no fim — na dúvida, não fechou', () => {
    expect(pareceFechamento(`✅ **Desafio**: parcial\n🎯 **Compromisso**: revisar o combinado.\n\nFaz sentido pra você?`)).toBe(false);
  });

  it('vazio e nulo não contam como fechamento', () => {
    expect(pareceFechamento('')).toBe(false);
    expect(pareceFechamento(null)).toBe(false);
    expect(pareceFechamento(undefined)).toBe(false);
  });
});

describe('reforcoDeFechamento', () => {
  it('carrega o formato do roteiro e diz que a tentativa anterior foi descartada', () => {
    const texto = reforcoDeFechamento('FORMATO ESPERADO AQUI');
    expect(texto).toContain('FORMATO ESPERADO AQUI');
    expect(texto).toMatch(/DESCARTADA/i);
    expect(texto).toMatch(/não poderá responder/i);
  });
});

describe('roteiro socrático — o último turno sabe que é o último', () => {
  const base = {
    nomeColab: 'Ana', cargo: 'Coordenadora', perfilDominante: 'S',
    competencia: 'Gestão de Pessoas', descritor: 'COO03_D6 — Busca de apoio',
    desafio: 'Registrar o combinado por escrito', historico: [],
  };

  it('o turno 6 proíbe pergunta e avisa que a pessoa não responde depois', () => {
    const { systemSuffix } = promptSocratic({ ...base, turnIA: 6 });
    expect(systemSuffix).toMatch(/TERMINA NESTA MENSAGEM/i);
    expect(systemSuffix).toMatch(/NÃO faça pergunta/i);
  });

  it('`fechamentoSuffix` é o mesmo bloco — a rede de segurança pede o formato certo', () => {
    const p3 = promptSocratic({ ...base, turnIA: 3 });
    const p6 = promptSocratic({ ...base, turnIA: 6 });
    expect((p3 as any).fechamentoSuffix).toBe((p6 as any).systemSuffix);
  });

  it('🔴 com DUAS tarefas, a transição é PRESCRITA no turno 4 — não sobra para o 6', () => {
    const desafios = [
      { competencia: 'Gestão de Pessoas', desafio_texto: 'registrar o combinado' },
      { competencia: 'Planejamento', desafio_texto: 'definir o gatilho do risco' },
    ];
    const t4 = promptSocratic({ ...base, desafios, turnIA: 4 }).systemSuffix;
    expect(t4).toMatch(/TRANSIÇÃO OBRIGATÓRIA/i);
    expect(t4).toContain('definir o gatilho do risco');
    // E o turno 6 continua sendo só fechamento.
    expect(promptSocratic({ ...base, desafios, turnIA: 6 }).systemSuffix).toMatch(/FECHAMENTO OBRIGATÓRIO/i);
  });

  it('🔴 com UMA tarefa e DOIS conteúdos, o 2º assunto entra no turno 5', () => {
    // Sem isto o segundo descritor da semana não aparece em lugar nenhum da
    // conversa — e ele conta na régua de nível igual ao primeiro.
    const t5 = promptSocratic({
      ...base,
      descritoresCobertos: ['COO03_D6 — Busca de apoio', 'COO03_D7 — Sustentação do combinado'],
      turnIA: 5,
    }).systemSuffix;
    expect(t5).toMatch(/SEGUNDO ÂNGULO/i);
    expect(t5).toContain('Sustentação do combinado');
  });

  it('o código da matriz não vaza para o texto que a IA lê', () => {
    // `descritor` chega como "COO03_D6 — Busca de apoio" em 79 de 648 itens de
    // plano; o prompt manda não citar nome técnico e recebia o código na string.
    const { systemSuffix } = promptSocratic({ ...base, turnIA: 3 });
    expect(systemSuffix).toContain('Busca de apoio');
    expect(systemSuffix).not.toContain('COO03_D6');
  });
});

describe('a rota grava `finished` só depois de passar pela rede', () => {
  // Estático (mesmo padrão de `semana-gates-tela`): montar a rota exigiria
  // Supabase e IA. O que precisa ficar travado é o CONTRATO.
  const ROTA = readFileSync(join(process.cwd(), 'app/api/temporada/reflection/route.ts'), 'utf-8');

  it('a rede roda quando o teto chega e a fala não fechou', () => {
    expect(ROTA).toContain('if (finished && !pareceFechamento(respostaIA))');
  });

  it('a segunda tentativa só substitui se ela MESMA fechou', () => {
    // Trocar uma conversa cortada por outra cortada é pagar uma chamada à toa.
    expect(ROTA).toContain('if (limpo && pareceFechamento(limpo)) respostaIA = limpo;');
  });

  it('quando nem a segunda fecha, a degradação fica registrada', () => {
    expect(ROTA).toContain('registrarConversaSemFechamento');
  });

  it('🔑 os desafios vêm da FONTE ÚNICA, não montados na própria rota', () => {
    expect(ROTA).toContain('resolverDesafiosDaSemana(sb, semanaPlan');
    expect(ROTA).toContain('desafioUnicoPorCompetencia: programaConfig.desafioUnicoPorCompetencia');
    // A montagem antiga (kit por entrega, sem cargo e sem o flag) não volta.
    expect(ROTA).not.toContain('semanaPlan.conteudos_dia.map(async (e: any) => {');
  });

  it('🔑 o kit é resolvido COM o cargo — sem ele, `cargoServe` vira curinga', () => {
    expect(ROTA).toContain('cargo: colab.cargo');
  });
});
