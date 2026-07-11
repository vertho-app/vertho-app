/**
 * Núcleo da IA-autora de Módulos-Base: prompt de sistema, montagem do user prompt
 * e validação do corpo devolvido.
 *
 * Vive em `lib/` — e não em `actions/modulos-base.ts` — porque as tasks do
 * Trigger.dev precisam do MESMO prompt (batch de manuscrito), e um arquivo
 * `'use server'` não pode ser importado por elas sem transformar cada export
 * num endpoint HTTP. Mesmo motivo de `lib/ia2-gabarito.ts`.
 *
 * Sem guard e sem Supabase. A única chamada externa é a `callAI` — o mesmo wrapper
 * único de IA que o resto do app usa.
 */
import { callAI } from '@/actions/ai-client';

export type Nivel = 'N1' | 'N2' | 'N3' | 'N4';

const BLOCOS = ['conteudo_central', 'conteudo_aplicavel', 'guarda_corpos', 'adaptacao_por_formato'] as const;

/**
 * Extrai UM bloco de topo pelo nome, varrendo chaves balanceadas a partir do
 * `{` que segue `"chave":`. Ciente de strings e escapes, então `}` dentro de
 * texto não conta.
 *
 * Existe porque o JSON do topo pode estar quebrado enquanto os blocos, isolados,
 * são válidos.
 */
function extrairBloco(text: string, chave: string): any | null {
  const marca = text.indexOf(`"${chave}"`);
  if (marca < 0) return null;
  const abre = text.indexOf('{', marca + chave.length + 2);
  if (abre < 0) return null;

  let profundidade = 0;
  let emString = false;
  let escapado = false;
  for (let i = abre; i < text.length; i++) {
    const c = text[i];
    if (emString) {
      if (escapado) escapado = false;
      else if (c === '\\') escapado = true;
      else if (c === '"') emString = false;
      continue;
    }
    if (c === '"') emString = true;
    else if (c === '{') profundidade++;
    else if (c === '}') {
      profundidade--;
      if (profundidade === 0) {
        try { return JSON.parse(text.slice(abre, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

// ── Parsing tolerante do JSON do corpo ────────────────────────────────────────
// Aceita JSON parcial (mesmo que falte 1 dos 4 blocos — o ausente vira {} e
// a revisão humana / IA-auditora pega depois). Antes, qualquer ausência
// rejeitava a resposta inteira, derrubando o import quando o output era
// grande demais e a IA truncava no fim.
//
// 3º nível de resgate (RESGATE POR BLOCO): a IA às vezes fecha a chave raiz cedo
// demais — `..."]}}},"guarda_corpos":{...` — e aí tanto o JSON.parse do texto
// inteiro quanto o regex ganancioso `/\{[\s\S]*\}/` falham, embora os 4 blocos
// estejam íntegros. Um refino real morreu assim, duas tentativas seguidas, com
// 26k chars de conteúdo bom no lixo. Agora cada bloco é resgatado por conta.
export function extractCorpo(raw: string | null | undefined): any | null {
  const text = String(raw || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  if (!text) return null;

  const montar = (p: any) => ({
    conteudo_central: p.conteudo_central || {},
    conteudo_aplicavel: p.conteudo_aplicavel || {},
    guarda_corpos: p.guarda_corpos || {},
    adaptacao_por_formato: p.adaptacao_por_formato || {},
  });
  const temAlgo = (p: any) => BLOCOS.some((b) => p?.[b]);

  const candidatos = [text];
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) candidatos.push(obj[0]);
  for (const c of candidatos) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && temAlgo(parsed)) return montar(parsed);
    } catch { /* tenta próximo */ }
  }

  // Resgate por bloco.
  const resgatado: any = {};
  for (const b of BLOCOS) {
    const v = extrairBloco(text, b);
    if (v) resgatado[b] = v;
  }
  return temAlgo(resgatado) ? montar(resgatado) : null;
}

// ── Validação mínima do corpo (não substitui revisão humana) ──────────────────
export function validarCorpo(corpo: any): string[] {
  const erros: string[] = [];
  if (!corpo?.conteudo_central?.ideia_principal) erros.push('conteudo_central.ideia_principal ausente');
  if (!corpo?.conteudo_central?.explicacao_expandida) erros.push('conteudo_central.explicacao_expandida ausente');
  if (!Array.isArray(corpo?.conteudo_central?.principios) || corpo.conteudo_central.principios.length < 3) {
    erros.push('conteudo_central.principios precisa de pelo menos 3 itens');
  }
  if (!corpo?.conteudo_central?.sintese_executiva) erros.push('conteudo_central.sintese_executiva ausente');
  if (!Array.isArray(corpo?.conteudo_aplicavel?.situacoes_tipicas) || corpo.conteudo_aplicavel.situacoes_tipicas.length < 3) {
    erros.push('conteudo_aplicavel.situacoes_tipicas precisa de pelo menos 3 itens');
  }
  if (!corpo?.guarda_corpos?.preservar || !corpo?.guarda_corpos?.evitar) {
    erros.push('guarda_corpos.preservar e .evitar são obrigatórios');
  }
  return erros;
}
// ════════════════════════════════════════════════════════════════════════════
// IA-as-autor — rascunhar do zero
// ════════════════════════════════════════════════════════════════════════════

export const SYSTEM_AUTOR = `Você é um designer instrucional sênior da Vertho. Sua tarefa é preencher um Módulo-Base de Conteúdo seguindo o template oficial.

REGRAS INTRANSPONÍVEIS:
- O módulo é matéria-prima pedagógica para a IA gerar conteúdos depois (texto, podcast, vídeo). NÃO é roteiro final, NÃO é régua de maturidade, NÃO é aula pro colaborador.
- PROIBIDO mencionar NÍVEIS de maturidade no conteúdo: não escreva "N1", "N2", "estágio inicial/avançado", "transição de nível", "maturidade", nem descreva a evolução por nível DENTRO dos campos. A transição de nível serve SÓ para VOCÊ calibrar a profundidade/escopo — NUNCA aparece no texto gerado. (Esse é o erro mais grave: módulo que vira régua.)
- DISTILE em matéria-prima: conceitos, princípios e exemplos reutilizáveis. NÃO copie a estrutura de AULA do material-fonte — sem títulos markdown (##) dentro dos campos, sem sequência didática "passo 1, passo 2", sem prosa pronta para o leitor final. Se o fonte vier formatado como aula, EXTRAIA o conhecimento e descarte a forma.
- CALIBRE a LINGUAGEM ao PÚBLICO informado. Se o público for microempreendedor/MEI/iniciante, use linguagem SIMPLES e concreta; evite jargão corporativo ("homologar fornecedores", "taxa de conversão", "prospecção fria", "testes estatísticos", "conversão histórica") — explique sem pressupor conhecimento técnico.
- Não use nomes próprios reais. Não invente leis, normas ou estatísticas. Não faça diagnóstico psicológico. Não trate DISC como determinismo.
- Exemplos devem ser UNIVERSAIS (sem cargo específico, salvo se for explicitamente um módulo de contexto específico).
- repertorio_linguagem DEVE ter as 6 categorias (frases_uteis, perguntas_poderosas, abertura, conducao_situacao_dificil, fechamento_com_compromisso, frases_a_evitar) — nenhuma vazia.

FORMATO DE SAÍDA: APENAS JSON válido com a estrutura especificada. Sem markdown, sem comentários, sem texto antes ou depois.`;

/** Teto do texto-fonte injetado no prompt. As fatias de manuscrito têm ~64k. */
export const LIMITE_FONTE_PADRAO = 60000;

export interface OpcoesPrompt {
  contexto?: string;
  referencia?: any;
  docxTexto?: string;
  /**
   * Como nomear o profissional ("o técnico", "o gestor"). Sem isto a autora
   * alterna sinônimos aleatoriamente entre módulos do mesmo descritor.
   */
  termoCanonico?: string;
  /** Sobrescreve LIMITE_FONTE_PADRAO. Fatias de manuscrito precisam de ~70k. */
  limiteFonte?: number;
  /**
   * Cargo/função quando o módulo é DECLARADAMENTE de contexto de cargo (ex.:
   * manuscrito da rede — "Coordenação Pedagógica"). Ativa o gancho de escape da
   * regra de universalidade: exemplos ancorados no cargo passam a ser esperados,
   * na autora E na auditora (que lê o mesmo sinal via contexto_pedagogico).
   */
  contextoCargo?: string;
}

export function montarUserPrompt(comp: any, nivel_entrada: Nivel, nivel_destino: Nivel, o: OpcoesPrompt = {}) {
  const { contexto, referencia, docxTexto, termoCanonico, contextoCargo } = o;
  const nivelTextos: Record<string, string> = {
    N1: comp.n1_gap || '',
    N2: comp.n2_desenvolvimento || '',
    N3: comp.n3_meta || '',
    N4: comp.n4_referencia || '',
  };

  const blocoReferencia = referencia
    ? `\n\n## MÓDULO DE REFERÊNCIA (use como base — adapte para o novo locale):\n${JSON.stringify({
        conteudo_central: referencia.conteudo_central,
        conteudo_aplicavel: referencia.conteudo_aplicavel,
        guarda_corpos: referencia.guarda_corpos,
        adaptacao_por_formato: referencia.adaptacao_por_formato,
      }, null, 2)}`
    : '';

  const blocoDocx = docxTexto
    ? `\n\n## TEXTO EXTRAÍDO DO DOCX (estruture-o no JSON do módulo — adapte o que estiver fora do padrão):\n${docxTexto.slice(0, o.limiteFonte ?? LIMITE_FONTE_PADRAO)}`
    : '';

  const blocoTermo = termoCanonico
    ? `\n- TERMO CANÔNICO: refira-se ao profissional SEMPRE como "${termoCanonico}". Não alterne sinônimos (ex.: "acompanhador", "supervisor", "monitor") — use o mesmo termo do início ao fim.`
    : '';

  const blocoCargo = contextoCargo
    ? `\n- CONTEXTO DE CARGO: este módulo é do cargo "${contextoCargo}". Exemplos e situações ancorados na realidade desse cargo são APROPRIADOS e desejáveis — NÃO precisa universalizar para outros cargos.`
    : '';

  return `## COMPETÊNCIA CANÔNICA
- Nome: ${comp.nome}
- Pilar: ${comp.pilar || '—'}
- Segmento: ${comp.segmento}
- Descritor: ${comp.descritor_completo || comp.descricao || '—'}

## PÚBLICO (calibre a linguagem para ele)
${comp.cargo || contexto || 'profissional generalista'} — escreva no nível de quem vai aplicar isto no dia a dia, sem jargão técnico desnecessário.${blocoTermo}${blocoCargo}

## PROFUNDIDADE-ALVO (use APENAS para calibrar o escopo — NÃO escreva sobre níveis no conteúdo)
- Ponto de partida típico: ${nivelTextos[nivel_entrada]}
- Onde deve chegar: ${nivelTextos[nivel_destino]}
Lembrete: jamais cite "${nivel_entrada}", "${nivel_destino}", "transição" ou "maturidade" nos campos de saída.

## CONTEXTO PEDAGÓGICO
${contexto || 'transversal — não específico de um contexto'}

## EVIDÊNCIAS ESPERADAS (referência)
${comp.evidencias_esperadas || '—'}
${blocoReferencia}
${blocoDocx}

## ESTRUTURA EXIGIDA DA SAÍDA (JSON):
{
  "conteudo_central": {
    "ideia_principal": "string markdown 3-5 linhas (300-500 chars)",
    "explicacao_expandida": "string markdown 400-1200 palavras",
    "principios": [
      { "nome": "≤60 chars", "explicacao": "1-2 frases", "implicacao_pratica": "1 frase aplicada" }
    ],
    "sintese_executiva": "string markdown 5-8 linhas"
  },
  "conteudo_aplicavel": {
    "situacoes_tipicas": [
      { "contexto": "...", "desafio": "...", "risco_comum": "...", "boa_abordagem": "..." }
    ],
    "exemplos_universais": {
      "simples": "...", "intermediario": "...", "complexo": "...",
      "aplicacao_inadequada": "...", "aplicacao_adequada": "..."
    },
    "erros_comuns": [
      { "erro": "...", "por_que_acontece": "...", "impacto": "...", "como_corrigir": "..." }
    ],
    "repertorio_linguagem": {
      "frases_uteis": ["..."], "perguntas_poderosas": ["..."],
      "abertura": ["..."], "conducao_situacao_dificil": ["..."],
      "fechamento_com_compromisso": ["..."], "frases_a_evitar": ["..."]
    },
    "boas_praticas": [
      { "o_que_fazer": "...", "por_que": "...", "como_aplicar": "...", "evidencia_boa_aplicacao": "..." }
    ]
  },
  "guarda_corpos": {
    "preservar": ["..."], "evitar": ["..."],
    "pode_adaptar_livremente": ["cargo","contexto institucional","formato","tom","exemplos concretos"],
    "nao_pode_adaptar": ["conceito central","profundidade pedagógica","princípios","limites éticos"],
    "cuidados_eticos": ["..."], "cuidados_linguagem": ["..."]
  },
  "adaptacao_por_formato": {
    "texto": "orientação específica para texto de apoio",
    "podcast_roteiro": "orientação específica para roteiro de podcast",
    "video_roteiro": "orientação específica para roteiro de vídeo"
  }
}

QUANTIDADES (faixa fechada — não ultrapasse o teto): 5 a 6 princípios, 4 a 5 situações típicas, 4 a 5 erros comuns, 4 a 5 boas práticas. Densidade vale mais que volume: prefira 5 itens afiados a 9 diluídos. Responda APENAS com o JSON.`;
}

export async function chamarIAComRetry(systemPrompt: string, userPrompt: string, model: string, maxTokens = 64000) {
  let corpo: any = null;
  for (let tentativa = 1; tentativa <= 2 && !corpo; tentativa++) {
    try {
      const raw = await callAI(systemPrompt, userPrompt, { model }, maxTokens);
      corpo = extractCorpo(raw);
      if (!corpo) {
        const txt = String(raw || '');
        console.warn(
          `[modulo_base_autor] tentativa ${tentativa}: JSON inválido. ` +
          `raw=${txt.length}chars · início="${txt.slice(0, 200).replace(/\n/g, ' ')}" · ` +
          `fim="${txt.slice(-200).replace(/\n/g, ' ')}"`,
        );
      }
    } catch (e: any) {
      console.warn(`[modulo_base_autor] tentativa ${tentativa} falhou:`, e?.message);
    }
  }
  return corpo;
}
