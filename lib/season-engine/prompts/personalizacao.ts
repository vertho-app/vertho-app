/**
 * Builder da CAMADA DE PERSONALIZAÇÃO do PDF de conteúdo final.
 *
 * Gera DUAS seções markdown curtas que se ANEXAM ao núcleo curricular já pronto
 * (micro_conteudos.conteudo_inline) — sem reescrever, resumir nem contradizer o
 * núcleo. O núcleo permanece intacto (invariante de integridade); a camada é
 * conteúdo novo e legítimo, ancorado no arquétipo DISC do colaborador e no
 * brief da escola (PPP).
 *
 *  1. "## Para o seu perfil: <arquétipo>"  — sempre (eixo DISC).
 *  2. "## No contexto da sua escola"        — só quando há brief (eixo PPP).
 *
 * Saída: APENAS o markdown das seções (a action concatena ao núcleo).
 */

import type { EscolaBrief } from '@/lib/escola-brief';
import { briefPreenchido, briefParaPrompt } from '@/lib/escola-brief';

interface PersonalizacaoParams {
  competencia?: string | null;
  descritor?: string | null;
  /** Núcleo curricular — usado SÓ como referência de "não repetir". */
  conteudoCore: string;
  arquetipoNome: string;
  arquetipoDesc: string;
  escolaBrief?: EscolaBrief | null;
}

export function buildPersonalizacaoPrompt(p: PersonalizacaoParams): { system: string; user: string } {
  const temBrief = briefPreenchido(p.escolaBrief);

  const system = `Você é um mentor de desenvolvimento profissional da Vertho. Recebe um conteúdo de aprendizagem JÁ ESCRITO e produz uma CAMADA DE PERSONALIZAÇÃO curta que será ANEXADA ao final dele.

REGRAS ABSOLUTAS:
- NÃO reescreva, resuma, repita nem contradiga o conteúdo-núcleo. Ele continua intacto antes da sua camada. Você só ACRESCENTA uma leitura personalizada.
- Escreva em português do Brasil, markdown válido, tom de mentor — direto, prático, sem jargão de teste psicológico.
- Use os dados de perfil/escola como LENTE de aplicação, não como assunto. Nunca explique o que é DISC, nem cite siglas (D/I/S/C) ou pontuações. Nunca invente nomes próprios, marcas ou dados da escola.
- Cada seção: 1-2 parágrafos curtos + (opcional) uma lista de 2-4 itens acionáveis. Nada de encher linguiça.

Produza EXATAMENTE ${temBrief ? 'estas DUAS seções, nesta ordem' : 'esta UMA seção'} (apenas o markdown, sem texto fora delas, sem cercas de código):

## Para o seu perfil: ${p.arquetipoNome}
Como alguém com este perfil (${p.arquetipoDesc}) aplica MELHOR esta competência no dia a dia: as forças naturais a usar a favor e os pontos cegos a vigiar. Conecte ao tema do conteúdo, não ao perfil em abstrato.
${temBrief ? `
## No contexto da sua escola
Traga UM exemplo ou ajuste concreto de como aplicar o conteúdo na realidade desta escola (etapas, rede, contexto, ambientes do brief). Sem citar nomes próprios.` : ''}`;

  const partes: string[] = [];
  if (p.competencia) partes.push(`COMPETÊNCIA: ${p.competencia}`);
  if (p.descritor) partes.push(`DESCRITOR: ${p.descritor}`);
  partes.push(`PERFIL DO LEITOR: ${p.arquetipoNome} — ${p.arquetipoDesc}`);
  if (temBrief) partes.push(`BRIEF DA ESCOLA (use como contexto real):\n${briefParaPrompt(p.escolaBrief as EscolaBrief)}`);
  partes.push(`CONTEÚDO-NÚCLEO (NÃO repita; só use pra não dizer o óbvio de novo):\n${p.conteudoCore.slice(0, 12000)}`);
  partes.push(`Escreva agora ${temBrief ? 'as duas seções' : 'a seção'} de personalização.`);

  return { system, user: partes.join('\n\n') };
}
