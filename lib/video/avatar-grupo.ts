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
  /** F0 mediana da fala do avatar da mãe: o alvo do portão para o miolo da irmã. */
  f0Hz: number;
  /** Como a mãe narrou o avatar, e o ritmo e o nível dele: a régua da emenda. */
  referencia: ReferenciaAvatar;
  textos: AvatarFixo;
  avatar: { intro: AssetAvatar; outro: AssetAvatar };
}

/**
 * O avatar da mãe como régua da EMENDA avatar ↔ miolo da irmã.
 *
 * `Medido 26/09/2026` na escuta cega do dono (grupo Gerente Comercial, ACME Demo): a
 * altura sozinha NÃO prevê a costura. A irmã com o menor salto de F0 foi a pior,
 * porque o miolo dela saiu num take único 23 % mais RÁPIDO e 5 dB mais BAIXO que o
 * avatar, que a mãe narrou cena a cena. A irmã que narrou o miolo pelo mesmo caminho
 * da mãe (ritmo 1,04×, 2 dB) foi a melhor, acima da própria mãe.
 */
export interface ReferenciaAvatar {
  /** A mãe narrou num take único (senão, cena a cena). A irmã narra o miolo pelo MESMO caminho. */
  takeUnico: boolean;
  /** Nível da fala do avatar (dBFS, `nivelDeFalaDb`). O miolo da irmã é levado até ele. */
  nivelDb: number | null;
  /** Ritmo do avatar (palavras por segundo, `ritmoPalavrasPorSeg`). */
  pps: number | null;
}

/** Quanto o ritmo do miolo pode se afastar do ritmo do avatar (fração). A irmã ruim
 *  do piloto estava em 1,23×; a boa em 1,04×; a mãe, contra ela mesma, em 0,90×. */
export const FAIXA_RITMO = 0.15;
/** Ganho máximo aplicado ao miolo para casar o nível do avatar (dB), nos dois sentidos. */
export const GANHO_MAX_DB = 9;
/** Abaixo disso, a diferença de nível não se ouve e o áudio não é reescrito (dB). */
const GANHO_MIN_DB = 0.5;

/**
 * Nível da FALA (dBFS): mediana do RMS das janelas de 50 ms que têm voz (acima de
 * −45 dBFS). Silêncio e pausas ficam de fora, então duas falas da mesma voz com
 * pausas diferentes comparam pelo que se ouve. `null` se quase não há fala.
 */
export function nivelDeFalaDb(pcm: Buffer, sampleRate: number): number | null {
  const n = Math.floor(0.05 * sampleRate);
  const total = Math.floor(pcm.length / 2);
  const niveis: number[] = [];
  for (let a = 0; a + n <= total; a += n) {
    let s = 0;
    for (let i = a; i < a + n; i++) { const v = pcm.readInt16LE(i * 2) / 32768; s += v * v; }
    const db = 20 * Math.log10(Math.sqrt(s / n) || 1e-9);
    if (db > -45) niveis.push(db);
  }
  if (niveis.length < 10) return null;
  niveis.sort((x, y) => x - y);
  return niveis[Math.floor(niveis.length / 2)];
}

/** Ritmo em palavras por segundo, somando os trechos (da 1ª à última palavra de cada um). */
export function ritmoPalavrasPorSeg(trechos: (WordTime[] | undefined | null)[]): number | null {
  let palavras = 0, segundos = 0;
  for (const ws of trechos) {
    if (!ws?.length) continue;
    palavras += ws.length;
    segundos += Math.max(0, ws[ws.length - 1].end - ws[0].start);
  }
  return palavras >= 10 && segundos > 0 ? palavras / segundos : null;
}

/**
 * Decide a emenda da irmã: o ritmo do miolo cabe no do avatar? E quanto de ganho cada
 * cena do miolo precisa para ficar no nível do avatar. Sem ritmo medido dos dois lados
 * RECUSA (sem medida não há como afirmar que a costura não se ouve).
 */
export function avaliarEmenda(ref: ReferenciaAvatar, miolo: { id: string; nivelDb: number | null; words?: WordTime[] }[]): {
  ok: boolean; motivo?: string; razaoRitmo: number | null; ganhos: Record<string, number>;
} {
  const pps = ritmoPalavrasPorSeg(miolo.map((m) => m.words));
  if (!ref.pps || !pps) return { ok: false, motivo: 'ritmo não medido (sem timing do ASR)', razaoRitmo: null, ganhos: {} };
  const razaoRitmo = pps / ref.pps;
  if (Math.abs(razaoRitmo - 1) > FAIXA_RITMO) {
    return { ok: false, motivo: `ritmo do miolo ${razaoRitmo.toFixed(2)}× o do avatar (faixa ±${Math.round(FAIXA_RITMO * 100)}%)`, razaoRitmo, ganhos: {} };
  }
  const ganhos: Record<string, number> = {};
  if (ref.nivelDb != null) {
    for (const m of miolo) {
      if (m.nivelDb == null) continue;
      const g = Math.max(-GANHO_MAX_DB, Math.min(GANHO_MAX_DB, ref.nivelDb - m.nivelDb));
      if (Math.abs(g) >= GANHO_MIN_DB) ganhos[m.id] = Math.round(g * 10) / 10;
    }
  }
  return { ok: true, razaoRitmo, ganhos };
}

/** Aplica ganho em PCM 16-bit sem nunca clipar: se o pico passaria de −0,2 dBFS, o ganho encolhe. */
export function aplicarGanhoPcm16(pcm: Buffer, ganhoDb: number): { pcm: Buffer; ganhoDb: number } {
  const total = Math.floor(pcm.length / 2);
  let pico = 0;
  for (let i = 0; i < total; i++) pico = Math.max(pico, Math.abs(pcm.readInt16LE(i * 2)));
  let g = Math.pow(10, ganhoDb / 20);
  const teto = 0.977 * 32767;
  if (pico > 0 && pico * g > teto) g = teto / pico;
  const out = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i++) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(i * 2) * g))), i * 2);
  return { pcm: out, ganhoDb: Math.round(20 * Math.log10(g) * 100) / 100 };
}

/**
 * Leva cada cena do miolo ao nível do avatar. I/O injetado (baixar o PCM da cena e subir
 * o mp3 novo) para o núcleo ser testável sem rede. Devolve só as cenas reescritas.
 */
export async function nivelarMiolo(
  ganhos: Record<string, number>,
  io: { baixarPcm: (id: string) => Promise<Buffer>; subir: (id: string, pcm: Buffer) => Promise<string> },
): Promise<Record<string, { src: string; ganhoDb: number }>> {
  const out: Record<string, { src: string; ganhoDb: number }> = {};
  for (const [id, g] of Object.entries(ganhos)) {
    const { pcm, ganhoDb } = aplicarGanhoPcm16(await io.baixarPcm(id), g);
    out[id] = { src: await io.subir(id, pcm), ganhoDb };
  }
  return out;
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
