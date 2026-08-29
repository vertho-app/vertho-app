/** Backup JSON do tenant de demo antes de qualquer reset destrutivo. */
import './_env';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSupabaseAdmin } from '@/lib/supabase';

const SLUG = 'gruposinal';
const TABLES = [
  'temporada_semana_progresso', 'trilhas', 'reavaliacao_sessoes', 'sessoes_avaliacao',
  'descriptor_assessments', 'respostas', 'videos_watched', 'fase4_progresso',
  'banco_cenarios', 'top10_cargos', 'colaboradores', 'cargos_empresa',
  'competencias', 'ppp_escolas', 'relatorios', 'fit_resultados',
];

async function main() {
  const sb = createSupabaseAdmin();
  const { data: empresa, error: empresaError } = await sb.from('empresas')
    .select('*').eq('slug', SLUG).maybeSingle();
  if (empresaError || !empresa) throw new Error(empresaError?.message || 'tenant não encontrado');
  if (empresa.is_demo !== true) throw new Error('guardrail: tenant não está marcado como demo');

  const tabelas: Record<string, unknown[]> = {};
  const tabelasAusentes: Record<string, string> = {};
  for (const table of TABLES) {
    const { data, error } = await sb.from(table).select('*').eq('empresa_id', empresa.id);
    if (error) {
      if (error.code === 'PGRST205' || /Could not find the table/i.test(error.message)) {
        tabelasAusentes[table] = error.message;
        continue;
      }
      throw new Error(`${table}: ${error.message}`);
    }
    tabelas[table] = data || [];
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(process.cwd(), 'backups');
  const path = join(dir, `gruposinal-before-consistency-fix-${stamp}.json`);
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify({ capturado_em: new Date().toISOString(), empresa, tabelas, tabelas_ausentes: tabelasAusentes }, null, 2), 'utf8');
  console.log(JSON.stringify({ path, empresa_id: empresa.id, contagens: Object.fromEntries(Object.entries(tabelas).map(([k, v]) => [k, v.length])), tabelas_ausentes: Object.keys(tabelasAusentes) }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
