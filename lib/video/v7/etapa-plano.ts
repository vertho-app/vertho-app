/**
 * Etapa do plano visual da biblioteca v7 no `gerar-video-modulo` (E3 da migração do vídeo, 17/10/2026).
 *
 * Depois que a narração tem os tempos do Whisper e o `montarInputProps` montou as cenas e as legendas, o Opus 5.5
 * (`low`) recebe o catálogo e o miolo do vídeo (cenas entre a abertura e o fecho do avatar, com as frases
 * cronometradas) e devolve os momentos. As regras do plano são GARANTIDAS em `plano.ts` (até 2 rodadas de ajuste),
 * e as ilustrações saem pelo mesmo gerador dos PDFs (`lib/imagem-editorial.ts`). Tudo aqui foi portado do
 * protótipo validado nos dois vídeos aprovados pelo dono (Amazon e Macaé): as cenas, o pedido, o ajuste e a
 * ilustração são os mesmos.
 *
 * O módulo não chama rede: quem chama passa as funções de IA, de imagem e de gravação (`DepsPlano`). O adaptador
 * do Trigger está em `no-trigger.ts`.
 */
import { createHash } from 'node:crypto';
import { CATALOGO_V7 } from './catalogo';
import {
  problemasDoPlano, pedidoDoPlano, pedidoDeAjuste, aplicarAjustes, cabeAjuste, montarMomentos, promptDaIlustracao,
  type CenaPlano, type RespostaPlano, type AjusteBruto, type MomentoFinal,
} from './plano';

/** A biblioteca congelada que o catálogo descreve (v7d: 23 modelos + imagem + frase; sem `vago_preciso`). */
export const VERSAO_BIBLIOTECA_V7 = 'v7d';
/** Tetos de saída do protótipo validado (o raciocínio em `low` é curto; o teto não custa, só o que sai). */
export const MAX_TOKENS_PLANO = 64000;
export const MAX_TOKENS_AJUSTE = 24000;

/** Campos do roteiro que não são TELA (o protótipo mandava o resto da cena como `tela`). */
const FORA_DA_TELA = ['id', 'narration', 'source_anchor', 'estimated_words', 'key_idea', 'icons', 'subtitle_note'];

type CenaDoRoteiro = { id: string };
type CenaDoProps = { id: string; type: string; fromFrame: number; durationInFrames: number };
type LegendaDoProps = { sceneId: string; startFrame: number; endFrame: number; text: string };
/** O que o plano lê do `render_inputprops` (o `SpikePropsV3` do `montarInputProps` serve). */
export type PropsDoMiolo = { fps?: number; scenes: readonly CenaDoProps[]; captions: readonly LegendaDoProps[] };

/**
 * O miolo do vídeo como o plano o recebe: as cenas que não são do avatar, com a duração real e as frases (legendas
 * do Whisper) em segundos da própria cena. Porte exato do `cenasDe` do protótipo.
 */
export function cenasDoMiolo(roteiro: { scenes: readonly CenaDoRoteiro[] }, props: PropsDoMiolo): CenaPlano[] {
  const fps = props.fps || 30;
  const doRoteiro = new Map(roteiro.scenes.map((s) => [s.id, s]));
  return props.scenes.filter((s) => !String(s.type).startsWith('avatar')).map((s) => {
    const r = (doRoteiro.get(s.id) || {}) as Record<string, unknown>;
    const tela = Object.fromEntries(Object.entries(r).filter(([k]) => !FORA_DA_TELA.includes(k)));
    return {
      id: s.id, tipo: s.type, dur: +(s.durationInFrames / fps).toFixed(3), tela,
      frases: props.captions.filter((c) => c.sceneId === s.id).map((c, i) => ({
        i, de: +((c.startFrame - s.fromFrame) / fps).toFixed(2), ate: +((c.endFrame - s.fromFrame) / fps).toFixed(2), texto: c.text,
      })),
    };
  });
}

/** A chave por cliente em `empresas.sys_config.video_biblioteca_v7`: `true` ou `{ ligado, contexto }`. Desligada por padrão. */
export type ConfigVideoV7 = { ligado: boolean; contexto: string | null };

export function configVideoV7(sysConfig: unknown): ConfigVideoV7 {
  const c = (sysConfig as Record<string, unknown> | null | undefined)?.video_biblioteca_v7;
  if (c === true) return { ligado: true, contexto: null };
  if (!c || typeof c !== 'object') return { ligado: false, contexto: null };
  const o = c as { ligado?: unknown; contexto?: unknown };
  const contexto = typeof o.contexto === 'string' && o.contexto.trim() ? o.contexto.trim().slice(0, 800) : null;
  return { ligado: o.ligado === true, contexto };
}

/**
 * O contexto do vídeo (local de trabalho e cargo), que vai ao plano e à ilustração.
 *
 * O validado (17/10) foi uma descrição CURTA do lugar, com os espaços concretos e o cargo: sem ela, o plano de um
 * boliche pediu ilustração de aeroporto. Em produção o resumo do PPP não serve para isso nos maiores clientes
 * (`Medido 17/10/2026`): a Secretaria Municipal (28 vídeos em 60 dias) não tem PPP extraído, e o PPP da Amazon
 * Bowling está no esquema corporativo, que o `extracaoParaTexto` não lê (devolve o JSON cru). Por isso a descrição
 * mora na chave do cliente; sem ela, sobra o nome da empresa, o segmento e o cargo.
 */
export function contextoDoVideo(p: { configurado: string | null; empresaNome: string | null; segmento: string | null; cargo: string | null }): string | null {
  const cargo = (p.cargo || '').trim();
  if (p.configurado) return cargo && !/cargo\s*:/i.test(p.configurado) ? `${p.configurado.replace(/\s*\.?\s*$/, '.')} Cargo: ${cargo}.` : p.configurado;
  const nome = (p.empresaNome || '').trim();
  const partes = [nome && `${nome}${p.segmento ? ` (segmento: ${p.segmento})` : ''}`, cargo && `Cargo: ${cargo}`].filter(Boolean);
  return partes.length ? partes.join('. ') + '.' : null;
}

/** Assinatura do pedido: o retry do mesmo vídeo com as mesmas frases reaproveita o plano já pago. */
export function assinaturaDoPlano(pedido: string): string {
  return createHash('sha1').update(`${VERSAO_BIBLIOTECA_V7}|${CATALOGO_V7}|${pedido}`).digest('hex').slice(0, 16);
}

/** O JSON da resposta (com ou sem cerca de código e texto em volta), como no protótipo. */
export function lerJsonDaResposta<T>(texto: string): T {
  const limpo = String(texto || '').replace(/^\s*```[a-z]*\s*\n/i, '').replace(/\n```\s*$/i, '').replace(/^[^{]*/, '').replace(/[^}]*$/, '');
  return JSON.parse(limpo) as T;
}

export interface ImagemV7 { momento: string; nome: string; url: string; mimeType: string; modelo: string; provedor: string }

/** O que fica salvo junto do vídeo (`videos_gerados.visual_v7`) e o que o render da E4 lê. */
export interface VisualV7 {
  versao: string;
  assinatura: string;
  criadoEm: string;
  contexto: string | null;
  /** Ids das cenas do miolo, na ordem. */
  cenas: string[];
  momentos: MomentoFinal[];
  /** As ilustrações: `nome` é o que o momento usa em `data.arquivo`. */
  imagens: ImagemV7[];
  /** A resposta do Opus já ajustada (para auditar e para refazer só a montagem). */
  plano: RespostaPlano;
  ajustes: string[];
  avisos: string[];
  excessos: string[];
  /** Problemas que sobraram depois das rodadas de ajuste (0 no esperado). */
  problemasRestantes: number;
}

export interface DepsPlano {
  /** Uma chamada ao Opus: sistema = catálogo, devolve o texto da resposta. */
  chamarIA: (system: string, user: string, maxTokens: number) => Promise<string>;
  gerarImagem: (prompt: string) => Promise<{ buffer: Buffer; mimeType: string; modelo: string; provedor: string }>;
  /** Grava a ilustração e devolve o endereço público. */
  guardarImagem: (arquivo: string, buffer: Buffer, mimeType: string) => Promise<string>;
  agora?: () => Date;
}

/**
 * Plano, ajuste, montagem e ilustrações. Lança se o plano não vier (resposta ilegível, sem cenas) ou se uma
 * ilustração falhar nos dois provedores: quem chama registra a degradação e o vídeo segue no formato de hoje.
 * A falha do AJUSTE não derruba: o plano segue com o aviso (a montagem já troca o que for inválido por `frase`).
 */
export async function gerarVisualV7(
  entrada: { cenas: CenaPlano[]; contexto: string | null; anterior?: VisualV7 | null },
  deps: DepsPlano,
): Promise<{ visual: VisualV7; reaproveitado: boolean }> {
  const { cenas, contexto } = entrada;
  if (!cenas.length) throw new Error('o vídeo não tem miolo (só cenas de avatar)');
  const pedido = pedidoDoPlano(cenas, contexto);
  const assinatura = assinaturaDoPlano(pedido);
  if (entrada.anterior?.assinatura === assinatura && entrada.anterior.momentos?.length) {
    return { visual: entrada.anterior, reaproveitado: true };
  }

  const resp = lerJsonDaResposta<RespostaPlano>(await deps.chamarIA(CATALOGO_V7, pedido, MAX_TOKENS_PLANO));
  if (!resp || !Array.isArray(resp.cenas) || !resp.cenas.length) throw new Error('o plano veio sem cenas');
  for (const c of resp.cenas) if (!Array.isArray(c.momentos)) c.momentos = [];

  const avisos: string[] = [];
  let problemas = problemasDoPlano(resp, cenas);
  while (problemas.length && cabeAjuste(resp)) {
    let ajustes: AjusteBruto[];
    try {
      const txt = await deps.chamarIA(CATALOGO_V7, pedidoDeAjuste(resp, cenas, problemas, contexto), MAX_TOKENS_AJUSTE);
      ajustes = lerJsonDaResposta<{ ajustes?: AjusteBruto[] }>(txt).ajustes || [];
    } catch (e) {
      avisos.push(`ajuste do plano falhou (${problemas.length} problema(s) ficam): ${String((e as Error)?.message || e).slice(0, 160)}`);
      break;
    }
    const { recusadas } = aplicarAjustes(resp, problemas, ajustes);
    if (recusadas) avisos.push(`${recusadas} troca(s) do ajuste recusada(s)`);
    problemas = problemasDoPlano(resp, cenas);
  }

  const montagem = montarMomentos(resp, cenas);
  const imagens: ImagemV7[] = await Promise.all(montagem.imagens.map(async (p) => {
    const r = await deps.gerarImagem(promptDaIlustracao(p, contexto));
    const ext = r.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const url = await deps.guardarImagem(`${p.nome.replace(/\.png$/i, '')}.${ext}`, r.buffer, r.mimeType);
    return { momento: p.momento, nome: p.nome, url, mimeType: r.mimeType, modelo: r.modelo, provedor: r.provedor };
  }));

  return {
    reaproveitado: false,
    visual: {
      versao: VERSAO_BIBLIOTECA_V7,
      assinatura,
      criadoEm: (deps.agora?.() ?? new Date()).toISOString(),
      contexto,
      cenas: cenas.map((c) => c.id),
      momentos: montagem.momentos,
      imagens,
      plano: resp,
      ajustes: resp.ajuste || [],
      avisos: [...avisos, ...montagem.avisos],
      excessos: montagem.excessos,
      problemasRestantes: problemas.length,
    },
  };
}
