import 'server-only';

import { callAI } from '@/actions/ai-client';
import { stableJsonHash } from './hash';
import {
  filterComparableEnem,
  getEscola,
  getMunicipio,
  getEscolasMunicipio,
  getEscolaBenchmarks,
  getEscolaInfraSaeb,
  getParesCidade,
  getMunicipioVariabilidade,
  getMunicipioBenchmarks,
} from './queries';
import type {
  Escola,
  SaebSnapshot,
  IcaSnapshot,
  EnemEscolaSnapshot,
  MunicipioEnemAggregate,
  CensoInfra,
  IdebSnapshot,
  MunicipioIdebAggregate,
  SarespSnapshot,
  PddeRepasse,
  PddeMunicipal,
  FundebRepasse,
  VaarSnapshot,
  FundebReceitaPrevista,
  EscolaBenchmarkRow,
  BenchmarkRow,
  EscolaInfraSaeb,
  ParCidade,
  MunicipioVariabilidade,
} from './queries';

const PROMPT_VERSION_PROPOSTA = 'radar-proposta-pdf-v3';

const SYSTEM_PROPOSTA = `Você é um analista educacional sênior do Vertho Mentor IA escrevendo uma PROPOSTA PÚBLICA em PDF, dirigida a um gestor escolar ou secretário(a) municipal de educação.

REGRAS DE NEGÓCIO:
1. Use APENAS os dados estruturados fornecidos. Nunca invente números, anos ou comparações.
2. Cite ano e fonte (Saeb/INEP, Ideb/INEP, ICA/INEP, Censo/INEP, Enem/INEP, SARESP/Seduc-SP, FUNDEB/Tesouro, PDDE/FNDE) sempre que mencionar um número.
3. Tom institucional, técnico-pedagógico, sério. SEM linguagem promocional excessiva, SEM persona "BETO".
4. Foco prático: o que fazer com esse diagnóstico nos próximos 30/60/90 dias.
5. Se um dado não estiver presente, escreva "dado não disponível" ou simplesmente omita aquele item.
6. Quando houver Ideb com meta vs realizado, cite explicitamente status (atingiu/superou/abaixo).
7. Quando houver scores de Censo, mencione a dimensão mais frágil. Quando houver cruzamento Infra×Saeb (quadrante), explique se a escola está em "dupla vulnerabilidade" ou "faz mais com menos".
8. Quando houver pares INSE da mesma cidade, posicione a escola no ranking de forma sóbria (sem competitividade).
9. Quando houver FUNDEB ou VAAR, conecte recursos disponíveis a desafios pedagógicos.
10. Português brasileiro, formal mas acessível.

FORMATO DE SAÍDA: JSON estrito com:
{
  "resumo_executivo": "2 parágrafos curtos com a síntese do diagnóstico (até 800 chars)",
  "leitura_saeb": "leitura textual dos resultados de aprendizagem do Saeb e, quando houver, do Ideb e do Enem comparável (até 800 chars).",
  "contexto_municipal": "contexto ICA + estrutura do município +, quando houver, leitura agregada do Ideb, Enem e variabilidade entre escolas (até 700 chars)",
  "leitura_infra": "leitura curta da infraestrutura escolar (Censo) destacando a dimensão mais frágil e o quadrante Infra×Saeb quando disponível. Até 500 chars. Use string vazia se não houver Censo.",
  "leitura_recursos": "leitura curta dos recursos disponíveis (FUNDEB/VAAR/PDDE), conectando a desafios pedagógicos. Até 500 chars. Use string vazia se não houver dado.",
  "pontos_atencao": ["..."],          // 3-5 itens
  "perguntas_pedagogicas": ["..."],   // 3 perguntas pra discussão
  "como_vertho_ajuda": ["..."],       // 3 itens curtos de aplicação prática (Mentor IA)
  "proximos_passos": ["..."]          // 3 ações concretas pro gestor (esta semana / 30 / 90 dias)
}`;

export type PropostaConteudo = {
  resumo_executivo: string;
  leitura_saeb: string;
  contexto_municipal: string;
  leitura_infra: string;
  leitura_recursos: string;
  pontos_atencao: string[];
  perguntas_pedagogicas: string[];
  como_vertho_ajuda: string[];
  proximos_passos: string[];
};

const FALLBACK: PropostaConteudo = {
  resumo_executivo: 'Diagnóstico baseado em dados públicos do INEP. Análise contextual está sendo gerada — consulte os indicadores oficiais nas seções a seguir.',
  leitura_saeb: 'Os indicadores Saeb organizados por etapa e disciplina estão disponíveis no portal Vertho Radar.',
  contexto_municipal: 'Indicadores municipais consolidados a partir de fontes oficiais.',
  leitura_infra: '',
  leitura_recursos: '',
  pontos_atencao: [],
  perguntas_pedagogicas: [],
  como_vertho_ajuda: [
    'Mapeamento de competências docentes com IA contextualizada.',
    'Trilhas individuais de desenvolvimento pedagógico.',
    'Acompanhamento e relatórios para a secretaria.',
  ],
  proximos_passos: [],
};

function extractJson(text: string): PropostaConteudo | null {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const json = fenced ? fenced[1] : text;
    const start = json.indexOf('{');
    const end = json.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(json.slice(start, end + 1));
    return {
      resumo_executivo: String(parsed.resumo_executivo || '').slice(0, 1500),
      leitura_saeb: String(parsed.leitura_saeb || '').slice(0, 1400),
      contexto_municipal: String(parsed.contexto_municipal || '').slice(0, 1300),
      leitura_infra: String(parsed.leitura_infra || '').slice(0, 900),
      leitura_recursos: String(parsed.leitura_recursos || '').slice(0, 900),
      pontos_atencao: Array.isArray(parsed.pontos_atencao) ? parsed.pontos_atencao.slice(0, 5).map(String) : [],
      perguntas_pedagogicas: Array.isArray(parsed.perguntas_pedagogicas) ? parsed.perguntas_pedagogicas.slice(0, 4).map(String) : [],
      como_vertho_ajuda: Array.isArray(parsed.como_vertho_ajuda) ? parsed.como_vertho_ajuda.slice(0, 4).map(String) : [],
      proximos_passos: Array.isArray(parsed.proximos_passos) ? parsed.proximos_passos.slice(0, 4).map(String) : [],
    };
  } catch {
    return null;
  }
}

export type PropostaPayload = {
  conteudo: PropostaConteudo;
  scopeLabel: string;
  scopeType: 'escola' | 'municipio';
  scopeId: string;
  uf: string;
  municipio: string;
  // Dados estruturados pra renderizar tabelas/gráficos no PDF
  escola?: Escola | null;
  saeb?: SaebSnapshot[];
  ica?: IcaSnapshot[];
  enemEscola?: EnemEscolaSnapshot[];
  enemMunicipio?: MunicipioEnemAggregate[];
  ideb?: IdebSnapshot[];
  idebMunicipio?: MunicipioIdebAggregate[];
  censo?: CensoInfra | null;
  saresp?: SarespSnapshot[];
  pdde?: PddeRepasse[];
  pddeMunicipal?: PddeMunicipal[];
  fundeb?: FundebRepasse[];
  vaar?: VaarSnapshot | null;
  receitaPrevista?: FundebReceitaPrevista | null;
  benchmarks?: EscolaBenchmarkRow[];
  benchmarksMunicipio?: BenchmarkRow[];
  infraSaeb?: EscolaInfraSaeb | null;
  paresInse?: ParCidade[];
  variabilidade?: MunicipioVariabilidade | null;
  totalEscolas?: number;
  geradoEm: string;
};

export async function montarPropostaPayload(
  scopeType: 'escola' | 'municipio',
  scopeId: string,
): Promise<PropostaPayload | null> {
  if (scopeType === 'escola') {
    const r = await getEscola(scopeId);
    if (!r?.escola) return null;
    const escola = r.escola;
    const saeb = r.saeb;
    const ideb = r.ideb;
    const censo = r.censo;
    const saresp = r.saresp;
    const pdde = r.pdde;
    const enemEscola = filterComparableEnem(r.enem || []);

    const [benchmarks, infraSaebRes, paresInse] = await Promise.all([
      getEscolaBenchmarks(scopeId),
      getEscolaInfraSaeb(scopeId),
      getParesCidade(scopeId, 8),
    ]);
    const infraSaeb = infraSaebRes.resumo;

    const dadosHash = stableJsonHash({
      escola, saeb, enemEscola, ideb, censo, saresp, pdde, infraSaeb, paresInse,
    });
    const conteudo = await gerarOuCacheProposta('escola', scopeId, dadosHash, {
      escopo: { tipo: 'escola', nome: escola.nome, codigo_inep: escola.codigo_inep, municipio: escola.municipio, uf: escola.uf, rede: escola.rede, inse_grupo: escola.inse_grupo, microrregiao: escola.microrregiao, zona: escola.zona },
      saeb: saeb.slice(0, 16),
      enem: enemEscola.slice(0, 4),
      ideb: ideb.slice(0, 12),
      censo_scores: censo ? {
        basica: censo.score_basica,
        pedagogica: censo.score_pedagogica,
        acessibilidade: censo.score_acessibilidade,
        conectividade: censo.score_conectividade,
      } : null,
      saresp: saresp.slice(0, 8),
      pdde: pdde.slice(0, 4),
      cruzamento_infra_saeb: infraSaeb ? {
        quadrante: infraSaeb.quadrante,
        score_geral: infraSaeb.score_geral,
        pct_n0_avg_simples: infraSaeb.pct_n0_avg_simples,
        n0_diff_mediana: infraSaeb.n0_diff_mediana,
      } : null,
      benchmarks: (benchmarks || []).slice(0, 4),
      pares_inse_cidade: paresInse.slice(0, 8).map((p) => ({
        nome: p.nome, is_target: p.is_target, saeb_geral: p.saeb_geral,
        ideb_principal: p.ideb_principal, rank_geral: p.rank_geral, total_pares: p.total_pares,
      })),
    });
    return {
      conteudo,
      scopeLabel: escola.nome,
      scopeType,
      scopeId,
      municipio: escola.municipio,
      uf: escola.uf,
      escola,
      saeb,
      enemEscola,
      ideb,
      censo,
      saresp,
      pdde,
      benchmarks,
      infraSaeb,
      paresInse,
      geradoEm: new Date().toISOString(),
    };
  }

  // município
  const m = await getMunicipio(scopeId);
  if (!m) return null;
  const escolas = await getEscolasMunicipio(scopeId, 50);
  const [variabilidade, benchmarksMunicipio] = await Promise.all([
    getMunicipioVariabilidade(scopeId),
    getMunicipioBenchmarks(scopeId),
  ]);

  const dadosHash = stableJsonHash({
    ibge: scopeId,
    ica: m.ica,
    enem: m.enem,
    ideb: m.ideb,
    fundeb: m.fundeb,
    pddeMunicipal: m.pddeMunicipal,
    vaar: m.vaar,
    receitaPrevista: m.receitaPrevista,
    variabilidade,
    totalEscolas: m.totalEscolas,
    redes: m.redes,
  });
  const conteudo = await gerarOuCacheProposta('municipio', scopeId, dadosHash, {
    escopo: { tipo: 'municipio', ibge: scopeId, nome: m.nome, uf: m.uf, totalEscolas: m.totalEscolas, redes: m.redes, escolas_amostra: escolas.slice(0, 10).map(e => ({ inep: e.codigo_inep, nome: e.nome, rede: e.rede })) },
    ica: m.ica.slice(0, 10),
    enem: m.enem.slice(0, 4),
    ideb_agregado: m.ideb.slice(0, 9),
    fundeb: (m.fundeb || []).slice(0, 6),
    pdde_municipal: (m.pddeMunicipal || []).slice(0, 6),
    vaar: m.vaar,
    receita_prevista: m.receitaPrevista,
    variabilidade,
    benchmarks: (benchmarksMunicipio || []).slice(0, 4),
  });
  return {
    conteudo,
    scopeLabel: `${m.nome}/${m.uf}`,
    scopeType,
    scopeId,
    municipio: m.nome,
    uf: m.uf,
    ica: m.ica,
    enemMunicipio: m.enem,
    idebMunicipio: m.ideb,
    fundeb: m.fundeb,
    pddeMunicipal: m.pddeMunicipal,
    vaar: m.vaar,
    receitaPrevista: m.receitaPrevista,
    variabilidade,
    benchmarksMunicipio,
    totalEscolas: m.totalEscolas,
    geradoEm: new Date().toISOString(),
  };
}

async function gerarOuCacheProposta(
  scopeType: 'escola' | 'municipio',
  scopeId: string,
  dadosHash: string,
  contextoIA: any,
): Promise<PropostaConteudo> {
  // Cache check
  const { createSupabaseAdmin } = await import('@/lib/supabase');
  const sb = createSupabaseAdmin();
  const { data: cached } = await sb
    .from('diag_analises_ia')
    .select('conteudo')
    .eq('scope_type', `proposta_${scopeType}`)
    .eq('scope_id', scopeId)
    .eq('prompt_version', PROMPT_VERSION_PROPOSTA)
    .eq('dados_hash', dadosHash)
    .maybeSingle();
  if (cached && (cached as any).conteudo?.resumo_executivo) {
    return (cached as any).conteudo as PropostaConteudo;
  }

  // Gera
  try {
    const userMessage = `Contexto da proposta:\n\n${JSON.stringify(contextoIA, null, 2)}\n\nProduza o JSON conforme o formato.`;
    const resp = await callAI(SYSTEM_PROPOSTA, userMessage, { model: 'claude-sonnet-4-6' }, 3500, { temperature: 0.5 });
    const parsed = extractJson(resp);
    if (parsed) {
      sb.from('diag_analises_ia').upsert({
        scope_type: `proposta_${scopeType}`,
        scope_id: scopeId,
        prompt_version: PROMPT_VERSION_PROPOSTA,
        dados_hash: dadosHash,
        conteudo: parsed,
        modelo: 'claude-sonnet-4-6',
      }, {
        onConflict: 'scope_type,scope_id,prompt_version,dados_hash',
      }).then(() => {});
      return parsed;
    }
  } catch (err) {
    console.error('[proposta-pdf] geração IA falhou', err);
  }
  return FALLBACK;
}
