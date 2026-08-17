/**
 * Avisa quem teve o PLANO (relatório individual) gerado — e só quem for NOVO.
 *
 * 🔑 O QUE É "PDI" AQUI (decidido em 16/08/2026)
 * ─────────────────────────────────────────────
 * É o **relatório individual** (`relatorios`, `tipo='individual'`), que já traz
 * `blueprint_objetivos` (objetivo + competência + ação principal) e, por
 * competência, um `sprint` com foco de 30 dias, ação principal, ação de apoio,
 * checklist, ritual e evidência esperada — tudo ancorado nas respostas reais da
 * pessoa.
 *
 * A tabela `pdis` **não** é a fonte: ela é código morto da fase 4, com um único
 * escritor (`gerarPDIs`) que nenhuma tela jamais chamou. O plano que ela geraria
 * (níveis, prazos, checkpoints) é mais POBRE que o que já está no relatório, e
 * não conhece as respostas de ninguém. Ver `docs/TEMPLATES-WHATSAPP.md`.
 *
 * 🔴 POR QUE ISTO NÃO VIVE DENTRO DA GERAÇÃO
 * ──────────────────────────────────────────
 * Relatório individual é gerado em LOTE: Macaé produziu 34 entre 03:03 e 03:41
 * de 15/08. Um envio por relatório gerado seria uma rajada no mesmo número que a
 * Meta restringiu em 11/08 (155 mensagens a 2s derrubaram o canal em 1min47).
 * Aqui o envio é deliberado, espaçado e com teto por execução.
 *
 * ⚠️ CORTE FIXO, e é ele que cumpre "só para os próximos": nenhum relatório
 * anterior a `CORTE_ISO` é elegível, nunca — nem se o cron rodar pela primeira
 * vez meses depois. Os 38 de Ibipeba (13-20/07) e os 34 de Macaé (15/08) já
 * foram baixados pelas pessoas e não devem ser reanunciados.
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { enviarPorTemplate } from '@/lib/notifications/pilula-template';
import { tenantUrl } from '@/lib/domain';

/**
 * Momento em que o aviso foi ligado. Relatório mais antigo que isto é passado —
 * e passado não se reanuncia.
 *
 * Constante e não `now()`: um corte relativo faria a elegibilidade depender de
 * QUANDO o cron rodou, o que é irreprodutível e silencioso.
 */
export const CORTE_ISO = '2026-08-16T23:59:00.000Z';

/** Teto por execução. Conservador de propósito: leva pequena, medir, repetir. */
const TETO_PADRAO = 25;
/** Espaçamento entre mensagens. A cadência do canal é política, não detalhe. */
const INTERVALO_MS = 6_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CandidatoPlano {
  colaboradorId: string;
  nome: string;
  telefone: string | null;
  geradoEm: string;
}

/**
 * Quem deve ser avisado, decidido em CÓDIGO PURO (testável sem banco).
 *
 * As três exclusões são diferentes e por isso contadas separadamente: passado
 * (corte), já avisado (idempotência) e sem telefone (lacuna de cadastro, que não
 * é sucesso nem falha de envio).
 */
export function decidirAvisos(
  candidatos: CandidatoPlano[],
  jaAvisados: Set<string>,
  corteIso: string = CORTE_ISO,
): { enviar: CandidatoPlano[]; antigos: number; repetidos: number; semTelefone: number } {
  let antigos = 0, repetidos = 0, semTelefone = 0;
  const enviar: CandidatoPlano[] = [];

  for (const c of candidatos || []) {
    if (!c.geradoEm || c.geradoEm <= corteIso) { antigos++; continue; }
    if (jaAvisados.has(c.colaboradorId)) { repetidos++; continue; }
    if (!c.telefone) { semTelefone++; continue; }
    enviar.push(c);
  }
  return { enviar, antigos, repetidos, semTelefone };
}

/**
 * Roda para TODAS as empresas não-demo. Nunca lança: um aviso que derruba o cron
 * troca uma notificação por um apagão.
 */
export async function avisarPlanosProntos(opts: { teto?: number; executar?: boolean } = {}) {
  const teto = opts.teto ?? TETO_PADRAO;
  const executar = opts.executar !== false;
  const sb = createSupabaseAdmin();
  const resumo = { elegiveis: 0, enviados: 0, falhas: 0, antigos: 0, repetidos: 0, semTelefone: 0 };

  const { data: empresas, error: eE } = await sb.from('empresas')
    .select('id, slug, nome, is_demo').or('is_demo.is.null,is_demo.eq.false');
  if (eE) { console.error('[avisar-plano] empresas:', eE.message); return resumo; }

  for (const emp of (empresas || []) as any[]) {
    // Só o que nasceu depois do corte já filtra no banco — o `decidirAvisos`
    // refaz a checagem porque a régua tem que valer mesmo se a query mudar.
    const { data: rels, error: eR } = await sb.from('relatorios')
      .select('colaborador_id, gerado_em')
      .eq('empresa_id', emp.id).eq('tipo', 'individual')
      .gt('gerado_em', CORTE_ISO)
      .not('colaborador_id', 'is', null);
    if (eR) { console.error(`[avisar-plano] relatorios ${emp.slug}:`, eR.message); continue; }
    if (!rels?.length) continue;

    const ids = [...new Set(rels.map((r: any) => r.colaborador_id))];
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, whatsapp, telefone')
      .eq('empresa_id', emp.id).in('id', ids);
    const porId = new Map((colabs || []).map((c: any) => [c.id, c]));

    const { data: jaFoi } = await sb.from('notification_deliveries')
      .select('colaborador_id')
      .eq('empresa_id', emp.id).eq('kind', 'plano').eq('status', 'sucesso');
    const avisados = new Set((jaFoi || []).map((d: any) => d.colaborador_id));

    const candidatos: CandidatoPlano[] = rels.map((r: any) => {
      const c = porId.get(r.colaborador_id) as any;
      return {
        colaboradorId: r.colaborador_id,
        nome: (c?.nome_completo || 'Colaborador').split(' ')[0],
        telefone: c?.whatsapp || c?.telefone || null,
        geradoEm: r.gerado_em,
      };
    });

    const d = decidirAvisos(candidatos, avisados);
    resumo.antigos += d.antigos;
    resumo.repetidos += d.repetidos;
    resumo.semTelefone += d.semTelefone;
    resumo.elegiveis += d.enviar.length;

    const baseUrl = tenantUrl(emp.slug);
    for (const alvo of d.enviar.slice(0, Math.max(0, teto - resumo.enviados))) {
      if (!executar) continue;
      const r = await enviarPorTemplate('plano', {
        telefone: alvo.telefone!, nome: alvo.nome,
        semana: 1, tema: '', slug: emp.slug, baseUrl,
        formato: null, pilula: null,
        empresaId: emp.id, colaboradorId: alvo.colaboradorId,
        dedupeKey: `plano:${alvo.colaboradorId}`,
      });
      if (r.ok) resumo.enviados++; else resumo.falhas++;
      await dormir(INTERVALO_MS);
    }
  }

  console.log(`[avisar-plano] ${JSON.stringify(resumo)}`);
  return resumo;
}
