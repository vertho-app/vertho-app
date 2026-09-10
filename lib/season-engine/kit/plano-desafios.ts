/** Produção antecipada das tarefas de par que as trilhas ativas demandam. */
import { chaveDoPar, gerarDesafioDaSemana } from './desafio-par';
import { normDescritor } from '@/lib/blueprint/to-descriptors';
import { normalizarComp } from '@/lib/workshop-competencias';
import { getProgramaConfigDaTrilha } from '@/lib/season-engine/programa-config';

type Nucleo = { descritor: string; ideia_central: string; pontos_chave: string[]; exemplo_ancora: string };
export interface DemandaDesafio {
  empresaId: string; competencia: string; descritores: string[]; cargo: string; disc: string;
  pessoas: string[]; distancia: number; nucleos: Nucleo[];
}

async function todas(sb: any, tabela: string, colunas: string, filtro: (q: any) => any) {
  const out: any[] = [];
  for (let pagina = 0; pagina < 100; pagina++) {
    const { data, error } = await filtro(sb.from(tabela).select(colunas)).order('id').range(pagina * 1000, pagina * 1000 + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...(data || []));
    if ((data || []).length < 1000) return out;
  }
  throw new Error(`${tabela}: leitura incompleta`);
}

const chave = (comp: string, ds: string[], cargo: string, disc: string) =>
  JSON.stringify([normalizarComp(comp), chaveDoPar(ds), cargo.trim().toLowerCase(), disc]);

/** Sem IA nem escrita. A semana é a de CADA pessoa, não a maior da empresa. */
export async function levantarPlanoDesafios(sb: any, empresaId: string, semanasAdiante = 4): Promise<DemandaDesafio[]> {
  const [envios, trilhas, colabs, existentes, briefs] = await Promise.all([
    todas(sb, 'fase4_envios', 'id,colaborador_id,semana_atual', q => q.eq('empresa_id', empresaId).eq('status', 'ativo')),
    todas(sb, 'trilhas', 'id,colaborador_id,numero_temporada,criado_em,temporada_plano,programa_modo,programa_config', q => q.eq('empresa_id', empresaId)),
    todas(sb, 'colaboradores', 'id,cargo,perfil_dominante', q => q.eq('empresa_id', empresaId)),
    todas(sb, 'kit_desafios_semana', 'id,competencia,descritores_norm,cargo,disc,desafio', q => q.eq('empresa_id', empresaId).eq('status', 'published')),
    todas(sb, 'kit_briefs', 'id,empresa_id,competencia,descritor,cargo,brief,modulo_base_id', q => q.or(`empresa_id.eq.${empresaId},empresa_id.is.null`).eq('status', 'published').not('modulo_base_id', 'is', null)),
  ]);
  const porPessoa = new Map(colabs.map(c => [c.id, c]));
  const ultimas = new Map<string, any>();
  for (const t of trilhas) {
    const anterior = ultimas.get(t.colaborador_id);
    if (!anterior || Number(t.numero_temporada) > Number(anterior.numero_temporada)
      || (Number(t.numero_temporada) === Number(anterior.numero_temporada) && t.criado_em > anterior.criado_em)) ultimas.set(t.colaborador_id, t);
  }
  const prontas = new Set(existentes.filter(e => e.desafio?.desafio_texto).map(e => chave(e.competencia, e.descritores_norm, e.cargo || 'todos', e.disc)));
  const demandas = new Map<string, DemandaDesafio>();
  for (const envio of envios) {
    const t = ultimas.get(envio.colaborador_id), c = porPessoa.get(envio.colaborador_id);
    if (!t || !c || !getProgramaConfigDaTrilha(t).desafioUnicoPorCompetencia) continue;
    const disc = String(c.perfil_dominante || '').trim().charAt(0).toUpperCase();
    if (!['D', 'I', 'S', 'C'].includes(disc)) continue;
    const cargo = String(c.cargo || 'todos').trim();
    const atual = Math.max(1, Number(envio.semana_atual) || 1);
    for (const s of Array.isArray(t.temporada_plano) ? t.temporada_plano : []) {
      const distancia = Number(s.semana) - atual;
      if (s.tipo !== 'conteudo' || distancia < 0 || distancia > semanasAdiante) continue;
      const grupos = new Map<string, { competencia: string; descritores: string[] }>();
      for (const e of s.conteudos_dia || []) {
        if (!e.competencia || !e.descritor) continue;
        const k = normalizarComp(e.competencia);
        const g = grupos.get(k) || { competencia: e.competencia, descritores: [] };
        g.descritores.push(e.descritor); grupos.set(k, g);
      }
      for (const g of grupos.values()) {
        if (chaveDoPar(g.descritores).length < 2) continue;
        const k = chave(g.competencia, g.descritores, cargo, disc);
        if (prontas.has(k) || prontas.has(chave(g.competencia, g.descritores, 'todos', disc))) continue;
        const d = demandas.get(k) || { empresaId, ...g, cargo, disc, pessoas: [], distancia, nucleos: [] };
        d.distancia = Math.min(d.distancia, distancia);
        if (!d.pessoas.includes(c.id)) d.pessoas.push(c.id);
        demandas.set(k, d);
      }
    }
  }
  for (const d of demandas.values()) {
    d.nucleos = [...new Map(d.descritores.map(desc => [normDescritor(desc), desc])).values()].flatMap(desc => {
      const candidatas = briefs.filter(b => normalizarComp(b.competencia) === normalizarComp(d.competencia)
        && normDescritor(b.descritor) === normDescritor(desc)
        && (!b.cargo || b.cargo.toLowerCase() === 'todos' || b.cargo.toLowerCase() === d.cargo.toLowerCase()))
        .sort((a, b) => Number(b.cargo?.toLowerCase() === d.cargo.toLowerCase()) - Number(a.cargo?.toLowerCase() === d.cargo.toLowerCase()) || Number(!!b.empresa_id) - Number(!!a.empresa_id));
      const n = candidatas[0]?.brief;
      return n?.ideia_central ? [{ descritor: desc, ideia_central: n.ideia_central, pontos_chave: n.pontos_chave || [], exemplo_ancora: n.exemplo_ancora || '' }] : [];
    });
  }
  return [...demandas.values()].sort((a, b) => a.distancia - b.distancia || b.pessoas.length - a.pessoas.length);
}

export async function prepararDesafiosDaCoorte(sb: any, empresaId: string, opts: { limite?: number; semanasAdiante?: number; competencia?: string } = {}) {
  const plano = (await levantarPlanoDesafios(sb, empresaId, opts.semanasAdiante))
    .filter(d => !opts.competencia || normalizarComp(d.competencia) === normalizarComp(opts.competencia));
  const aptas = plano.filter(d => d.nucleos.length === chaveDoPar(d.descritores).length);
  const limite = Math.max(0, Math.min(100, Math.floor(opts.limite ?? 12)));
  let gerados = 0;
  for (const d of aptas.slice(0, limite)) {
    const r = await gerarDesafioDaSemana(sb, d);
    if (!r.reused) gerados++;
  }
  return { gerados, faltantes: plano.length, semBrief: plano.length - aptas.length, adiados: Math.max(0, aptas.length - limite) };
}
