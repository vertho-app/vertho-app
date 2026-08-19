/* eslint-disable */
/**
 * Convite ao ASSESSMENT DE COMPETÊNCIAS por WhatsApp (`avaliacao_pendente`, UTILITY).
 *
 * ALVO: quem já fez o mapeamento comportamental e **nunca iniciou** a avaliação
 * — o degrau exato onde a jornada para. Medido em 19/08/2026 nos professores de
 * Macaé: dos 156, 41 se mapearam, 22 responderam, e 19 ficaram no meio. Quem
 * chega a entrar conclui (41 de 42 logins viraram mapeamento), então o que falta
 * a esses 19 é o lembrete, não a tela.
 *
 * POR QUE UM SCRIPT, E NÃO UM GATILHO
 * ───────────────────────────────────
 * O mesmo motivo do `_boas-vindas-turma.ts`: quem decide cobrar uma turma é uma
 * pessoa. Um gatilho automático cobraria também quem se mapeou ontem, quem está
 * em tenant de outra fase e quem entrou por engano no cadastro.
 *
 * IDEMPOTENTE: quem já tem entrega `kind='avaliacao_pendente'` no WhatsApp é
 * pulado. Rodar duas vezes não manda duas. (`--reenviar` ignora a guarda, para o
 * caso deliberado de segunda cobrança.)
 *
 * Uso:
 *   npx tsx scripts/_convite-avaliacao.ts --empresa=macae                 → dry-run
 *   npx tsx scripts/_convite-avaliacao.ts --empresa=macae --enviar
 *   ... --cargo=Professor   (filtra por cargo; substring, case-insensitive)
 *   ... --limite=20         (teto por execução; default: o da política de lote)
 *   ... --reenviar          (ignora a idempotência — use com intenção)
 */
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { enviarTemplateCloud, cloudApiConfigurada } from '@/lib/whatsapp/cloud-api';
import { contratoDoTemplate } from '@/lib/notifications/pilula-template';
import { tenantUrl } from '@/lib/domain';
import { criarPaceadorSincrono, maxPorDisparo } from '@/lib/whatsapp/cadencia';
import { hasDiscMapeado } from '@/lib/disc-status';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const SLUG = arg('empresa');
const CARGO = arg('cargo');
const TEMPLATE = arg('template') || 'avaliacao_pendente';
const LIMITE = Number(arg('limite')) || maxPorDisparo();
const ENVIAR = process.argv.includes('--enviar');
const REENVIAR = process.argv.includes('--reenviar');

/** Primeiro nome apresentável — cadastro em CAIXA ALTA vira "Maria", não "MARIA". */
function primeiroNome(completo: string | null): string {
  const bruto = String(completo || '').trim().split(/\s+/)[0] || '';
  if (!bruto) return 'Olá';
  if (bruto !== bruto.toUpperCase()) return bruto;
  return bruto.charAt(0) + bruto.slice(1).toLowerCase();
}

async function main() {
  if (!SLUG) throw new Error('--empresa=<slug> é obrigatório (disparo em massa não roda sem alvo explícito)');
  if (!cloudApiConfigurada()) throw new Error('Cloud API não configurada no .env.local');

  const montar = contratoDoTemplate(TEMPLATE);
  if (!montar) throw new Error(`template "${TEMPLATE}" não tem contrato em CONTRATOS — mandar parâmetros no formato errado entrega mensagem sem sentido`);

  const sb = createSupabaseAdmin();

  const { data: empresa, error: eE } = await sb.from('empresas')
    .select('id, slug, nome, is_demo').eq('slug', SLUG).maybeSingle();
  if (eE) throw new Error(`empresas: ${eE.message}`);
  if (!empresa) throw new Error(`empresa ${SLUG} não encontrada`);
  if ((empresa as any).is_demo) throw new Error('tenant de demonstração não envia comunicação real');

  const empresaId = (empresa as any).id as string;
  const baseUrl = tenantUrl((empresa as any).slug);

  const { data: colabs, error: eC } = await sb.from('colaboradores')
    .select('id, nome_completo, cargo, whatsapp, telefone, perfil_dominante, d_natural, i_natural, s_natural, c_natural')
    .eq('empresa_id', empresaId);
  if (eC) throw new Error(`colaboradores: ${eC.message}`);

  const doCargo = (colabs || []).filter((c: any) =>
    !CARGO || new RegExp(CARGO, 'i').test(String(c.cargo || '')));
  const mapeados = doCargo.filter(hasDiscMapeado);

  // Quem JÁ respondeu alguma competência sai do alvo. A régua é ter linha em
  // `respostas` com `r1` — linha sem resposta seria "abriu e não respondeu", que
  // é justamente quem ainda precisa do lembrete.
  const respondentes = new Set<string>();
  const ids = mapeados.map((c: any) => c.id);
  for (let i = 0; i < ids.length; i += 100) {
    // `.eq('empresa_id')` na mesma cadeia: o script roda em service-role, que
    // tem BYPASSRLS — filtrar só por `colaborador_id` funcionaria hoje e leria
    // outro tenant no dia em que a mesma pessoa existir em dois.
    const { data, error } = await sb.from('respostas')
      .select('colaborador_id, r1')
      .eq('empresa_id', empresaId)
      .in('colaborador_id', ids.slice(i, i + 100));
    if (error) throw new Error(`respostas: ${error.message}`);
    for (const r of (data as any[]) || []) if (r.r1) respondentes.add(r.colaborador_id);
  }

  // Já receberam este convite? A telemetria é a fonte — rodar de novo não pode mandar duas.
  const { data: jaForam, error: eJ } = await sb.from('notification_deliveries')
    .select('colaborador_id').eq('empresa_id', empresaId)
    .eq('kind', 'avaliacao_pendente').eq('channel', 'whatsapp');
  if (eJ) throw new Error(`telemetria: ${eJ.message}`);
  const recebidos = new Set((jaForam || []).map((d: any) => d.colaborador_id));

  const fila = mapeados
    .map((c: any) => ({ ...c, fone: c.whatsapp || c.telefone }))
    .filter((c: any) => !respondentes.has(c.id))
    .filter((c: any) => c.fone)
    .filter((c: any) => REENVIAR || !recebidos.has(c.id));

  const semFone = mapeados.filter((c: any) => !respondentes.has(c.id) && !(c.whatsapp || c.telefone));

  console.log(`${empresa.nome}${CARGO ? ` · cargo ~ "${CARGO}"` : ''}`);
  console.log(`  no escopo: ${doCargo.length} · com mapeamento comportamental: ${mapeados.length} · destes, já responderam o assessment: ${respondentes.size}`);
  console.log(`  ALVO (mapeado, sem assessment, com telefone, sem convite): ${fila.length}`);
  if (recebidos.size) console.log(`  já receberam este convite antes: ${recebidos.size}${REENVIAR ? ' (--reenviar: incluídos assim mesmo)' : ' (pulados)'}`);
  if (semFone.length) console.log(`  ⚠️ sem telefone, ficam de fora: ${semFone.length}`);
  console.log(`  template: ${TEMPLATE} · instituição no {{2}}: "${empresa.nome}" · link: ${baseUrl}/dashboard/assessment`);

  const lote = fila.slice(0, LIMITE);
  if (lote.length < fila.length) console.log(`  ⚠️ teto de ${LIMITE}: ${fila.length - lote.length} ficam para a próxima execução`);
  if (!lote.length) { console.log('\nnada a enviar.'); return; }

  const args = (c: any) => ({
    telefone: c.fone, nome: primeiroNome(c.nome_completo), semana: 1, tema: '',
    slug: (empresa as any).slug, baseUrl, instituicao: (empresa as any).nome,
  }) as any;

  if (!ENVIAR) {
    console.log(`\nPRÉVIA (${Math.min(5, lote.length)} de ${lote.length}):`);
    for (const c of lote.slice(0, 5)) {
      const { params } = montar(args(c));
      console.log(`  ${c.nome_completo} · ${c.fone} → [${params.join(' | ')}]`);
    }
    console.log('\nLISTA COMPLETA DO LOTE:');
    for (const [i, c] of lote.entries()) console.log(`  ${String(i + 1).padStart(3)}. ${c.nome_completo} · ${c.fone}`);
    console.log('\ndry-run — rode com --enviar para disparar.');
    return;
  }

  let ok = 0, falha = 0;
  const paceador = criarPaceadorSincrono();
  for (const [i, c] of lote.entries()) {
    await paceador.aguardarVez();
    const { params, botaoParam } = montar(args(c));
    const r = await enviarTemplateCloud(
      { phone: c.fone, template: TEMPLATE, params, botaoParam },
      { motivo: 'avaliacao_pendente', empresaId, colaboradorId: c.id, dedupeKey: `avaliacao_pendente:${c.id}` },
    );
    if (r.ok) ok++; else falha++;
    console.log(`  ${i + 1}/${lote.length} ${c.nome_completo} · ${r.ok ? 'ok' : 'FALHOU: ' + r.reason}`);
  }

  console.log(`\n✓ ${ok} enviada(s) · ${falha} falha(s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
