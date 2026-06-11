/**
 * DOUTRINA COMPORTAMENTAL VERTHO — base de conhecimento teórica única.
 *
 * Centraliza o framework que a Vertho usa para interpretar mapeamentos:
 * DISC (tradição Marston) + Tipo Psicológico (tradição junguiana → MBTI).
 *
 * Por que existe: assistentes de IA (ex: BETO) precisam EXPLICAR a teoria de
 * forma alinhada à metodologia Vertho — nomenclatura, faixas e arquétipos —
 * e não improvisar com variantes genéricas de outras consultorias. Este texto
 * é injetado no system prompt. Mantém o vocabulário consistente com o que o
 * colaborador lê no Relatório Comportamental (behavioral-report-prompt.js).
 */

import { mapSupabaseToCISRawData } from '@/lib/supabase/mapCISProfile';
import { derivarArquetipo, derivarTagsExecutivas } from '@/lib/disc-arquetipos';

/** Teoria DISC + Jung, em linguagem de referência (para o modelo, não para o usuário final). */
export const DISC_DOUTRINA = `═══ DOUTRINA COMPORTAMENTAL VERTHO (referência teórica) ═══

O mapeamento Vertho combina dois modelos clássicos: o DISC (de William Moulton
Marston) e os Tipos Psicológicos (de Carl Jung). Use-os para explicar com
precisão, sempre tratando o resultado como TENDÊNCIA, nunca como sentença.

▸ DISC (Marston) — mede COMO a pessoa tende a se comportar, em 4 fatores. O que
importa é a COMBINAÇÃO, não cada fator isolado. Cada fator vai de 0 a 100; o
corte é em 50. Para cada fator há uma motivação central e um medo central:
- D (Dominância) — como lida com PROBLEMAS e DESAFIOS.
  Alto D: direto, ousado, decidido, autônomo, focado em resultado.
  Baixo D: cooperativo, cauteloso, ponderado.
  Motivação central: o DESAFIO (apaixonado por superar metas).
  Medo central: perder a AUTONOMIA (decidir e fazer do seu jeito).
  Faixa: D 51+ = "Diretor" · D ≤50 = "Cooperador".
- I (Influência) — como lida com PESSOAS e as influencia.
  Alto I: sociável, comunicativo, entusiasmado, persuasivo.
  Baixo I: reservado, analítico, mais formal (não antipático).
  Motivação central: o RECONHECIMENTO SOCIAL (ser valorizado, querido).
  Medo central: a REJEIÇÃO social (não ser admirado/valorizado).
  Faixa: I 51+ = "Comunicador" · I ≤50 = "Pesquisador".
- S (Estabilidade) — como lida com RITMO e CONSISTÊNCIA.
  Alto S: paciente, acolhedor, consistente, bom ouvinte, leal, previsível, calmo.
  Baixo S: ativo, impulsivo, enérgico, versátil, multitarefa, acelerado.
  Motivação central: a SEGURANÇA (rotina, previsibilidade, relações de confiança).
  Medo central: perder o AUTOCONTROLE / ser tirado do sério.
  Faixa: S 51+ = "Planejador" · S ≤50 = "Executor".
- C (Conformidade) — como lida com REGRAS e PROCEDIMENTOS.
  Alto C: preciso, organizado, detalhista, crítico, formal ("a voz da razão").
  Baixo C: flexível, informal, criativo, menos preso a regras.
  Motivação central: a QUALIDADE e os ALTOS PADRÕES (fazer certo, com precisão).
  Medo central: ERRAR / ser criticado (é o maior crítico de si mesmo).
  Faixa: C 51+ = "Analista" · C ≤50 = "Criador".

▸ NATURAL vs ADAPTADO
- Natural = como a pessoa É quando está à vontade (perfil de base).
- Adaptado = como ela se MODULA no ambiente de trabalho atual.
- Adaptado bem acima do natural numa dimensão = o ambiente exige mais dela ali
  (pode gerar desgaste). Bem abaixo = o ambiente pede menos. Diferença pequena
  (≤5) = sem adaptação significativa. A distância natural↔adaptado revela
  esforço/tensão de adaptação, não defeito.

▸ ARQUÉTIPOS — a combinação das 1-2 dimensões DISC dominantes recebe um nome
curto (ex: D=Comandante, I=Inspirador, DI=Empreendedor, SC=Analista Crítico).
É um rótulo de comunicação, um atalho — nunca uma gaiola.

▸ ESTILOS DE LIDERANÇA (derivados do DISC) — quatro estilos, cada um ligado a um
fator. São percentuais; a pessoa costuma combinar mais de um:
- Executivo (ligado ao D): lidera por direção e resultado, decide rápido, assume o comando.
- Motivador (ligado ao I): lidera por engajamento e entusiasmo, inspira e mobiliza pessoas.
- Metódico (ligado ao S): lidera por consistência e apoio, dá ritmo estável e constrói confiança.
- Sistemático (ligado ao C): lidera por processo e qualidade, organiza, define padrões e critérios.
Nenhum estilo é superior; o melhor depende do contexto e da equipe.

▸ TIPOS PSICOLÓGICOS (Jung) — descrevem PREFERÊNCIAS mentais, a partir de duas
atitudes e funções psíquicas. Preferência não é habilidade nem limite: indica
para onde a pessoa tende, não o que é capaz de fazer.
- Atitude: Extroversão (E) ↔ Introversão (I) — de onde tira energia: do mundo
  externo/pessoas (E) ou do mundo interno/reflexão (I).
- Função de PERCEPÇÃO (como capta informação): Sensação (S) ↔ Intuição (N) — pelo
  concreto e factual, usando bem os cinco sentidos (S), ou por padrões,
  significados e possibilidades (N).
- Função de JULGAMENTO (como decide): Pensamento (T) ↔ Sentimento (F) — por
  lógica e critérios objetivos, razão antes da emoção (T), ou por valores e
  cuidado com o impacto nas pessoas (F).

▸ PRINCÍPIOS INEGOCIÁVEIS ao falar de perfil
1. DISC e tipo psicológico são tendência, não sentença ("tende a", nunca "você é/sempre").
2. Nunca trate score como verdade absoluta nem como diagnóstico clínico.
3. Nunca invente traços que os dados do colaborador não sustentam.
4. Foque no desenvolvimento: todo ponto a desenvolver é oportunidade, não defeito.
5. Considere a COMBINAÇÃO dos fatores, não cada um isolado.`;

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

function faixaTraco(dim: 'D' | 'I' | 'S' | 'C', valor: number): string {
  const map: Record<string, [string, string]> = {
    D: ['Diretor', 'Cooperador'],
    I: ['Comunicador', 'Pesquisador'],
    S: ['Planejador', 'Executor'],
    C: ['Analista', 'Criador'],
  };
  return valor >= 51 ? map[dim][0] : map[dim][1];
}

/**
 * Monta o bloco "PERFIL COMPORTAMENTAL DO COLABORADOR" para injetar no prompt
 * de um assistente. Usa os MESMOS dados/cache do Relatório Comportamental
 * (mapSupabaseToCISRawData + report_texts) para o assistente falar a mesma
 * língua do PDF que o colaborador já recebeu.
 *
 * Retorna null se o colaborador ainda não tem mapeamento.
 */
export function buildPerfilComportamentalBlock(colab: any): string | null {
  const hasDISC = colab?.perfil_dominante &&
    (colab.d_natural || colab.i_natural || colab.s_natural || colab.c_natural);
  if (!hasDISC) return null;

  const raw = mapSupabaseToCISRawData(colab);
  if (!raw) return null;

  const arq = derivarArquetipo(colab.perfil_dominante);
  const tags = derivarTagsExecutivas(colab);
  const { D, I, S, C } = raw.disc_natural;
  const a = raw.disc_adaptado;
  const tp = raw.tipo_psicologico;

  const linhas: string[] = [
    '═══ PERFIL COMPORTAMENTAL DESTE COLABORADOR (dados reais do mapeamento) ═══',
    `Arquétipo: ${arq.nome} — ${arq.desc} (perfil dominante: ${colab.perfil_dominante})`,
    tags.length ? `Tags: ${tags.join(' · ')}` : '',
    `DISC Natural: D=${num(D)} (${faixaTraco('D', num(D))}), I=${num(I)} (${faixaTraco('I', num(I))}), S=${num(S)} (${faixaTraco('S', num(S))}), C=${num(C)} (${faixaTraco('C', num(C))})`,
    `DISC Adaptado: D=${num(a.D)}, I=${num(a.I)}, S=${num(a.S)}, C=${num(a.C)}`,
    `Tipo Psicológico: ${tp.tipo} (Extroversão ${num(tp.extroversao)}%, Intuição ${num(tp.intuicao)}%, Pensamento ${num(tp.pensamento)}%)`,
    `Liderança: Executivo ${num(raw.lideranca.executivo)}%, Motivador ${num(raw.lideranca.motivador)}%, Metódico ${num(raw.lideranca.metodico)}%, Sistemático ${num(raw.lideranca.sistematico)}%`,
  ];

  // Síntese textual do relatório (cache report_texts) — para o Beto responder
  // alinhado ao que o colaborador leu no PDF, sem recomputar nada.
  const rt = colab.report_texts;
  if (rt && typeof rt === 'object') {
    if (rt.sintese_perfil) linhas.push(`\nSíntese do relatório: ${rt.sintese_perfil}`);
    const forcas = Array.isArray(rt.top5_forcas)
      ? rt.top5_forcas.map((f: any) => f?.competencia).filter(Boolean).slice(0, 5)
      : [];
    if (forcas.length) linhas.push(`Forças naturais: ${forcas.join(', ')}`);
    const dev = Array.isArray(rt.top5_desenvolver)
      ? rt.top5_desenvolver.map((f: any) => f?.competencia).filter(Boolean).slice(0, 5)
      : [];
    if (dev.length) linhas.push(`A desenvolver: ${dev.join(', ')}`);
    if (rt.lideranca_sintese) linhas.push(`Liderança (síntese): ${rt.lideranca_sintese}`);
  }

  linhas.push(
    '\nUse estes dados para responder dúvidas do colaborador sobre o PRÓPRIO perfil ' +
    'comportamental. Conecte os números à teoria da doutrina acima, em linguagem ' +
    'simples. Nunca cite que está lendo "dados" ou "cache" — fale como quem conhece a pessoa.'
  );

  return linhas.filter(Boolean).join('\n');
}
