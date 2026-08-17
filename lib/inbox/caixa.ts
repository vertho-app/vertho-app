/**
 * Montagem da CAIXA — a lista de conversas, dos dois escopos.
 *
 * POR QUE ISTO NÃO AGRUPA NADA
 * ────────────────────────────
 * A primeira versão lia as últimas 500 mensagens e agrupava por telefone aqui,
 * em memória. O agrupamento agora acontece na view `whatsapp_conversas`
 * (mig 216), e a razão é de correção, não de performance: uma janela de N
 * mensagens não é uma amostra de conversas. Quem escreve muito ocupa a janela
 * inteira, e as conversas de todo mundo desaparecem da lista — em silêncio, e
 * começando pela mais antiga, que é justamente a que esperava resposta.
 *
 * O que sobra para o TypeScript é o que o SQL não deve decidir: a janela de 24h
 * (regra de produto, com fronteira dura, testada com tempo congelado) e o nome
 * humano por trás do telefone.
 */
import { calcularJanela } from './janela';
import type { Conversa, ConversaGlobal, ResumoCaixa } from './tipos';

/** Linha crua da view `whatsapp_conversas` (mig 216, ampliada na 220). */
export interface LinhaConversa {
  empresa_id: string | null;
  from_phone: string;
  /** Mais recente de QUALQUER lado — é por ela que a caixa ordena. */
  ultima_em: string;
  /**
   * Mais recente RECEBIDA. `null` = a pessoa nunca escreveu.
   *
   * Separado de `ultima_em` porque a janela de 24h é reaberta pelo que ELA manda;
   * usar a data do nosso envio ofereceria um campo de resposta que a Meta recusa.
   */
  ultima_recebida_em?: string | null;
  /** Mensagens DELA. `0` = conversa que só existe porque nós mandamos. */
  total: number;
  /** Mensagens NOSSAS. */
  enviadas?: number;
  nao_lidas: number;
  ultimo_texto: string | null;
  ultimo_tipo: string | null;
  ultimo_lado?: 'pessoa' | 'equipe' | null;
  colaborador_id: string | null;
  ambiguidade: string | null;
}

/**
 * O que mostrar na prévia quando a última mensagem não tem texto.
 *
 * "(mídia)" para tudo esconde a informação que decide a prioridade de quem
 * atende: um áudio de 40 segundos e um sticker não pedem a mesma coisa.
 */
export function rotuloDoTipo(tipo: string | null): string {
  switch (tipo) {
    case 'audio':
    case 'voice': return '(áudio)';
    case 'image': return '(imagem)';
    case 'video': return '(vídeo)';
    case 'document': return '(documento)';
    case 'sticker': return '(figurinha)';
    case 'location': return '(localização)';
    case 'contacts': return '(contato)';
    default: return '(sem texto)';
  }
}

function paraConversa(l: LinhaConversa, nomes: Map<string, string>, agora: number): Conversa {
  const recebidas = Number(l.total) || 0;
  return {
    telefone: l.from_phone,
    colaboradorId: l.colaborador_id,
    nome: l.colaborador_id ? nomes.get(l.colaborador_id) ?? null : null,
    ultimaEm: l.ultima_em,
    ultimoTexto: l.ultimo_texto,
    ultimoTipo: l.ultimo_tipo,
    naoLidas: Number(l.nao_lidas) || 0,
    ambiguidade: l.ambiguidade,
    recebidas,
    enviadas: Number(l.enviadas) || 0,
    ultimoLado: l.ultimo_lado === 'equipe' ? 'equipe' : 'pessoa',
    /*
     * A janela é do ÚLTIMO RECEBIDO — é ele que a reabre. Nunca do que enviamos.
     *
     * 🔴 Desde a mig 220 a lista inclui conversas que só têm envio, e aí a
     * diferença deixou de ser sutil: `ultima_em` seria a data do NOSSO disparo, e
     * a tela ofereceria o campo de resposta livre para quem nunca escreveu — a
     * Meta recusaria com 131047 e, para quem clicou, a mensagem simplesmente não
     * teria chegado. O `?? null` (e não `?? l.ultima_em`) é deliberado: sem
     * recebida, o estado correto é "nunca escreveu".
     */
    janela: calcularJanela(l.ultima_recebida_em ?? null, agora),
  };
}

/** Ordem da caixa: quem falou por último aparece primeiro. */
function porRecencia<T extends { ultimaEm: string }>(a: T, b: T): number {
  return new Date(b.ultimaEm).getTime() - new Date(a.ultimaEm).getTime();
}

/** Conversas de UMA empresa (workspace do cliente). */
export function montarConversas(
  linhas: LinhaConversa[],
  nomes: Map<string, string>,
  agora: number = Date.now(),
): Conversa[] {
  return (linhas || []).map((l) => paraConversa(l, nomes, agora)).sort(porRecencia);
}

/**
 * Conversas de TODAS as empresas (caixa da equipe Vertho).
 *
 * As não identificadas (`empresa_id NULL`) entram na MESMA lista, e isso é
 * deliberado: quando elas moram numa aba separada, ninguém abre a aba. Quem
 * atende precisa ver que existe alguém esperando resposta antes de saber de que
 * cliente a pessoa é — a identificação é um problema nosso, não dela.
 */
export function montarCaixaGlobal(
  linhas: LinhaConversa[],
  nomes: Map<string, string>,
  empresas: Map<string, string>,
  agora: number = Date.now(),
): ConversaGlobal[] {
  return (linhas || [])
    .map((l) => ({
      ...paraConversa(l, nomes, agora),
      empresaId: l.empresa_id,
      empresa: l.empresa_id ? empresas.get(l.empresa_id) ?? null : null,
    }))
    .sort(porRecencia);
}

/**
 * Contadores do topo da caixa.
 *
 * `naoLidas` soma MENSAGENS e `conversasNaoLidas` conta CONVERSAS — os dois,
 * porque são perguntas diferentes e confundi-las é como um painel passa a
 * mentir: "12 não lidas" com 12 mensagens de uma pessoa só descreve um trabalho
 * bem menor que 12 pessoas esperando.
 */
export function resumoDaCaixa(conversas: ConversaGlobal[]): ResumoCaixa {
  return {
    conversas: conversas.length,
    conversasNaoLidas: conversas.filter((c) => c.naoLidas > 0).length,
    naoLidas: conversas.reduce((a, c) => a + c.naoLidas, 0),
    janelasAbertas: conversas.filter((c) => c.janela.podeTextoLivre).length,
    naoIdentificadas: conversas.filter((c) => !c.empresaId).length,
  };
}
