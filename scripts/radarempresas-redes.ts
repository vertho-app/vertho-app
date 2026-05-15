/**
 * Detecta redes/franquias e consolida cada uma como 1 lead.
 * Rede = mesmo nome_fantasia normalizado em >=3 cnpj_basico DISTINTOS
 * (franqueado é PJ própria; filial seria mesmo cnpj_basico). A
 * franqueadora quase nunca está no recorte — o lead é a REDE.
 *
 * Popula radarempresas_redes (1 linha/marca) e marca rede_marca nas
 * unidades em radarempresas_scores (saem da lista individual / funil).
 *
 * Roda DEPOIS do score. Uso: npx tsx scripts/radarempresas-redes.ts
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { classificarHelper } from '../lib/radarempresas/score';
import { getSegmento } from '../lib/radarempresas/segmentos';

const env = readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a: any, l) => { const i = l.indexOf('='); if (i > 0) a[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const norm = (s: string | null) => String(s || '').toUpperCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Falsos positivos: associações/entidades (não são franquia)
const RUIDO = /\b(ASSOCIACAO|SINDICATO|CONDOMINIO|IGREJA|PARAQUIA|PAROQUIA|CARTORIO|FUNDACAO|INSTITUTO|COOPERATIVA|CONSELHO|APM|AABB)\b/;
// Termo genérico isolado (1 token) — coincidência de nome, não marca
const GENERICO_UNICO = new Set(['FARMACIA', 'DROGARIA', 'PADARIA', 'RESTAURANTE', 'LANCHONETE',
  'MERCADO', 'MERCEARIA', 'ESCOLA', 'COLEGIO', 'CLINICA', 'BAR', 'ACADEMIA', 'OTICA',
  'PIZZARIA', 'SORVETERIA', 'BUFFET', 'PETSHOP', 'BARBEARIA', 'SALAO', 'LAVANDERIA']);

function ehRedeValida(marcaNorm: string, nDonos: number): boolean {
  if (marcaNorm.length < 5 || nDonos < 3) return false;
  if (RUIDO.test(marcaNorm)) return false;
  const toks = marcaNorm.split(' ');
  if (toks.length === 1 && GENERICO_UNICO.has(toks[0])) return false;
  return true;
}

async function main() {
  // estab + score (paginado)
  type U = { id: string; cnpj_basico: string; cnpj_completo: string; uf: string; mun: string;
    fant: string; score: number; seg: string | null };
  const porMarca = new Map<string, U[]>();
  const fantOrig = new Map<string, Map<string, number>>(); // marca → {fantasia original: freq}

  for (let from = 0; ; from += 1000) {
    const { data: ests } = await sb.from('radarempresas_estabelecimentos')
      .select('id, cnpj_basico, cnpj_completo, uf, municipio_nome, nome_fantasia')
      .range(from, from + 999);
    if (!ests?.length) break;
    const ids = (ests as any[]).map(e => e.id);
    const { data: scs } = await sb.from('radarempresas_scores')
      .select('estabelecimento_id, score_total, score_explanation').in('estabelecimento_id', ids);
    const scMap = new Map((scs || []).map((s: any) => [s.estabelecimento_id, s]));
    for (const e of ests as any[]) {
      const m = norm(e.nome_fantasia);
      if (!m) continue;
      const sc = scMap.get(e.id) as any;
      const u: U = {
        id: e.id, cnpj_basico: e.cnpj_basico, cnpj_completo: e.cnpj_completo,
        uf: e.uf, mun: e.municipio_nome, fant: e.nome_fantasia,
        score: sc?.score_total ?? 0, seg: sc?.score_explanation?.segmento_key ?? null,
      };
      if (!porMarca.has(m)) { porMarca.set(m, []); fantOrig.set(m, new Map()); }
      porMarca.get(m)!.push(u);
      const fo = fantOrig.get(m)!;
      fo.set(e.nome_fantasia, (fo.get(e.nome_fantasia) || 0) + 1);
    }
    if (ests.length < 1000) break;
  }

  const redes: any[] = [];
  const unidadeMarca: { id: string; marca: string }[] = [];
  for (const [marca, us] of porMarca) {
    const donos = new Set(us.map(u => u.cnpj_basico));
    if (!ehRedeValida(marca, donos.size)) continue;
    const scores = us.map(u => u.score);
    const scoreMedio = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    // segmento dominante
    const segCount = new Map<string, number>();
    for (const u of us) if (u.seg) segCount.set(u.seg, (segCount.get(u.seg) || 0) + 1);
    const segDom = [...segCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    // nome de exibição = fantasia original mais frequente
    const fo = fantOrig.get(marca)!;
    const nomeExib = [...fo.entries()].sort((a, b) => b[1] - a[1])[0][0];
    redes.push({
      marca_norm: marca, nome_exibicao: nomeExib,
      n_unidades: us.length, n_donos: donos.size,
      segmento_key: segDom, segmento_nome: segDom ? (getSegmento(segDom)?.nome || segDom) : null,
      score_medio: scoreMedio, score_max: Math.max(...scores),
      classificacao: classificarHelper(scoreMedio),
      ufs: [...new Set(us.map(u => u.uf).filter(Boolean))],
      municipios: [...new Set(us.map(u => u.mun).filter(Boolean))].slice(0, 20),
      exemplo_cnpj: us[0].cnpj_completo,
      confianca_rede: donos.size >= 6 ? 'alta' : 'media',
      updated_at: new Date().toISOString(),
    });
    for (const u of us) unidadeMarca.push({ id: u.id, marca });
  }

  console.log(`Redes detectadas: ${redes.length} · unidades marcadas: ${unidadeMarca.length}`);

  // limpa marcas antigas e regrava
  await sb.from('radarempresas_scores').update({ rede_marca: null }).not('rede_marca', 'is', null);
  for (let i = 0; i < redes.length; i += 500) {
    await sb.from('radarempresas_redes').upsert(redes.slice(i, i + 500), { onConflict: 'marca_norm' });
  }
  // marca unidades (em lote por marca pra reduzir requests)
  const porMarcaIds = new Map<string, string[]>();
  for (const { id, marca } of unidadeMarca) {
    if (!porMarcaIds.has(marca)) porMarcaIds.set(marca, []);
    porMarcaIds.get(marca)!.push(id);
  }
  let done = 0;
  for (const [marca, ids] of porMarcaIds) {
    for (let i = 0; i < ids.length; i += 200) {
      await sb.from('radarempresas_scores').update({ rede_marca: marca })
        .in('estabelecimento_id', ids.slice(i, i + 200));
    }
    done++;
  }
  console.log(`[OK] ${redes.length} redes gravadas · ${done} marcas aplicadas nas unidades`);

  redes.sort((a, b) => b.n_unidades - a.n_unidades);
  console.log('Top 12 redes:');
  redes.slice(0, 12).forEach(r => console.log(
    `  ${String(r.n_unidades).padStart(3)} un · ${r.n_donos} donos · sc${r.score_medio} ${r.classificacao} · ${r.nome_exibicao.slice(0, 40)}`));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
