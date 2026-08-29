/* eslint-disable */
/**
 * Corrige os 18 MBs de "Autocuidado e resiliência emocional × Gestão Escolar" que
 * gravaram o TÍTULO EDITORIAL no campo `descritor` ("A Calma que se Constrói") em vez do
 * nome da régua ("Regulação sob pressão").
 *
 * Efeito do bug (medido 28/07): o match exato dá 0, a escolha cai no embedding do título
 * e embaralha — 6 descritores colapsavam em 2 MBs, e 14 dos 18 micro_conteudos core do
 * par ancoraram no módulo ERRADO. Dois MBs ("Ler os Próprios Sinais", "A Calma que se
 * Constrói") nunca foram usados por nada. Falha silenciosa: o conteúdo sai, só fala do
 * assunto vizinho. Em Coordenação Pedagógica o MESMO manuscrito gravou certo — a
 * varredura do acervo achou só estes 18 fora do padrão.
 *
 * O mapeamento foi confirmado por DUAS fontes independentes:
 *  1. `conteudo_central` de cada MB (os princípios são inequívocos);
 *  2. as tags de extração (DIR02_MB01..MB12, dois por descritor, na ordem D1..D6 da régua).
 *
 * ⚠️ Corrigir o TEXTO não basta: `descritor_embedding` tem precedência absoluta sobre o
 * match por tokens (`modulo-base-integration.ts`: `if (queryVec && emb) cosine else tokens`).
 * O vetor antigo foi calculado sobre o título e continuaria mandando. Por isso o embedding
 * é RECALCULADO com a mesma fórmula da publicação (`descritor + ' ' + titulo`).
 *
 * Uso: npx tsx --env-file=.env.local scripts/_corrigir-mb-gestao-escolar.ts [--apply]
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { writeFileSync } from 'fs';

const APPLY = process.argv.includes('--apply');
const COMP = 'Autocuidado e resiliência emocional';
const CARGO = 'Gestão Escolar';

/** título editorial (como está gravado em `descritor`) → nome_curto da régua. */
const MAPA: Record<string, string> = {
  'Ler os Próprios Sinais': 'Consciência de limites',       // DIR02_D1 · MB01/02
  'A Calma que se Constrói': 'Regulação sob pressão',       // DIR02_D2 · MB03/04
  'A Fronteira que Cuida': 'Limites profissionais',         // DIR02_D3 · MB05/06
  'O Fôlego que se Preserva': 'Sustentabilidade pessoal',   // DIR02_D4 · MB07/08
  'A Escolha de se Cuidar': 'Protagonismo do bem-estar',    // DIR02_D5 · MB09/10
  'Ninguém Conduz Sozinho': 'Busca de apoio e rede',        // DIR02_D6 · MB11/12
};

async function main() {
  const sb = createSupabaseAdmin();

  const { data: comps } = await sb.from('competencias')
    .select('id, nome_curto').ilike('nome', COMP).eq('cargo', CARGO);
  const compIds = (comps || []).map((c: any) => c.id);
  const naRegua = new Set((comps || []).map((c: any) => c.nome_curto).filter(Boolean));
  if (!compIds.length) throw new Error('competência/cargo não encontrados');

  // Sanidade: todo destino do mapa TEM que existir na régua. Sem isso eu trocaria um
  // nome errado por outro nome errado e o match continuaria falhando — em silêncio.
  const forinhas = Object.values(MAPA).filter((d) => !naRegua.has(d));
  if (forinhas.length) throw new Error(`destino fora da régua: ${forinhas.join(', ')}`);

  const { data: mbs } = await sb.from('modulos_base_conteudo')
    .select('id, descritor, titulo, nivel_entrada, nivel_destino, status')
    .in('competencia_id', compIds);

  const alvo = (mbs || []).filter((m: any) => MAPA[String(m.descritor).trim()]);
  const fora = (mbs || []).filter((m: any) => !MAPA[String(m.descritor).trim()]);

  console.log(`${APPLY ? '🔥 APPLY' : '🔍 DRY RUN'} · ${mbs?.length || 0} MB(s) no par · ${alvo.length} a corrigir · ${fora.length} já ok/desconhecido`);
  for (const m of fora) console.log(`   (intacto) ${m.descritor} · ${m.nivel_entrada}→${m.nivel_destino}`);

  if (!APPLY) {
    for (const m of alvo) {
      console.log(`  ${String(m.descritor).padEnd(26)} → ${MAPA[String(m.descritor).trim()].padEnd(26)} ${m.nivel_entrada}→${m.nivel_destino} [${String(m.id).slice(0, 8)}]`);
    }
    console.log('\n→ rode com --apply');
    return;
  }

  // Backup FORA do repo (é dado de tenant e o repositório é público).
  const backup = alvo.map((m: any) => ({ id: m.id, descritor_antigo: m.descritor, titulo: m.titulo }));
  const path = `${process.env.TEMP || '.'}/mb-gestao-escolar-backup-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(backup, null, 2));
  console.log(`backup: ${path}\n`);

  let ok = 0, erros = 0;
  for (const m of alvo) {
    const novo = MAPA[String(m.descritor).trim()];
    // Mesma fórmula da publicação (`aprovarPublicar`): descritor + título.
    const emb = await embedText(`${novo} ${m.titulo || ''}`.trim());
    const patch: any = { descritor: novo };
    if (emb?.vector) patch.descritor_embedding = emb.vector;
    const { error } = await sb.from('modulos_base_conteudo').update(patch).eq('id', m.id);
    if (error) { erros++; console.log(`  ✗ ${m.id}: ${error.message}`); continue; }
    ok++;
    console.log(`  ✓ ${String(m.descritor).padEnd(26)} → ${novo.padEnd(26)} ${m.nivel_entrada}→${m.nivel_destino}${emb?.vector ? ' +emb' : ' (SEM embedding — match cairá em tokens)'}`);
  }
  console.log(`\ncorrigidos: ${ok} · erros: ${erros}`);
  console.log('→ validar: npx tsx --env-file=.env.local scripts/_probe-mb-gestao-escolar.ts');
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
