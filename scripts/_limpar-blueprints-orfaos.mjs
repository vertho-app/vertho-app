// F-I5 — limpeza de development_blueprints ÓRFÃOS.
//
// A tabela (mig 175) foi criada SEM FK para colaboradores/empresas: deletar um
// colaborador ou uma empresa NÃO apaga o blueprint, e o órfão acumula. Pior:
// `auditarBlueprint` de órfão falha no gate "colaborador não encontrado".
// A mig 191 adiciona as FKs ON DELETE CASCADE — mas FK nova REJEITA linhas
// órfãs existentes, então elas têm que sair ANTES de aplicar a 191.
//
// Órfão = blueprint cujo colaborador_id OU empresa_id não existe mais.
//
// Uso:
//   node scripts/_limpar-blueprints-orfaos.mjs            # DRY-RUN — só conta/relata
//   node scripts/_limpar-blueprints-orfaos.mjs --aplicar  # backup JSON em backups/ + delete
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
config({ path: '.env.local' });

const APLICAR = process.argv.includes('--aplicar');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Todos os blueprints
const { data: blueprints, error } = await sb.from('development_blueprints')
  .select('id, empresa_id, colaborador_id, spec_version, gerado_em');
if (error) { console.error('ERRO:', error.message); process.exit(1); }

// 2. Ids vivos de colaboradores e empresas (só os referenciados)
const colabIds = [...new Set(blueprints.map((b) => b.colaborador_id).filter(Boolean))];
const empIds = [...new Set(blueprints.map((b) => b.empresa_id).filter(Boolean))];

const colabsVivos = new Set();
for (let i = 0; i < colabIds.length; i += 200) {
  const { data, error: e } = await sb.from('colaboradores').select('id').in('id', colabIds.slice(i, i + 200));
  if (e) { console.error('ERRO colaboradores:', e.message); process.exit(1); }
  for (const c of data ?? []) colabsVivos.add(c.id);
}
const empresasVivas = new Set();
for (let i = 0; i < empIds.length; i += 200) {
  const { data, error: e } = await sb.from('empresas').select('id').in('id', empIds.slice(i, i + 200));
  if (e) { console.error('ERRO empresas:', e.message); process.exit(1); }
  for (const c of data ?? []) empresasVivas.add(c.id);
}

// 3. Classifica órfãos
const orfaos = blueprints.map((b) => ({
  ...b,
  motivo: [
    !colabIds.length || !colabsVivos.has(b.colaborador_id) ? 'colaborador inexistente' : null,
    !empresasVivas.has(b.empresa_id) ? 'empresa inexistente' : null,
  ].filter(Boolean).join(' + '),
})).filter((b) => b.motivo);

console.log(`blueprints: ${blueprints.length} | colabs referenciados: ${colabIds.length} (vivos: ${colabsVivos.size}) | empresas: ${empIds.length} (vivas: ${empresasVivas.size})`);
console.log(`ÓRFÃOS: ${orfaos.length}`);
for (const o of orfaos) {
  console.log(`  ✘ ${o.id.slice(0, 8)} colab=${o.colaborador_id?.slice(0, 8)} emp=${o.empresa_id?.slice(0, 8)} gerado=${o.gerado_em} — ${o.motivo}`);
}

if (!orfaos.length) { console.log('\nNada a fazer — a mig 191 pode ser aplicada direto.'); process.exit(0); }
if (!APLICAR) { console.log('\nDRY-RUN. Rode com --aplicar para backup + delete.'); process.exit(0); }

// 4. Backup (AGENTS.md: sempre antes de deletar em produção)
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
const path = `backups/blueprints-orfaos-f-i5-${ts}.json`;
writeFileSync(path, JSON.stringify({ quando: ts, orfaos }, null, 2));
console.log(`\nBackup: ${path} (${orfaos.length} linhas)`);

// 5. Delete em lotes de 50
let apagados = 0;
for (let i = 0; i < orfaos.length; i += 50) {
  const lote = orfaos.slice(i, i + 50).map((o) => o.id);
  const { error: delErr, count } = await sb.from('development_blueprints').delete({ count: 'exact' }).in('id', lote);
  if (delErr) { console.error('ERRO no delete:', delErr.message); process.exit(3); }
  apagados += count ?? 0;
}
console.log(`Apagados: ${apagados}/${orfaos.length}`);
