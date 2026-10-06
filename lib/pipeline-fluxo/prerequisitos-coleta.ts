/**
 * Coleta dos pré-requisitos do fluxo completo (SOMENTE LEITURA, núcleo headless). Lê o que `prerequisitos.ts` precisa e devolve
 * o veredito pronto. Reaproveita a coleta da prévia (`entrada`: pessoas e foco dos cargos) para não ler a empresa duas vezes.
 *
 * Cada leitura falha sozinha: um erro vira "não foi possível medir" no item correspondente (nunca "ok"), e os outros itens saem.
 * Isso é de propósito diferente da prévia, que derruba tudo: aqui o painel é um aviso, e perder os 5 por causa de 1 seria pior.
 */
import { materiaPrimaCanonica } from '@/lib/season-engine/kit/brief';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';
import { normalizarModoPrograma } from '@/lib/season-engine/programa-config';
import { COLUNAS_PREFERENCIA_KIT } from '@/lib/season-engine/kit/formatos-por-preferencia';
import { carregarConfigsEfetivasEmLote } from '@/lib/turmas/contexto';
import { lerTudoPaginado } from '@/lib/paginacao';
import type { EntradaPrevia } from './previa';
import {
  competenciasQueODuoResolve, montarPrerequisitos,
  type InfraRenderPrereq, type ModuloBaseDoPar, type PessoaPrereq, type PrerequisitosFluxo,
} from './prerequisitos';

const LOTE_IN = 150;
const CONCORRENCIA_MODULO_BASE = 4;

const msg = (e: unknown) => String((e as any)?.message || e);

/** `sb` RAW (o módulo-base global tem `empresa_id` nulo e o `tenantDb` o esconde); `tdb` escopado à empresa. */
export async function coletarPrerequisitos(deps: {
  sb: any;
  tdb: any;
  empresaId: string;
  entrada: EntradaPrevia;
  /** Injetável para teste; em produção é o `process.env` da plataforma. */
  env?: Record<string, string | undefined>;
}): Promise<PrerequisitosFluxo> {
  const { sb, tdb, empresaId, entrada } = deps;
  const env = deps.env ?? process.env;
  const render: InfraRenderPrereq = { temToken: !!env.HCLOUD_TOKEN, temSnapshot: !!env.RENDER_SNAPSHOT_ID, temDatabaseUrl: !!env.DATABASE_URL };
  const focoDe = new Map(entrada.cargos.map((c) => [c.nome, c.foco]));

  // Colunas que o Kit lê, das pessoas do escopo (em lotes: o `in` com muitos ids estoura a URL).
  const colabs = new Map<string, any>();
  let colaboradoresErro: string | null = null;
  const ids = entrada.pessoas.map((p) => p.id);
  for (let i = 0; i < ids.length && !colaboradoresErro; i += LOTE_IN) {
    const { data, error } = await tdb.from('colaboradores').select(`id, perfil_dominante, programa_modo, ${COLUNAS_PREFERENCIA_KIT}`).in('id', ids.slice(i, i + LOTE_IN));
    if (error) colaboradoresErro = `colaboradores: ${error.message}`;
    else for (const c of data || []) colabs.set(c.id, c);
  }

  // Programa efetivo POR PESSOA, na precedência da geração (participação, turma, pessoa, empresa).
  let programaErro: string | null = colaboradoresErro;
  const modoDe = new Map<string, string>();
  const regularDuoDe = new Map<string, unknown>();
  if (!programaErro) {
    try {
      const { data: emp, error } = await sb.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
      if (error) throw new Error(`empresas: ${error.message}`);
      const configs = await carregarConfigsEfetivasEmLote(sb, empresaId, ids.map((id) => ({ id, programa_modo: colabs.get(id)?.programa_modo ?? null })), emp?.sys_config || {});
      for (const id of ids) {
        const cfg = configs.get(id) || {};
        modoDe.set(id, normalizarModoPrograma(cfg.programa_modo));
        regularDuoDe.set(id, cfg.competencias_regular_duo);
      }
    } catch (e) { programaErro = msg(e); }
  }

  // Top 10 do cargo: só quem está em DUO com foco curto precisa dele (é o último recurso do DUO para achar a 2ª competência).
  const top10PorCargo = new Map<string, string[]>();
  if (!programaErro) {
    const cargosDuoCurto = [...new Set(entrada.pessoas
      .filter((p) => p.cargo && modoDe.get(p.id) === 'regular_duo' && (focoDe.get(p.cargo) || []).length < 2)
      .map((p) => p.cargo as string))];
    if (cargosDuoCurto.length) {
      try {
        const top = await lerTudoPaginado((de, ate) => tdb.from('top10_cargos').select('cargo, competencia_id, posicao').in('cargo', cargosDuoCurto).order('posicao').range(de, ate));
        if (top.error) throw new Error(`top10_cargos: ${top.error}`);
        const compIds = [...new Set(top.data.map((t: any) => t.competencia_id).filter(Boolean))] as string[];
        const nomes = new Map<string, string>();
        for (let i = 0; i < compIds.length; i += LOTE_IN) {
          const { data, error } = await tdb.from('competencias').select('id, nome').in('id', compIds.slice(i, i + LOTE_IN));
          if (error) throw new Error(`competencias: ${error.message}`);
          for (const c of data || []) nomes.set(c.id, c.nome);
        }
        for (const t of top.data) {
          const nome = nomes.get(t.competencia_id);
          if (nome) (top10PorCargo.get(t.cargo) || top10PorCargo.set(t.cargo, []).get(t.cargo)!).push(nome);
        }
      } catch (e) { programaErro = msg(e); }
    }
  }

  const pessoas: PessoaPrereq[] = entrada.pessoas.map((p) => {
    const foco = (p.cargo && focoDe.get(p.cargo)) || [];
    return {
      id: p.id, nome: p.nome, cargo: p.cargo ?? null,
      colab: colabs.get(p.id) || {},
      modo: modoDe.get(p.id) || normalizarModoPrograma(null),
      competenciasDuo: competenciasQueODuoResolve({ foco, regularDuo: regularDuoDe.get(p.id), top10Nomes: (p.cargo && top10PorCargo.get(p.cargo)) || [] }),
    };
  });

  const moduloBase = await consultarModulosBase(sb, empresaId, entrada);
  return montarPrerequisitos({
    pessoas,
    cargos: entrada.cargos.map((c) => ({ nome: c.nome, foco: c.foco })),
    moduloBase, programaErro, colaboradoresErro, render,
  });
}

/**
 * Há módulo-base publicado, COM matéria-prima, para cada par (cargo com gente no escopo, competência foco)? Usa o MESMO resolvedor
 * do Kit, sem descritor (sem descritor não há embedding: nada de custo nem de rede externa) e a MESMA regra de "tem matéria-prima"
 * (`materiaPrimaCanonica`). O candidato é o mesmo conjunto que o Kit enxerga, então "nenhum" aqui é "nenhum" lá.
 */
async function consultarModulosBase(sb: any, empresaId: string, entrada: EntradaPrevia): Promise<ModuloBaseDoPar[] | { erro: string }> {
  const cargosComGente = new Set(entrada.pessoas.map((p) => p.cargo).filter((c): c is string => !!c));
  const pares: Array<{ cargo: string; competencia: string }> = [];
  for (const c of entrada.cargos) {
    if (!cargosComGente.has(c.nome)) continue;
    for (const competencia of c.foco) pares.push({ cargo: c.nome, competencia });
  }
  const out: ModuloBaseDoPar[] = new Array(pares.length);
  let proximo = 0;
  let erro: string | null = null;
  const trabalhador = async () => {
    for (;;) {
      if (erro || proximo >= pares.length) return;
      const i = proximo++;
      const { cargo, competencia } = pares[i];
      try {
        const r = await resolverModuloBaseParaConteudo(sb, { competenciaNome: competencia, nivelMin: 1.0, cargo, empresaId });
        out[i] = { cargo, competencia, achou: !!r && materiaPrimaCanonica(r.modulo).trim().length > 0 };
      } catch (e) { erro = `${cargo}, ${competencia}: ${msg(e)}`; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA_MODULO_BASE, pares.length) }, trabalhador));
  return erro ? { erro } : out;
}
