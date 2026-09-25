/**
 * Avatar compartilhado por grupo (empresa × módulo × cargo) — peças PURAS.
 *
 * O avatar (intro e outro) é ~65% do custo de um vídeo, e hoje cada célula DISC do
 * mesmo módulo paga o seu. O plano (docs/GERADOR-VIDEO-MODULO.md) é a 1ª célula do
 * grupo gerar o avatar e as irmãs reaproveitarem o clipe. Este arquivo concentra o
 * que dá para decidir sem rede nem banco, para ser testado isolado.
 */
import { createHash } from 'node:crypto';
import type { AvatarFixo, CenaAvatarFixa } from './roteiro-prompt';
import type { WordTime } from './whisper-align';

interface CenaComNarracao { id: string; narration?: string | null }

/** Muda quando o texto do avatar deixa de ser reaproveitável (prompt dos textos, regras). */
export const VERSAO_AVATAR_GRUPO = '2026-09-25';

/**
 * `videos_gerados.etapa` da célula inserida SEM disparo, esperando o orquestrador do
 * grupo. Quem a tira daqui (o orquestrador ou o fallback do despacho) faz um UPDATE
 * condicionado a esta etapa: é a trava contra disparar a mesma célula duas vezes.
 */
export const ETAPA_AGUARDANDO_AVATAR = 'aguardando_avatar';

/**
 * Chave do grupo: quem pode compartilhar o MESMO avatar. Entra tudo que muda o texto
 * da abertura e do fecho (empresa, módulo, cargo, contexto do cargo e do PPP, versão)
 * e fica de fora o que só muda o miolo (o DISC).
 */
export function chaveGrupoAvatar(p: {
  empresaId: string; moduloBaseId: string; cargo: string; pppBrief: string | null; cargoBloco: string | null;
}): string {
  const h = (s: string | null) => createHash('sha1').update(s || '').digest('hex').slice(0, 16);
  return createHash('sha1')
    .update([p.empresaId, p.moduloBaseId, p.cargo, h(p.pppBrief), h(p.cargoBloco), VERSAO_AVATAR_GRUPO].join('|'))
    .digest('hex');
}

const palavras = (s: string) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
/** Mesmo espaçamento que `normalizarRoteiro` deixa (espaços colapsados, sem bordas). */
const colapsar = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Confere os textos do avatar contra as regras do prompt do roteiro (a mesma régua que o
 * modelo recebe lá): tamanho, abertura sem cumprimento, fecho em pergunta, tela curta.
 * A folga de ±2 palavras é a do próprio modelo, que conta mal; fora dela é outro vídeo.
 */
export function problemasDosTextosAvatar(t: AvatarFixo): string[] {
  const p: string[] = [];
  const wi = palavras(t.intro.narration), wo = palavras(t.outro.narration);
  if (wi < 28 || wi > 36) p.push(`intro com ${wi} palavras (30-34)`);
  if (wo < 24 || wo > 32) p.push(`outro com ${wo} palavras (26-30)`);
  if (/^(oi|ola|bem-vind|tudo bem)/.test(semAcento(t.intro.narration.trim()))) p.push('intro começa com cumprimento');
  if (!t.outro.narration.trim().endsWith('?')) p.push('outro não termina em pergunta');
  for (const [nome, c] of [['intro', t.intro], ['outro', t.outro]] as const) {
    if (!c.title?.trim() || palavras(c.title) > 8) p.push(`${nome}: title vazio ou acima de 8 palavras`);
    if (!c.subtitle?.trim() || palavras(c.subtitle) > 14) p.push(`${nome}: subtitle vazio ou acima de 14 palavras`);
  }
  return p;
}

/**
 * Sobrescreve as cenas de avatar do roteiro com o texto fixo do grupo. O prompt já
 * manda copiar; isto garante, porque o clipe da HeyGen só serve para o MESMO texto.
 * Cena de avatar que o modelo esqueceu é criada. Os outros campos (key_idea,
 * source_anchor) que o modelo escreveu ficam.
 */
export function aplicarAvatarFixo<R extends { scenes: any[] }>(roteiro: R, fixo: AvatarFixo): R {
  const cenas = [...(roteiro.scenes || [])];
  const aplicar = (tipo: 'avatar_intro' | 'avatar_outro', t: CenaAvatarFixa, posicao: 'inicio' | 'fim') => {
    const i = posicao === 'inicio' ? cenas.findIndex((s) => s?.type === tipo) : cenas.map((s) => s?.type).lastIndexOf(tipo);
    const base = i >= 0 ? cenas[i] : { id: `${tipo}-fixo`, type: tipo, key_idea: t.title, source_anchor: 'IDEIA_PRINCIPAL' };
    const cena = { ...base, title: t.title, subtitle: t.subtitle, narration: t.narration, estimated_words: palavras(t.narration) };
    if (i >= 0) cenas[i] = cena;
    else if (posicao === 'inicio') cenas.unshift(cena);
    else cenas.push(cena);
  };
  aplicar('avatar_intro', fixo.intro, 'inicio');
  aplicar('avatar_outro', fixo.outro, 'fim');
  return { ...roteiro, scenes: cenas };
}

/** Uma cena de avatar pronta, como a mãe a deixou (mp4 mudo + mp3 + timing). */
export interface AssetAvatar {
  src: string;
  audioSrc: string;
  words?: WordTime[];
  durationSec?: number;
  heygenVideoId?: string;
}

/** O que a irmã recebe do orquestrador para reaproveitar o avatar da mãe. */
export interface AvatarGrupoPayload {
  grupoId: string;
  /** Voz, modelo, elenco, estilo, foto, motor e fps com que o avatar foi feito. */
  assinatura: string;
  /** F0 mediana do take da mãe: o alvo do portão para o miolo da irmã. */
  f0Hz: number;
  textos: AvatarFixo;
  avatar: { intro: AssetAvatar; outro: AssetAvatar };
}

/**
 * Decide o que a irmã pode reaproveitar. Recusa (e a irmã segue o fluxo de hoje) se o
 * avatar foi feito com outra voz/foto/motor, ou se o texto das cenas de avatar do
 * roteiro dela não é o do grupo. Cena pedida em `regerarCenas` não é preenchida.
 */
export function avatarDoGrupoParaCenas(
  roteiro: { scenes: { id: string; type: string; narration?: string | null }[] },
  payload: AvatarGrupoPayload,
  opts: { assinaturaAtual: string; regerarCenas?: string[] },
): { assets: Record<string, AssetAvatar>; fixas: Set<string>; recusa?: string } {
  if (payload.assinatura !== opts.assinaturaAtual) {
    return { assets: {}, fixas: new Set(), recusa: `assinatura do avatar diferente (${payload.assinatura} × ${opts.assinaturaAtual})` };
  }
  const assets: Record<string, AssetAvatar> = {};
  const fixas = new Set<string>();
  const pares = [
    ['avatar_intro', payload.textos.intro, payload.avatar.intro],
    ['avatar_outro', payload.textos.outro, payload.avatar.outro],
  ] as const;
  for (const [tipo, texto, asset] of pares) {
    const cena = tipo === 'avatar_intro'
      ? roteiro.scenes.find((s) => s.type === tipo)
      : [...roteiro.scenes].reverse().find((s) => s.type === tipo);
    if (!cena) return { assets: {}, fixas: new Set(), recusa: `roteiro sem ${tipo}` };
    if (colapsar(cena.narration) !== colapsar(texto.narration)) {
      return { assets: {}, fixas: new Set(), recusa: `${tipo} com texto diferente do grupo` };
    }
    if (opts.regerarCenas?.includes(cena.id)) continue;
    assets[cena.id] = asset;
    fixas.add(cena.id);
  }
  return { assets, fixas };
}

/**
 * A falha do take da irmã é RECUSA DO PORTÃO de voz (a síntese saiu, mas fora da faixa
 * de altura em todas as tentativas), e não rede, Whisper ou corte? Só a recusa tira a
 * irmã do grupo: as outras falhas aconteceriam sem o grupo também. Casa a mensagem que
 * `lib/gemini-tts.ts` lança quando nenhuma tentativa passa (fixada em teste).
 */
export const recusaDoPortao = (motivo: string) => /passou no controle de qualidade/.test(motivo);

export interface PlanoNarracao<C extends CenaComNarracao = CenaComNarracao> {
  /** Cenas com texto a narrar, na ordem do roteiro. */
  cenasComTexto: C[];
  /** As que ainda não têm áudio neste vídeo. */
  pendentes: C[];
  /** Sintetizar as pendentes numa chamada só (a "narração única"). */
  usarTakeUnico: boolean;
}

/**
 * Decide o que a narração do vídeo precisa sintetizar, e se pode ser num take só.
 *
 * A narração única existe para a voz não mudar de uma cena para outra (06/09/2026).
 * Ela só vale quando TODO o áudio que já existe é de um take com a mesma voz — senão
 * o vídeo fica com dois takes emendados sem ninguém ter decidido isso. Por isso:
 *   · sem nada gerado → take único sobre tudo (o caso de sempre);
 *   · resume parcial ou retake de cena (`regerarCenas`) → caminho por cena, como antes;
 *   · cenas `fixas` (o avatar do grupo, já pronto e aprovado) não contam como "já
 *     gerado": o take único sai sobre o resto, e é o alvo do portão que casa a altura.
 *
 * Sem `fixas`, o resultado é idêntico ao `nadaGerado` que o trigger usava.
 */
export function planoDeNarracao<C extends CenaComNarracao>(
  cenas: C[],
  temAudio: (id: string) => boolean,
  opts: { fixas?: ReadonlySet<string> } = {},
): PlanoNarracao<C> {
  const fixas = opts.fixas ?? new Set<string>();
  const cenasComTexto = cenas.filter((s) => String(s.narration ?? '').trim());
  const pendentes = cenasComTexto.filter((s) => !temAudio(s.id));
  const jaGeradasForaDasFixas = cenasComTexto.filter((s) => temAudio(s.id) && !fixas.has(s.id)).length;
  return {
    cenasComTexto,
    pendentes,
    usarTakeUnico: pendentes.length > 1 && jaGeradasForaDasFixas === 0,
  };
}
