/* eslint-disable */
/**
 * Convite ao ASSESSMENT DE COMPETÊNCIAS por WhatsApp (`avaliacao_competencias`,
 * UTILITY) — ou `avaliacao_pendente` por `--template=`, para quem não deu passo
 * nenhum.
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
 * IDEMPOTENTE POR TEMPLATE: quem já tem entrega com `kind` = o template desta
 * execução é pulado. Rodar duas vezes não manda duas — mas trocar a COPY alcança
 * de novo quem a anterior não moveu, e o resumo diz quantos estão nessa segunda
 * cobrança. (`--reenviar` ignora a guarda, para o caso deliberado.)
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
/**
 * Default = `avaliacao_competencias`, o template escrito para quem JÁ fez o
 * mapeamento comportamental — que é o alvo deste script. O `avaliacao_pendente`
 * segue disponível por `--template=` e serve ao outro estado: quem não deu passo
 * nenhum (nem DISC, nem cenário), para quem "avaliação de perfil" é a descrição
 * correta.
 */
const TEMPLATE = arg('template') || 'avaliacao_competencias';
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

  // Já receberam este convite? A telemetria é a fonte — rodar de novo não pode
  // mandar duas.
  //
  // 🔑 A guarda é POR TEMPLATE (`kind` = nome do template), não por "convite ao
  // assessment" em geral: `avaliacao_pendente` e `avaliacao_competencias`
  // descrevem o MESMO momento com textos diferentes, e o segundo existe
  // justamente para alcançar de novo quem o primeiro não moveu. Uma guarda
  // genérica tornaria a correção de copy inaplicável — mas ela também não pode
  // ser invisível: quem já recebeu OUTRO convite aparece no resumo, porque essa
  // pessoa está recebendo a segunda cobrança sobre o mesmo assunto.
  const { data: jaForam, error: eJ } = await sb.from('notification_deliveries')
    .select('colaborador_id, kind').eq('empresa_id', empresaId)
    .in('kind', ['avaliacao_pendente', 'avaliacao_competencias']).eq('channel', 'whatsapp');
  if (eJ) throw new Error(`telemetria: ${eJ.message}`);
  const recebidos = new Set((jaForam || []).filter((d: any) => d.kind === TEMPLATE).map((d: any) => d.colaborador_id));
  const receberamOutro = new Set((jaForam || []).filter((d: any) => d.kind !== TEMPLATE).map((d: any) => d.colaborador_id));

  // A COMPETÊNCIA anunciada sai de `cargos_empresa.top5_workshop`, a mesma régua
  // que a tela do assessment usa para escolher o próximo cenário. Sem ela o
  // `{{2}}` sairia vazio ("sua avaliação de  ainda não foi iniciada"), então
  // quem não tem competência resolvida NÃO recebe — falha alta na construção,
  // que é onde há humano para corrigir.
  const { data: cargos, error: eCg } = await sb.from('cargos_empresa')
    .select('nome, top5_workshop').eq('empresa_id', empresaId);
  if (eCg) throw new Error(`cargos_empresa: ${eCg.message}`);
  const top5Do = new Map<string, string[]>(
    (cargos || []).map((c: any) => [String(c.nome || '').toLowerCase(), (c.top5_workshop || []) as string[]]));
  const competenciaDe = (c: any): string | null =>
    (top5Do.get(String(c.cargo || '').toLowerCase()) || [])[0] || null;

  const fila = mapeados
    .map((c: any) => ({ ...c, fone: c.whatsapp || c.telefone, competencia: competenciaDe(c) }))
    .filter((c: any) => !respondentes.has(c.id))
    .filter((c: any) => c.fone)
    .filter((c: any) => c.competencia)
    .filter((c: any) => REENVIAR || !recebidos.has(c.id));

  const semCompetencia = mapeados.filter((c: any) => !respondentes.has(c.id) && !competenciaDe(c));
  if (semCompetencia.length) {
    console.log(`  ⚠️ sem competência no top5_workshop do cargo, ficam de fora: ${semCompetencia.length}`);
    for (const c of semCompetencia.slice(0, 5)) console.log(`       · ${c.nome_completo} (${c.cargo})`);
  }

  const semFone = mapeados.filter((c: any) => !respondentes.has(c.id) && !(c.whatsapp || c.telefone));

  console.log(`${empresa.nome}${CARGO ? ` · cargo ~ "${CARGO}"` : ''}`);
  console.log(`  no escopo: ${doCargo.length} · com mapeamento comportamental: ${mapeados.length} · destes, já responderam o assessment: ${respondentes.size}`);
  console.log(`  ALVO (mapeado, sem assessment, com telefone, sem convite): ${fila.length}`);
  if (recebidos.size) console.log(`  já receberam ESTE template antes: ${recebidos.size}${REENVIAR ? ' (--reenviar: incluídos assim mesmo)' : ' (pulados)'}`);
  const segundaCobranca = fila.filter((c: any) => receberamOutro.has(c.id)).length;
  if (segundaCobranca) console.log(`  ⚠️ ${segundaCobranca} do lote já receberam OUTRO convite ao assessment — para eles esta é a 2ª cobrança`);
  if (semFone.length) console.log(`  ⚠️ sem telefone, ficam de fora: ${semFone.length}`);
  const comps = [...new Set(fila.map((c: any) => c.competencia))];
  console.log(`  template: ${TEMPLATE} · competência(s) anunciada(s): ${comps.join(' | ') || '—'} · link: ${baseUrl}/dashboard/assessment`);

  const lote = fila.slice(0, LIMITE);
  if (lote.length < fila.length) console.log(`  ⚠️ teto de ${LIMITE}: ${fila.length - lote.length} ficam para a próxima execução`);
  if (!lote.length) { console.log('\nnada a enviar.'); return; }

  const args = (c: any) => ({
    telefone: c.fone, nome: primeiroNome(c.nome_completo), semana: 1, tema: '',
    slug: (empresa as any).slug, baseUrl, instituicao: (empresa as any).nome,
    competencia: c.competencia,
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
      // `motivo` vira o `kind` da telemetria: gravar o NOME DO TEMPLATE é o que
      // permite medir as duas copies separadamente e o que faz a guarda de
      // idempotência acima funcionar por template.
      { motivo: TEMPLATE, empresaId, colaboradorId: c.id, dedupeKey: `${TEMPLATE}:${c.id}` },
    );
    if (r.ok) ok++; else falha++;
    console.log(`  ${i + 1}/${lote.length} ${c.nome_completo} · ${r.ok ? 'ok' : 'FALHOU: ' + r.reason}`);
  }

  console.log(`\n✓ ${ok} enviada(s) · ${falha} falha(s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
