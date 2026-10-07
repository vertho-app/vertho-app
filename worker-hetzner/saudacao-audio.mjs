/**
 * Áudio da SAUDAÇÃO NOMINAL ("Olá, {nome}. Que bom ter você aqui.") — a parte que o app e a caixa de render precisam
 * combinar. Puro (sem rede, sem dependência), em .mjs porque a caixa roda sem o TypeScript do app e o app importa o
 * mesmo arquivo: a chave do objeto NÃO tem duas cópias para divergir.
 *
 * POR QUE EXISTE (07/10/2026). A saudação era sintetizada NA CAIXA, no AI Studio, enquanto o corpo do vídeo sai no Vertex.
 * O mesmo nome de voz soa como locutoras diferentes nos dois (medido em 07/09), cada síntese avulsa é um sorteio, e o cache
 * é por PESSOA: o sorteio ruim se repetia em todos os vídeos dela. Queixa do dono nas escolas: "o tom de saudação está
 * diferente do tom do restante do vídeo". Agora o app sintetiza no Vertex (`lib/video/saudacao-vertex.ts`), grava o mp3
 * neste caminho, e a caixa só lê e monta. A caixa NÃO sintetiza mais: sem o áudio, a pessoa fica sem nominal (o deck genérico
 * segue no ar) e a reconciliação refaz. Cair no AI Studio reabriria o sorteio sem ninguém ver.
 *
 * A versão do elenco entra na chave: recastar a voz (`ELENCO.mentora.versao`) torna o áudio antigo invisível em vez de
 * servir a locutora velha. A caixa recebe a versão em `VOZ_VERSAO` (ensure-render-worker).
 */

export const BUCKET_SAUDACAO = 'video-assets';

/** `degradacao_log.tipo` que a caixa grava quando falta o áudio. Repetido em `lib/degradacao.ts`; um teste confere os dois. */
export const DEGRADACAO_SAUDACAO_AUSENTE = 'saudacao-vertex-ausente';

/** Slug ASCII para chave de objeto (nome/versão). */
export function slugSaudacao(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
}

export function primeiroNome(nome) {
  const first = String(nome || '').trim().split(/\s+/)[0] || '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : '';
}

/** O que a mentora diz. É o MESMO texto que o dono ouviu na comparação cega de 07/10/2026. */
export function textoDaSaudacao(nome) {
  return `Olá, ${nome}. Que bom ter você aqui.`;
}

/**
 * Onde mora o ÁUDIO da saudação de UMA pessoa (o mp3 que o TTS devolve: o app não decodifica nada, porque na Vercel não há
 * ffmpeg). Determinístico (sem tabela, sem migration): a pessoa, o primeiro nome falado e a versão do elenco. Mudou o nome
 * ou a voz, é outro objeto.
 */
export function chaveDoAudioDaSaudacao({ colaboradorId, nome, versao }) {
  if (!colaboradorId || !nome || !versao) throw new Error('chave da saudação: colaboradorId, nome e versao são obrigatórios');
  return `saudacoes/${colaboradorId}__${slugSaudacao(nome)}__${slugSaudacao(versao)}.mp3`;
}
