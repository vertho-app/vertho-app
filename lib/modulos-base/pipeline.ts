/**
 * NÚCLEO do pipeline de extração → Módulo-Base — segmentação de transcrição/
 * material em seções temáticas + estruturação nos 4 blocos, SEM guard de sessão.
 *
 * Vive em `lib/` pelo mesmo motivo de `lib/blueprint/core.ts`: as tasks do
 * Trigger.dev (`trigger/extracao-video.ts`, `trigger/estruturar-material.ts`) e a
 * rota interna `/api/internal/modulo-from-video` rodam sem admin logado, e um
 * módulo `'use server'` não pode ser importado por eles sem transformar cada
 * export num endpoint HTTP — foi o que reexpos estas funções (IA cara + INSERT
 * service_role) quando viviam em `actions/modulos-base.ts`.
 *
 * REGRA: estas funções NÃO autorizam ninguém. Quem chama já está autorizado:
 * a rota interna (`x-internal-secret`), as tasks (fila autenticada do trigger)
 * ou uma action gatada (`actions/extracao-video.ts`, `requireAdminAction`).
 */

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import {
  SYSTEM_AUTOR,
  montarUserPrompt,
  validarCorpo,
  type Nivel,
} from '@/lib/modulo-base-autor';
import {
  carregarCompetenciaBase,
  carregarCompetenciaEmpresa,
  auditarModulosCore,
} from '@/lib/modulo-base-auditor';
import { chamarIAComRetry } from '@/lib/modulo-base-autor';

// ── Tipos e helpers compartilhados com actions/modulos-base.ts ────────────────

export type Status = 'rascunho' | 'revisao' | 'publicado' | 'obsoleto';
export type Locale = 'pt-BR' | 'pt-PT' | 'es-ES' | 'en-US';


export const NIVEIS: Nivel[] = ['N1', 'N2', 'N3', 'N4'];

export function nivelGreater(a: Nivel, b: Nivel) {
  return NIVEIS.indexOf(a) > NIVEIS.indexOf(b);
}

const _STOP = new Set(['para', 'como', 'sobre', 'mais', 'pela', 'pelo', 'entre', 'isso', 'esta', 'este', 'essa', 'esse', 'dos', 'das', 'com', 'sem', 'que', 'capacidade']);
const _norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const _toks = (s: string) => new Set(_norm(s).split(/[^a-z0-9]+/g).filter((t) => t.length >= 4 && !_STOP.has(t)));

export interface MetaModulo {
  // Uma das duas: competência CANÔNICA (base) OU competência da EMPRESA.
  competencia_base_id?: string | null;
  competencia_id?: string | null;
  nivel_entrada: Nivel;
  nivel_destino: Nivel;
  contexto_pedagogico?: string | null;
  locale: Locale;
  titulo?: string | null;
  descritor?: string | null;
  finalidade?: string | null;
}

function normalizeContextoPedagogico(value?: string | null): string | null {
  const clean = String(value || '').trim();
  if (!clean) return null;
  return clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || null;
}

function montarCorpoFallback(comp: any, meta: MetaModulo, textoBase: string) {
  const texto = String(textoBase || '').trim().slice(0, 7000);
  const foco = meta.descritor || comp?.nome || 'tema do material';
  return {
    conteudo_central: {
      ideia_principal: `Material base extraído para apoiar o desenvolvimento de ${comp?.nome || foco}.`,
      explicacao_expandida: texto || `O material deve ser revisado para consolidar conceitos, exemplos e orientações ligados a ${foco}.`,
      principios: [
        `Organizar os conceitos centrais de ${foco} em linguagem clara.`,
        'Preservar exemplos e situações presentes no material original.',
        'Transformar o conteúdo em orientação aplicável, sem criar fatos não presentes na fonte.',
        'Separar fundamentos, práticas e cuidados para facilitar a adaptação em formatos finais.',
        'Manter o módulo como matéria-prima pedagógica, não como aula final.',
      ],
      sintese_executiva: `Rascunho gerado a partir do material original para revisão e refinamento em ${comp?.nome || foco}.`,
    },
    conteudo_aplicavel: {
      situacoes_tipicas: [
        { situacao: 'Revisão do material-base', risco_comum: 'Usar o texto bruto sem curadoria', boa_abordagem: 'Selecionar conceitos e exemplos aderentes ao público-alvo.' },
        { situacao: 'Criação de conteúdo final', risco_comum: 'Inventar exemplos fora da fonte', boa_abordagem: 'Adaptar apenas o que está sustentado pelo material.' },
        { situacao: 'Aplicação em trilhas de aprendizagem', risco_comum: 'Misturar muitos objetivos em um módulo', boa_abordagem: 'Definir um objetivo pedagógico por peça.' },
        { situacao: 'Contextualização para empresa', risco_comum: 'Forçar termos genéricos', boa_abordagem: 'Revisar linguagem e exemplos para o contexto da empresa.' },
      ],
      erros_comuns: [
        'Publicar sem revisão humana do rascunho.',
        'Tratar o módulo-base como roteiro final.',
        'Remover nuances importantes do material original.',
        'Atribuir maturidade ou diagnóstico sem evidência.',
      ],
      boas_praticas: [
        'Revisar títulos, descritores e finalidade antes de publicar.',
        'Conferir se a competência canônica escolhida está adequada.',
        'Preservar trechos relevantes do material como referência.',
        'Ajustar o conteúdo para exemplos universais e seguros.',
      ],
    },
    guarda_corpos: {
      preservar: [
        'Fidelidade ao material original.',
        'Linguagem clara e aplicável.',
        'Caráter de matéria-prima pedagógica.',
      ],
      evitar: [
        'Inventar dados, casos ou estatísticas.',
        'Transformar o módulo em aula final.',
        'Fazer diagnóstico psicológico ou comportamental.',
      ],
      cuidados: [
        'Rascunho de contingência: revisar antes de publicar.',
      ],
    },
    adaptacao_por_formato: {
      texto: 'Converter em artigo ou microconteúdo após revisão.',
      podcast_roteiro: 'Usar como base para conversa guiada, preservando exemplos do material.',
      video_roteiro: 'Transformar em roteiro curto com abertura, conceito central e aplicação prática.',
    },
  };
}

/**
 * Estrutura um texto-base nos 4 blocos (IA-autora) e insere o módulo rascunho.
 * Núcleo compartilhado: a competência canônica + transição já vêm resolvidas
 * (pela detecção de texto único OU pelo segmentador de transcrição longa).
 */
export async function estruturarEInserirModulo(
  meta: MetaModulo,
  textoBase: string,
  opts: { empresaId?: string | null; urlOrigem?: string; createdBy?: string },
): Promise<{ id?: string; grupo_id?: string; competencia?: string; nivel_entrada?: Nivel; nivel_destino?: Nivel; avisos?: string[]; error?: string }> {
  const isEmpresa = !!meta.competencia_id;
  const comp = isEmpresa
    ? await carregarCompetenciaEmpresa(meta.competencia_id!)
    : await carregarCompetenciaBase(meta.competencia_base_id!);
  if (!comp) return { error: isEmpresa ? 'Competência da empresa não encontrada' : 'Competência base não encontrada' };

  // Estrutura os 4 blocos tratando o texto-base como matéria-prima (igual ao docx).
  const contextoPedagogico = normalizeContextoPedagogico(meta.contexto_pedagogico);
  const userPrompt = montarUserPrompt(comp, meta.nivel_entrada, meta.nivel_destino, {
    contexto: contextoPedagogico || undefined,
    docxTexto: textoBase,
  });
  const model = await getModelForTask(null as any, 'modulo_base_autor');
  let corpo = await chamarIAComRetry(SYSTEM_AUTOR, userPrompt, model);
  const usouFallback = !corpo && contextoPedagogico === 'fallback-material';
  if (!corpo && usouFallback) corpo = montarCorpoFallback(comp, meta, textoBase);
  if (!corpo) return { error: 'A IA não conseguiu estruturar o conteúdo do vídeo. Tente novamente ou edite manualmente.' };

  const erros = validarCorpo(corpo);
  const sb = createSupabaseAdmin();
  const insertRow: any = {
    empresa_id: opts.empresaId || null,
    locale: meta.locale,
    competencia_base_id: isEmpresa ? null : meta.competencia_base_id,
    competencia_id: isEmpresa ? meta.competencia_id : null,
    nivel_entrada: meta.nivel_entrada,
    nivel_destino: meta.nivel_destino,
    titulo: (meta.titulo || `[Vídeo] ${comp.nome} ${meta.nivel_entrada}→${meta.nivel_destino}`).slice(0, 120),
    descritor: meta.descritor ? String(meta.descritor).slice(0, 200) : null,
    finalidade: (meta.finalidade || `Matéria-prima pedagógica extraída de vídeo para a transição ${meta.nivel_entrada}→${meta.nivel_destino} em "${comp.nome}".`).slice(0, 400),
    contexto_pedagogico: contextoPedagogico,
    tags: opts.urlOrigem ? ['extraido-video', opts.urlOrigem.slice(0, 80)] : ['extraido-video'],
    conteudo_central: corpo.conteudo_central,
    conteudo_aplicavel: corpo.conteudo_aplicavel,
    guarda_corpos: corpo.guarda_corpos,
    adaptacao_por_formato: corpo.adaptacao_por_formato,
    created_by: opts.createdBy || 'extracao-video',
    status: 'rascunho' as Status,
  };
  if (usouFallback) insertRow.tags = [...insertRow.tags, 'fallback-ia'];
  const { data, error } = await sb.from('modulos_base_conteudo').insert(insertRow).select('id, grupo_id').single();
  if (error) return { error: error.message };
  return { id: data.id, grupo_id: data.grupo_id, competencia: comp.nome, nivel_entrada: meta.nivel_entrada, nivel_destino: meta.nivel_destino, avisos: usouFallback ? [...erros, 'Rascunho de contingência: revisar antes de publicar.'] : erros };
}

type SegSecao = Omit<MetaModulo, 'locale'> & { texto_base: string };
export type DirecionamentoModuloBase = {
  pilar?: string | null;
  competencia?: string | null;
  competenciaBaseId?: string | null;
};
interface SegCtx {
  compsListagem: string;
  direcionamentoTexto: string;
  idSet: Set<string>;
  nomeParaId: Map<string, string>;
  /** id da competência → nome (p/ ancorar o descritor no modelo da empresa). */
  idToNome: Map<string, string>;
  /** nome da competência (lower) → descritores do modelo (empresa). */
  descritoresPorComp: Map<string, string[]>;
  model: string;
  /** true = catálogo da EMPRESA (ids vão para competencia_id, não competencia_base_id). */
  empresa: boolean;
  /** true = direcionamento pilar/competência ATIVO: extrai SÓ o escopo, sem forçar (0 é válido). */
  exclusivo: boolean;
}

/**
 * Ancora um descritor (texto livre da IA) no descritor do MODELO da competência
 * mais próximo por overlap de tokens — garante que o descritor de um módulo da
 * empresa seja SEMPRE um do modelo, não inventado. Sem descritores no modelo ou
 * sem competência resolvida → devolve o original.
 */
function ancorarDescritor(competenciaId: string | null | undefined, descritorLivre: string, ctx: SegCtx): string {
  if (!competenciaId) return descritorLivre;
  const nome = ctx.idToNome.get(competenciaId);
  const opcoes = nome ? ctx.descritoresPorComp.get(String(nome).trim().toLowerCase()) : null;
  if (!opcoes || !opcoes.length) return descritorLivre;
  const mt = _toks(descritorLivre || '');
  let best = opcoes[0], bestHit = -1;
  for (const d of opcoes) {
    const dt = _toks(d);
    let hit = 0; for (const t of mt) if (dt.has(t)) hit++;
    if (hit > bestHit) { bestHit = hit; best = d; }
  }
  return best;
}

type CompetenciaSeg = {
  id: string;
  nome: string;
  segmento: string;
  descricao?: string;
  pilar?: string | null;
  descritor_completo?: string | null;
};

function tokensBusca(s: string): string[] {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length >= 4 && !['para', 'como', 'sobre', 'mais', 'pela', 'pelo', 'entre', 'isso', 'esta', 'este', 'essa', 'esse'].includes(t));
}

function escolherCompetenciaFallback(texto: string, comps: CompetenciaSeg[], direcionamento?: DirecionamentoModuloBase | null): CompetenciaSeg | null {
  if (!comps.length) return null;
  const hintId = String(direcionamento?.competenciaBaseId || '').trim();
  if (hintId) {
    const byId = comps.find((c) => c.id === hintId);
    if (byId) return byId;
  }
  const textoTokens = new Set(tokensBusca(`${direcionamento?.pilar || ''} ${direcionamento?.competencia || ''} ${texto.slice(0, 24000)}`));
  const hintPilar = String(direcionamento?.pilar || '').trim().toLowerCase();
  const hintComp = String(direcionamento?.competencia || '').trim().toLowerCase();
  let best = comps[0], bestScore = -1;
  for (const c of comps) {
    const hay = `${c.nome || ''} ${c.pilar || ''} ${c.descritor_completo || ''} ${c.descricao || ''}`;
    const compTokens = tokensBusca(hay);
    let score = 0;
    if (hintPilar && String(c.pilar || '').trim().toLowerCase() === hintPilar) score += 80;
    if (hintComp && String(c.nome || '').trim().toLowerCase() === hintComp) score += 80;
    for (const t of compTokens) if (textoTokens.has(t)) score += 4;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

function secoesFallbackDeterministico(transcricao: string, tituloVideo: string, comps: CompetenciaSeg[], direcionamento?: DirecionamentoModuloBase | null, empresa = false): SegSecao[] {
  const full = String(transcricao || '').trim();
  if (full.length < 200 || !comps.length) return [];
  const AMOSTRA = 8000;
  const total = Math.min(3, Math.max(1, Math.ceil(full.length / 120000)));
  const step = Math.max(AMOSTRA, Math.floor(full.length / total));
  const out: SegSecao[] = [];
  for (let i = 0; i < total; i++) {
    const trecho = full.slice(i * step, i * step + AMOSTRA).trim();
    if (trecho.length < 500) continue;
    const comp = escolherCompetenciaFallback(trecho, comps, direcionamento);
    if (!comp) continue;
    // Descritor é um SUB-TEMA da competência — NUNCA o pilar nem o nome da
    // competência. No fallback (sem IA) não dá pra gerar um granular fiel, então
    // usamos um placeholder honesto que o admin ajusta na revisão. (Bug anterior:
    // o pilar direcionador vazava para o descritor.)
    out.push({
      competencia_base_id: empresa ? null : comp.id,
      competencia_id: empresa ? comp.id : null,
      nivel_entrada: 'N1',
      nivel_destino: 'N2',
      contexto_pedagogico: 'fallback-material',
      titulo: `${tituloVideo || 'Material'} — parte ${i + 1}`,
      // Empresa: usa um descritor do modelo (o representativo da competência), não placeholder.
      descritor: (empresa && comp.descritor_completo) ? comp.descritor_completo : `Visão geral — parte ${i + 1}`,
      finalidade: `Estruturar matéria-prima extraída do material em "${comp.nome}".`,
      texto_base: trecho,
    });
  }
  return out;
}

// Formato de saída em BLOCOS DELIMITADOS (não JSON): o texto_base é markdown
// denso e longo, e pedir JSON faz o modelo deixar aspas/quebras não escapadas
// (parse falha) ou serializar o array como string (tool use). Marcadores com o
// markdown livre entre delimitadores não precisam de escape → parse 100% estável.
const SEG_SYSTEM = `Você é designer instrucional da Vertho. Recebe um TRECHO de transcrição/material (aula/palestra/apostila) e o divide em SEÇÕES TEMÁTICAS coerentes. Cada seção vira matéria-prima de UM módulo-base, mapeado a UMA competência canônica do catálogo Vertho.

REGRAS:
- Identifique de 1 a 8 seções (use o número que o conteúdo pedir; um trecho monotemático pode ter 1).
- Se houver DIRECIONAMENTO DO ADMIN, trate-o como prioridade semântica: prefira o pilar/competência indicada quando o trecho for compatível. Só desvie se o conteúdo claramente pertencer a outro tema.
- Para CADA seção, escolha SEMPRE a competência do catálogo SEMANTICAMENTE mais próxima — nunca deixe sem competência. Copie o competencia_base_id EXATO da lista (e repita o nome em competencia_nome para conferência).
- descritor: o sub-tema ESPECÍFICO da seção dentro da competência (5-10 palavras; mais granular que o nome da competência).
- PODE haver mais de uma seção para a MESMA competência, desde que sejam DESCRITORES (sub-temas) distintos — cada descritor vira um módulo separado. Não force descritores iguais a se juntarem.
- Transição de nível: cada módulo cobre EXATAMENTE UM DEGRAU. Use SOMENTE N1→N2, N2→N3 ou N3→N4. NUNCA pule níveis (proibido N1→N3, N1→N4, N2→N4). Um mesmo descritor PODE virar até 3 módulos (um por degrau), mas nenhum módulo cobre mais de um degrau. Default N1→N2 se incerto.
- texto_base: PRESERVE o conteúdo da seção na ORDEM original — não RESUMA (não corte definições, distinções, exemplos/casos, dados/números nem o encadeamento dos argumentos) e não INFLE (não repita, não floreie, não invente para alongar). O tamanho deve ser PROPORCIONAL ao que o trecho realmente desenvolve do tema: se o material de entrada já vier denso, MANTENHA essa densidade; se vier de fala/transcrição crua, organize em prosa fiel sem perder conteúdo. Markdown. Corte só ruído (saudações, repetição vazia); NÃO inclua nada que não esteja no trecho.

FORMATO DA SAÍDA — para CADA seção emita EXATAMENTE este bloco (um bloco por seção; NÃO escreva nada fora dos blocos, sem JSON, sem comentários):
===SECAO===
competencia_base_id: <id EXATO da lista do catálogo>
competencia_nome: <nome>
descritor: <sub-tema específico, 5-10 palavras>
nivel_entrada: <N1|N2|N3|N4>
nivel_destino: <N1|N2|N3|N4>
contexto_pedagogico: <rótulo curto slug, máx. 80 chars, ex.: transversal, lideranca, educacao-infantil; ou vazio>
titulo: <título da seção>
finalidade: <1 frase>
---TEXTO---
<texto_base em markdown, denso e fiel — pode ter várias linhas, ## títulos, aspas, listas; escreva livremente>
===FIM===`;

// Todo módulo cobre EXATAMENTE UM DEGRAU (N1→N2, N2→N3 ou N3→N4). Spans largos
// (N1→N4, N1→N3, N2→N4) são proibidos — viram um módulo "panorâmico" que se
// sobrepõe aos granulares. Quando a IA emite um span largo, cai no default N1→N2.
const niveisValidos = (e: string, d: string) =>
  NIVEIS.includes(e as Nivel) && NIVEIS.includes(d as Nivel)
  && NIVEIS.indexOf(d as Nivel) - NIVEIS.indexOf(e as Nivel) === 1;

/**
 * Parser dos blocos delimitados emitidos pelo SEG_SYSTEM:
 *   ===SECAO=== <campos key: value> ---TEXTO--- <markdown livre> ===FIM===
 * Robusto por construção: o markdown (com aspas, ##, quebras) fica entre
 * delimitadores e não precisa de escape — sem os erros de parse de JSON.
 */
function parseSecoesBlocos(raw: string): any[] {
  const out: any[] = [];
  for (const bloco of String(raw).split('===SECAO===').slice(1)) {
    const corpo = bloco.split('===FIM===')[0];
    const idx = corpo.indexOf('---TEXTO---');
    if (idx < 0) continue;
    const meta = corpo.slice(0, idx);
    const texto_base = corpo.slice(idx + '---TEXTO---'.length).trim();
    const get = (k: string) => (new RegExp('^\\s*' + k + '\\s*:\\s*(.+)$', 'm').exec(meta)?.[1] || '').trim();
    const competencia_base_id = get('competencia_base_id');
    if (!competencia_base_id || !texto_base) continue;
    out.push({
      competencia_base_id,
      competencia_nome: get('competencia_nome'),
      descritor: get('descritor'),
      nivel_entrada: get('nivel_entrada'),
      nivel_destino: get('nivel_destino'),
      contexto_pedagogico: get('contexto_pedagogico') || null,
      titulo: get('titulo'),
      finalidade: get('finalidade'),
      texto_base,
    });
  }
  return out;
}

/** Segmenta UMA janela de texto (≤ ~110k chars) numa chamada (com retry). */
async function segmentarJanela(texto: string, tituloVideo: string, ctx: SegCtx): Promise<{ secoes: SegSecao[]; diag: string }> {
  const montarUser = (incluirDirecionamento: boolean) => `${incluirDirecionamento && ctx.direcionamentoTexto ? `${ctx.direcionamentoTexto}\n\n` : ''}${ctx.empresa ? `REGRA DO DESCRITOR (obrigatória): o campo "descritor" de cada seção DEVE ser o NOME CURTO de um dos descritores listados sob a competência escolhida — o texto ANTES do travessão "—" (a parte depois do "—" é só a descrição longa, NÃO copie ela). Copie o nome curto LITERALMENTE. Escolha o que melhor descreve a seção (use a descrição longa só pra entender qual é) — NUNCA escreva um descritor novo. Se a seção tocar mais de um, escolha o predominante.\n\n` : ''}CATÁLOGO DE COMPETÊNCIAS (escolha sempre 1 por seção — id EXATO):
${ctx.compsListagem}

TÍTULO: ${tituloVideo || '—'}

TRECHO:
${texto}`;

  const tentar = async (user: string, sufixo: string): Promise<{ secoes: SegSecao[]; diag: string }> => {
    let ultimoDiag = 'sem resposta';
  // 2 tentativas (não 3): cada chamada densa pode levar ~minutos, e o `timeoutMs`
  // abaixo é o que segura a latência — `maxRetries: 0` evita o retry do SDK, que
  // dobraria o tempo por chamada.
  //
  // ⚠️ O comentário anterior justificava o número pelos "300s da rota síncrona".
  // A rota que de fato executa isto — `app/api/internal/modulo-from-video` —
  // declara `maxDuration = 800`, e os dois outros consumidores são tasks do
  // Trigger (3600s). O 300 era premissa herdada, não medida.
  //
  // 🔑 26/08: teto 32.000 → 64.000, unificando a taskKey (as outras 3 chamadas
  // de `modulo_base_autor` já rodavam em 64k; a MESMA etiqueta com dois tetos é
  // defeito, e o auditor reportava sempre o menor). Isto NÃO alonga a chamada:
  // quem limita o relógio é `timeoutMs`, que segue em 180s. `max_tokens` limita
  // a SAÍDA — com o mesmo tempo disponível, o teto maior só dá espaço para o
  // JSON FECHAR em vez de ser cortado no meio.
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const raw = await callAI(SEG_SYSTEM, user, { model: ctx.model }, 64000, { timeoutMs: 180000, maxRetries: 0, taskKey: 'modulo_base_autor' }).catch((e: any) => { ultimoDiag = 'callAI: ' + (e?.message || e); return ''; });
      const brutas = parseSecoesBlocos(String(raw || ''));
      if (!brutas.length) { ultimoDiag = `t${tentativa}${sufixo}: raw=${String(raw || '').length}c, 0 blocos`; continue; }

      // Resolve a competência: id válido do catálogo OU nome casado ao catálogo.
      const secoes: SegSecao[] = brutas.map((s: any) => {
        let id = String(s?.competencia_base_id || '').trim();
        if (!ctx.idSet.has(id)) id = ctx.nomeParaId.get(String(s?.competencia_nome || '').trim().toLowerCase()) || '';
        return { s, id };
      }).filter((x) => x.id && x.s?.texto_base).map(({ s, id }) => ({
        // Catálogo da empresa → competencia_id; canônico → competencia_base_id.
        competencia_base_id: ctx.empresa ? null : id,
        competencia_id: ctx.empresa ? id : null,
        nivel_entrada: (niveisValidos(s.nivel_entrada, s.nivel_destino) ? s.nivel_entrada : 'N1') as Nivel,
        nivel_destino: (niveisValidos(s.nivel_entrada, s.nivel_destino) ? s.nivel_destino : 'N2') as Nivel,
        contexto_pedagogico: s.contexto_pedagogico || null,
        titulo: s.titulo || null,
        // Empresa: ANCORA o descritor no modelo da competência (não texto livre).
        descritor: ctx.empresa ? ancorarDescritor(id, s.descritor, ctx) : (s.descritor || null),
        finalidade: s.finalidade || null,
        texto_base: String(s.texto_base),
      }));

      if (secoes.length) return { secoes, diag: `${secoes.length} (t${tentativa}${sufixo})` };
      ultimoDiag = `t${tentativa}${sufixo}: ${brutas.length} brutas, 0 válidas`;
    }
    return { secoes: [], diag: ultimoDiag };
  };

  const comDirecionamento = await tentar(montarUser(true), '');
  if (comDirecionamento.secoes.length || !ctx.direcionamentoTexto) return comDirecionamento;
  // Modo exclusivo: NÃO re-tenta sem direcionamento — isso forçaria o material a
  // competências fora do escopo. 0 seções é um resultado válido aqui.
  if (ctx.exclusivo) return comDirecionamento;
  const semDirecionamento = await tentar(montarUser(false), ' sem-direcionamento');
  if (semDirecionamento.secoes.length) return { ...semDirecionamento, diag: `${semDirecionamento.diag}; fallback após direcionamento sem blocos` };
  return comDirecionamento;
}

/**
 * Segmenta a transcrição/material completo em seções temáticas → 1 módulo por
 * tema. Texto pequeno (≤110k chars): 1 chamada. Texto GRANDE: MAP-REDUCE —
 * fatia em janelas com overlap, segmenta cada uma e deduplica/mescla seções por
 * (competência × transição), removendo o teto de tamanho (livros, cursos, etc).
 */
async function segmentarTranscricao(
  transcricao: string, tituloVideo: string, direcionamento?: DirecionamentoModuloBase | null, empresaId?: string | null,
): Promise<{ secoes: SegSecao[]; diag: string }> {
  const sb = createSupabaseAdmin();
  // Escopo de EMPRESA → usa o catálogo de competências DELA (pilares próprios, ex.:
  // Empreendedorismo na Macaé). Global → catálogo canônico. competencias tem linhas
  // duplicadas por cargo → dedup por nome (1 competência = 1 entrada no catálogo).
  let lista: CompetenciaSeg[];
  // Empresa: o descritor do módulo é SEMPRE o NOME_CURTO oficial do descritor da
  // matriz (ex.: "Escuta ativa"), NÃO a descrição longa. Guardamos os nome_curto
  // por competência (p/ a IA copiar e o ancorarDescritor casar) + a descrição
  // longa só como CONTEXTO no catálogo (ajuda a IA a casar o trecho ao descritor).
  const descritoresPorComp = new Map<string, string[]>();          // nome_curto[]
  const descricaoLongaDe = new Map<string, string>();              // `${compK}|${curtoLower}` → descrição longa
  if (empresaId) {
    const { data: comps } = await sb.from('competencias')
      .select('id, nome, nome_curto, cargo, descricao, pilar, descritor_completo')
      .eq('empresa_id', empresaId).order('nome');
    const porNome = new Map<string, CompetenciaSeg>();
    for (const c of (comps || []) as any[]) {
      const k = String(c.nome || '').trim().toLowerCase();
      if (k && !porNome.has(k)) porNome.set(k, { ...c, segmento: c.cargo || 'empresa' });
      // Descritor oficial = nome_curto; cai pra descrição longa só se faltar nome_curto.
      const curto = String(c.nome_curto || '').trim() || String(c.descritor_completo || '').trim();
      const longo = String(c.descritor_completo || '').trim();
      if (k && curto) {
        if (!descritoresPorComp.has(k)) descritoresPorComp.set(k, []);
        const arr = descritoresPorComp.get(k)!;
        if (!arr.includes(curto)) arr.push(curto);
        if (longo && longo !== curto) descricaoLongaDe.set(`${k}|${curto.toLowerCase()}`, longo);
      }
    }
    lista = [...porNome.values()];
  } else {
    const { data: comps } = await sb.from('competencias_base')
      .select('id, nome, segmento, descricao, pilar, descritor_completo')
      .order('nome');
    lista = (comps || []) as CompetenciaSeg[];
  }
  const hintPilar = String(direcionamento?.pilar || '').trim().toLowerCase();
  const hintComp = String(direcionamento?.competencia || '').trim().toLowerCase();
  const hintId = String(direcionamento?.competenciaBaseId || '').trim();

  // MODO EXCLUSIVO: havendo direcionamento (pilar/competência), a extração é
  // restrita ESTRITAMENTE a esse escopo — o catálogo oferecido à IA contém SÓ as
  // competências do escopo, e trechos fora dele NÃO viram módulo (0 é resultado
  // válido). Direcionamento a nível de COMPETÊNCIA (id/nome) restringe àquela
  // competência; só pilar restringe ao pilar inteiro.
  const exclusivo = !!(hintId || hintComp || hintPilar);
  const _normc = (s: any) => String(s || '').trim().toLowerCase();
  let listaEscopo = lista;
  if (exclusivo) {
    listaEscopo = lista.filter((c) => {
      if (hintId || hintComp) {
        if (hintId && c.id === hintId) return true;
        if (hintComp) {
          const nome = _normc(c.nome);
          if (nome === hintComp || nome.includes(hintComp) || hintComp.includes(nome)) return true;
        }
        return false;
      }
      return _normc(c.pilar) === hintPilar; // só pilar
    });
    if (!listaEscopo.length) {
      // O pilar/competência direcionado não existe neste catálogo — config, não
      // aderência. Sinaliza distinto pra não confundir com "material não aderente".
      const alvo = direcionamento?.competencia || direcionamento?.pilar || direcionamento?.competenciaBaseId;
      return { secoes: [], diag: `direcionamento "${alvo}" não encontrado no catálogo ${empresaId ? 'da empresa' : 'canônico'} (verifique o pilar/competência)` };
    }
  }

  const score = (c: typeof lista[number]) => {
    let s = 0;
    if (hintId && c.id === hintId) s += 1000;
    if (hintPilar && _normc(c.pilar) === hintPilar) s += 100;
    const nome = _normc(c.nome);
    if (hintComp && nome === hintComp) s += 80;
    if (hintComp && (nome.includes(hintComp) || hintComp.includes(nome))) s += 40;
    return s;
  };
  const listaOrdenada = [...listaEscopo].sort((a, b) => score(b) - score(a) || a.nome.localeCompare(b.nome));
  const direcionamentoTexto = exclusivo
    ? `ESCOPO EXCLUSIVO DA EXTRAÇÃO (regra absoluta — SOBREPÕE qualquer instrução do sistema sobre "sempre escolher uma competência"):
- Pilar: ${direcionamento?.pilar || '—'}
- Competência: ${direcionamento?.competencia || '—'}
O catálogo abaixo já contém SOMENTE as competências válidas deste escopo.
1. Crie seções APENAS para trechos que tratam GENUINAMENTE deste escopo.
2. Trecho que NÃO seja deste escopo: IGNORE — não emita seção, não force, não aproxime "mais ou menos", não classifique no que sobrou.
3. É CORRETO e esperado retornar ZERO seções se o material não aborda este escopo. Não invente cobertura para parecer produtivo.`
    : '';
  // Empresa: o catálogo LISTA os descritores do modelo por competência — a IA
  // ESCOLHE um deles (semântica > token snap). Global: 1 linha por competência.
  const compsListagem = listaOrdenada.slice(0, 200).map((c) => {
    if (empresaId) {
      const k = String(c.nome).trim().toLowerCase();
      const ds = descritoresPorComp.get(k) || [];
      // Lista o NOME_CURTO (o que vai no campo "descritor") + a descrição longa só
      // como contexto pra IA casar o trecho ao descritor certo.
      const dl = ds.map((d) => {
        const longo = descricaoLongaDe.get(`${k}|${d.toLowerCase()}`);
        return `    • ${d}${longo ? ` — ${longo}` : ''}`;
      }).join('\n');
      return `- ${c.id} :: ${c.nome}${c.pilar ? ' (' + c.pilar + ')' : ''}${dl ? `\n  DESCRITORES desta competência (copie o NOME CURTO — o texto ANTES do "—" — literalmente no campo "descritor"):\n${dl}` : ''}`;
    }
    return `- ${c.id} :: ${c.nome} (${c.segmento}${c.pilar ? ' / ' + c.pilar : ''})${c.descritor_completo || c.descricao ? ' — ' + (c.descritor_completo || c.descricao) : ''}`;
  }).join('\n');
  const ctx: SegCtx = {
    compsListagem,
    direcionamentoTexto,
    idSet: new Set(listaEscopo.map((c) => c.id)),
    nomeParaId: new Map(listaEscopo.map((c) => [c.nome.trim().toLowerCase(), c.id])),
    idToNome: new Map(listaEscopo.map((c) => [c.id, c.nome])),
    descritoresPorComp,
    model: await getModelForTask(null as any, 'modulo_base_autor'),
    empresa: !!empresaId,
    exclusivo,
  };

  const full = String(transcricao);
  // Janelas MENORES (40k chars ≈ 6-7k palavras): cada chamada gera menos seções
  // → output curto (~120-160s) que cabe no timeout e nos 800s da rota interna.
  // Janelas grandes (110k) faziam UMA chamada densa gerar ~30k tokens (~600s),
  // estourando o tempo num livro. Mais janelas, mas paralelas (CONC) e curtas.
  // Cobertura de materiais grandes. Rodando IN-TASK (trigger), o limite real é o
  // maxDuration da task (1h), NÃO os 800s da rota — então os caps são só uma rede de
  // segurança alta. Configuráveis por env (sem deploy): EXTRACAO_MAX_JANELAS (~35k
  // chars/janela) e EXTRACAO_MAX_SECOES (módulos). O `diag` reporta se truncou; se o
  // material for ENORME, suba as envs (e o maxDuration da task, se preciso).
  const envNum = (k: string, d: number) => { const n = parseInt(process.env[k] || '', 10); return Number.isFinite(n) && n > 0 ? n : d; };
  // MERGE_CAP: teto de texto BRUTO acumulado por célula (competência×descritor) no
  // REDUCE — acima disso, o excedente (cauda, geralmente repetitiva) é aparado antes
  // de estruturar. Subido 24k→40k (roda in-task, sem o teto de 800s) p/ não cortar
  // descritores muito cobertos. Env-tunável.
  const JANELA = 40000, OVERLAP = 5000;
  const MERGE_CAP = envNum('EXTRACAO_MERGE_CAP', 40000);
  const MAX_JANELAS = envNum('EXTRACAO_MAX_JANELAS', 60);
  const MAX_SECOES = envNum('EXTRACAO_MAX_SECOES', 80);

  // Caso comum: cabe numa janela → 1 chamada (comportamento anterior).
  if (full.length <= JANELA) return segmentarJanela(full, tituloVideo, ctx);

  // MAP: janelas com overlap (evita cortar um tema na fronteira).
  const janelas: string[] = [];
  for (let i = 0; i < full.length && janelas.length < MAX_JANELAS; i += (JANELA - OVERLAP)) {
    janelas.push(full.slice(i, i + JANELA));
  }
  const truncado = (MAX_JANELAS - 1) * (JANELA - OVERLAP) + JANELA < full.length;

  // MAP em PARALELO: as janelas são independentes. Para materiais grandes, 5
  // janelas por lote ainda criavam 3 ondas de IA e podiam estourar a conexão de
  // ~300s do callback; até 12 janelas cabem no teto já imposto por MAX_JANELAS.
  const CONC = 12;
  const todas: SegSecao[] = [];
  const diags: string[] = [];
  for (let i = 0; i < janelas.length; i += CONC) {
    const lote = janelas.slice(i, i + CONC);
    const rs = await Promise.all(lote.map((jan, k) =>
      segmentarJanela(jan, `${tituloVideo} (parte ${i + k + 1}/${janelas.length})`, ctx)));
    rs.forEach((r, k) => { todas.push(...r.secoes); diags.push(`j${i + k + 1}:${r.secoes.length}`); });
  }

  // REDUCE: dedup/mescla por (competência × transição × DESCRITOR). Assim, mesma
  // competência com descritores (sub-temas) DIFERENTES vira módulos SEPARADOS;
  // só o MESMO descritor que cruza janelas é fundido (material combinado, cap).
  const map = new Map<string, SegSecao>();
  for (const s of todas) {
    const key = `${s.competencia_id || s.competencia_base_id}|${s.nivel_entrada}|${s.nivel_destino}|${String(s.descritor || '').trim().toLowerCase()}`;
    const ex = map.get(key);
    if (ex) {
      if (ex.texto_base.length < MERGE_CAP) ex.texto_base = (ex.texto_base + '\n\n' + s.texto_base).slice(0, MERGE_CAP);
    } else {
      map.set(key, { ...s });
    }
  }
  const secoes = [...map.values()].slice(0, MAX_SECOES);
  // Fallback determinístico FORÇA uma competência em cada trecho — incompatível
  // com o modo exclusivo (onde 0 é resultado legítimo). Só roda fora dele.
  if (!secoes.length && !exclusivo) {
    const fallback = secoesFallbackDeterministico(full, tituloVideo, listaOrdenada, direcionamento, !!empresaId);
    if (fallback.length) {
      return { secoes: fallback, diag: `fallback determinístico após IA sem blocos (${janelas.length} janelas)` };
    }
  }
  const diag = `map-reduce ${janelas.length} janelas → ${todas.length} brutas → ${secoes.length} módulos${truncado ? ' [texto truncado em ' + MAX_JANELAS + ' janelas]' : ''} (${diags.join(' ')})`;
  return { secoes, diag };
}

/**
 * Cria N Módulos-Base rascunho a partir da transcrição completa de um vídeo
 * longo (1 módulo por seção temática). Usado pelo worker (vídeos >1h via rota
 * interna). Para vídeos curtos, o segmentador devolve 1 seção → 1 módulo.
 */
export async function criarModulosDeTranscricao(opts: {
  transcricao: string;
  tituloVideo?: string;
  urlOrigem?: string;
  locale?: string;
  empresaId?: string | null;
  createdBy?: string;
  direcionamento?: DirecionamentoModuloBase | null;
}): Promise<{ modulos: { id: string; competencia?: string; nivel_entrada?: Nivel; nivel_destino?: Nivel }[]; error?: string; semAderencia?: boolean }> {
  if (!opts?.transcricao?.trim()) return { modulos: [], error: 'transcrição vazia' };

  const dir = opts.direcionamento;
  const exclusivo = !!(dir?.pilar || dir?.competencia || dir?.competenciaBaseId);
  const { secoes, diag } = await segmentarTranscricao(opts.transcricao, opts.tituloVideo || '', dir, opts.empresaId);
  if (!secoes.length) {
    if (exclusivo) {
      // Material processado, mas nada aderente ao escopo direcionado: 0 módulos é
      // o resultado correto (não-erro). Sinaliza com semAderencia pra UI tratar distinto.
      const alvo = dir?.competencia || dir?.pilar || 'o escopo direcionado';
      return { modulos: [], semAderencia: true, error: `Material não aderente a "${alvo}" — 0 módulos extraídos. ${diag}` };
    }
    return { modulos: [], error: `Não foi possível segmentar a transcrição. ${diag}` };
  }

  const locale = (opts.locale || 'pt-BR') as Locale;
  // Estrutura as seções EM PARALELO — N módulos levam ~o tempo de 1, em vez de
  // N×(tempo de um). Crucial pra não estourar o timeout no fluxo síncrono
  // (material) e no callback (vídeo) quando há muitos temas.
  const estruturar = (s: SegSecao) => estruturarEInserirModulo(
    { ...s, locale } as MetaModulo,
    s.texto_base,
    { empresaId: opts.empresaId, urlOrigem: opts.urlOrigem, createdBy: opts.createdBy },
  ).catch((e: any) => ({ error: e?.message || 'erro' } as any));

  // Estrutura em LOTES (concorrência limitada): cada seção é uma chamada Claude
  // densa (até 64k tokens). Tudo de uma vez (Promise.all de 20) estoura o
  // rate-limit; lotes de 6 mantêm o paralelismo sem afogar o provedor.
  const ESTRUT_CONC = 6;
  const resultados: any[] = [];
  for (let i = 0; i < secoes.length; i += ESTRUT_CONC) {
    resultados.push(...await Promise.all(secoes.slice(i, i + ESTRUT_CONC).map(estruturar)));
  }
  const modulos: { id: string; competencia?: string; nivel_entrada?: Nivel; nivel_destino?: Nivel }[] = [];
  const falhas: string[] = [];
  resultados.forEach((res, i) => {
    if (res?.id) modulos.push({ id: res.id, competencia: res.competencia, nivel_entrada: res.nivel_entrada, nivel_destino: res.nivel_destino });
    else falhas.push(`[${String(secoes[i].competencia_base_id).slice(0, 8)}] ${res?.error || 'sem id'}`);
  });
  if (!modulos.length) {
    return { modulos: [], error: `${secoes.length} seções, 0 estruturadas. Motivos: ${falhas.slice(0, 4).join(' · ').slice(0, 380)}` };
  }

  // Já entrega cada módulo COM nota da IA-auditora (best-effort). Sem isto, todo
  // módulo extraído nascia sem nota até alguém reauditar manualmente. Desligável
  // por env (EXTRACAO_AUTO_AUDITAR=0) se o custo/tempo da auditoria pesar.
  if (process.env.EXTRACAO_AUTO_AUDITAR !== '0') {
    try {
      await autoAuditarModulosExtraidos(createSupabaseAdmin(), modulos.map((m) => m.id));
    } catch (e: any) {
      console.warn('[criarModulosDeTranscricao] auto-auditoria falhou (módulos seguem sem nota):', e?.message);
    }
  }
  return { modulos };
}

/**
 * Segmenta + estrutura uma extração (extracoes_video) em N Módulos-Base e atualiza
 * o status. ANTES era o corpo da rota /api/internal/modulo-from-video (limitada a
 * 800s na Vercel). Agora é uma função compartilhada que as TASKS do trigger rodam
 * DIRETO (orçamento de minutos→horas, sem o teto de 800s e sem HTTP no meio — o que
 * também elimina o "erro" por conexão cortada). A rota vira um wrapper fino.
 * Idempotente: se a extração já está 'done', devolve o resultado existente.
 */
export async function segmentarEEstruturarExtracao(
  extracaoId: string,
  opts: { transcricao?: string; titulo?: string | null; locale?: string } = {},
): Promise<{ ok?: true; moduloIds?: string[]; n?: number; idempotente?: boolean; error?: string; httpStatus?: number }> {
  const sb = createSupabaseAdmin();
  const { data: ext } = await sb.from('extracoes_video')
    .select('id, status, modulo_base_ids, escopo_empresa_id, url, transcricao, pilar_direcionador, competencia_direcionadora, competencia_base_id_direcionadora')
    .eq('id', extracaoId).maybeSingle();
  if (!ext) return { error: 'extração não encontrada', httpStatus: 404 };
  if (ext.status === 'done' && Array.isArray(ext.modulo_base_ids) && ext.modulo_base_ids.length) {
    return { ok: true, moduloIds: ext.modulo_base_ids, n: ext.modulo_base_ids.length, idempotente: true };
  }
  const texto = String(opts.transcricao || ext.transcricao || '').trim();
  if (!texto) return { error: 'transcricao obrigatória', httpStatus: 400 };

  let locale = opts.locale;
  if (!locale && ext.escopo_empresa_id) {
    const { data: emp } = await sb.from('empresas').select('default_locale').eq('id', ext.escopo_empresa_id).maybeSingle();
    locale = emp?.default_locale || undefined;
  }
  locale = locale || 'pt-BR';

  const res = await criarModulosDeTranscricao({
    transcricao: texto, tituloVideo: opts.titulo || undefined, urlOrigem: ext.url,
    locale, empresaId: ext.escopo_empresa_id || null, createdBy: 'extracao-video',
    direcionamento: {
      pilar: ext.pilar_direcionador || null,
      competencia: ext.competencia_direcionadora || null,
      competenciaBaseId: ext.competencia_base_id_direcionadora || null,
    },
  });

  if (res.error || !res.modulos.length) {
    // Material não aderente ao escopo direcionado → status 'vazio' (resultado válido,
    // não falha). Erro real de segmentação → 'error'.
    const status = res.semAderencia ? 'vazio' : 'error';
    await sb.from('extracoes_video').update({
      status, error: String(res.error || 'falha ao estruturar módulos').slice(0, 500),
      n_modulos: 0,
      transcricao: texto.slice(0, 500000), titulo: opts.titulo || null, updated_at: new Date().toISOString(),
    }).eq('id', extracaoId);
    return { error: res.error || 'falha ao estruturar', httpStatus: res.semAderencia ? 200 : 422 };
  }

  const ids = res.modulos.map((m) => m.id);
  const comps = res.modulos.map((m) => m.competencia).filter(Boolean);
  const tituloFinal = res.modulos.length > 1
    ? `${res.modulos.length} módulos: ${comps.slice(0, 2).join(', ')}${comps.length > 2 ? '…' : ''}`
    : (comps[0] || opts.titulo || 'Vídeo');
  await sb.from('extracoes_video').update({
    status: 'done', modulo_base_id: ids[0], modulo_base_ids: ids, n_modulos: ids.length,
    transcricao: texto.slice(0, 500000), titulo: tituloFinal, error: null, updated_at: new Date().toISOString(),
  }).eq('id', extracaoId);
  return { ok: true, moduloIds: ids, n: ids.length };
}

// Auto-auditoria pós-extração: audita os módulos recém-criados em lotes, sem
// guard (roda no trigger). Best-effort — falha em um módulo não derruba os outros
// nem a extração; o módulo só fica sem nota (auditável depois pela UI).
async function autoAuditarModulosExtraidos(sb: ReturnType<typeof createSupabaseAdmin>, ids: string[]) {
  // Mesma rotina que a task do manuscrito usa — auditoria em lotes de 4 e
  // promoção rascunho → revisão para quem recebeu veredito.
  const { falhas } = await auditarModulosCore(sb, ids, { promoverParaRevisao: true });
  if (falhas.length) console.warn('[autoAuditar] falhas:', falhas.join(' · '));
}
