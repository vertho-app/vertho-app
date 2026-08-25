/**
 * VALIDAÇÃO DA SAÍDA DA CENA — pura, sem IA e sem banco.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══
 *
 * Três rodadas de medição foram invalidadas por defeito meu, e as três só foram
 * descobertas DEPOIS de rodar, por acaso:
 *
 *   1. a persona nascia cega à armadilha (leitor buscava chave inexistente);
 *   2. a tabela cruzava proficiência com confiança;
 *   3. o extrator numerava as ENTRADAS (1…18) em vez de apontar o descritor, e
 *      a consolidação lia as seis primeiras como D1–D6 — descartando o resto
 *      em silêncio, com a cobertura ainda dizendo 6/6.
 *
 * O padrão comum não é "errei três vezes": é que **nada olhava o resultado**. O
 * script imprimia média e nível, e média e nível sempre saem — mesmo quando o
 * que entrou não faz sentido. Um número que sempre aparece não é medida.
 *
 * Aqui cada `it` da suíte tem um par: uma invariante que, quebrada, **impede o
 * relatório de sair**. A regra é a do FMEA: na CONSTRUÇÃO falhe alto. Uma cena
 * de medição é construção — há um humano na frente, e é melhor perder a cena do
 * que publicar uma nota que ninguém sabe do que é feita.
 */

import { nivelDaEvidencia, type ConsolidacaoCena, type EvidenciaDescritor } from './beats';
import { medirDitado, TETO_DITADO, type FalaDaCena } from './ditado';

export type Severidade = 'erro' | 'aviso';

export interface Violacao {
  severidade: Severidade;
  campo: string;
  detalhe: string;
}

export interface EntradaValidacao {
  numDescritores: number;
  totalBeats: number;
  turnos: number;
  beatsCumpridos: number[];
  contrato: { armadilha: string; tradeoff: string; complicador: string };
  evidencias: EvidenciaDescritor[];
  consolidacao: ConsolidacaoCena;
  /** Só as falas do AVALIADO — é nelas que a citação tem de existir. */
  falasDoAvaliado: string[];
  /**
   * O histórico COM os papéis, para medir ditação. Opcional: sem ele a
   * checagem não roda — e é melhor não rodar do que rodar sobre metade dos
   * dados e devolver uma taxa que parece medida e não é.
   */
  historico?: FalaDaCena[];
  /**
   * `medicao` (default) aplica o teto de ditação; `ensaio` não.
   *
   * O default é o estrito de propósito: quem esquecer o campo numa cena de
   * medição recebe o teto; quem esquecer num ensaio recebe um aviso a mais.
   * O erro caro é o outro — medir com o interlocutor ensinando.
   */
  modo?: 'medicao' | 'ensaio';
}

/**
 * Normalização para comparar citação com transcrição: sem acento, sem caixa,
 * espaços colapsados e pontuação de borda removida.
 *
 * Deliberadamente TOLERANTE. O objetivo é pegar paráfrase e invenção, não punir
 * o extrator por ter aparado uma vírgula. Um comparador exato geraria ruído que
 * ninguém leria — e alarme que ninguém lê é alarme desligado.
 */
export function normalizar(t: string): string {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Citação curta demais não dá para verificar — e não dá para auditar depois. */
export const MIN_CITACAO = 25;

/**
 * Tira a conjunção da BORDA de um fragmento de emenda.
 *
 * 🔴 Medido 25/08/2026 (fase 0e): o extrator devolveu
 * `"Zero tolerância escrito, não na minha cabeça... e o segundo episódio da
 * Dona Rute já ter consequência formal e visível"`. Os dois trechos existem na
 * fala, contíguos — o que a pessoa disse no meio foi *"e as outras mães vendo,
 * por isso o segundo episódio…"*. O extrator cortou o meio e escreveu "e" no
 * lugar de "por isso". Nada mudou de sentido, e a cena INTEIRA foi invalidada.
 *
 * Emenda com reticências PRECISA de tecido conjuntivo nas bordas — é assim que
 * citação emendada funciona em qualquer texto. A palavra colada ao "..." é do
 * extrator, não do falante, e cobrar literalidade dela reprova citação honesta.
 *
 * ⚠️ Só a BORDA, e só conector. O miolo continua tendo de bater palavra por
 * palavra, senão isto viraria licença para parafrasear.
 */
const CONECTORES = ['e', 'mas', 'entao', 'porque', 'que', 'e que', 'ou', 'ai', 'dai', 'por isso', 'entretanto', 'porem'];
export function semConectorDeBorda(fragmento: string): string {
  let f = fragmento.trim();
  for (const c of CONECTORES) {
    if (f.startsWith(c + ' ')) { f = f.slice(c.length + 1); break; }
  }
  for (const c of CONECTORES) {
    if (f.endsWith(' ' + c)) { f = f.slice(0, -(c.length + 1)); break; }
  }
  return f.trim();
}

export function validarSaidaDaCena(e: EntradaValidacao): Violacao[] {
  const v: Violacao[] = [];
  const erro = (campo: string, detalhe: string) => v.push({ severidade: 'erro', campo, detalhe });
  const aviso = (campo: string, detalhe: string) => v.push({ severidade: 'aviso', campo, detalhe });

  // ── Contrato de entrada ───────────────────────────────────────────────────
  if (!e.contrato.armadilha.trim()) erro('contrato', 'armadilha vazia — o personagem não sabe o que recusar');
  if (!e.contrato.tradeoff.trim()) erro('contrato', 'tradeoff vazio');
  if (!e.contrato.complicador.trim()) erro('contrato', 'fator complicador vazio');

  // ── Domínio dos índices ───────────────────────────────────────────────────
  if (e.consolidacao.indicesInvalidos.length) {
    erro('evidencias.descritor',
      `índices fora de 1..${e.numDescritores}: ${e.consolidacao.indicesInvalidos.join(', ')} — ` +
      'sinal de que o extrator numerou as ENTRADAS em vez de apontar o descritor');
  }

  // Numeração sequencial disfarçada: mesmo dentro da faixa, se os índices forem
  // exatamente 1,2,3…N na ordem em que aparecem, é contador, não descritor.
  const seq = e.evidencias.map((x) => x.indice);
  const pareceContador = seq.length >= e.numDescritores &&
    seq.slice(0, e.numDescritores).every((n, k) => n === k + 1) &&
    new Set(seq.slice(0, e.numDescritores)).size === e.numDescritores;
  if (pareceContador && seq.length > e.numDescritores) {
    erro('evidencias.descritor', 'os primeiros índices são 1,2,3… na ordem — provável contador de linha');
  }

  // ── Turnos e beats ────────────────────────────────────────────────────────
  for (const ev of e.evidencias) {
    if (ev.turno != null && (ev.turno < 1 || ev.turno > e.turnos)) {
      erro('evidencias.turno', `turno ${ev.turno} fora de 1..${e.turnos}`);
    }
    if (ev.beat != null && (ev.beat < 1 || ev.beat > e.totalBeats)) {
      erro('evidencias.beat', `beat ${ev.beat} fora de 1..${e.totalBeats}`);
    }
    if (ev.beat != null && !e.beatsCumpridos.includes(ev.beat)) {
      aviso('evidencias.beat', `evidência no beat ${ev.beat}, que não consta como cumprido`);
    }
    /**
     * Uma das duas formas, nunca nenhuma.
     *
     * `nivelDaEvidencia` cai em `sem_sinal` quando os dois campos faltam — o que
     * é a leitura certa para artefato velho e a leitura ERRADA para uma saída
     * corrompida: o descritor sumiria da conta como "a cena não exigiu isso",
     * com a cobertura acusando lacuna em vez de defeito. Aqui a ausência é erro.
     */
    if (ev.nivel == null && ev.veredito == null) {
      erro('evidencias.nivel', `D${ev.indice}: sem "nivel" e sem "veredito" — evidência ilegível`);
    }
    if (ev.nivel != null && !['n1_gap', 'n2_em_desenvolvimento', 'n3_meta', 'sem_sinal'].includes(ev.nivel)) {
      erro('evidencias.nivel', `nível desconhecido: ${ev.nivel}`);
    }
    if (ev.veredito != null && !['demonstrou', 'tentou', 'falhou', 'sem_sinal'].includes(ev.veredito)) {
      erro('evidencias.veredito', `veredito desconhecido: ${ev.veredito}`);
    }
    if (!['fraca', 'moderada', 'forte'].includes(ev.forca)) {
      erro('evidencias.forca', `força desconhecida: ${ev.forca}`);
    }
  }

  // ── A citação é literal? ──────────────────────────────────────────────────
  //
  // Nunca tinha sido conferido, e é o alicerce do protocolo de âncora: os
  // avaliadores humanos classificam CONTRA a citação. Se o extrator parafraseia,
  // não há o que auditar — e a paráfrase é indistinguível da invenção.
  const transcricao = normalizar(e.falasDoAvaliado.join('  '));
  for (const ev of e.evidencias) {
    if (nivelDaEvidencia(ev) === 'sem_sinal') continue;
    const c = normalizar(ev.citacao);
    if (!c) { erro('evidencias.citacao', `D${ev.indice} sem citação`); continue; }
    if (c.length < MIN_CITACAO) {
      aviso('evidencias.citacao', `D${ev.indice}: citação curta demais para verificar ("${ev.citacao}")`);
      continue;
    }
    /**
     * Reticências marcam EMENDA, e emenda é citação legítima.
     *
     * Medido em 25/08/2026: o extrator devolveu `"…precisa tratar no
     * planejamento do próximo semestre... Anota aí"` — os dois fragmentos
     * existem na fala, separados por outras frases. Recusar isso reprovaria
     * citação honesta e treinaria o extrator a citar menos, que é o oposto do
     * que se quer: quanto mais literal e mais completa, melhor para o humano
     * auditar. Cada fragmento é verificado por si.
     */
    const fragmentos = ev.citacao.split(/\.{2,}|…/)
      .map(normalizar).map(semConectorDeBorda).filter((f) => f.length >= MIN_CITACAO);
    const paraVerificar = fragmentos.length ? fragmentos : [c];
    const ausentes = paraVerificar.filter((f) => !transcricao.includes(f));
    if (ausentes.length) {
      erro('evidencias.citacao',
        `D${ev.indice}: citação NÃO aparece na fala do avaliado — paráfrase ou invenção: "${ev.citacao.slice(0, 70)}"`);
    }
  }

  // ── O interlocutor ENSINOU? ───────────────────────────────────────────────
  //
  // Prompt pede, código garante. O prompt do interlocutor proíbe nomear o
  // elemento que falta; aqui se confere se ele obedeceu — contando quantas
  // citações trazem elemento concreto que já estava na fala anterior DELE.
  //
  // Numa cena de medição isso é ERRO, não aviso: uma cena em que o andaime
  // aparece no lugar do comportamento não mede o que diz medir, e a régua do
  // FMEA para construção é falhar alto.
  if (e.historico?.length && (e.modo ?? 'medicao') === 'medicao') {
    const d = medirDitado(e.evidencias, e.historico);
    if (d.taxa != null && d.taxa > TETO_DITADO) {
      erro('cena.ditado',
        `${d.ditadas} de ${d.ditadas + d.proprias} citações repetem elemento que o interlocutor ` +
        `já tinha dito (${(100 * d.taxa).toFixed(0)}%, teto ${(100 * TETO_DITADO).toFixed(0)}%) — ` +
        'a cena ensinou a resposta antes de medi-la');
    }
  }

  // ── Aritmética da consolidação ────────────────────────────────────────────
  const notas = e.consolidacao.notas;
  if (notas.length !== e.numDescritores) {
    erro('consolidacao.notas', `${notas.length} notas para ${e.numDescritores} descritores`);
  }
  const medidas = notas.filter((n): n is number => n != null);
  if (e.consolidacao.cobertura.medidos !== medidas.length) {
    erro('consolidacao.cobertura', `medidos=${e.consolidacao.cobertura.medidos} mas há ${medidas.length} notas`);
  }
  const semSinalEsperado = notas.map((n, k) => (n == null ? k + 1 : 0)).filter(Boolean);
  if (JSON.stringify(e.consolidacao.semSinal) !== JSON.stringify(semSinalEsperado)) {
    erro('consolidacao.semSinal', `semSinal=${e.consolidacao.semSinal} não bate com as notas nulas`);
  }
  if (medidas.length) {
    const media = Number((medidas.reduce((a, b) => a + b, 0) / medidas.length).toFixed(2));
    if (Math.abs(media - (e.consolidacao.media ?? -1)) > 0.005) {
      erro('consolidacao.media', `média informada ${e.consolidacao.media}, calculada ${media}`);
    }
  } else if (e.consolidacao.media != null) {
    erro('consolidacao.media', 'média não-nula sem nenhuma nota');
  }

  // Nível: ou é null com motivo, ou é coerente com a média.
  if (e.consolidacao.nivel == null && !e.consolidacao.nivelSuprimidoPorque) {
    erro('consolidacao.nivel', 'nível nulo sem motivo declarado');
  }
  if (e.consolidacao.nivel != null && e.consolidacao.nivelSuprimidoPorque) {
    erro('consolidacao.nivel', 'nível publicado E motivo de supressão ao mesmo tempo');
  }

  return v;
}

/** `true` quando não há nenhum `erro` — avisos não bloqueiam. */
export const saidaConfiavel = (vs: Violacao[]) => !vs.some((x) => x.severidade === 'erro');
