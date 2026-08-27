import type { SupabaseClient } from '@supabase/supabase-js';
import { descritorParaHumano } from '@/lib/descritor-humano';

/**
 * FONTE ÚNICA de "em que competência/descritor esta pessoa está nesta semana?".
 *
 * 🔴 POR QUE EXISTE (medido 27/08/2026)
 * ────────────────────────────────────
 * Dois caminhos de produção respondiam essa pergunta lendo
 * `fase4_envios.competencia_id` — uma coluna que **nunca existiu**. O baseline
 * não a tem, e a migration 149 cria `competencia_id` em `modulos_base_conteudo`,
 * outra tabela. Ninguém nunca a criou aqui.
 *
 * E o estrago não é "o campo vem nulo". O PostgREST recusa a QUERY INTEIRA com
 * 400 quando uma coluna do `select` não existe, então:
 *
 *   · `app/actions/beto.ts` — `envio` vinha `null` e a função caía no
 *     `if (!envio) return`, três linhas depois. Pílula da semana, competência em
 *     foco, conhecimento curado do descritor e Módulo-Base **nunca executaram**,
 *     para ninguém, desde sempre. Não são "os 75 envios": são 100% das chamadas.
 *   · `actions/tutor-evidencia.ts` — o `envio?.competencia_id` engolia igual, e
 *     `competenciaNome` ficava `''` em toda avaliação de evidência.
 *
 * 🔑 POR QUE NÃO CRIAR A COLUNA. Levantei os 9 arquivos que escrevem em
 * `fase4_envios`: **nenhum** grava `competencia_id`. Criá-la (com ou sem
 * backfill) daria uma coluna permanentemente nula e os dois consumidores
 * seguiriam sem contexto — seria preservar a ilusão, não curar o defeito.
 *
 * A fonte real já existe e é a que o disparador diário usa
 * (`lib/fase4/trigger-diario-empresa.ts`): a TRILHA. Medido nos 75 envios
 * ativos — 75 têm trilha, com `competencia_foco` e `temporada_plano`
 * preenchidos. Não falta dado; faltava a pergunta ser feita no lugar certo.
 *
 * ⚠️ A LIMPEZA DO DESCRITOR NÃO É COSMÉTICA, é o que faz o casamento fechar.
 * Parte dos planos traz o código da matriz colado no texto
 * (`COO03_D3 — Limites profissionais`) e `competencias.nome_curto` guarda só o
 * texto. Medido: casando o valor CRU, 66 de 75 resolvem; com
 * `descritorParaHumano`, **75 de 75, e zero ambíguos**. Os 9 que faltavam são
 * exatamente os que trazem o código.
 *
 * ⛳ Escopo desta função: ela NÃO substitui o `trigger-diario-empresa`, que tem
 * a sua própria resolução e funciona. Unificar os dois é uma rodada à parte —
 * fica registrado aqui que a lógica tem um gêmeo vivo.
 */

export interface ContextoSemanal {
  /** Nome da competência da semana, do plano da trilha. */
  competencia: string | null;
  /** Descritor da semana, já sem o código da matriz. */
  descritor: string | null;
  /** `competencias.id` — o que os carregadores de conhecimento esperam. */
  competenciaId: string | null;
  /** A semana vigente do envio ativo. */
  semana: number;
  /** A entrada do `temporada_plano` desta semana, crua. */
  planoDaSemana: any | null;
  /** A pílula da semana, já no formato que os prompts consomem. */
  pilula: { titulo: string | null; resumo: string | null; url: string | null } | null;
}

/**
 * O bloco `conteudo` do plano NÃO usa `titulo`/`resumo`/`url`.
 *
 * ⚠️ Medido em 27/08 nos 75 envios ativos: os 75 têm o bloco, e **zero** têm
 * `titulo`, `resumo` ou `url`. As chaves reais são `core_titulo`, `core_url`,
 * `por_que_cabe_na_semana` (mais `desafio_texto`, `formatos_disponiveis`,
 * `acao_observavel`…). Passar o bloco cru para o prompt do BETO renderizaria
 * "Título: undefined" — o mesmo defeito que este arquivo existe para corrigir,
 * uma camada adiante. O mapeamento fica AQUI, num lugar só.
 */
function pilulaDoPlano(conteudo: any): ContextoSemanal['pilula'] {
  if (!conteudo || typeof conteudo !== 'object') return null;
  const titulo = conteudo.core_titulo ?? null;
  const url = conteudo.core_url ?? null;
  const resumo = conteudo.por_que_cabe_na_semana ?? null;
  if (!titulo && !url && !resumo) return null;
  return { titulo, resumo, url };
}

/**
 * Resolve o contexto da semana pela TRILHA.
 *
 * Devolve `null` só quando não há envio ativo ou trilha — os dois casos em que
 * realmente não há contexto. Erro de leitura é LANÇADO, e de propósito: foi um
 * erro engolido no destructuring que manteve este caminho morto e invisível.
 */
export async function resolverContextoSemanal(
  sb: SupabaseClient,
  args: { colaboradorId: string; empresaId?: string | null; cargo?: string | null; semana?: number },
): Promise<ContextoSemanal | null> {
  const { data: envio, error: errEnvio } = await sb
    .from('fase4_envios')
    .select('semana_atual, status')
    .eq('colaborador_id', args.colaboradorId)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<any>();
  if (errEnvio) throw new Error(`fase4_envios: ${errEnvio.message}`);

  const semana = args.semana ?? envio?.semana_atual ?? null;
  if (!envio || !semana) return null;

  const { data: trilha, error: errTrilha } = await sb
    .from('trilhas')
    .select('temporada_plano, competencia_foco')
    .eq('colaborador_id', args.colaboradorId)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle<any>();
  if (errTrilha) throw new Error(`trilhas: ${errTrilha.message}`);
  if (!trilha) return null;

  const plano = Array.isArray(trilha.temporada_plano) ? trilha.temporada_plano : [];
  const planoDaSemana = plano[semana - 1] ?? null;

  const competencia = planoDaSemana?.competencia ?? trilha.competencia_foco ?? null;
  const descritorCru = planoDaSemana?.descritor ?? null;
  const descritor = descritorCru ? descritorParaHumano(descritorCru) : null;

  const competenciaId = await resolverCompetenciaId(sb, {
    empresaId: args.empresaId,
    cargo: args.cargo,
    descritor,
  });

  return {
    competencia,
    descritor,
    competenciaId,
    semana,
    planoDaSemana,
    pilula: pilulaDoPlano(planoDaSemana?.conteudo),
  };
}

/**
 * `competencias.id` a partir do descritor já limpo, escopado por empresa+cargo.
 *
 * O escopo não é zelo excessivo: o mesmo `nome_curto` existe em cargos
 * diferentes, e a matriz é POR CARGO. Sem os dois, isto casaria a linha de
 * outro cargo — o tipo de erro que não aparece na tela, só no conteúdo errado.
 */
async function resolverCompetenciaId(
  sb: SupabaseClient,
  args: { empresaId?: string | null; cargo?: string | null; descritor: string | null },
): Promise<string | null> {
  if (!args.descritor || !args.empresaId || !args.cargo) return null;
  const { data, error } = await sb
    .from('competencias')
    .select('id')
    .eq('empresa_id', args.empresaId)
    .eq('cargo', args.cargo)
    .eq('nome_curto', args.descritor)
    .limit(1)
    .maybeSingle<any>();
  if (error) throw new Error(`competencias: ${error.message}`);
  return data?.id ?? null;
}
