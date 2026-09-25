/**
 * O que o Beto do WhatsApp sabe da situação da pessoa, e o texto que acompanha
 * o link de acesso. Puro: quem lê o banco é `suporte-auto.ts`.
 *
 * 🔴 POR QUE EXISTE (25/09/2026)
 * ──────────────────────────────
 * O Beto mandava o template `acesso_vertho` SEM uma palavra: quando o link saía,
 * a resposta do modelo era descartada. Dois casos reais em 24 horas:
 *
 *  - "Qual é a senha pra entrar?" recebeu só o botão.
 *  - Uma professora de Macaé ENTROU com o link das 08:55 e depois tocou no mesmo
 *    botão quatro vezes (09:01, 09:07, 09:08, 09:31; cada toque, "link inválido
 *    ou expirado", medido nos logs de `/auth/callback`). Escreveu "não estou
 *    conseguindo acessar o link que vc me mandou" e recebeu outro link, sem saber
 *    por que o primeiro tinha parado.
 *
 * O texto sai daqui, montado com fatos do banco, e não do modelo: o que ele
 * afirma (quando foi o último link, se a pessoa entrou depois dele) é
 * verificável. Prosa de modelo sobre acesso já prometeu link que não saiu
 * (ensaio de 22/09).
 *
 * E o modelo não sabia nada além de nome, cargo e empresa. A primeira mensagem
 * da mesma professora era "só me foi enviado um link inicial no dia 4 de
 * setembro, depois não recebi mais nenhum": ela não tinha trilha (mapeada em
 * 04/09, depois do lote de 05/09), e o Beto respondeu com um link de acesso.
 * `situacaoParaContexto` leva a trilha, o mapeamento e os horários de login e
 * de link ao prompt.
 */

import { TRILHA } from '@/lib/status';

/** O que o template aprovado promete: "O link expira em 15 minutos". */
export const VALIDADE_LINK_MS = 15 * 60 * 1000;
/** Folga para o relógio do banco e o do servidor: entrar aos 15:30 ainda é "com ele". */
const FOLGA_MS = 60 * 1000;

const FUSO = 'America/Sao_Paulo';

function diaBrt(ms: number): string {
  // en-CA dá AAAA-MM-DD, comparável como texto.
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(ms));
}

function horaBrt(ms: number): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(ms));
}

function dataCurtaBrt(ms: number): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' })
    .format(new Date(ms));
}

type Dia = 'hoje' | 'ontem' | 'antes';

function qualDia(ms: number, now: number): Dia {
  if (diaBrt(ms) === diaBrt(now)) return 'hoje';
  if (diaBrt(ms) === diaBrt(now - 24 * 3600 * 1000)) return 'ontem';
  return 'antes';
}

/** "hoje às 08:55", "ontem às 21:12", "04/09 às 16:03". Sempre em Brasília. */
export function quandoBrt(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso);
  const dia = qualDia(ms, now);
  const prefixo = dia === 'antes' ? dataCurtaBrt(ms) : dia;
  return `${prefixo} às ${horaBrt(ms)}`;
}

/** "O link das 08:55" / "O link de ontem, das 21:12" / "O link de 04/09, das 16:03". */
function oLinkDe(iso: string, now: number): string {
  const ms = Date.parse(iso);
  const dia = qualDia(ms, now);
  if (dia === 'hoje') return `O link das ${horaBrt(ms)}`;
  return `O link de ${dia === 'ontem' ? 'ontem' : dataCurtaBrt(ms)}, das ${horaBrt(ms)}`;
}

/** "às 08:55" / "ontem às 21:12" / "em 04/09 às 16:03". */
function entrouEm(iso: string, now: number): string {
  const ms = Date.parse(iso);
  const dia = qualDia(ms, now);
  if (dia === 'hoje') return `às ${horaBrt(ms)}`;
  return dia === 'ontem' ? `ontem às ${horaBrt(ms)}` : `em ${dataCurtaBrt(ms)} às ${horaBrt(ms)}`;
}

export interface AnteriorDoLink {
  /** Último `acesso_vertho` enviado com sucesso a este número nas últimas 24 h, ANTES do atual. */
  ultimoLinkEm: string | null;
  /** Último login da pessoa (`auth.users.last_sign_in_at`), de qualquer forma de entrada. */
  ultimoLoginEm: string | null;
}

export type CasoDoLink = 'primeiro' | 'anterior-usado' | 'anterior-expirado' | 'anterior-valendo';

/**
 * O que aconteceu com o link anterior.
 *
 * "Usado" é inferência, e a régua é estreita de propósito: login DEPOIS do link
 * e dentro da validade dele. Login fora dessa janela não foi com aquele link
 * (ele já tinha vencido), e o caso vira "expirado".
 */
export function casoDoLink(a: AnteriorDoLink, now = Date.now()): CasoDoLink {
  if (!a.ultimoLinkEm) return 'primeiro';
  const link = Date.parse(a.ultimoLinkEm);
  if (!Number.isFinite(link)) return 'primeiro';
  const login = a.ultimoLoginEm ? Date.parse(a.ultimoLoginEm) : NaN;
  if (Number.isFinite(login) && login >= link && login <= link + VALIDADE_LINK_MS + FOLGA_MS) {
    return 'anterior-usado';
  }
  return now - link > VALIDADE_LINK_MS ? 'anterior-expirado' : 'anterior-valendo';
}

const COMO_ENTRAR = 'é só tocar em Acessar Vertho (não precisa de senha)';

/**
 * O texto que sai logo depois do template `acesso_vertho`.
 *
 * ⚠️ Não diz "acima" nem "abaixo": são dois envios, e a Meta não garante a ordem
 * de entrega entre eles. Não tem link (o botão é o link), então a verificação de
 * link do Beto não se aplica.
 */
export function textoAoEnviarLink(a: AnteriorDoLink, now = Date.now()): string {
  const caso = casoDoLink(a, now);
  if (caso === 'anterior-usado') {
    return `${oLinkDe(a.ultimoLinkEm!, now)} já foi usado: você entrou ${entrouEm(a.ultimoLoginEm!, now)}, `
      + `e cada link abre uma vez só. Te mandei um novo, ${COMO_ENTRAR}. `
      + 'Quando quiser entrar de novo depois, me peça outro por aqui.';
  }
  if (caso === 'anterior-expirado') {
    return `${oLinkDe(a.ultimoLinkEm!, now)} expirou: cada link vale por 15 minutos. `
      + `Te mandei um novo, ${COMO_ENTRAR}. Ele abre uma vez só.`;
  }
  if (caso === 'anterior-valendo') {
    return `Te mandei um novo link; use este, que é o mais recente. ${capitalizar(COMO_ENTRAR)}. `
      + 'Ele vale por 15 minutos e abre uma vez só.';
  }
  return `Te mandei seu link de acesso: ${COMO_ENTRAR}. Ele vale por 15 minutos e abre uma vez só. `
    + 'Quando quiser entrar de novo depois, me peça outro por aqui.';
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface SituacaoLida {
  /**
   * Status das trilhas da pessoa (`trilhas.status`). `null` = a leitura falhou
   * (desconhecida); lista vazia = não tem trilha.
   */
  trilhas: string[] | null;
  /** `colaboradores.mapeamento_em`. `undefined` = não lido (equipe interna). */
  mapeamentoEm?: string | null;
  ultimoLoginEm: string | null;
  /** A leitura do login falhou: `null` acima não quer dizer "nunca entrou". */
  loginDesconhecido: boolean;
  ultimoLinkEm: string | null;
}

/**
 * O bloco `situacao` do CONTEXTO do modelo. Horários já em Brasília e por
 * extenso: o modelo não converte fuso, e um ISO em UTC viraria "11:55" numa
 * resposta a quem entrou às 08:55.
 */
export function situacaoParaContexto(s: SituacaoLida, now = Date.now()) {
  const trilha = s.trilhas === null
    ? 'desconhecida'
    : s.trilhas.includes(TRILHA.ATIVA)
      ? TRILHA.ATIVA
      : s.trilhas[0] ?? 'nenhuma';
  return {
    trilha,
    mapeamento_comportamental: s.mapeamentoEm === undefined ? 'desconhecido' : s.mapeamentoEm ? 'feito' : 'não feito',
    ultimo_login: s.loginDesconhecido
      ? 'desconhecido'
      : s.ultimoLoginEm ? quandoBrt(s.ultimoLoginEm, now) : 'sem registro',
    ultimo_link_de_acesso_24h: s.ultimoLinkEm ? quandoBrt(s.ultimoLinkEm, now) : 'nenhum',
  };
}
