/**
 * Semeia o prompt de cada formato com a ESPINHA do kit (núcleo + lente DISC +
 * desafio), garantindo que os 4 formatos "digam a mesma coisa" e conduzam ao
 * MESMO desafio do DISC. Espelha o padrão de enriquecerPromptComModuloBase:
 * anexa um bloco ao system, sem tocar nos builders de cada formato.
 */
import type { KitBriefNucleo, DiscLetter } from './brief';
import type { DesafioStructured } from '@/lib/season-engine/prompts/challenge';
import { ARQUETIPOS } from '@/lib/disc-arquetipos';

// Como cada formato deve ATERRISSAR no desafio (fechamento coeso).
const COMO_FECHA: Record<string, string> = {
  video: 'A narração deve FECHAR conduzindo a pessoa a esse desafio (chamada final).',
  audio: 'A provocação final do podcast deve ser esse desafio.',
  texto: 'A seção de fechamento ("Para refletir"/"Aplicação") deve ser esse desafio.',
  case: 'O caso deve abrir para esse desafio na pergunta final — SEM citar o descritor.',
};

export interface KitSeed {
  nucleo: KitBriefNucleo;
  disc: DiscLetter;
  desafio: DesafioStructured;
  /** Contexto/PPP da EMPRESA — tecido no core (o kit é por empresa). */
  pppBrief?: string | null;
}

export function enriquecerPromptComKit(
  prompt: { system: string; user: string },
  kit: KitSeed,
  formatoEngine: string,
): { system: string; user: string } {
  const arq = ARQUETIPOS[kit.disc];
  const fecho = COMO_FECHA[formatoEngine] || 'Conduza a pessoa ao desafio ao final.';

  const systemAdd = [
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'KIT — ESPINHA COMPARTILHADA (todos os formatos dizem A MESMA COISA):',
    `IDEIA CENTRAL (obrigatória): ${kit.nucleo.ideia_central}`,
    `PONTOS-CHAVE (cobrir os 3): ${kit.nucleo.pontos_chave.map((x) => `"${x}"`).join(' · ')}`,
    `EXEMPLO-ÂNCORA (use ou varie no mesmo espírito): ${kit.nucleo.exemplo_ancora}`,
    '',
    `LENTE DE PERFIL (${arq.nome} — ${arq.desc}): expresse o tema do jeito que ENGAJA este perfil (tom, exemplos, enquadramento). NUNCA cite DISC, siglas (D/I/S/C) nem o nome do perfil.`,
    '',
    `DESAFIO DA SEMANA (este conteúdo deve conduzir a ele, sem reescrevê-lo): "${kit.desafio.desafio_texto}" (ação: ${kit.desafio.acao_observavel}; critério: ${kit.desafio.criterio_de_execucao}). ${fecho}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');

  // PPP/contexto da EMPRESA como LENTE de aplicação (não como assunto; sem citar o nome).
  const userAdd = kit.pppBrief
    ? `\n\n━━━ CONTEXTO DA INSTITUIÇÃO (use como LENTE de aplicação, sem citar o nome) ━━━\n${kit.pppBrief}`
    : '';

  return { system: `${prompt.system}\n${systemAdd}`, user: `${prompt.user}${userAdd}` };
}
