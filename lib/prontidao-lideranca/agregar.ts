/**
 * AGREGAÇÃO — junta as duas camadas por pessoa a partir do banco. Núcleo SEM
 * gate: recebe um client já autorizado (service-role) e o `empresaId` decidido
 * por quem chamou (sessão do RH ou rota do admin). Quem expõe à web é
 * `actions/prontidao-lideranca.ts`.
 *
 * Três regras herdadas de quem já leu estas tabelas antes:
 *
 * 1. Erro de leitura LANÇA (padrão de `aggregateAdequacao`): é caminho de
 *    construção, há humano para consertar — e "sem dados" nunca pode ser o
 *    disfarce de uma query que falhou.
 * 2. Tudo que vem em lista é PAGINADO. `db-max-rows` corta em 1.000 sem erro;
 *    42 pessoas × 30 descritores já passam disso, e a ausência aqui viraria
 *    "mapeamento incompleto" para quem completou (medido em F-V5).
 * 3. `role='rh'` e e-mails internos ficam fora da população, como no DNA.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { aggregateAdequacao, type PessoaAdequacao } from '@/lib/adequacao-cargo/aggregate';
import { isInternalEmail } from '@/lib/internal-emails';
import { resolverEscopoDeLote } from '@/lib/turmas/escopo';
import { chaveCompetencia, type ConfigProntidaoLideranca, type CargoParaValidacao } from './config';
import { calcularPosicoes, type NotaDescritor, type PosicaoPessoa } from './posicao';
import { lerEstilo, type EstiloPessoa, type Faixas } from './estilo';
import { montarLinha, ordenarLinhas, contarPorQuadrante, type LinhaMatriz, type Quadrante } from './matriz';
import { extrairEvidencias, normalizarAuditoria, type EvidenciasCompetencia } from './evidencias';
import { calibrarComExemplares, type Calibragem } from './calibragem';

const PAGINA = 1000;

/** Lê todas as páginas de uma query. `montar` recebe (de, até) e devolve a cadeia com `.range` aplicado. */
async function lerTudo<T>(montar: (de: number, ate: number) => any, rotulo: string): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await montar(de, de + PAGINA - 1);
    if (error) throw new Error(`não foi possível ler ${rotulo}: ${error.message}`);
    const pagina: T[] = data || [];
    out.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return out;
}

export interface PessoaPopulacao { id: string; nome: string; cargo: string | null; email: string | null }

/** População do programa: escopo (empresa inteira ou turma) menos rh e internos. */
export async function carregarPopulacao(sb: any, empresaId: string, cfg: ConfigProntidaoLideranca): Promise<PessoaPopulacao[]> {
  let ids: string[] | null = null;
  if (cfg.escopo.tipo === 'turma') {
    const escopo = await resolverEscopoDeLote(sb, empresaId, { tipo: 'turma', turmaId: cfg.escopo.turmaId } as any);
    ids = escopo.colaboradorIds;
    if (!ids.length) return [];
  }
  const rows = await lerTudo<any>((de, ate) => {
    let q = sb.from('colaboradores').select('id, nome_completo, cargo, email, role').eq('empresa_id', empresaId);
    if (ids) q = q.in('id', ids);
    return q.order('nome_completo').range(de, ate);
  }, 'os colaboradores');
  return rows
    .filter((c) => c.role !== 'rh' && !isInternalEmail(c.email))
    .map((c) => ({ id: c.id, nome: c.nome_completo || 'Colaborador', cargo: c.cargo || null, email: c.email || null }));
}

/** Cargos do tenant no formato que a validação da config consome. */
export async function carregarCargosParaValidacao(sb: any, empresaId: string): Promise<CargoParaValidacao[]> {
  const { data, error } = await sb.from('cargos_empresa').select('nome, gabarito, top5_workshop').eq('empresa_id', empresaId);
  if (error) throw new Error(`não foi possível ler os cargos: ${error.message}`);
  return (data || []).map((c: any) => ({
    nome: c.nome,
    temGabarito: !!c.gabarito?.tela4,
    top5: Array.isArray(c.top5_workshop) ? c.top5_workshop.map((s: unknown) => String(s ?? '').trim()).filter(Boolean) : [],
  }));
}

async function carregarNotas(sb: any, empresaId: string, ids: string[], competencias: string[]): Promise<NotaDescritor[]> {
  if (!ids.length) return [];
  const chaves = new Set(competencias.map(chaveCompetencia));
  const rows = await lerTudo<any>((de, ate) => sb.from('descriptor_assessments')
    .select('colaborador_id, competencia, descritor, nota')
    .eq('empresa_id', empresaId)
    .in('colaborador_id', ids)
    .order('id')            // paginação sem ORDER BY repete/pula linha entre páginas
    .range(de, ate), 'as notas por descritor');
  return rows
    .filter((r) => chaves.has(chaveCompetencia(r.competencia)))
    .map((r) => ({ colaboradorId: r.colaborador_id, competencia: r.competencia, descritor: r.descritor, nota: Number(r.nota) }));
}

async function carregarAuditoria(sb: any, empresaId: string, ids: string[], competencias: string[]): Promise<Map<string, boolean>> {
  const pendente = new Map<string, boolean>();
  if (!ids.length) return pendente;
  const chaves = new Set(competencias.map(chaveCompetencia));
  const rows = await lerTudo<any>((de, ate) => sb.from('respostas')
    .select('colaborador_id, competencia_nome, status_ia4')
    .eq('empresa_id', empresaId)
    .in('colaborador_id', ids)
    .order('id')
    .range(de, ate), 'as respostas');
  for (const r of rows) {
    if (!chaves.has(chaveCompetencia(r.competencia_nome))) continue;
    if (normalizarAuditoria(r.status_ia4) === 'revisar') pendente.set(r.colaborador_id, true);
  }
  return pendente;
}

export interface PessoaIncompleta { colaboradorId: string; nome: string; cargo: string | null; cobertas: number; total: number; faltantes: string[] }
export interface PessoaSemEstilo { colaboradorId: string; nome: string; cargo: string | null; motivo: string }

export interface ProntidaoLideranca {
  cargoAlvo: string;
  competencias: string[];
  /** ISO do instante do cálculo — não é snapshot, e a tela diz isso. */
  calculadoEm: string;
  corte: number;
  banda: number;
  populacao: number;
  linhas: LinhaMatriz[];
  porQuadrante: Record<Quadrante, number>;
  incompletos: PessoaIncompleta[];
  /** Posição completa, mas sem perfil comportamental (ou sem gabarito do alvo): não entra na matriz. */
  semEstilo: PessoaSemEstilo[];
  naoIniciados: number;
  exemplares: string[];
  faixas: Faixas | null;
  avisos: string[];
}

/**
 * A leitura completa do programa. Cruza por `colaborador_id`; quem não tem as
 * duas pontas vai para a lista própria com o motivo — nunca some.
 */
export async function agregarProntidaoLideranca(sb: any, empresaId: string, cfg: ConfigProntidaoLideranca): Promise<ProntidaoLideranca> {
  const avisos: string[] = [];
  const [populacao, cargos] = await Promise.all([carregarPopulacao(sb, empresaId, cfg), carregarCargosParaValidacao(sb, empresaId)]);
  const alvo = cargos.find((c) => chaveCompetencia(c.nome) === chaveCompetencia(cfg.cargo_alvo)) || null;
  const competencias = alvo?.top5 || [];
  if (!alvo) avisos.push(`Cargo-alvo "${cfg.cargo_alvo}" não existe mais em cargos_empresa.`);
  else if (!competencias.length) avisos.push(`Cargo-alvo "${alvo.nome}" está sem Top 5 — não há o que medir.`);

  const ids = populacao.map((p) => p.id);
  const [notas, auditoria] = await Promise.all([
    carregarNotas(sb, empresaId, ids, competencias),
    carregarAuditoria(sb, empresaId, ids, competencias),
  ]);
  const posicoes = competencias.length ? calcularPosicoes(notas, competencias, cfg.corte_nota, cfg.banda) : new Map<string, PosicaoPessoa>();

  // Eixo X: aderência ao gabarito do cargo-alvo, para os cargos presentes na população.
  const cargosDaPopulacao = [...new Set(populacao.map((p) => p.cargo).filter(Boolean))] as string[];
  let estilos = new Map<string, EstiloPessoa>();
  let faixas: Faixas | null = null;
  if (alvo?.temGabarito && cargosDaPopulacao.length) {
    const adequacao = await aggregateAdequacao(sb as SupabaseClient, empresaId, alvo.nome, { poolCargos: cargosDaPopulacao });
    if (adequacao.semGabarito) avisos.push('O cargo-alvo não tem gabarito (perfil ideal): o eixo de estilo fica indisponível.');
    else {
      faixas = adequacao.perfilIdeal?.faixas || null;
      if (!faixas) avisos.push('Gabarito sem faixas de corte declaradas — o estilo usa o status do motor.');
      for (const p of adequacao.pessoas as PessoaAdequacao[]) if (p.id) estilos.set(p.id, lerEstilo(p, faixas));
      const semDiscriminacao = adequacao.avisosCalibracao?.length || 0;
      if (semDiscriminacao) avisos.push(`${semDiscriminacao} medida(s) do gabarito do alvo não discriminam neste pool (ver Calibração do gabarito).`);
    }
  } else if (alvo && !alvo.temGabarito) {
    avisos.push('O cargo-alvo não tem gabarito (perfil ideal): o eixo de estilo fica indisponível.');
  }

  const exemplares = new Set(cfg.exemplares);
  const linhas: LinhaMatriz[] = [];
  const incompletos: PessoaIncompleta[] = [];
  const semEstilo: PessoaSemEstilo[] = [];
  let naoIniciados = 0;
  for (const p of populacao) {
    const pos = posicoes.get(p.id);
    if (!pos) { naoIniciados += 1; continue; }
    if (!pos.completo) {
      incompletos.push({ colaboradorId: p.id, nome: p.nome, cargo: p.cargo, cobertas: pos.cobertas, total: pos.total, faltantes: pos.faltantes });
      continue;
    }
    const est = estilos.get(p.id);
    if (!est) {
      semEstilo.push({ colaboradorId: p.id, nome: p.nome, cargo: p.cargo, motivo: faixas || estilos.size ? 'sem perfil comportamental' : 'eixo de estilo indisponível' });
      continue;
    }
    const linha = montarLinha({
      colaboradorId: p.id, nome: p.nome, cargo: p.cargo, posicao: pos, estilo: est, corte: cfg.corte_nota,
      ehExemplar: exemplares.has(p.id), auditoriaPendente: auditoria.get(p.id) === true,
    });
    if (linha) linhas.push(linha);
  }

  const ordenadas = ordenarLinhas(linhas);
  return {
    cargoAlvo: alvo?.nome || cfg.cargo_alvo,
    competencias,
    calculadoEm: new Date().toISOString(),
    corte: cfg.corte_nota,
    banda: cfg.banda,
    populacao: populacao.length,
    linhas: ordenadas,
    porQuadrante: contarPorQuadrante(ordenadas),
    incompletos,
    semEstilo,
    naoIniciados,
    exemplares: cfg.exemplares,
    faixas,
    avisos,
  };
}

export interface Parecer {
  linha: LinhaMatriz;
  evidencias: EvidenciasCompetencia[];
  calculadoEm: string;
  cargoAlvo: string;
  corte: number;
  banda: number;
}

/**
 * O parecer de UMA pessoa = a linha dela na matriz (os mesmos números) + as
 * evidências literais por competência do programa.
 */
export async function carregarParecer(sb: any, empresaId: string, colaboradorId: string, cfg: ConfigProntidaoLideranca): Promise<Parecer | { indisponivel: string }> {
  const agg = await agregarProntidaoLideranca(sb, empresaId, cfg);
  const linha = agg.linhas.find((l) => l.colaboradorId === colaboradorId);
  if (!linha) {
    const inc = agg.incompletos.find((i) => i.colaboradorId === colaboradorId);
    if (inc) return { indisponivel: `Mapeamento incompleto: faltam ${inc.faltantes.join(', ')}.` };
    const se = agg.semEstilo.find((s) => s.colaboradorId === colaboradorId);
    if (se) return { indisponivel: `Sem eixo de estilo: ${se.motivo}.` };
    return { indisponivel: 'Pessoa fora da população do programa ou sem mapeamento iniciado.' };
  }
  const chaves = new Set(agg.competencias.map(chaveCompetencia));
  const { data, error } = await sb.from('respostas')
    .select('id, competencia_id, competencia_nome, avaliacao_ia, status_ia4, avaliado_em, feedback_ia4')
    .eq('empresa_id', empresaId)
    .eq('colaborador_id', colaboradorId);
  if (error) throw new Error(`não foi possível ler as respostas: ${error.message}`);
  const porComp = new Map<string, EvidenciasCompetencia>();
  for (const r of data || []) {
    const chave = chaveCompetencia(r.competencia_nome);
    if (!chaves.has(chave)) continue;
    porComp.set(chave, extrairEvidencias(r));
  }
  const evidencias = agg.competencias.map((c) => porComp.get(chaveCompetencia(c)) || {
    respostaId: null, competenciaId: null, competencia: c, auditoria: null, avaliadoEm: null, feedback: null, descritores: [],
  });
  return { linha, evidencias, calculadoEm: agg.calculadoEm, cargoAlvo: agg.cargoAlvo, corte: agg.corte, banda: agg.banda };
}

/** Calibragem: onde o instrumento coloca os líderes de referência. */
export async function carregarCalibragem(sb: any, empresaId: string, cfg: ConfigProntidaoLideranca): Promise<Calibragem & { competencias: string[] }> {
  const cargos = await carregarCargosParaValidacao(sb, empresaId);
  const alvo = cargos.find((c) => chaveCompetencia(c.nome) === chaveCompetencia(cfg.cargo_alvo));
  const competencias = alvo?.top5 || [];
  const ids = cfg.exemplares;
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data, error } = await sb.from('colaboradores').select('id, nome_completo').eq('empresa_id', empresaId).in('id', ids);
    if (error) throw new Error(`não foi possível ler os exemplares: ${error.message}`);
    for (const c of data || []) nomes.set(c.id, c.nome_completo || c.id);
  }
  const notas = await carregarNotas(sb, empresaId, ids, competencias);
  return { ...calibrarComExemplares({ notas, exemplares: ids, competencias, corte: cfg.corte_nota, nomes }), competencias };
}
