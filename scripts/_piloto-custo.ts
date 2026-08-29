export {};
/* eslint-disable */
// PILOTO DE CUSTO/QUALIDADE — coorte sintética no tenant acme-demo.
// 5 arquétipos (DISC×perfil de evolução) × 2 braços (Sonnet 4.6 / Sonnet 5) = 10.
// Roda o simulador de temporada headless (núcleo lib/season-engine/simulador-core),
// populando ia_usage_log com source='simulator'. Aluno em gpt-5.6-luna (overhead,
// taskKey='sim_aluno', netável). Mentor no modelo do braço (taskKey real do fluxo).
//
// Subcomandos:
//   npx tsx scripts/_piloto-custo.ts setup            # cria coorte (idempotente)
//   npx tsx scripts/_piloto-custo.ts run sonnet46     # roda o braço 4.6
//   npx tsx scripts/_piloto-custo.ts run sonnet5      # roda o braço 5
//   npx tsx scripts/_piloto-custo.ts run              # roda os 10
//   npx tsx scripts/_piloto-custo.ts report           # agrega ledger (custo/tokens/cache × modelo)
//   npx tsx scripts/_piloto-custo.ts cleanup          # apaga colabs/trilhas (preserva ledger)
process.loadEnvFile('.env.local');

const EMAIL_PREFIX = 'pilotocusto';
const CARGO = 'Representante Comercial';
const ARCH = [
  { key: 'a1', perfil: 'D',  evol: 'evolucao_confirmada' },
  { key: 'a2', perfil: 'I',  evol: 'evolucao_parcial' },
  { key: 'a3', perfil: 'S',  evol: 'estagnacao' },
  { key: 'a4', perfil: 'C',  evol: 'regressao' },
  { key: 'a5', perfil: 'CS', evol: 'evolucao_parcial' },
];
const ARMS = [
  { arm: 'sonnet46', model: 'claude-sonnet-4-6' },
  { arm: 'sonnet5',  model: 'claude-sonnet-5' },
];
const emailOf = (a: string, arm: string) => `${EMAIL_PREFIX}-${a}-${arm}.demo@vertho.ai`;

async function main() {
  const cmd = process.argv[2] || 'report';
  const { createSupabaseAdmin } = await import('@/lib/supabase');
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', 'acme-demo').maybeSingle();
  if (!emp) throw new Error('acme-demo não encontrado');
  const empId = emp.id as string;

  if (cmd === 'setup') return setup(sb, empId);
  if (cmd === 'smoke') return smoke(sb, empId);
  if (cmd === 'run') return run(sb, empId, process.argv[3], process.argv[4]);
  if (cmd === 'report') return report(sb);
  if (cmd === 'cleanup') return cleanup(sb, empId);
  throw new Error('cmd inválido: ' + cmd);
}

async function templateTrilha(sb: any, empId: string) {
  const { data: col } = await sb.from('colaboradores').select('id')
    .eq('empresa_id', empId).ilike('nome_completo', 'Bruna%').maybeSingle();
  if (!col) throw new Error('template colab (Bruna) não encontrado');
  const { data: tr } = await sb.from('trilhas')
    .select('competencia_foco, temporada_plano, descritores_selecionados, programa_modo')
    .eq('colaborador_id', col.id).maybeSingle();
  return tr;
}

async function setup(sb: any, empId: string) {
  const tpl = await templateTrilha(sb, empId);
  if (!tpl?.temporada_plano) throw new Error('template trilha sem temporada_plano');
  const manifest: any[] = [];
  for (const a of ARCH) for (const A of ARMS) {
    const email = emailOf(a.key, A.arm);
    let { data: colab } = await sb.from('colaboradores').select('id')
      .eq('empresa_id', empId).eq('email', email).maybeSingle();
    if (!colab) {
      const ins = await sb.from('colaboradores').insert({
        empresa_id: empId, email,
        nome_completo: `Piloto ${a.key.toUpperCase()} ${A.arm}`,
        cargo: CARGO, perfil_dominante: a.perfil,
      }).select('id').single();
      if (ins.error) throw new Error(`colab ${email}: ${ins.error.message}`);
      colab = ins.data;
    }
    let { data: trilha } = await sb.from('trilhas').select('id')
      .eq('empresa_id', empId).eq('colaborador_id', colab.id).maybeSingle();
    if (!trilha) {
      const ins = await sb.from('trilhas').insert({
        empresa_id: empId, colaborador_id: colab.id,
        competencia_foco: tpl.competencia_foco,
        temporada_plano: tpl.temporada_plano,
        descritores_selecionados: tpl.descritores_selecionados,
        programa_modo: tpl.programa_modo || 'regular_single',
        status: 'ativa',
      }).select('id').single();
      if (ins.error) throw new Error(`trilha ${email}: ${ins.error.message}`);
      trilha = ins.data;
    }
    manifest.push({ arch: a.key, arm: A.arm, model: A.model, evol: a.evol, colabId: colab.id, trilhaId: trilha.id });
  }
  console.log(JSON.stringify(manifest, null, 2));
  console.log(`\n✓ coorte pronta: ${manifest.length} colabs/trilhas (comp="${tpl.competencia_foco}")`);
}

async function currentManifest(sb: any, empId: string) {
  const { data: colabs } = await sb.from('colaboradores').select('id, email')
    .eq('empresa_id', empId).ilike('email', `${EMAIL_PREFIX}-%`);
  const out: any[] = [];
  const re = new RegExp(`^${EMAIL_PREFIX}-(a\\d)-(sonnet46|sonnet5)\\.demo@`);
  for (const c of colabs || []) {
    const m = c.email.match(re);
    if (!m) continue;
    const arch = ARCH.find(x => x.key === m[1]);
    const armObj = ARMS.find(x => x.arm === m[2]);
    if (!arch || !armObj) continue;
    const { data: tr } = await sb.from('trilhas').select('id').eq('colaborador_id', c.id).maybeSingle();
    if (tr) out.push({ arch: m[1], arm: m[2], model: armObj.model, evol: arch.evol, colabId: c.id, trilhaId: tr.id });
  }
  return out;
}

// Valida a cadeia headless + tags do ledger com 1 semana só (barato/rápido).
async function smoke(sb: any, empId: string) {
  const { simularUmaSemanaCore } = await import('@/lib/season-engine/simulador-core');
  const man = await currentManifest(sb, empId);
  const alvo = man.find(m => m.arch === 'a1' && m.arm === 'sonnet46');
  if (!alvo) throw new Error('rode setup primeiro');
  // acha a 1ª semana de conteúdo do plano
  const { data: tr } = await sb.from('trilhas').select('temporada_plano').eq('id', alvo.trilhaId).single();
  const plano = Array.isArray(tr.temporada_plano) ? tr.temporada_plano : [];
  const semConteudo = plano.find((s: any) => s.tipo === 'conteudo' && s.descritor);
  if (!semConteudo) throw new Error('plano sem semana de conteúdo');
  console.log(`smoke: trilha=${alvo.trilhaId} semana=${semConteudo.semana} (socrático, mentor=4.6, aluno=luna)`);
  const t0 = Date.now();
  const r: any = await simularUmaSemanaCore(sb, { trilhaId: alvo.trilhaId, semana: semConteudo.semana, perfilEvolucao: alvo.evol, mentorModel: alvo.model });
  console.log(`resultado: ${JSON.stringify(r)} (${Math.round((Date.now() - t0) / 1000)}s)`);
  // confere ledger
  const { data: led } = await sb.from('ia_usage_log')
    .select('feature, model, source, input_tokens, output_tokens, cost_usd')
    .eq('source', 'simulator').eq('colaborador_id', alvo.colabId)
    .order('created_at', { ascending: false }).limit(20);
  console.log(`\nledger (source=simulator, colab do smoke): ${led?.length || 0} linhas`);
  for (const l of led || []) console.log(`  ${l.feature.padEnd(24)} ${l.model.padEnd(20)} in=${l.input_tokens} out=${l.output_tokens} $${Number(l.cost_usd || 0).toFixed(4)}`);
}

async function run(sb: any, empId: string, armFilter?: string, archFilter?: string) {
  const { simularTemporadaCore } = await import('@/lib/season-engine/simulador-core');
  const manifest = await currentManifest(sb, empId);
  const alvo = manifest.filter(m => (!armFilter || m.arm === armFilter) && (!archFilter || m.arch === archFilter));
  if (!alvo.length) throw new Error('coorte vazia ou filtro sem match — rode `setup` primeiro');
  console.log(`Rodando ${alvo.length} temporadas (arm=${armFilter || 'todos'}, arch=${archFilter || 'todos'})...`);
  for (const m of alvo) {
    const t0 = Date.now();
    try {
      const r: any = await simularTemporadaCore(sb, { trilhaId: m.trilhaId, perfilEvolucao: m.evol, mentorModel: m.model });
      const secs = Math.round((Date.now() - t0) / 1000);
      console.log(`[${m.arch}/${m.arm}] ${r?.ok ? 'OK' : 'ERRO ' + (r?.error || '')} — ${secs}s, ${r?.steps?.length || 0} steps`);
    } catch (e: any) {
      console.error(`[${m.arch}/${m.arm}] EXCEPTION: ${e?.message}`);
    }
  }
  console.log('✓ run concluído');
}

async function report(sb: any) {
  const { data: rows, error } = await sb.from('ia_usage_log')
    .select('feature, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd')
    .eq('source', 'simulator');
  if (error) throw new Error(error.message);
  if (!rows?.length) { console.log('Sem linhas source=simulator ainda.'); return; }

  const agg: Record<string, any> = {};
  for (const r of rows) {
    const k = `${r.feature}::${r.model}`;
    agg[k] ||= { feature: r.feature, model: r.model, n: 0, in: 0, out: 0, cr: 0, cw: 0, usd: 0 };
    const a = agg[k];
    a.n++; a.in += r.input_tokens || 0; a.out += r.output_tokens || 0;
    a.cr += r.cache_read_tokens || 0; a.cw += r.cache_write_tokens || 0; a.usd += Number(r.cost_usd) || 0;
  }
  const list = Object.values(agg).sort((a: any, b: any) => b.usd - a.usd);

  const isAluno = (f: string) => f === 'sim_aluno';
  const money = (n: number) => `$${n.toFixed(3)}`;
  console.log('\n== LEDGER source=simulator (feature × modelo) ==');
  console.log('feature'.padEnd(26), 'modelo'.padEnd(20), 'n'.padStart(5), 'in'.padStart(9), 'out'.padStart(8), 'cacheR'.padStart(9), 'USD'.padStart(9));
  for (const a of list as any[]) {
    console.log(
      (isAluno(a.feature) ? '· ' + a.feature : a.feature).padEnd(26),
      a.model.padEnd(20), String(a.n).padStart(5),
      String(a.in).padStart(9), String(a.out).padStart(8), String(a.cr).padStart(9), money(a.usd).padStart(9),
    );
  }

  // Totais: representativo (mentor+extração, exclui aluno) vs overhead (aluno) por modelo
  const byModel: Record<string, any> = {};
  for (const a of list as any[]) {
    byModel[a.model] ||= { repUsd: 0, repIn: 0, repOut: 0, ovUsd: 0, repN: 0 };
    if (isAluno(a.feature)) { byModel[a.model].ovUsd += a.usd; }
    else { byModel[a.model].repUsd += a.usd; byModel[a.model].repIn += a.in; byModel[a.model].repOut += a.out; byModel[a.model].repN += a.n; }
  }
  console.log('\n== COMPARAÇÃO POR MODELO (representativo = mentor+extração, exclui aluno) ==');
  for (const [model, v] of Object.entries(byModel) as any) {
    console.log(`${model.padEnd(20)} rep=${money(v.repUsd)} (n=${v.repN}, in=${v.repIn}, out=${v.repOut})  overhead_aluno=${money(v.ovUsd)}`);
  }

  // 4.6 vs 5: tokens/tarefa por fluxo-mentor
  const mentorFluxos = ['evidencias_socratic', 'missao_feedback', 'sem13_qualitativa', 'sim_extracao_socratic', 'sim_extracao_missao', 'sim_extracao_qualitativa'];
  console.log('\n== TOKENS/TAREFA por fluxo × modelo (o +30% do tokenizer?) ==');
  for (const f of mentorFluxos) {
    const r46: any = (list as any[]).find(a => a.feature === f && a.model === 'claude-sonnet-4-6');
    const r5: any = (list as any[]).find(a => a.feature === f && a.model === 'claude-sonnet-5');
    if (!r46 && !r5) continue;
    const tpt = (a: any) => a && a.n ? Math.round((a.in + a.out) / a.n) : null;
    const t46 = tpt(r46), t5 = tpt(r5);
    const delta = t46 && t5 ? `${(((t5 - t46) / t46) * 100).toFixed(0)}%` : '—';
    console.log(`${f.padEnd(26)} 4.6=${t46 ?? '—'} tok/tarefa  5=${t5 ?? '—'} tok/tarefa  Δ=${delta}`);
  }
}

async function cleanup(sb: any, empId: string) {
  const man = await currentManifest(sb, empId);
  if (!man.length) { console.log('nada a limpar'); return; }
  const colabIds = man.map(m => m.colabId), trilhaIds = man.map(m => m.trilhaId);
  // PRESERVA o ledger: solta o FK (colaborador_id → ON DELETE CASCADE apagaria a medição).
  await sb.from('ia_usage_log').update({ colaborador_id: null }).in('colaborador_id', colabIds);
  await sb.from('temporada_semana_progresso').delete().in('trilha_id', trilhaIds);
  await sb.from('trilhas').delete().in('id', trilhaIds);
  await sb.from('colaboradores').delete().in('id', colabIds);
  console.log(`✓ limpo: ${colabIds.length} colabs + ${trilhaIds.length} trilhas (ledger preservado, colaborador_id=null)`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
