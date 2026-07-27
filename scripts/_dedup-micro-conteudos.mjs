// F-C6 — dedup de micro_conteudos (conteúdo NÃO-kit).
//
// Sem UNIQUE em micro_conteudos, geração concorrente do mesmo
// (empresa, competência, descritor, formato, cargo) insere 2+ rows. Medido 27/07:
// 19 grupos (13 globais/demo, 6 Ibipeba). O motor escolhe UMA por score e as outras
// viram peso morto que confunde diagnóstico.
//
// Regra do vencedor (espelha lib/season-engine/build-season.ts:195-206):
//   1. REFERENCIADO por algum temporada_plano (apagar referenciado = core_id órfão)
//   2. maior score (computarScoreConteudo: taxa_conclusao ou blend com impacto)
//   3. maior versao
//   4. mais recente (created_at)
//
// Uso:
//   node scripts/_dedup-micro-conteudos.mjs            # DRY-RUN — só relata
//   node scripts/_dedup-micro-conteudos.mjs --aplicar  # backup JSON em backups/ + delete
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
config({ path: '.env.local' });

const APLICAR = process.argv.includes('--aplicar');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const COLS = 'id, empresa_id, competencia, descritor, formato, cargo, ativo, versao, taxa_conclusao, impacto_amostras, impacto_medio_delta, created_at, titulo, url, storage_path, origem';

// 1. Todos os conteúdos NÃO-kit
const { data: todos, error } = await sb.from('micro_conteudos').select(COLS).is('kit_id', null);
if (error) { console.error('ERRO:', error.message); process.exit(1); }

const key = (c) => [c.empresa_id ?? '', c.competencia, c.descritor ?? '', c.formato, c.cargo ?? ''].join('|');
const grupos = new Map();
for (const c of todos) {
  const k = key(c);
  if (!grupos.has(k)) grupos.set(k, []);
  grupos.get(k).push(c);
}
const dups = [...grupos.entries()].filter(([, v]) => v.length > 1);
console.log(`NÃO-kit: ${todos.length} | grupos: ${grupos.size} | DUPLICADOS: ${dups.length}`);
if (!dups.length) { console.log('Nada a fazer.'); process.exit(0); }

// 2. Referências em temporada_plano (JSONB) — core_id / formatos_disponiveis[].id
const { data: trilhas } = await sb.from('trilhas').select('id, empresa_id, temporada_plano');
const refs = new Map(); // conteudoId -> [trilhaId]
for (const t of trilhas ?? []) {
  const txt = JSON.stringify(t.temporada_plano ?? {});
  for (const [, rows] of dups) for (const c of rows) {
    if (txt.includes(c.id)) {
      if (!refs.has(c.id)) refs.set(c.id, []);
      refs.get(c.id).push(t.id);
    }
  }
}

// 3. Score idêntico ao do motor (build-season.ts:235-242)
const score = (c) => {
  const taxa = c.taxa_conclusao ?? 0;
  const amostras = c.impacto_amostras ?? 0;
  const delta = c.impacto_medio_delta ?? null;
  if (amostras < 5 || delta == null) return taxa;
  return 0.7 * Math.max(0, Math.min(1, delta / 1.5)) + 0.3 * taxa;
};

const perdedores = [];
const loserParaVencedor = new Map(); // loserId -> row vencedora
let refsEmPerdedores = 0;
for (const [k, rows] of dups) {
  const ordenado = [...rows].sort((a, b) => {
    const ra = refs.has(a.id) ? 1 : 0, rb = refs.has(b.id) ? 1 : 0;
    if (ra !== rb) return rb - ra;
    const sa = score(a), sbc = score(b);
    if (sbc !== sa) return sbc - sa;
    if ((b.versao ?? 0) !== (a.versao ?? 0)) return (b.versao ?? 0) - (a.versao ?? 0);
    return new Date(b.created_at) - new Date(a.created_at);
  });
  const [vencedor, ...losers] = ordenado;
  const [emp, comp, desc, fmt, cargo] = k.split('|');
  console.log(`\n• ${comp} / ${desc} [${fmt}] cargo=${cargo || '(null)'} emp=${emp ? emp.slice(0, 8) : 'GLOBAL'} — ${rows.length}×`);
  console.log(`  ✔ fica: ${vencedor.id.slice(0, 8)} v${vencedor.versao} score=${score(vencedor)} refs=${refs.get(vencedor.id)?.length ?? 0} "${(vencedor.titulo ?? '').slice(0, 50)}"`);
  for (const l of losers) {
    const r = refs.get(l.id)?.length ?? 0;
    if (r) refsEmPerdedores++;
    console.log(`  ✘ sai:  ${l.id.slice(0, 8)} v${l.versao} score=${score(l)} refs=${r} ativo=${l.ativo} "${(l.titulo ?? '').slice(0, 50)}"`);
    perdedores.push(l);
    loserParaVencedor.set(l.id, vencedor);
  }
}

console.log(`\nRESUMO: ${dups.length} grupos, ${perdedores.length} linhas a apagar, perdedores referenciados por planos: ${refsEmPerdedores}`);
console.log('(referenciados serão REAPONTADOS para o vencedor antes do delete — apagar direto criaria core_id órfão)');

if (!APLICAR) { console.log('\nDRY-RUN. Rode com --aplicar para reapontar planos + backup + delete.'); process.exit(0); }

// 4. Reapontar temporada_plano: loser → vencedor (core_id/core_url/core_titulo e
//    formatos_disponiveis[fmt] inteiros — trocar só o id deixaria url/titulo do perdedor)
let trilhasTocadas = 0;
const planosOriginais = [];
for (const t of trilhas ?? []) {
  const p = t.temporada_plano;
  const sems = Array.isArray(p) ? p : (p?.semanas ?? []);
  let mudou = false;
  const original = JSON.parse(JSON.stringify(p)); // backup ANTES de mutar
  for (const s of sems) {
    const cont = s?.conteudo;
    if (!cont) continue;
    for (const [fmt, info] of Object.entries(cont.formatos_disponiveis ?? {})) {
      const v = loserParaVencedor.get(info?.id);
      if (v) { cont.formatos_disponiveis[fmt] = { id: v.id, url: v.url ?? null, titulo: v.titulo }; mudou = true; }
    }
    const vcore = loserParaVencedor.get(cont.core_id);
    if (vcore) { cont.core_id = vcore.id; cont.core_url = vcore.url ?? null; cont.core_titulo = vcore.titulo; mudou = true; }
  }
  if (!mudou) continue;
  planosOriginais.push({ trilha_id: t.id, temporada_plano: original });
  const { error: upErr } = await sb.from('trilhas').update({ temporada_plano: p }).eq('id', t.id);
  if (upErr) { console.error(`ERRO ao reapontar trilha ${t.id}:`, upErr.message); process.exit(3); }
  trilhasTocadas++;
}
console.log(`\nPlanos reapontados: ${trilhasTocadas} trilhas`);

// 5. Backup (AGENTS.md: sempre antes de deletar em produção) — linhas apagadas + planos originais
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
const path = `backups/micro-conteudos-dedup-f-c6-${ts}.json`;
writeFileSync(path, JSON.stringify({ quando: ts, grupos: dups.length, apagados: perdedores, planos_originais: planosOriginais }, null, 2));
console.log(`\nBackup: ${path} (${perdedores.length} linhas)`);

// 5. Delete em lotes de 50
let apagados = 0;
for (let i = 0; i < perdedores.length; i += 50) {
  const lote = perdedores.slice(i, i + 50).map((c) => c.id);
  const { error: delErr, count } = await sb.from('micro_conteudos').delete({ count: 'exact' }).in('id', lote);
  if (delErr) { console.error('ERRO no delete:', delErr.message); process.exit(3); }
  apagados += count ?? 0;
}
console.log(`Apagados: ${apagados}/${perdedores.length}`);

// 6. Verificação: re-conta duplicados
const { data: depois } = await sb.from('micro_conteudos').select('empresa_id, competencia, descritor, formato, cargo').is('kit_id', null);
const g2 = new Map();
for (const c of depois ?? []) g2.set(key(c), (g2.get(key(c)) ?? 0) + 1);
const ainda = [...g2.values()].filter((n) => n > 1).length;
console.log(`Duplicados restantes: ${ainda}`);
