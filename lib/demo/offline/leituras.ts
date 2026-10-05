/**
 * Relatório do Gestor e do RH do pacote offline, pelo MESMO construtor que a
 * sala online recebe por último a cada reset (`sincronizarLeiturasDemo`).
 *
 * Por que não o texto do fixture (R-136, 05/10/2026): o relatório do RH e o do
 * gestor da rede de escolas eram a prosa congelada da IA, e ela cita nota com
 * duas casas ("Marina Rocha (1,52)", "média geral de 2,51"). O cliente só vê
 * nível e avanço (decisão 1 da revisão de 02/10). O construtor lê as notas do
 * elenco, devolve só o nível e conta pessoas por nível, então a tela e o PDF do
 * pacote dizem o que a sala online diz, sem decimal.
 *
 * Puro: sem rede, sem banco, sem IA.
 */
import { construirLeiturasDemo } from '@/lib/demo/relatorios-coerentes';
import type { OfflinePerson, ReportValue } from './types';

/** O que o construtor lê de cada pessoa do elenco (os campos que o roster declara). */
export type PessoaDoElenco = {
  key: string;
  email: string;
  nome_completo: string;
  cargo: string;
  role: string;
  gestor_email?: string | null;
};

const CHAVES_DO_GESTOR = [
  'resumo_executivo',
  'destaques_evolucao',
  'ranking_atencao',
  'analise_por_competencia',
  'acoes',
  'mensagem_final',
] as const;

const CHAVES_DO_RH = [
  'resumo_executivo',
  'indicadores',
  'competencias_criticas',
  'visao_por_cargo',
  'treinamentos_sugeridos',
  'plano_acao',
  'decisoes_chave',
  'mensagem_final',
] as const;

function recorte(fonte: Record<string, unknown>, chaves: readonly string[]): Record<string, ReportValue> {
  return Object.fromEntries(
    chaves.filter((chave) => fonte?.[chave] != null).map((chave) => [chave, fonte[chave] as ReportValue]),
  );
}

/**
 * O Top 5 de um cargo, no que o elenco mostra: as competências que alguém do cargo
 * respondeu. Quem só lidera (Gerente Comercial, Coordenação) não responde nenhuma, e
 * o construtor o trata como cargo sem mapeamento, como o reset faz.
 */
function cargosDoElenco(elenco: PessoaDoElenco[], avaliacoes: Record<string, OfflinePerson['assessments']>) {
  return [...new Set(elenco.map((pessoa) => pessoa.cargo))].map((nome) => ({
    nome,
    top5_workshop: [...new Set(
      elenco.filter((pessoa) => pessoa.cargo === nome)
        .flatMap((pessoa) => (avaliacoes[pessoa.key] || []).map((item) => item.competency)),
    )],
  }));
}

export function leiturasDoElenco(
  marca: string,
  elenco: PessoaDoElenco[],
  avaliacoes: Record<string, OfflinePerson['assessments']>,
  chaveDoGestor: string,
) {
  const pessoas = elenco.map((pessoa) => ({ id: pessoa.key, email: pessoa.email, nome_completo: pessoa.nome_completo, cargo: pessoa.cargo, role: pessoa.role, gestor_email: pessoa.gestor_email ?? null }));
  const notas = elenco.flatMap((pessoa) => (avaliacoes[pessoa.key] || []).map((item) => ({
    colaborador_id: pessoa.key, competencia: item.competency, descritor: item.descriptor, nota: item.score,
  })));
  const relatorios = construirLeiturasDemo(marca, pessoas, cargosDoElenco(elenco, avaliacoes), notas);
  const gestor = relatorios.find((relatorio) => relatorio.tipo === 'gestor' && relatorio.colaboradorId === chaveDoGestor);
  const rh = relatorios.find((relatorio) => relatorio.tipo === 'rh');
  if (!gestor || !rh) throw new Error(`leituras do pacote offline: sem relatório de ${!gestor ? `gestor (${chaveDoGestor})` : 'RH'}`);
  return {
    coordination: recorte(gestor.conteudo as Record<string, unknown>, CHAVES_DO_GESTOR),
    direction: recorte(rh.conteudo as Record<string, unknown>, CHAVES_DO_RH),
  };
}
