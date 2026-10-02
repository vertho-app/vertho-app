/**
 * Progresso do Diagnóstico (cenários) no painel da Fase 2.
 *
 * Duas réguas que já existem, sem escrever uma terceira:
 *
 * - QUANTO cada pessoa responde = o Top 5 do cargo dela, contado por
 *   `progressoMapeamentoPorPessoa`, a mesma do /admin/andamento e da home do RH.
 *   Até 02/10/2026 a tela multiplicava o roster por 2 fixo: na Amazon Bowling,
 *   com 6 competências em todo cargo, 13 pessoas viravam "26 cenários" em vez
 *   de 78, e quem respondesse os 6 contaria só 2.
 * - QUEM já pode responder = `canAccessDiagnosticoNaOrdem`, o gate que a pessoa
 *   enfrenta. Quem ainda não fez o Perfil comportamental fica no total, num
 *   grupo próprio, em vez de sumir da conta: a Bowling tinha 14 pessoas e a
 *   tela dizia "1 de 13" sem citar a 14ª.
 *
 * Os grupos são disjuntos e somam `total`: respondeu → cargo sem competências →
 * falta o Perfil → pode responder.
 */
import { progressoMapeamentoPorPessoa, type CargoMapeamento } from '@/lib/mapeamento-competencias';
import { canAccessDiagnosticoNaOrdem } from '@/lib/access-gates/diagnostico-ordem';

export type PessoaDiagnostico = {
  id: string;
  nome_completo: string;
  cargo: string | null;
  perfil_dominante: string | null;
};

export type RespostaDiagnostico = {
  colaborador_id?: string | null;
  competencia_nome?: string | null;
};

export type ProgressoDiagnostico = {
  total: number;
  /** Tem ao menos uma resposta (começou o Diagnóstico). */
  responderam: PessoaDiagnostico[];
  /** Sem resposta e com o gate aberto: é quem o RH cobra. */
  podemResponder: PessoaDiagnostico[];
  /** Sem resposta e barrada pela ordem: precisa do Perfil comportamental antes. */
  faltaPerfil: PessoaDiagnostico[];
  /** Cargo sem Top 5: não há cenário para responder, fica fora da conta de cenários. */
  semCompetencias: PessoaDiagnostico[];
  cenarios: { respondidos: number; esperados: number };
};

export function progressoDiagnostico(
  pessoas: PessoaDiagnostico[],
  cargos: CargoMapeamento[],
  respostas: RespostaDiagnostico[],
  perfilExternoFonte: string | null,
): ProgressoDiagnostico {
  const comResposta = new Set(
    (respostas || []).map((r) => String(r.colaborador_id || '')).filter(Boolean),
  );
  const porPessoa = progressoMapeamentoPorPessoa(
    pessoas || [],
    cargos || [],
    (respostas || []).map((r) => ({ colaborador_id: r.colaborador_id, competencia: r.competencia_nome })),
  );

  const out: ProgressoDiagnostico = {
    total: 0,
    responderam: [],
    podemResponder: [],
    faltaPerfil: [],
    semCompetencias: [],
    cenarios: { respondidos: 0, esperados: 0 },
  };

  for (const pessoa of pessoas || []) {
    out.total++;
    const { feitas, total } = porPessoa.get(pessoa.id) || { feitas: 0, total: 0 };
    out.cenarios.esperados += total;
    out.cenarios.respondidos += feitas;

    if (comResposta.has(pessoa.id)) { out.responderam.push(pessoa); continue; }
    if (total === 0) { out.semCompetencias.push(pessoa); continue; }
    const ordem = canAccessDiagnosticoNaOrdem({ perfil_externo_fonte: perfilExternoFonte }, pessoa, false);
    (ordem.allowed ? out.podemResponder : out.faltaPerfil).push(pessoa);
  }
  return out;
}
