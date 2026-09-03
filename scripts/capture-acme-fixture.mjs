/**
 * Captura a estrutura de um tenant vivo (fonte de verdade de um ambiente demo)
 * num FIXTURE congelado. O reset semeia a partir desse JSON, e não do tenant
 * VIVO → a demo fica imune a mexidas na origem.
 *
 * Rode quando quiser ATUALIZAR o golden state:
 *   node scripts/capture-acme-fixture.mjs
 *
 * Guarda os `id` de origem (competências/cenários) para o remapeamento no reset.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

/**
 * Origem, ambiente demo e destino são PARÂMETROS: o mesmo motor congela o
 * golden de qualquer par (tenant vivo → tenant demo). Sem argumento, mantém o
 * par histórico `acme` → `acme-demo`.
 *
 *   node scripts/capture-acme-fixture.mjs
 *   node scripts/capture-acme-fixture.mjs --source=ibipeba --demo=escolas-acme \
 *     --out=lib/demo/escolas-demo-fixture.json
 */
const arg = (nome, padrao) => {
  const achado = process.argv.slice(2).find((item) => item.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3).trim() : padrao;
};

const SOURCE_SLUG = arg('source', 'acme');
const DEMO_SLUG = arg('demo', 'acme-demo');
const OUT = arg('out', 'lib/demo/acme-demo-fixture.json');

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

  // ── Artefatos AVALIADOS das personas (do tenant demo, após rodar IA4) ──────
  // Congela o MAPEAMENTO já avaliado por persona (chaveado por e-mail, estável
  // entre resets) → a demo abre com notas prontas, SEM rodar IA no reset.
  const demo = await sb.from('empresas').select('id').eq('slug', DEMO_SLUG).maybeSingle();
  const personaArtifacts = {};
  if (demo.data?.id) {
    const did = demo.data.id;
    const colabs = await must('demo colabs', sb.from('colaboradores').select('id, email, report_texts, report_generated_at, comportamental_audio_path, comportamental_pdf_path').eq('empresa_id', did));
    const idToEmail = new Map((colabs || []).map((c) => [c.id, c.email]));
    // O caminho do MP3 entra como REDE DE SEGURANÇA (ver o reset): quem preserva
  // a mídia no dia a dia é o warm snapshot, que lê o estado anterior ao reset.
  const reportByEmail = new Map((colabs || []).map((c) => [c.email, c.report_texts ? {
    report_texts: c.report_texts,
    report_generated_at: c.report_generated_at,
    comportamental_audio_path: c.comportamental_audio_path || null,
    comportamental_pdf_path: c.comportamental_pdf_path || null,
  } : null]));
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

    // PDI da TELA (`relatorios` com tipo='individual'): ~3,5 min de IA por
    // pessoa, e `relatorios` está em DEMO_RESET_TABLES — sem congelar, o PDI
    // some no primeiro reset. Não confundir com o blueprint logo abaixo: aquele
    // alimenta a trilha, este é o documento que /dashboard/pdi mostra.
    const pdis = await must('demo PDIs',
      sb.from('relatorios').select('*').eq('empresa_id', did).in('tipo', ['individual', 'gestor']));
    for (const r of pdis || []) {
      const email = idToEmail.get(r.colaborador_id);
      if (!email || !personaArtifacts[email]) continue;
      const { id, colaborador_id, empresa_id, created_at, updated_at, ...rest } = r;
      // `pdi` guarda o documento da PESSOA; `relatorioGestor`, o da liderança
      // dela. A aba Documentos conta as duas categorias separadamente, e sem o
      // segundo "Liderancas" abria com zero.
      if (r.tipo === 'gestor') personaArtifacts[email].relatorioGestor = rest;
      else personaArtifacts[email].pdi = rest;
    }

    // PDI (development blueprint): derivado dos descritores por IA, ~2 min por
    // pessoa. Sem congelar, a tela de PDI da demo nasce vazia depois do reset.
    const blueprints = await must('demo blueprints',
      sb.from('development_blueprints').select('*').eq('empresa_id', did));
    for (const b of blueprints || []) {
      const email = idToEmail.get(b.colaborador_id);
      if (!email || !personaArtifacts[email]) continue;
      const { id, colaborador_id, empresa_id, created_at, updated_at, ...brest } = b;
      personaArtifacts[email].blueprint = brest;
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

  // Consolidado de RH (tipo='rh', sem colaborador): e ele que alimenta a
  // "leitura analitica" das abas Cargos e Prioridades. Nao cabe em
  // personaArtifacts (que e por e-mail) porque a linha e da ORGANIZACAO.
  let relatorioRh = null;
  if (demo.data?.id) {
    const rh = await must('demo consolidado RH',
      sb.from('relatorios').select('*').eq('empresa_id', demo.data.id).eq('tipo', 'rh').is('colaborador_id', null).maybeSingle());
    if (rh) {
      const { id, empresa_id, colaborador_id, colab_key, created_at, updated_at, ...rest } = rh;
      relatorioRh = rest;
    }
  }

  const fixture = {
    _meta: { source: SOURCE_SLUG, demo: DEMO_SLUG, capturedAt: new Date().toISOString(), note: `Golden state congelado de ${DEMO_SLUG} (estrutura de ${SOURCE_SLUG}). Regenerar com scripts/capture-acme-fixture.mjs (rode IA4 no tenant demo ANTES, p/ congelar o mapeamento avaliado).` },
    empresa,
    competencias: competencias || [],
    cargos: cargos || [],
    top10: top10 || [],
    cenarios: cenarios || [],
    personaArtifacts,
    relatorioRh,
  };
  writeFileSync(OUT, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Fixture salvo em ${OUT}`);
  console.log(`  competencias=${fixture.competencias.length} cargos=${fixture.cargos.length} top10=${fixture.top10.length} cenarios=${fixture.cenarios.length}`);
  const pa = Object.entries(personaArtifacts).map(([e, a]) => `${e}: ${a.respostas.length}resp/${a.descriptor_assessments.length}desc/${a.report ? 'report✓' : '—'}/${a.trilha ? 'trilha✓(' + (a.trilha.progress?.length || 0) + 'sem)' : '—'}`);
  console.log(`  personaArtifacts: ${pa.length ? pa.join(' · ') : `(nenhum — rode IA4 no ${DEMO_SLUG} antes de capturar)`}`);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
