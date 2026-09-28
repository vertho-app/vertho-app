/**
 * Projeção de UMA linha de treino para as listas (histórico do participante e
 * da equipe). Pura, sem I/O e sem `server-only`: o serviço (`historico.ts`) e o
 * harness da tela (`tests/browser/pace.entry.tsx`) usam a MESMA função. Até
 * 27/09/2026 o harness montava o item à mão e escondia a nota antes da
 * pesquisa, coisa que o serviço não fazia: o verificador fotografava um estado
 * que a produção não produzia (V-7 da revisão).
 */
import { VENDAS_SESSAO } from '@/lib/status';
import type { Estado } from './schema';
import { notaPacePublica, pontuacaoMatriz } from './escala';
import { escalaNativa14, usaMatrizPace } from './matriz-avaliacao';
import type { NotasPorCompetencia } from './evolucao';

export type ResumoTreino = {
  id: string;
  criadoEm: string;
  status: Estado['status'];
  nivel: 1 | 2 | 3;
  nome: string | null;
  nomeVendedor: string;
  nota: number | null;
  temRelatorio: boolean;
  versaoRegua: string;
  testeAdmin: boolean;
  /** Só no histórico do PRÓPRIO participante, e só de devolutiva liberada. */
  competencias?: NotasPorCompetencia | null;
  /** Título da recomendação prioritária: o foco sugerido para o próximo treino. */
  foco?: string | null;
  /** Só no histórico do participante: devolutiva pronta esperando a pesquisa. */
  pesquisaPendente?: boolean;
};
type NotaJson = number | null | undefined;
export type LinhaResumo = {
  id: string;
  created_at: string;
  colaborador_id?: string | null;
  /** Dono do treino: 'admin:<id>' ou 'colab:<id>'. Decide o "Teste administrativo". */
  owner_key?: string | null;
  resumo: Omit<
    ResumoTreino,
    'id' | 'criadoEm' | 'testeAdmin' | 'competencias' | 'foco' | 'pesquisaPendente'
  >;
  // Projeções do histórico do participante (COLUNAS_HISTORICO_PARTICIPANTE).
  pl?: NotaJson;
  p?: NotaJson;
  a?: NotaJson;
  c?: NotaJson;
  e?: NotaJson;
  liberado?: unknown;
  foco?: unknown;
};
export type PontuacaoMatriz = ReturnType<typeof pontuacaoMatriz>;

/**
 * "Teste administrativo" é o treino criado por administrador da plataforma
 * (`owner_key` 'admin:…', a forma que `sim_vendas_criar` exige). Até 27/09/2026
 * saía de `!colaborador_id`, e a exclusão legada de um colaborador (que só zera
 * `colaborador_id`) fazia o treino REAL da pessoa desvinculada virar teste do
 * admin (V-6). Linha sem `owner_key` só vem da RPC da equipe antes da mig 271:
 * ali vale a regra antiga, que é o comportamento de antes da correção.
 */
export function ehTesteAdmin(r: Pick<LinhaResumo, 'owner_key' | 'colaborador_id'>) {
  if (typeof r.owner_key === 'string') return r.owner_key.startsWith('admin:');
  return !r.colaborador_id;
}
/** pace-4 e pace-5: matriz gravada, mas a média do resumo ficou na projeção 0 a 10 (sem Planejamento). */
export function notaVemDaMatriz(versao?: string | null) {
  return usaMatrizPace(versao ?? undefined) && !escalaNativa14(versao ?? undefined);
}
const nota = (n: NotaJson) => (typeof n === 'number' ? n : null);
/** Evolução e foco só de devolutiva LIBERADA e na escala 1 a 4 nativa (pace-6 em diante). */
function evolucaoDaLinha(r: LinhaResumo) {
  if (r.liberado == null || !escalaNativa14(r.resumo?.versaoRegua)) return {};
  return {
    competencias: { PL: nota(r.pl), P: nota(r.p), A: nota(r.a), C: nota(r.c), E: nota(r.e) },
    foco: typeof r.foco === 'string' && r.foco.trim() ? r.foco.trim() : null,
  };
}

/**
 * O item da lista. `notasMatriz`: notas pace-4/pace-5 recalculadas pela matriz
 * (V-5). `participante`: é o histórico da própria pessoa, e então a nota só
 * aparece depois da pesquisa de experiência (decisão D2 do dono, 27/09/2026,
 * que reverte a de 14/09): a nota à vista contaminava a resposta da pesquisa e
 * convidava a pular para outro treino. A gestão continua vendo a nota.
 */
export function resumoPublico(
  r: LinhaResumo,
  opcoes: { notasMatriz?: Map<string, PontuacaoMatriz>; participante?: boolean } = {},
): ResumoTreino & { escalaOriginal: '0-10' | null } {
  const notaPublica = opcoes.notasMatriz?.has(r.id)
    ? opcoes.notasMatriz.get(r.id)!.Media
    : notaPacePublica(r.resumo.nota, r.resumo.versaoRegua);
  const liberada = r.liberado != null;
  return {
    ...r.resumo,
    nota: opcoes.participante && !liberada ? null : notaPublica,
    escalaOriginal: escalaNativa14(r.resumo.versaoRegua) ? null : '0-10',
    id: r.id,
    criadoEm: r.created_at,
    testeAdmin: ehTesteAdmin(r),
    ...evolucaoDaLinha(r),
    ...(opcoes.participante
      ? {
          pesquisaPendente:
            r.resumo.status === VENDAS_SESSAO.CONCLUIDA &&
            r.resumo.temRelatorio === true &&
            !liberada,
        }
      : {}),
  };
}
