import 'server-only';
/**
 * Acompanhamento do Simulador de liderança pelo RH e pelo gestor.
 *
 * 🔑 Decisão do dono (18/09/2026): RH e gestor veem QUEM faz e os RESULTADOS.
 * Até então o treino era visto só pelo dono (`owner_key`), e a proposta
 * prometia "relatório para o RH" de outra coisa (o Mapeamento).
 *
 * Mesma régua de acesso dos outros dois simuladores (`lib/simulador-vendas/equipe.ts`):
 * papel de acompanhamento + `journey.team.view` + `reports.individual.view`, e
 * por pessoa `canViewColabJourney` (RH vê a empresa, gestor os liderados, tutor
 * os tutorados). O painel entrega devolutivas e níveis, nunca as conversas nem a
 * preparação e a reflexão escritas pela pessoa, como no vendas.
 *
 * População = a do programa de liderança (escopo configurado, sem RH e sem
 * contas internas) com o cargo liberado para o simulador: quem aparece como
 * "não começou" é quem PODERIA ter começado.
 */
import { can } from '@/lib/permissions';
import { canViewColabJourney } from '@/lib/authz';
import { tenantDb } from '@/lib/tenant-db';
import type { AuthenticatedContext } from '@/lib/auth/request-context';
import { lerConfigProntidao } from '@/lib/prontidao-lideranca/config';
import { carregarPopulacao } from '@/lib/prontidao-lideranca/agregar';
import { prontidaoLiderancaHabilitada } from '@/lib/prontidao-lideranca/habilitado';
import {
  acessoDoCargo,
  idDoCargo,
  mapaDeCargos,
} from '@/lib/simuladores/acesso-cargo';
import {
  linhasDaVariante,
  VARIANTES,
  type LinhaMatriz,
} from '@/lib/simuladores/lideranca/matriz-global';
import { sinteseDaJornada, type SinteseJornada } from './avaliacao';
import { LiderancaError, type AvaliacaoGravada, type Episodio } from './schema';

export type MatrizPublica = Pick<
  LinhaMatriz,
  | 'cod_comp'
  | 'nome'
  | 'cod_desc'
  | 'nome_curto'
  | 'n1_gap'
  | 'n2_desenvolvimento'
  | 'n3_meta'
  | 'n4_referencia'
  | 'cargo'
>;
/** Recorte da matriz que a tela precisa para nomear descritores e mostrar a régua. */
export const matrizPublica = (m: LinhaMatriz[]): MatrizPublica[] =>
  m.map(
    ({
      cod_comp,
      nome,
      cod_desc,
      nome_curto,
      n1_gap,
      n2_desenvolvimento,
      n3_meta,
      n4_referencia,
      cargo,
    }) => ({
      cod_comp,
      nome,
      cod_desc,
      nome_curto,
      n1_gap,
      n2_desenvolvimento,
      n3_meta,
      n4_referencia,
      cargo,
    }),
  );

const LOTE = 100;
const lotes = <T>(itens: T[]) =>
  Array.from({ length: Math.ceil(itens.length / LOTE) }, (_, i) =>
    itens.slice(i * LOTE, i * LOTE + LOTE),
  );

export async function podeAcompanharLideranca(
  auth: AuthenticatedContext,
): Promise<boolean> {
  return (
    (auth.isPlatformAdmin || ['rh', 'gestor'].includes(auth.role)) &&
    (await can(auth, 'journey.team.view')) &&
    (await can(auth, 'reports.individual.view'))
  );
}

export async function contextoEquipe(
  auth: AuthenticatedContext,
  solicitada?: string | null,
) {
  const empresaId = auth.isPlatformAdmin
    ? solicitada || auth.empresaId
    : auth.empresaId;
  if (!empresaId)
    throw new LiderancaError(
      400,
      'Selecione uma empresa para acompanhar o simulador.',
    );
  if (!auth.isPlatformAdmin && solicitada && solicitada !== empresaId)
    throw new LiderancaError(
      403,
      'Seu cadastro não tem acesso a esta empresa.',
    );
  if (!(await podeAcompanharLideranca(auth)))
    throw new LiderancaError(
      403,
      'Seu perfil não permite acompanhar esta equipe.',
    );
  const tdb = tenantDb(empresaId);
  const { data: empresa, error } = await tdb.raw
    .from('empresas')
    .select('id,nome,sys_config')
    .eq('id', empresaId)
    .maybeSingle();
  if (error)
    throw new LiderancaError(503, 'Não foi possível consultar a empresa.');
  if (!empresa) throw new LiderancaError(404, 'Empresa não encontrada.');
  if (!(await prontidaoLiderancaHabilitada(tdb.raw, empresaId)))
    throw new LiderancaError(
      403,
      'O simulador de liderança não está contratado para esta empresa.',
    );
  return {
    auth,
    empresaId,
    empresaNome: empresa.nome as string,
    tdb,
    sysConfig: empresa.sys_config,
  };
}
export type ContextoEquipe = Awaited<ReturnType<typeof contextoEquipe>>;

type PessoaVisivel = { id: string; nome: string; cargo: string | null };

/** População visível para quem pergunta: programa, cargo liberado e régua da jornada. */
async function populacaoVisivel(c: ContextoEquipe): Promise<PessoaVisivel[]> {
  const cfg = lerConfigProntidao(c.sysConfig);
  if (!cfg) return [];
  const populacao = await carregarPopulacao(c.tdb.raw, c.empresaId, cfg);
  if (!populacao.length) return [];
  const { data: cargos, error: erroCargos } = await c.tdb
    .from('cargos_empresa')
    .select('id,nome');
  if (erroCargos)
    throw new LiderancaError(503, 'Não foi possível consultar os cargos.');
  // Mesma régua de nome do gate (`chaveCargo`); até 19/09/2026 cada lado comparava de um jeito.
  const cargoId = mapaDeCargos(
    (cargos || []) as Array<{ id: string; nome: string }>,
  );
  const liberadas = populacao.filter(
    (p) => acessoDoCargo(c.sysConfig, idDoCargo(cargoId, p.cargo)).lideranca,
  );
  const gestores = new Map<string, string | null>();
  for (const lote of lotes(liberadas.map((p) => p.id))) {
    const { data, error } = await c.tdb
      .from('colaboradores')
      .select('id,gestor_email')
      .in('id', lote);
    if (error)
      throw new LiderancaError(
        503,
        'Não foi possível consultar as permissões da equipe.',
      );
    for (const r of data || []) gestores.set(r.id, r.gestor_email ?? null);
  }
  return liberadas
    .filter((p) =>
      canViewColabJourney(c.auth, {
        id: p.id,
        empresa_id: c.empresaId,
        gestor_email: gestores.get(p.id) ?? null,
      }),
    )
    .map((p) => ({ id: p.id, nome: p.nome, cargo: p.cargo }));
}

type LinhaJornada = {
  id: string;
  colaborador_id: string;
  updated_at: string;
  concluidos: Episodio[] | null;
  ativoIndice: string | null;
  cargoMatriz: string | null;
};

const varianteDoCargo = (cargoMatriz: string | null) =>
  cargoMatriz === VARIANTES.futuro ? 'futuro' : 'lider';

async function repeticoes(c: ContextoEquipe, jornadaIds: string[]) {
  const porJornada = new Map<
    string,
    Array<
      Pick<
        Episodio,
        'id' | 'indice' | 'encerradoEm' | 'avaliacao' | 'repeticao'
      >
    >
  >();
  for (const lote of lotes(jornadaIds)) {
    for (let de = 0; ; de += 1000) {
      const { data, error } = await c.tdb
        .from('sim_lideranca_episodios')
        .select(
          'id,jornada_id,indice,avaliacao:episodio->avaliacao,encerradoEm:episodio->>encerradoEm',
        )
        .in('jornada_id', lote)
        .eq('repeticao', true)
        .order('id')
        .range(de, de + 999);
      if (error)
        throw new LiderancaError(
          503,
          'Não foi possível consultar as repetições.',
        );
      for (const r of (data || []) as any[]) {
        const lista = porJornada.get(r.jornada_id) || [];
        lista.push({
          id: r.id,
          indice: r.indice,
          encerradoEm: r.encerradoEm,
          avaliacao: r.avaliacao as AvaliacaoGravada,
          repeticao: true,
        });
        porJornada.set(r.jornada_id, lista);
      }
      if ((data || []).length < 1000) break;
    }
  }
  return porJornada;
}

export interface LinhaPainel {
  colaboradorId: string;
  nome: string;
  cargo: string | null;
  variante: 'lider' | 'futuro' | null;
  encontrosConcluidos: number;
  emAndamento: number | null;
  ultimaAtividade: string | null;
  sintese: SinteseJornada | null;
}

export async function painelEquipe(c: ContextoEquipe) {
  const pessoas = await populacaoVisivel(c);
  const jornadas = new Map<string, LinhaJornada>();
  for (const lote of lotes(pessoas.map((p) => p.id))) {
    const { data, error } = await c.tdb
      .from('sim_lideranca_jornadas')
      .select(
        'id,colaborador_id,updated_at,concluidos:estado->concluidos,ativoIndice:estado->ativo->>indice,cargoMatriz:estado->matriz->0->>cargo',
      )
      .in('colaborador_id', lote);
    if (error)
      throw new LiderancaError(
        503,
        'Não foi possível consultar as jornadas da equipe.',
      );
    for (const r of (data || []) as any[])
      jornadas.set(r.colaborador_id, r as LinhaJornada);
  }
  const reps = await repeticoes(
    c,
    [...jornadas.values()].map((j) => j.id),
  );
  const linhas: LinhaPainel[] = pessoas.map((p) => {
    const j = jornadas.get(p.id);
    if (!j)
      return {
        colaboradorId: p.id,
        nome: p.nome,
        cargo: p.cargo,
        variante: null,
        encontrosConcluidos: 0,
        emAndamento: null,
        ultimaAtividade: null,
        sintese: null,
      };
    const variante = varianteDoCargo(j.cargoMatriz);
    const concluidos = j.concluidos || [];
    return {
      colaboradorId: p.id,
      nome: p.nome,
      cargo: p.cargo,
      variante,
      encontrosConcluidos: concluidos.length,
      emAndamento: j.ativoIndice == null ? null : Number(j.ativoIndice),
      ultimaAtividade: j.updated_at,
      sintese: sinteseDaJornada(
        [...concluidos, ...(reps.get(j.id) || [])],
        linhasDaVariante(variante),
        concluidos.length,
      ),
    };
  });
  linhas.sort(
    (a, b) =>
      b.encontrosConcluidos - a.encontrosConcluidos ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
  return {
    empresaId: c.empresaId,
    empresaNome: c.empresaNome,
    populacao: linhas.length,
    iniciaram: linhas.filter((l) => l.variante !== null).length,
    concluiram: linhas.filter((l) => l.encontrosConcluidos >= 5).length,
    pessoas: linhas,
  };
}

/** O que o acompanhamento enxerga de um encontro: devolutiva, sem conversa, preparação ou reflexão. */
function encontroParaEquipe(e: Episodio) {
  return {
    id: e.id,
    indice: e.indice,
    repeticao: e.repeticao,
    encerradoEm: e.encerradoEm,
    avaliacao: e.avaliacao,
    // Acordos pela descrição: o trecho literal é fala da pessoa, e a conversa não sai daqui.
    consequencia: e.consequencia
      ? {
          narrativa: e.consequencia.narrativa,
          acordos: e.consequencia.acordos.map((a) => a.descricao),
          pendencias: e.consequencia.pendencias,
        }
      : null,
  };
}

async function episodiosRepetidos(
  c: ContextoEquipe,
  jornadaId: string,
): Promise<Episodio[]> {
  const reps: Episodio[] = [];
  for (let de = 0; ; de += 200) {
    const { data, error: erroEp } = await c.tdb
      .from('sim_lideranca_episodios')
      .select('episodio')
      .eq('jornada_id', jornadaId)
      .eq('repeticao', true)
      .order('created_at')
      .order('id')
      .range(de, de + 199);
    if (erroEp)
      throw new LiderancaError(
        503,
        'Não foi possível consultar as repetições.',
      );
    reps.push(...(data || []).map((r: any) => r.episodio as Episodio));
    if ((data || []).length < 200) break;
  }
  return reps;
}

export async function detalhePessoa(c: ContextoEquipe, colaboradorId: string) {
  const pessoa = (await populacaoVisivel(c)).find(
    (p) => p.id === colaboradorId,
  );
  if (!pessoa)
    throw new LiderancaError(404, 'Pessoa não encontrada na sua equipe.');
  const { data: j, error } = await c.tdb
    .from('sim_lideranca_jornadas')
    .select('id,updated_at,estado')
    .eq('colaborador_id', colaboradorId)
    .maybeSingle();
  if (error)
    throw new LiderancaError(503, 'Não foi possível consultar a jornada.');
  if (!j)
    return {
      pessoa,
      matriz: [] as MatrizPublica[],
      encontros: [] as ReturnType<typeof encontroParaEquipe>[],
      sintese: null,
    };
  const estado = j.estado as { matriz: LinhaMatriz[]; concluidos: Episodio[] };
  const reps = await episodiosRepetidos(c, j.id);
  const todos = [...estado.concluidos, ...reps].filter((e) => e.avaliacao);
  return {
    pessoa,
    matriz: matrizPublica(estado.matriz),
    encontros: todos
      .sort(
        (a, b) =>
          Date.parse(a.encerradoEm || '') - Date.parse(b.encerradoEm || ''),
      )
      .map(encontroParaEquipe),
    sintese: sinteseDaJornada(todos, estado.matriz, estado.concluidos.length),
  };
}
