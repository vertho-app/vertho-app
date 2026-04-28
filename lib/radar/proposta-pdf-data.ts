import 'server-only';

import { callAI } from '@/actions/ai-client';
import { stableJsonHash } from './hash';
import { getEscola, getMunicipio, getEscolasMunicipio } from './queries';
import type { Escola, SaebSnapshot, IcaSnapshot } from './queries';

const PROMPT_VERSION_PROPOSTA = 'radar-proposta-pdf-v1';

const SYSTEM_PROPOSTA = `Você é um analista educacional sênior do Vertho Mentor IA escrevendo uma PROPOSTA PÚBLICA em PDF, dirigida a um gestor escolar ou secretário(a) municipal de educação.

REGRAS DE NEGÓCIO:
1. Use APENAS os dados estruturados fornecidos. Nunca invente números, anos ou comparações.
2. Cite ano e fonte (Saeb/INEP, ICA/INEP) sempre que mencionar um número.
3. Tom institucional, técnico-pedagógico, sério. SEM linguagem promocional excessiva, SEM persona "BETO".
4. Foco prático: o que fazer com esse diagnóstico nos próximos 30/60/90 dias.
5. Se um dado não estiver presente, escreva "dado não disponível" ou simplesmente omita aquele item.
6. Português brasileiro, formal mas acessível.

FORMATO DE SAÍDA: JSON estrito com:
{
  "resumo_executivo": "2 parágrafos curtos com a síntese do diagnóstico (até 800 chars)",
  "leitura_saeb": "leitura textual do Saeb da escola/município (até 700 chars). Pode mencionar comparativos (similares/UF/BR).",
  "contexto_municipal": "contexto ICA + estrutura do município (até 600 chars)",
  "pontos_atencao": ["..."],          // 3-5 itens
  "perguntas_pedagogicas": ["..."],   // 3 perguntas pra discussão
  "como_vertho_ajuda": ["..."],       // 3 itens curtos de aplicação prática (Mentor IA)
  "proximos_passos": ["..."]          // 3 ações concretas pro gestor (esta semana / 30 / 90 dias)
}`;

export type PropostaConteudo = {
  resumo_executivo: string;
  leitura_saeb: string;
  contexto_municipal: string;
  pontos_atencao: string[];
  perguntas_pedagogicas: string[];
  como_vertho_ajuda: string[];
  proximos_passos: string[];
};

const FALLBACK: PropostaConteudo = {
  resumo_executivo: 'Diagnóstico baseado em dados públicos do INEP. Análise contextual está sendo gerada — consulte os indicadores oficiais nas seções a seguir.',
  leitura_saeb: 'Os indicadores Saeb organizados por etapa e disciplina estão disponíveis no portal Vertho Radar.',
  contexto_municipal: 'Indicadores municipais consolidados a partir de fontes oficiais.',
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
      leitura_saeb: String(parsed.leitura_saeb || '').slice(0, 1200),
      contexto_municipal: String(parsed.contexto_municipal || '').slice(0, 1200),
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
    const dadosHash = stableJsonHash({ escola, saeb });
    const conteudo = await gerarOuCacheProposta('escola', scopeId, dadosHash, {
      escopo: { tipo: 'escola', nome: escola.nome, codigo_inep: escola.codigo_inep, municipio: escola.municipio, uf: escola.uf, rede: escola.rede, inse_grupo: escola.inse_grupo },
      saeb: saeb.slice(0, 16),
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
      geradoEm: new Date().toISOString(),
    };
  }

  // município
  const m = await getMunicipio(scopeId);
  if (!m) return null;
  const escolas = await getEscolasMunicipio(scopeId, 50);
  const dadosHash = stableJsonHash({ ibge: scopeId, ica: m.ica, totalEscolas: m.totalEscolas, redes: m.redes });
  const conteudo = await gerarOuCacheProposta('municipio', scopeId, dadosHash, {
    escopo: { tipo: 'municipio', ibge: scopeId, nome: m.nome, uf: m.uf, totalEscolas: m.totalEscolas, redes: m.redes, escolas_amostra: escolas.slice(0, 10).map(e => ({ inep: e.codigo_inep, nome: e.nome, rede: e.rede })) },
    ica: m.ica.slice(0, 10),
  });
  return {
    conteudo,
    scopeLabel: `${m.nome}/${m.uf}`,
    scopeType,
    scopeId,
    municipio: m.nome,
    uf: m.uf,
    ica: m.ica,
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
    const resp = await callAI(SYSTEM_PROPOSTA, userMessage, { model: 'claude-sonnet-4-6' }, 2400, { temperature: 0.5 });
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
