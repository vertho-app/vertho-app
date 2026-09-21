/**
 * Suporte automático no WhatsApp — PILOTO restrito a um telefone.
 *
 * Por que existe: avaliar atendimento automático para acesso, links expirados,
 * pendências e dúvidas simples, interpretando a mensagem e consultando a
 * situação do usuário, em vez de chatbot rígido de respostas prontas.
 *
 * Limites do piloto (de propósito, não esquecimento):
 *  - Só atende telefones em `PILOTO_TELEFONES`. Qualquer outro número cai em
 *    `fora-do-piloto` sem gastar IA e sem enviar nada.
 *  - Roda em `after()` no webhook, nunca no caminho do 200. IA lenta não pode
 *    segurar a resposta da Meta (reentrega e desativa a inscrição).
 *  - A LLM redige e classifica; quem DECIDE acesso é consulta determinística
 *    via `tenantDb`. Prosa do modelo não libera nada.
 *  - Sem dono limpo, sem chute de tenant: com ambiguidade e sem pin, a resposta
 *    é genérica e pede a empresa, sem citar dado de nenhum tenant.
 *  - `SUPORTE_AUTO_PILOTO_EMPRESA_ID` (opcional, lido em runtime) fixa o tenant
 *    do piloto. É decisão explícita do operador, registrada em env, não palpite:
 *    sem ela o comportamento é fail-closed. Mesmo pinado, a pessoa só é
 *    individualizada quando o telefone casa com UMA linha daquela empresa.
 *  - Nenhum `createSupabaseAdmin()` aqui: contexto vai por `tenantDb`, o resto
 *    (ledger, degradação, demo-guard, envio) escreve dentro dos próprios módulos.
 *
 * Observabilidade: `taskKey: 'suporte_whatsapp'` + `correlationId = wamid` no
 * ledger; falhas viram `degradacao_log` (tipo reutilizado de propósito, ver
 * `degradar()`), nunca 500 do webhook.
 */

import { callAI } from '@/actions/ai-client';
import { parseJsonIA } from '@/lib/ai-json';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { gateEnvioDemo } from '@/lib/demo/envio-guard';
import { tenantDb } from '@/lib/tenant-db';
import { enviarTextoCloud } from '@/lib/whatsapp/cloud-api';
import { formasDoTelefone } from '@/lib/whatsapp/nono-digito';
import { filtroDeTelefone } from '@/lib/whatsapp/resolver-dono';
import { ehPedidoDeResumo, ehRecusa } from '@/lib/notifications/ver-gestor';

/** ledger + custo: de quem é cada chamada deste piloto. */
export const SUPORTE_AUTO_TASK_KEY = 'suporte_whatsapp';
/** Modelo do piloto (Google, via ramo `callGemini` do wrapper). Id EXATO do
 * catálogo: o ledger faz lookup exato e `gemini-3.8-flash-high` não existe
 * (o nível de raciocínio vai em `reasoningEffort`, não no id). */
export const SUPORTE_AUTO_MODEL = 'gemini-3.8-flash';
/** Teto folgado: o thinking do Gemini divide o orçamento de saída com o texto;
 * teto justo trunca a resposta ou devolve vazio. Suporte é curto, o teto cobre
 * o raciocínio `high` com folga. */
const SUPORTE_AUTO_MAX_TOKENS = 1500;
/** Teto da resposta que vai ao WhatsApp (qualidade, não limite da Meta). */
const SUPORTE_AUTO_RESPOSTA_MAX = 1500;
/** Anti-rajada por telefone (melhor esforço, em memória: cold start zera). */
const SUPORTE_AUTO_TETO_HORA = 10;

/**
 * Telefones do piloto, E.164 sem "+". Comparação por dígitos + variantes de
 * nono dígito: DDD 11 chega COM o nono, então `11973882303` precisa casar com
 * `5511973882303` em qualquer forma que o webhook entregar.
 */
const PILOTO_TELEFONES = ['5511973882303'];

function digitos(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}
/** Este `fromPhone` é do piloto? */
export function telefoneNoPiloto(fromPhone: string): boolean {
  const telefone = digitos(fromPhone);
  const candidatos = [telefone];
  // O webhook entrega E.164, mas testes operacionais e chamadas internas podem
  // passar o formato nacional. Complete o DDI antes de gerar a variante do
  // nono dígito; `formasDoTelefone` deliberadamente só alterna números E.164.
  if (!telefone.startsWith('55') && (telefone.length === 10 || telefone.length === 11)) {
    candidatos.push(`55${telefone}`);
  }
  const formas = new Set(candidatos.flatMap((candidato) => formasDoTelefone(candidato)));
  return PILOTO_TELEFONES.some((p) => formas.has(p) || formas.has(digitos(p)));
}

/** Pin de tenant do piloto. Lido em runtime: const de topo fixaria o default
 * antes do `.env` carregar em script/worker. Ausente = fail-closed. */
function pinPilotoEmpresaId(): string | null {
  const v = (process.env.SUPORTE_AUTO_PILOTO_EMPRESA_ID || '').trim();
  return v || null;
}

// Reentregas da Meta (mesmo wamid) e rajada por telefone. Em memória de
// propósito: é dedup de processo, não garantia distribuída. A idempotência
// entre processos vem do `dedupeKey` no envio.
const wamidsVistos = new Map<string, number>();
const porTelefone = new Map<string, number[]>();

function pruneAgora(now: number): void {
  for (const [k, at] of wamidsVistos) {
    if (now - at > 24 * 3600 * 1000) wamidsVistos.delete(k);
  }
  for (const [k, ats] of porTelefone) {
    const recentes = ats.filter((t) => now - t < 3600 * 1000);
    if (recentes.length) porTelefone.set(k, recentes);
    else porTelefone.delete(k);
  }
}

export interface EntradaSuporte {
  fromPhone: string;
  waMessageId: string;
  tipo: string;
  texto: string | null;
  /** Número que RECEBEU (para onde a pessoa escreveu): a resposta sai por ele. */
  numeroId: string | null;
  empresaId: string | null;
  empresaNome: string | null;
  colaboradorId: string | null;
  ambiguidade: string | null;
}

export interface Elegibilidade {
  elegivel: boolean;
  motivo: string;
}

/** Filtros baratos antes de gastar IA. Puro e testável sem banco. */
export function elegivelParaAuto(e: EntradaSuporte, now = Date.now()): Elegibilidade {
  if (!telefoneNoPiloto(e.fromPhone)) return { elegivel: false, motivo: 'fora-do-piloto' };
  if (e.tipo !== 'text' && e.tipo !== 'button') return { elegivel: false, motivo: 'tipo-sem-texto' };
  if (!e.texto || !e.texto.trim()) return { elegivel: false, motivo: 'texto-vazio' };
  // VER e recusa têm fluxo próprio no webhook (o VER inclusive já responde).
  // Responder de novo seria mensagem dupla para a mesma palavra.
  if (ehPedidoDeResumo(e.texto) || ehRecusa(e.texto)) return { elegivel: false, motivo: 'fluxo-proprio' };
  pruneAgora(now);
  if (wamidsVistos.has(e.waMessageId)) return { elegivel: false, motivo: 'reentrega' };
  const usos = porTelefone.get(digitos(e.fromPhone)) ?? [];
  if (usos.length >= SUPORTE_AUTO_TETO_HORA) return { elegivel: false, motivo: 'teto-piloto' };
  return { elegivel: true, motivo: 'ok' };
}

function marcarUso(e: EntradaSuporte, now: number): void {
  wamidsVistos.set(e.waMessageId, now);
  const k = digitos(e.fromPhone);
  porTelefone.set(k, [...(porTelefone.get(k) ?? []), now]);
}

/** Limpa o estado em memória (testes). */
export function resetSuporteAutoMemoria(): void {
  wamidsVistos.clear();
  porTelefone.clear();
}

const SISTEMA_SUPORTE = `Você é o atendimento automático da Vertho no WhatsApp (piloto).
REGRAS DURAS:
- Identifique-se como atendimento automático na primeira frase quando útil; nunca finja ser humano.
- Responda em PT-BR, curto, estilo WhatsApp (ideal até 600 caracteres, nunca acima de 1500).
- Use SÓ o CONTEXTO fornecido. Dado que não está nele, não existe: não invente nome, empresa, cargo, semana, pendência, link ou prazo.
- CONTEXTO sem tenant (modo generico): dê orientação geral + peça o nome da empresa para consultar a situação. Não cite nenhuma empresa.
- Nunca devolva código, token, senha ou link com token. Link de acesso, só o genérico https://app.vertho.ai/entrar
- Acesso/link expirado: explique o passo a passo (pedir novo link em /entrar) e ofereça encaminhar à equipe.
- Se o pedido exige dado que você não tem, ação com conta, ou você não entendeu: precisa_humano=true.
- Saída ESTRITAMENTE neste JSON, sem cerca de código: {"intencao":"acesso|link|pendencia|posicao|duvida|outro","resposta":"...","precisa_humano":false,"acao":"responder|escalar"}`;

const CONTENCAO =
  'Aqui é o atendimento automático da Vertho. Recebi sua mensagem e encaminhei para a equipe, que responde por aqui mesmo. Se quiser, escreva com mais detalhes o que você precisa (acesso, link ou pendência).';

const INTENCOES = new Set(['acesso', 'link', 'pendencia', 'posicao', 'duvida', 'outro']);

interface SaidaIA {
  intencao: string;
  resposta: string;
  precisa_humano: boolean;
  acao: string;
}

function validarSaidaIA(bruto: unknown): SaidaIA | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const s = bruto as Record<string, unknown>;
  const resposta = String(s.resposta ?? '').trim();
  if (!resposta || resposta.length > SUPORTE_AUTO_RESPOSTA_MAX) return null;
  if (!INTENCOES.has(String(s.intencao ?? ''))) return null;
  if (typeof s.precisa_humano !== 'boolean') return null;
  if (s.acao !== 'responder' && s.acao !== 'escalar') return null;
  return { intencao: String(s.intencao), resposta, precisa_humano: s.precisa_humano, acao: s.acao };
}

/**
 * Reutilização deliberada de tipo no piloto: `lib/degradacao.ts` no disco está
 * atrás do remoto (faltam tipos novos lá), então criar `SUPORTE_AUTO_FALHOU`
 * agora seria hunk de conflito no cherry-pick. O `detalhe.fase` distingue a
 * origem; na graduação, criar o tipo próprio e trocar aqui.
 */
async function degradar(
  fase: string,
  e: EntradaSuporte,
  motivo: string,
  empresaId: string | null,
): Promise<void> {
  await registrarDegradacao({
    fluxo: 'envio',
    tipo: DEGRADACAO.WHATSAPP_STATUS_PERDIDO,
    chave: `suporte-auto:${e.waMessageId}`,
    empresaId,
    colaboradorId: e.colaboradorId,
    severidade: 'aviso',
    detalhe: { fase, motivo: motivo.slice(0, 200), piloto: true },
  });
}

interface Pessoa {
  nome: string | null;
  cargo: string | null;
}

/** Identidade via tenantDb (escopado; o guard reconhece o receiver `tdb`). */
async function pessoaDoTenant(
  empresaId: string,
  colaboradorId: string | null,
  fromPhone: string,
): Promise<{ pessoa: Pessoa | null; problemaLeitura: string | null }> {
  try {
    const tdb = tenantDb(empresaId);
    if (colaboradorId) {
      const { data, error } = await tdb
        .from('colaboradores')
        .select('id, nome_completo, cargo')
        .eq('id', colaboradorId)
        .maybeSingle();
      if (error) return { pessoa: null, problemaLeitura: error.message };
      if (!data) return { pessoa: null, problemaLeitura: null };
      return {
        pessoa: {
          nome: (data as any)?.nome_completo ?? null,
          cargo: (data as any)?.cargo ?? null,
        },
        problemaLeitura: null,
      };
    }
    // Modo pin sem pessoa individualizada: casa pelo telefone dentro do tenant.
    // Uma linha = pessoa; zero ou várias = sem individualização, sem chute.
    const { data, error } = await tdb
      .from('colaboradores')
      .select('id, nome_completo, cargo')
      .or(filtroDeTelefone(fromPhone));
    if (error) return { pessoa: null, problemaLeitura: error.message };
    const linhas = (data ?? []) as Array<any>;
    if (linhas.length !== 1) return { pessoa: null, problemaLeitura: null };
    return {
      pessoa: { nome: linhas[0]?.nome_completo ?? null, cargo: linhas[0]?.cargo ?? null },
      problemaLeitura: null,
    };
  } catch (err: any) {
    return { pessoa: null, problemaLeitura: String(err?.message ?? err) };
  }
}

export interface ResultadoSuporte {
  enviou: boolean;
  motivo: string;
}

/**
 * Executa o piloto para UMA mensagem já gravada. Nunca lança: todo fracasso
 * vira `{enviou:false}` + degradação, para o webhook seguir com 200 e a equipe
 * assumir pela inbox.
 */
export async function executarSuporteAuto(e: EntradaSuporte): Promise<ResultadoSuporte> {
  const now = Date.now();
  const el = elegivelParaAuto(e, now);
  if (!el.elegivel) return { enviou: false, motivo: el.motivo };
  marcarUso(e, now);

  const pin = pinPilotoEmpresaId();
  // Tenant efetivo: resolução limpa vence; pin é fallback explícito do piloto.
  const empresaEfetiva = e.empresaId ?? pin;
  const modo = e.empresaId ? 'tenant' : pin ? 'tenant-piloto' : 'generico';

  if (empresaEfetiva) {
    const gate = await gateEnvioDemo(empresaEfetiva);
    if (gate.blocked) {
      console.log(`[suporte-auto] tenant demo, sem resposta automática (${empresaEfetiva})`);
      return { enviou: false, motivo: 'tenant-demo' };
    }
  }

  let pessoa: Pessoa | null = null;
  if (empresaEfetiva) {
    const ctx = await pessoaDoTenant(empresaEfetiva, e.empresaId ? e.colaboradorId : null, e.fromPhone);
    if (ctx.problemaLeitura) {
      await degradar('leitura-contexto', e, ctx.problemaLeitura, empresaEfetiva);
      const r = await enviarTextoCloud(
        { phone: e.fromPhone, texto: CONTENCAO },
        {
          motivo: 'suporte-auto',
          empresaId: empresaEfetiva,
          colaboradorId: e.colaboradorId,
          dedupeKey: `suporte-auto:${e.waMessageId}`,
          numeroId: e.numeroId,
        },
      );
      return r.ok
        ? { enviou: true, motivo: 'contencao-leitura' }
        : { enviou: false, motivo: `falha-envio:${r.reason ?? '?'}` };
    }
    pessoa = ctx.pessoa;
  }

  const contexto = {
    modo,
    empresa: modo === 'tenant' ? e.empresaNome : null,
    pessoa,
    ambiguidade: modo === 'generico' ? (e.ambiguidade ?? 'sem-dono') : null,
  };
  const usuario = `MENSAGEM: ${e.texto?.trim()}\nCONTEXTO: ${JSON.stringify(contexto)}`;

  let saida: SaidaIA | null = null;
  try {
    const bruto = await callAI(
      SISTEMA_SUPORTE,
      usuario,
      { model: SUPORTE_AUTO_MODEL },
      SUPORTE_AUTO_MAX_TOKENS,
      {
        taskKey: SUPORTE_AUTO_TASK_KEY,
        empresaId: empresaEfetiva,
        colaboradorId: e.colaboradorId,
        correlationId: e.waMessageId,
        reasoningEffort: 'high',
        timeoutMs: 45000,
      },
    );
    try {
      saida = validarSaidaIA(parseJsonIA(bruto));
    } catch (err: any) {
      await degradar('parse-ia', e, String(err?.message ?? err), empresaEfetiva);
    }
  } catch (err: any) {
    await degradar('chamada-ia', e, String(err?.message ?? err), empresaEfetiva);
  }

  // IA fora do contrato ou pedindo humano: contenção fixa (não o texto do modelo).
  const texto = saida && !saida.precisa_humano && saida.acao === 'responder' ? saida.resposta : CONTENCAO;
  const motivoOk = !saida ? 'contencao-parse' : saida.precisa_humano || saida.acao !== 'responder' ? 'contencao-escala' : `auto:${saida.intencao}`;

  const r = await enviarTextoCloud(
    { phone: e.fromPhone, texto },
    {
      motivo: 'suporte-auto',
      empresaId: empresaEfetiva,
      colaboradorId: e.colaboradorId,
      dedupeKey: `suporte-auto:${e.waMessageId}`,
      numeroId: e.numeroId,
    },
  );
  if (!r.ok) {
    // Envio falhou (ex.: janela 131047): sem segunda tentativa aqui, um POST com
    // timeout pode já ter chegado. A equipe assume pela inbox.
    await degradar('envio', e, r.reason ?? 'falha desconhecida', empresaEfetiva);
    return { enviou: false, motivo: `falha-envio:${r.reason ?? '?'}` };
  }
  return { enviou: true, motivo: motivoOk };
}
