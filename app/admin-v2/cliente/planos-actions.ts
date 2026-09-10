'use server';

/**
 * Aviso de PLANO PRONTO pela tela — o disparo que não tinha operador.
 *
 * O cron `avisar_planos` só alcança relatórios posteriores ao `CORTE_ISO`
 * (16/08), e o corte é fixo de propósito. Quem ficou do lado de fora — os 34 de
 * Macaé, gerados em 15/08 — não tinha caminho nenhum: nem cron, nem tela. A
 * única saída era `curl` no endpoint do cron com o `CRON_SECRET`, que é
 * *Sensitive* na Vercel e ninguém consegue ler.
 *
 * Aqui a autorização é a SESSÃO do admin (`requireAdminAction`), não um segredo
 * compartilhado, e a ação fica no `admin_audit_log` com quem clicou.
 *
 * 🔑 Por que esta tela ignora o corte: ele existe para o AUTOMÁTICO, que roda
 * sem ninguém olhando. Aqui há prévia com números e um humano confirmando, e a
 * régua que importa passa a ser a idempotência — `notification_deliveries` com
 * `kind='plano'`, que impede segunda mensagem para a mesma pessoa.
 */
import { requireAdminAction } from '@/lib/auth/action-context';
import { createSupabaseAdmin } from '@/lib/supabase';
import { logAdminAction } from '@/lib/audit';
import { avisarPlanosProntos } from '@/lib/notifications/avisar-plano-pronto';
import { maxPorDisparo } from '@/lib/whatsapp/cadencia';

/** Alcança todo o histórico do tenant; quem filtra é a idempotência. */
const SEM_CORTE = '1970-01-01T00:00:00.000Z';

export interface PreviaPlanos {
  slug: string;
  /** Quantos receberiam AGORA. */
  elegiveis: number;
  /** Já avisados antes (não recebem de novo). */
  jaAvisados: number;
  /** Com plano mas sem telefone — lacuna de cadastro, não falha de envio. */
  semTelefone: number;
  /** Total de planos no tenant. */
  comPlano: number;
}

async function slugDe(sb: any, empresaId: string): Promise<string> {
  const { data, error } = await sb.from('empresas').select('slug').eq('id', empresaId).maybeSingle();
  if (error) throw new Error(`empresa: ${error.message}`);
  if (!data?.slug) throw new Error('empresa não encontrada');
  return data.slug as string;
}

/** Conta sem enviar nada. É o que a tela mostra antes de habilitar o botão. */
export async function previaAvisoPlanos(empresaId: string): Promise<PreviaPlanos> {
  await requireAdminAction('assessments.dispatch');
  const sb = createSupabaseAdmin();
  const slug = await slugDe(sb, empresaId);

  const r = await avisarPlanosProntos({
    apenasSlug: slug, corteIso: SEM_CORTE, executar: false, teto: 0,
  });

  const { count } = await sb.from('relatorios')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('tipo', 'individual');

  return {
    slug,
    elegiveis: r.elegiveis,
    jaAvisados: r.repetidos,
    semTelefone: r.semTelefone,
    comPlano: count ?? 0,
  };
}

/**
 * Envia. O `teto` limita a rodada.
 *
 * O 40 daqui era derivado do intervalo: a 6s por mensagem, 40 levavam ~4 min e
 * era o que cabia numa server action. Com a política em 1s (31/08) esse cálculo
 * não sustenta mais um literal próprio — 120 saem em 2 min, dentro do mesmo
 * orçamento. Então o default passa a ser o **teto de volume da política**
 * (`maxPorDisparo`), que é a decisão de "quantas mensagens não solicitadas de
 * uma vez", e não uma tradução do relógio.
 *
 * 🔑 O corte por TEMPO continua existindo e é do paceador, não daqui: se a
 * rodada não couber, ele para e devolve quem sobrou em `naoAlcancados`. A
 * idempotência por `kind='plano'` faz o segundo clique continuar de onde parou.
 */
export async function dispararAvisoPlanos(empresaId: string, teto = maxPorDisparo()) {
  const ctx = await requireAdminAction('assessments.dispatch');
  const sb = createSupabaseAdmin();
  const slug = await slugDe(sb, empresaId);

  let r: Awaited<ReturnType<typeof avisarPlanosProntos>> | null = null;
  try {
    r = await avisarPlanosProntos({
      apenasSlug: slug, corteIso: SEM_CORTE, executar: true, teto,
    });
    return { success: true as const, ...r };
  } catch (e: any) {
    return { success: false as const, error: e?.message || 'falha ao disparar' };
  } finally {
    // Best-effort e no `finally`: disparo que saiu pela metade é justamente o
    // que precisa estar no log.
    await logAdminAction({
      adminEmail: (ctx as any)?.email || 'desconhecido',
      acao: 'envio.aviso_plano',
      empresaId, empresaSlug: slug,
      alvo: r ? `${r.enviados} enviado(s)` : 'falha',
      detalhes: { teto, ...(r || {}) },
      resultado: !r ? 'erro' : r.falhas > 0 ? 'parcial' : 'ok',
    });
  }
}
