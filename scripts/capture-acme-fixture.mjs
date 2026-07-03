/**
 * Captura a estrutura do tenant `acme` (fonte de verdade do demo) num FIXTURE
 * congelado: lib/demo/acme-demo-fixture.json. O reset do ACME Demo semeia a
 * partir desse JSON (não do acme VIVO) → a demo fica imune a mexidas no acme.
 *
 * Rode este script quando quiser ATUALIZAR o golden state do demo:
 *   node scripts/capture-acme-fixture.mjs
 *
 * Guarda os `id` de origem (competências/cenários) para o remapeamento no reset.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const SOURCE_SLUG = 'acme';
const OUT = 'lib/demo/acme-demo-fixture.json';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const must = async (label, p) => { const r = await p; if (r.error) throw new Error(`${label}: ${r.error.message}`); return r.data; };

async function main() {
  const empresa = await must('empresa',
    sb.from('empresas').select('segmento, sys_config, ui_config, default_locale').eq('slug', SOURCE_SLUG).single());
  const source = await must('empresa id', sb.from('empresas').select('id').eq('slug', SOURCE_SLUG).single());
  const sid = source.id;

  const competencias = await must('competencias', sb.from('competencias').select('*').eq('empresa_id', sid).order('cargo').order('cod_comp'));
  const cargos = await must('cargos', sb.from('cargos_empresa').select('*').eq('empresa_id', sid).order('nome'));
  const top10 = await must('top10', sb.from('top10_cargos').select('*').eq('empresa_id', sid).order('cargo').order('posicao'));
  const cenarios = await must('cenarios', sb.from('banco_cenarios').select('*').eq('empresa_id', sid).order('created_at'));

  // ── Artefatos AVALIADOS das personas (do acme-demo, após rodar IA4) ─────────
  // Congela o MAPEAMENTO já avaliado por persona (chaveado por e-mail, estável
  // entre resets) → a demo abre com notas prontas, SEM rodar IA no reset.
  const demo = await sb.from('empresas').select('id').eq('slug', 'acme-demo').maybeSingle();
  const personaArtifacts = {};
  if (demo.data?.id) {
    const did = demo.data.id;
    const colabs = await must('demo colabs', sb.from('colaboradores').select('id, email, report_texts, report_generated_at').eq('empresa_id', did));
    const idToEmail = new Map((colabs || []).map((c) => [c.id, c.email]));
    const reportByEmail = new Map((colabs || []).map((c) => [c.email, c.report_texts ? { report_texts: c.report_texts, report_generated_at: c.report_generated_at } : null]));
    const respAval = await must('demo respostas avaliadas',
      sb.from('respostas').select('colaborador_id, competencia_nome, avaliacao_ia, nivel_ia4, nota_ia4, pontos_fortes, pontos_atencao, feedback_ia4, payload_ia4, status_ia4')
        .eq('empresa_id', did).not('avaliacao_ia', 'is', null));
    const descAssess = await must('demo descriptor_assessments',
      sb.from('descriptor_assessments').select('*').eq('empresa_id', did));
    for (const email of new Set([...idToEmail.values()])) {
      if (!email) continue;
      personaArtifacts[email] = { respostas: [], descriptor_assessments: [], report: reportByEmail.get(email) || null };
    }
    for (const r of respAval || []) {
      const email = idToEmail.get(r.colaborador_id);
      if (!email || !personaArtifacts[email]) continue;
      const { colaborador_id, ...rest } = r;
      personaArtifacts[email].respostas.push(rest);
    }
    for (const d of descAssess || []) {
      const email = idToEmail.get(d.colaborador_id);
      if (!email || !personaArtifacts[email]) continue;
      // `nivel` é GENERATED ALWAYS — não capturar (não pode ser inserido).
      const { id, colaborador_id, empresa_id, nivel, ...rest } = d;
      personaArtifacts[email].descriptor_assessments.push(rest);
    }

    // Trilha (jornada) por persona: a row de trilhas (conteúdo inline em
    // temporada_plano) + o progresso semanal. Replay recria com ids novos.
    const trilhas = await must('demo trilhas', sb.from('trilhas').select('*').eq('empresa_id', did));
    const progress = await must('demo progress', sb.from('temporada_semana_progresso').select('*').eq('empresa_id', did));
    const progByTrilha = new Map();
    for (const pr of progress || []) { const arr = progByTrilha.get(pr.trilha_id) || []; arr.push(pr); progByTrilha.set(pr.trilha_id, arr); }
    for (const t of trilhas || []) {
      const email = idToEmail.get(t.colaborador_id);
      if (!email || !personaArtifacts[email]) continue;
      const { id: tid, colaborador_id, empresa_id, created_at, updated_at, ...trest } = t;
      const progs = (progByTrilha.get(tid) || []).map((pr) => {
        const { id, trilha_id, colaborador_id, empresa_id, created_at, updated_at, ...prest } = pr;
        return prest;
      });
      personaArtifacts[email].trilha = { row: trest, progress: progs };
    }
  }

  const fixture = {
    _meta: { source: SOURCE_SLUG, capturedAt: new Date().toISOString(), note: 'Golden state congelado do ACME Demo. Regenerar com scripts/capture-acme-fixture.mjs (rode IA4 no acme-demo ANTES, p/ congelar o mapeamento avaliado).' },
    empresa,
    competencias: competencias || [],
    cargos: cargos || [],
    top10: top10 || [],
    cenarios: cenarios || [],
    personaArtifacts,
  };
  writeFileSync(OUT, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Fixture salvo em ${OUT}`);
  console.log(`  competencias=${fixture.competencias.length} cargos=${fixture.cargos.length} top10=${fixture.top10.length} cenarios=${fixture.cenarios.length}`);
  const pa = Object.entries(personaArtifacts).map(([e, a]) => `${e}: ${a.respostas.length}resp/${a.descriptor_assessments.length}desc/${a.report ? 'report✓' : '—'}/${a.trilha ? 'trilha✓(' + (a.trilha.progress?.length || 0) + 'sem)' : '—'}`);
  console.log(`  personaArtifacts: ${pa.length ? pa.join(' · ') : '(nenhum — rode IA4 no acme-demo antes de capturar)'}`);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
