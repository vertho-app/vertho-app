/* eslint-disable */
// Mapeia os descritores LIVRES das avaliações para os descritores OFICIAIS da
// matriz. Dry-run por padrão: classifica e mostra, sem gravar.
//
// POR QUE (medido 14/08, ao rodar a trilha piloto): a trilha ancora no descritor
// que veio da AVALIAÇÃO, não no catálogo — o piloto morreu com "Sem conteúdo
// para GERENCIAMENTO DE CONFLITOS × Decisão proporcional com consciência de
// custo", um descritor que a IA4 inventou quando a competência ainda não tinha
// régua. São 288 avaliações com 216 descritores DISTINTOS (deveriam ser 8) e
// ZERO usando os nomes oficiais: cada diretor foi medido numa régua própria.
// Sem reancorar, nenhuma trilha nasce — não é questão de relatório, é
// pré-requisito da geração.
//
// A classificação é feita por IA porque os nomes são paráfrases ("Decisão
// proporcional com custo nomeado" ≈ "Construção de soluções"), não variações
// ortográficas. O resultado é IMPRESSO para conferência antes de qualquer
// escrita: reescrever `descriptor_assessments` altera o resultado de avaliação
// de gente real.
//
// Uso: npx tsx scripts/_mapear-descritores-oficiais.ts <slug> <cod_comp> [--cargo=X]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';

const SLUG = process.argv[2] || 'macae';
const COD = process.argv[3] || 'C007';
const CARGO = process.argv.find((a) => a.startsWith('--cargo='))?.slice(8) || 'Diretor(a) Escolar';

const SYSTEM = `Você classifica descritores de competência. Recebe a RÉGUA OFICIAL (lista numerada) e uma lista de descritores LIVRES escritos por outra IA. Para CADA descritor livre, escolha o número do descritor oficial que trata do MESMO comportamento observável.
Regras: use só os números da régua; se nenhum servir, use 0. Não explique.
Responda APENAS JSON: {"mapa":[{"i":<indice do livre>,"o":<numero oficial|0>,"conf":<0..1>}]}`;

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;

  const { data: oficiais } = await sb.from('competencias')
    .select('cod_desc, nome_curto, descritor_completo, nome')
    .eq('empresa_id', empresaId).eq('cod_comp', COD).not('cod_desc', 'is', null).order('cod_desc');
  if (!oficiais?.length) throw new Error(`sem descritores oficiais em ${COD}`);

  const { data: livresRaw } = await sb.from('descriptor_assessments')
    .select('descritor').eq('empresa_id', empresaId).eq('cargo', CARGO)
    .eq('competencia', (oficiais as any[])[0].nome);
  const livres = [...new Set((livresRaw || []).map((r: any) => String(r.descritor || '').trim()).filter(Boolean))].sort();
  console.log(`${oficiais.length} oficiais · ${livres.length} descritores livres distintos · ${livresRaw?.length || 0} avaliações\n`);

  const regua = (oficiais as any[]).map((o, i) => `${i + 1}. ${o.nome_curto} — ${o.descritor_completo}`).join('\n');
  const mapa = new Map<string, { o: number; conf: number }>();

  // Lotes: a lista inteira num prompt só faz a IA perder o índice no meio.
  const LOTE = 40;
  for (let i = 0; i < livres.length; i += LOTE) {
    const fatia = livres.slice(i, i + LOTE);
    const user = `RÉGUA OFICIAL:\n${regua}\n\nDESCRITORES LIVRES:\n${fatia.map((d, k) => `${k}. ${d}`).join('\n')}`;
    const raw = await callAI(SYSTEM, user, {}, 4000, { taskKey: 'descritor_reancoragem' });
    const json = String(raw || '').replace(/```json|```/g, '').trim();
    const obj = JSON.parse(json.slice(json.indexOf('{'), json.lastIndexOf('}') + 1));
    for (const m of obj.mapa || []) {
      const nome = fatia[Number(m.i)];
      if (nome) mapa.set(nome, { o: Number(m.o), conf: Number(m.conf ?? 0) });
    }
    console.log(`  classificados ${Math.min(i + LOTE, livres.length)}/${livres.length}`);
  }

  const porOficial = new Map<string, number>();
  const semCasa: string[] = [];
  const baixaConf: string[] = [];
  for (const d of livres) {
    const m = mapa.get(d);
    if (!m || !m.o) { semCasa.push(d); continue; }
    const of = (oficiais as any[])[m.o - 1];
    porOficial.set(of.nome_curto, (porOficial.get(of.nome_curto) || 0) + 1);
    if (m.conf < 0.7) baixaConf.push(`${d}  →  ${of.nome_curto} (${m.conf})`);
  }

  console.log(`\ndistribuição — quantos descritores livres caem em cada oficial:`);
  for (const o of oficiais as any[]) {
    console.log(`  ${String(porOficial.get(o.nome_curto) || 0).padStart(3)}  ${o.cod_desc}  ${o.nome_curto}`);
  }
  console.log(`\n${livres.length - semCasa.length}/${livres.length} mapeados · ${semCasa.length} sem casa · ${baixaConf.length} com confiança < 0,7`);
  if (semCasa.length) { console.log('\nSEM CASA (precisam de decisão humana):'); for (const d of semCasa.slice(0, 15)) console.log(`  · ${d}`); }
  if (baixaConf.length) { console.log('\nBAIXA CONFIANÇA:'); for (const d of baixaConf.slice(0, 15)) console.log(`  · ${d}`); }
  console.log('\n(dry-run — nada foi gravado)');
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
