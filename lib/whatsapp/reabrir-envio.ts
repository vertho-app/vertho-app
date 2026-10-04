/**
 * Reabrir o envio da cadência quando a Meta diz que a mensagem FALHOU (R-94,
 * 04/10/2026).
 *
 * 🔴 O DEFEITO. A Cloud API aceita o template de forma síncrona e o cron carimba o
 * canal na hora (`ultima_pilulaN_whatsapp_em`). Se a Meta aceitou e DEPOIS reportou
 * `failed` pelo webhook (template pausado, destino inalcançável, taxa), o webhook só
 * gravava `failed_at` em `notification_deliveries`: o carimbo seguia dizendo "entregue",
 * o envio nunca voltava a ser pendente e a recuperação não tinha o que recuperar. A
 * pessoa ficava sem a mensagem e o painel contava a entrega como feita.
 *
 * Aqui: `failed` apaga o carimbo daquela coluna (só se for o carimbo DESTE envio), o que
 * devolve o envio ao estado "pendente" e deixa a janela de recuperação refazê-lo em
 * `lib/fase4/janelas.ts`. A repetição é limitada pela janela de 2 dias.
 *
 * O que NÃO se reabre: falha do DESTINO (número sem WhatsApp e afins). Repetir mandaria a
 * mesma mensagem ao mesmo número inválido, e a Meta pune a reincidência na qualidade da
 * conta, que é compartilhada por todos os tenants. Essas ficam registradas, para quem
 * cuida do cadastro.
 *
 * Fora de `'use server'` de propósito.
 */
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

/**
 * Códigos da Meta em que o problema é do DESTINO e repetir não ajuda: 131026 (mensagem não
 * entregável: sem WhatsApp, versão antiga, bloqueou), 133010 (número não registrado),
 * 131030 (destinatário fora da lista permitida), 131021 (destinatário igual ao remetente).
 * Lista curta e conservadora: o que não está aqui é tentado de novo, dentro da janela.
 */
export const CODIGOS_FALHA_PERMANENTE = ['131026', '133010', '131030', '131021'] as const;

/** `erro` vem de `statuses[].errors[0]` como `título (código)`. */
export function falhaPermanente(erro: string | null | undefined): boolean {
  const codigo = /\((\d{3,6})\)\s*$/.exec(String(erro ?? ''))?.[1];
  return !!codigo && (CODIGOS_FALHA_PERMANENTE as readonly string[]).includes(codigo);
}

const COLUNAS_DE_CARIMBO = [
  'ultima_pilula1_whatsapp_em',
  'ultima_pilula2_whatsapp_em',
  'ultima_evidencia_whatsapp_em',
] as const;
export type ColunaDeCarimbo = (typeof COLUNAS_DE_CARIMBO)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A coluna de carimbo de `fase4_envios` que uma entrega de cadência ocupa, lida do
 * `dedupe_key` que o cron grava (`<coluna>:<envio>`, `missao:<envio>`,
 * `avaliacao-final:<envio>:<semana>`, `pendencia:<envio>:<dia>`). Entrega que não é de
 * cadência (login, inbox, nudge de inatividade, push) devolve `null`: não há carimbo a
 * reabrir.
 */
export function carimboDaEntrega(dedupeKey: string | null | undefined): { coluna: ColunaDeCarimbo; envioId: string } | null {
  const partes = String(dedupeKey ?? '').split(':');
  const [prefixo, envioId] = partes;
  if (!envioId || !UUID.test(envioId)) return null;
  if ((COLUNAS_DE_CARIMBO as readonly string[]).includes(prefixo)) return { coluna: prefixo as ColunaDeCarimbo, envioId };
  if (prefixo === 'missao' || prefixo === 'avaliacao-final') return { coluna: 'ultima_pilula1_whatsapp_em', envioId };
  if (prefixo === 'pendencia') return { coluna: 'ultima_pilula2_whatsapp_em', envioId };
  return null;
}

export interface EntregaFalha {
  id?: string;
  dedupe_key?: string | null;
  empresa_id?: string | null;
  created_at?: string | null;
}

export type ResultadoReabertura = 'reaberto' | 'nao-aplica' | 'permanente' | 'falhou';

/** Folga entre o carimbo do cron e o `created_at` da entrega: são gravados com segundos de diferença. */
const FOLGA_DO_CARIMBO_MS = 10 * 60_000;

/**
 * Aplica o `failed` à cadência. NUNCA lança: roda dentro do webhook, que precisa
 * responder 200 sempre (a Meta reentrega em laço e acaba desativando a inscrição).
 */
export async function reabrirEnvioPorFalha(sb: any, entrega: EntregaFalha, erro: string | null | undefined): Promise<ResultadoReabertura> {
  try {
    const alvo = carimboDaEntrega(entrega.dedupe_key);
    // Sem empresa não há como escopar o update (o guard de tenant exige): não toca.
    if (!alvo || !entrega.empresa_id) return 'nao-aplica';

    const chave = `${alvo.envioId}:${alvo.coluna}`;
    if (falhaPermanente(erro)) {
      await registrarDegradacao({
        fluxo: 'envio',
        tipo: DEGRADACAO.WHATSAPP_FALHA_DE_ENTREGA,
        chave,
        empresaId: entrega.empresa_id,
        severidade: 'aviso',
        detalhe: { estado: 'permanente', coluna: alvo.coluna, erro: String(erro ?? '') },
      }, sb);
      return 'permanente';
    }

    // Só apaga o carimbo DESTE envio: um carimbo posterior (a recuperação que deu certo) é de
    // outra mensagem e um `failed` atrasado da primeira não pode apagá-lo.
    const criada = entrega.created_at ? Date.parse(entrega.created_at) : NaN;
    const limite = new Date((Number.isFinite(criada) ? criada : Date.now()) + FOLGA_DO_CARIMBO_MS).toISOString();
    const { data, error } = await sb.from('fase4_envios')
      .update({ [alvo.coluna]: null })
      .eq('id', alvo.envioId)
      .eq('empresa_id', entrega.empresa_id)
      .lte(alvo.coluna, limite)
      .select('id');
    if (error) {
      await registrarDegradacao({
        fluxo: 'envio',
        tipo: DEGRADACAO.WHATSAPP_FALHA_DE_ENTREGA,
        chave,
        empresaId: entrega.empresa_id,
        severidade: 'aviso',
        detalhe: { estado: 'nao-reaberto', coluna: alvo.coluna, erro: String(erro ?? ''), motivo: error.message },
      }, sb);
      return 'falhou';
    }
    if (!data?.length) return 'nao-aplica';

    await registrarDegradacao({
      fluxo: 'envio',
      tipo: DEGRADACAO.WHATSAPP_FALHA_DE_ENTREGA,
      chave,
      empresaId: entrega.empresa_id,
      severidade: 'aviso',
      detalhe: { estado: 'reaberto', coluna: alvo.coluna, erro: String(erro ?? '') },
    }, sb);
    return 'reaberto';
  } catch (e: any) {
    console.error('[reabrir-envio] falhou (o webhook segue):', e?.message || e);
    return 'falhou';
  }
}
