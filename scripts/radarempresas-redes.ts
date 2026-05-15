/**
 * Detecta redes e consolida cada uma como 1 lead (a negociação é na
 * matriz/franqueadora, não na unidade). Dois tipos:
 *
 *  - FRANQUIA: mesma nome_fantasia normalizada em >=3 cnpj_basico
 *    DISTINTOS (franqueado é PJ própria). Marca = fantasia.
 *  - GRUPO/REDE PRÓPRIA: 1 só empresa (mesmo cnpj_basico) com >=3
 *    filiais no recorte (ex. Sodexo, Raia Drogasil). Marca = razão
 *    social. is_matriz veio quebrado do pipeline e a matriz real
 *    (cnpj_ordem 0001) quase nunca está no recorte — o cnpj_basico
 *    é o sinal confiável de "mesma mesa de negociação".
 *
 * Popula radarempresas_redes (1 linha/rede) e marca rede_marca nas
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

// Falsos positivos: entidades religiosas/públicas/sem fins (não são lead).
// \b só no início → casa por prefixo (DIOCESAN→DIOCESANA, PAROQUI→PAROQUIA).
const RUIDO = /\b(ASSOCIACAO|SINDICATO|CONDOMINIO|IGREJA|PARAQUI|PAROQUI|MITRA|DIOCESAN|CONGREGAC|ASSEMBLEIA|CARTORIO|FUNDACAO|INSTITUTO|COOPERATIVA|CONSELHO|PREFEITURA|MUNICIPIO|APM|AABB)/;
// Só para GRUPO (razão social): PJ patrimonial/profissional unipessoal
const RUIDO_GRUPO = /\b(PARTICIPAC|HOLDING|ESPOLIO|CONSULTORIA|EMPREENDIMENTOS IMOBILIARIOS|INCORPORAC|ADMINISTRADORA DE BENS)/;
// Termo genérico isolado (1 token) — coincidência de nome, não marca
const GENERICO_UNICO = new Set(['FARMACIA', 'DROGARIA', 'PADARIA', 'RESTAURANTE', 'LANCHONETE',
  'MERCADO', 'MERCEARIA', 'ESCOLA', 'COLEGIO', 'CLINICA', 'BAR', 'ACADEMIA', 'OTICA',
  'PIZZARIA', 'SORVETERIA', 'BUFFET', 'PETSHOP', 'BARBEARIA', 'SALAO', 'LAVANDERIA']);

function ehFranquiaValida(marcaNorm: string, nDonos: number): boolean {
  if (marcaNorm.length < 5 || nDonos < 3) return false;
  if (RUIDO.test(marcaNorm) || RUIDO_GRUPO.test(marcaNorm)) return false;
  const toks = marcaNorm.split(' ');
  if (toks.length === 1 && GENERICO_UNICO.has(toks[0])) return false;
  return true;
}

function ehGrupoValido(razaoNorm: string, nFiliais: number): boolean {
  if (razaoNorm.length < 5 || nFiliais < 3) return false;
  if (RUIDO.test(razaoNorm) || RUIDO_GRUPO.test(razaoNorm)) return false;
  return true;
}

type U = {
  id: string; cnpj_basico: string; cnpj_completo: string; uf: string; mun: string;
  fant: string; score: number; seg: string | null;
};

function dominante(us: U[]): string | null {
  const c = new Map<string, number>();
  for (const u of us) if (u.seg) c.set(u.seg, (c.get(u.seg) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function montaRede(marcaNorm: string, nomeExib: string, tipo: 'franquia' | 'grupo',
  us: U[], nDonos: number, confianca: string) {
  const scores = us.map(u => u.score);
  const scoreMedio = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  const segDom = dominante(us);
  return {
    marca_norm: marcaNorm, nome_exibicao: nomeExib, tipo,
    n_unidades: us.length, n_donos: nDonos,
    segmento_key: segDom, segmento_nome: segDom ? (getSegmento(segDom)?.nome || segDom) : null,
    score_medio: scoreMedio, score_max: Math.max(...scores),
    classificacao: classificarHelper(scoreMedio),
    ufs: [...new Set(us.map(u => u.uf).filter(Boolean))],
    municipios: [...new Set(us.map(u => u.mun).filter(Boolean))].slice(0, 20),
    exemplo_cnpj: us[0].cnpj_completo,
    confianca_rede: confianca,
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  // razão social por cnpj_basico (fantasia de grupo costuma ser vazia)
  const razaoMap = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('radarempresas_empresas')
      .select('cnpj_basico, razao_social').order('cnpj_basico').range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const e of data as any[]) razaoMap.set(e.cnpj_basico, e.razao_social || '');
    if (data.length < 1000) break;
  }

  // todas as unidades (com score) — query única, paginação determinística
  const todas: U[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await sb.from('radarempresas_scores')
      .select('score_total, score_explanation, radarempresas_estabelecimentos!inner(id, cnpj_basico, cnpj_completo, uf, municipio_nome, nome_fantasia)')
      .order('estabelecimento_id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!rows?.length) break;
    for (const r of rows as any[]) {
      const e = r.radarempresas_estabelecimentos;
      todas.push({
        id: e.id, cnpj_basico: e.cnpj_basico, cnpj_completo: e.cnpj_completo,
        uf: e.uf, mun: e.municipio_nome, fant: e.nome_fantasia,
        score: r.score_total ?? 0, seg: r.score_explanation?.segmento_key ?? null,
      });
    }
    if (rows.length < 1000) break;
  }

  const redes: any[] = [];
  const unidadeMarca: { id: string; marca: string }[] = [];
  const absorvidos = new Set<string>(); // estabelecimento_id já em uma rede

  // ── Pass 1: FRANQUIA (mesma fantasia, >=3 donos distintos) ──────────
  const porMarca = new Map<string, U[]>();
  const fantOrig = new Map<string, Map<string, number>>();
  for (const u of todas) {
    const m = norm(u.fant);
    if (!m) continue;
    if (!porMarca.has(m)) { porMarca.set(m, []); fantOrig.set(m, new Map()); }
    porMarca.get(m)!.push(u);
    const fo = fantOrig.get(m)!;
    fo.set(u.fant, (fo.get(u.fant) || 0) + 1);
  }
  for (const [marca, us] of porMarca) {
    const donos = new Set(us.map(u => u.cnpj_basico));
    if (!ehFranquiaValida(marca, donos.size)) continue;
    const fo = fantOrig.get(marca)!;
    const nomeExib = [...fo.entries()].sort((a, b) => b[1] - a[1])[0][0];
    redes.push(montaRede(marca, nomeExib, 'franquia', us, donos.size,
      donos.size >= 6 ? 'alta' : 'media'));
    for (const u of us) { unidadeMarca.push({ id: u.id, marca }); absorvidos.add(u.id); }
  }

  // ── Pass 2: GRUPO / REDE PRÓPRIA (mesmo cnpj_basico, >=3 filiais) ───
  const porBasico = new Map<string, U[]>();
  for (const u of todas) {
    if (absorvidos.has(u.id)) continue; // já consolidado como franquia
    if (!porBasico.has(u.cnpj_basico)) porBasico.set(u.cnpj_basico, []);
    porBasico.get(u.cnpj_basico)!.push(u);
  }
  for (const [basico, us] of porBasico) {
    if (us.length < 3) continue;
    const razao = razaoMap.get(basico) || '';
    if (!ehGrupoValido(norm(razao), us.length)) continue;
    const marca = `GRP:${basico}`; // único por empresa, sem colidir c/ franquia
    redes.push(montaRede(marca, razao, 'grupo', us, 1, us.length >= 5 ? 'alta' : 'media'));
    for (const u of us) { unidadeMarca.push({ id: u.id, marca }); absorvidos.add(u.id); }
  }

  const nFranq = redes.filter(r => r.tipo === 'franquia').length;
  const nGrupo = redes.filter(r => r.tipo === 'grupo').length;
  console.log(`Redes: ${redes.length} (franquia ${nFranq} · grupo ${nGrupo}) · unidades marcadas: ${unidadeMarca.length}`);

  // limpa estado anterior e regrava do zero
  await sb.from('radarempresas_scores').update({ rede_marca: null }).not('rede_marca', 'is', null);
  await sb.from('radarempresas_redes').delete().neq('marca_norm', '___sentinel___');
  for (let i = 0; i < redes.length; i += 500) {
    const { error } = await sb.from('radarempresas_redes').insert(redes.slice(i, i + 500));
    if (error) throw new Error(error.message);
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

  redes.sort((a, b) => b.score_medio - a.score_medio);
  console.log('Top 14 por score:');
  redes.slice(0, 14).forEach(r => console.log(
    `  ${String(r.n_unidades).padStart(3)} un · ${r.tipo.padEnd(8)} · sc${String(r.score_medio).padStart(4)} ${r.classificacao.padEnd(13)} · ${r.nome_exibicao.slice(0, 42)}`));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
