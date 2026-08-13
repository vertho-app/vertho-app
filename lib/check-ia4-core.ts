/**
 * Núcleo SEM GATE do check da IA4 (2ª IA auditando a avaliação) — extraído de
 * actions/check-ia4.ts no padrão headless do projeto (lib/blueprint/core.ts):
 * a action 'use server' aplica requireAdminSupabase e delega; scripts/crons
 * chamam este núcleo direto com um client service-role.
 *
 * Motivação (20/07/2026): 4 avaliações rodaram sem check e não havia NENHUM
 * caminho headless para completá-las — o gate de sessão na action bloqueava.
 * O ledger provou que o check nem foi tentado (zero `ia4_check` no dia).
 *
 * Guards de tenant: queries de PII (respostas/colaboradores) levam
 * `.eq('empresa_id', ...)` na cadeia SEMPRE que o empresa_id é conhecido; a
 * única exceção é o fetch inicial por id em checarUmaRespostaCore (allowlisted).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { callAI, type AIConfig } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { formatPerfilContext } from '@/lib/perfil-comportamental';
import { getModelForTask } from '@/lib/ai-tasks';
import { nivelDaNota } from '@/lib/nivel-regua';

/**
 * Itens do CHECKLIST do auditor. A 2ª IA responde SIM/NÃO em cada um; a nota é
 * somada EM CÓDIGO — o modelo nunca escreve um número.
 *
 * Por que assim (medido em 12/08/2026, test-retest de 5 respostas × 3 rodadas
 * com entrada IDÊNTICA): pedindo nota livre, o auditor variava dp 8,0 com
 * amplitude de até 28 pontos, e o VEREDITO mudava em 5 de 5. A variância não
 * era difusa — era BIMODAL (`60 · 84 · 88`, `60 · 84 · 60`): o 60 é o teto que
 * o antigo `erro_grave` forçava. Ou seja, UMA decisão binária do modelo movia
 * um quarto da escala. Aqui a mesma discordância move o peso de UM item (7–10
 * pontos) e não chaveia o veredito sozinha.
 *
 * `critico` não mexe na nota — mexe no VEREDITO: DOIS críticos reprovados
 * seguram em `revisar` (um só é onde o julgamento oscila). `fatal` é a exceção
 * que segura sozinha — alucinação não passa em nenhuma hipótese. Assim o rigor
 * continua sem o penhasco de 25 pontos na nota.
 */
export type CheckItem = {
  id: string; peso: number; critico: boolean; fatal?: boolean; eixo: string; texto: string;
  /** 'codigo' = verificado deterministicamente; ausente = perguntado à IA. */
  fonte?: 'codigo';
};

/**
 * `fonte: 'codigo'` = item verificado DETERMINISTICAMENTE, sem perguntar à IA.
 *
 * Medido no A/B de 12/08 (15 respostas × 3 rodadas × 2 prompts): B2 foi
 * reprovado 19 vezes em 45 — discordando de uma normalização que o próprio
 * código já tinha imposto (`normalizarNiveisDaAvaliacao`). Perguntar a um LLM
 * o que o código calculou é pagar por ruído: são 35 dos 100 pontos entregues a
 * um julgamento sobre fatos que já conhecemos com certeza. Agora o código
 * responde esses itens e a IA fica só com o que exige LEITURA.
 */
export const CHECK_ITENS: readonly CheckItem[] = [
  // A3 é verificável sem ler nada: ou a evidência declara de qual resposta veio,
  // ou não declara. Foi assim que o caso real de 12/08 entrou — a avaliação
  // listou "O cenário informa que o Conselho existe formalmente…" como evidência
  // do descritor, uma string solta, sem R1–R4. O auditor pegou (A2), mas por
  // julgamento; aqui o código pega sempre, e de graça.
  { fonte: 'codigo' as const, id: 'A3', peso: 6, critico: true, eixo: 'ancoragem_evidencia', texto: 'Toda evidência declara de qual resposta (R1–R4) veio — nenhuma cita o cenário como se fosse prova.' },
  { id: 'A1', peso: 8,  critico: true,  eixo: 'ancoragem_evidencia',    texto: 'Todo descritor com nível N3 ou N4 tem trecho literal (ou paráfrase fiel) da resposta como evidência.' },
  { id: 'A2', peso: 6, critico: true, fatal: true, eixo: 'ancoragem_evidencia', texto: 'Toda evidência citada existe de fato nas respostas R1–R4 — nada foi inventado ou inferido.' },
  { fonte: 'codigo' as const, id: 'B1', peso: 10, critico: false, eixo: 'coerencia_nivel_nota',   texto: 'O nível de cada descritor corresponde à nota decimal pela régua (N1 1,00–1,99 · N2 2,00–2,99 · N3 3,00–3,50 · N4 acima de 3,50).' },
  { fonte: 'codigo' as const, id: 'B2', peso: 10, critico: true,  eixo: 'coerencia_nivel_nota',   texto: 'O MESMO descritor aparece com o MESMO nível em todas as seções (consolidação, avaliação por descritor, destaques, PDI e no texto).' },
  { fonte: 'codigo' as const, id: 'C1', peso: 8,  critico: false, eixo: 'coerencia_consolidacao', texto: 'A média informada confere com as notas por descritor.' },
  { fonte: 'codigo' as const, id: 'C2', peso: 7,  critico: false, eixo: 'coerencia_consolidacao', texto: 'As travas e o gap estão corretos (descritor N1 → máximo N2; mais de 3 descritores N1 → N1; evidência N3 → mínimo N2; gap = 3 − nível geral).' },
  { id: 'D1', peso: 8,  critico: true,  eixo: 'especificidade_feedback',texto: 'O feedback cita algo específico DESTA pessoa — não serviria igual para qualquer outra.' },
  { id: 'D2', peso: 7,  critico: false, eixo: 'especificidade_feedback',texto: 'O tom é construtivo e trata a pessoa pelo que ela demonstrou, sem julgamento moral.' },
  { id: 'E1', peso: 8,  critico: false, eixo: 'qualidade_recomendacoes',texto: 'Cada gap prioritário vira uma ação praticável e observável no trabalho da pessoa.' },
  { id: 'E2', peso: 7,  critico: false, eixo: 'qualidade_recomendacoes',texto: 'Não recomenda recursos externos (livros, cursos, podcasts, consultorias).' },
  // F1 é o item que mais oscilava (medido 12/08: reprovado em 2 de 3 rodadas
  // IDÊNTICAS, chaveando o veredito sozinho). A causa era o enunciado: toda
  // avaliação INTERPRETA o que foi dito — sem um limiar, "inferir" vira moeda.
  // Agora pergunta por AFIRMAÇÃO DE FATO não dito, e diz explicitamente o que
  // NÃO conta como violação.
  { id: 'F1', peso: 8,  critico: false, eixo: 'prudencia_metodologica', texto: 'A avaliação NÃO afirma como fato algo que a pessoa não disse — atribuir intenção ("quis evitar o conflito"), causa ("porque teme a mãe") ou resultado ("isso desgastaria a equipe") que não está nas respostas. NÃO conta como violação: interpretar o que FOI dito, apontar o que faltou, ou classificar a resposta contra a régua.' },
  { id: 'F2', peso: 7,  critico: false, eixo: 'prudencia_metodologica', texto: 'Na dúvida entre dois níveis, a avaliação ficou com o INFERIOR.' },
] as const;

const CHECK_SYSTEM = `Você é um auditor de qualidade de Assessment Comportamental da Vertho.
Sua tarefa: verificar, item a item, se a avaliação gerada por outra IA é DEFENSÁVEL como produto Vertho.

═══ PRINCÍPIOS ═══

- Evidência concreta vale mais que texto bonito
- N3/N4 sem base concreta NÃO se sustentam
- Feedback genérico é erro metodológico
- Recomendação sem base observável não vale
- O auditor PROTEGE rigor, prática e baixo viés

═══ COMO RESPONDER ═══

Você NÃO dá nota. Você responde VERDADEIRO ou FALSO em cada verificação abaixo,
e a nota é calculada em código a partir das suas respostas.

Para cada item: \`ok: true\` se a avaliação CUMPRE o item; \`ok: false\` se NÃO cumpre.
Quando \`ok: false\`, escreva em \`obs\` o motivo em uma frase, citando o ponto exato.
Na dúvida sobre um item, responda \`ok: false\` e explique — o lado conservador é acusar.

═══ VERIFICAÇÕES ═══

${CHECK_ITENS.filter((i) => i.fonte !== 'codigo').map((i) => `${i.id}. ${i.texto}`).join('\n')}

═══ FORMATO JSON (APENAS JSON, sem markdown) ═══

{
  "verificacoes": {
${CHECK_ITENS.filter((i) => i.fonte !== 'codigo').map((i) => `    "${i.id}": {"ok": true, "obs": ""}`).join(',\n')}
  },
  "ponto_mais_confiavel": "O que a avaliação fez melhor (1 frase)",
  "ponto_mais_fragil": "Onde a avaliação é mais vulnerável (1 frase)",
  "descritores_com_risco": ["descritores cuja nota parece frágil"],
  "tipo_de_erro_predominante": "extrapolacao|falta_prudencia|generico|matematica|nenhum",
  "justificativa": "2-3 frases concretas sobre o conjunto",
  "mudancas_sugeridas": ["correção específica para cada item marcado false"],
  "alertas": ["riscos residuais"]
}

REGRAS:
- Responda TODOS os ${CHECK_ITENS.filter((i) => i.fonte !== 'codigo').length} itens.
- Coerência de níveis, média e travas NÃO são perguntadas: o código já as verifica.
- NÃO invente campo "nota" nem "status" — eles são derivados em código.
- \`mudancas_sugeridas\` deve ter uma entrada por item false, na mesma ordem.`;

const IA4_CHECK_CALL_OPTIONS = { timeoutMs: 180000, maxRetries: 0 } as const;

// Retorna o prompt em duas partes p/ prompt caching (mesmo lote da IA4): o
// PREFIXO estável por (competência, cenário) — régua/cenário/perguntas, idêntico
// entre os colabs do lote → bloco cacheável; e o USER variável (colab/respostas/
// avaliação a auditar). Seções rotuladas ═══ → a reordenação não muda a leitura.
function buildCheckUser(colab: any, compNome: string, perfilCIS: string, resp: any, reguaTexto: string, cenarioTexto: string, perguntasTexto: string): { prefix: string; user: string } {
  const estavel: string[] = [];
  estavel.push(`═══ COMPETÊNCIA ═══\n${compNome}`);
  if (reguaTexto) estavel.push(`═══ RÉGUA DE MATURIDADE ═══\n${reguaTexto}`);
  if (cenarioTexto) estavel.push(`═══ CENÁRIO ═══\n${cenarioTexto}`);
  if (perguntasTexto) estavel.push(`═══ PERGUNTAS ═══\n${perguntasTexto}`);

  const variavel: string[] = [];
  variavel.push(`═══ PROFISSIONAL ═══
${colab?.nome_completo || '—'} · ${colab?.cargo || '—'}`);
  if (perfilCIS) variavel.push(`═══ PERFIL CIS ═══\n${perfilCIS}`);
  variavel.push(`═══ RESPOSTAS DO PROFISSIONAL ═══
R1: ${resp.r1 || '—'}
R2: ${resp.r2 || '—'}
R3: ${resp.r3 || '—'}
R4: ${resp.r4 || '—'}`);
  // Avaliação a auditar — incluir campos enriquecidos se disponíveis
  const av = typeof resp.avaliacao_ia === 'string' ? JSON.parse(resp.avaliacao_ia) : resp.avaliacao_ia;
  variavel.push(`═══ AVALIAÇÃO A AUDITAR ═══\n${JSON.stringify(av, null, 2)}`);
  variavel.push(`═══ INSTRUÇÃO ═══
Verifique se esta avaliação é DEFENSÁVEL como produto Vertho.
Se for bem escrita mas metodologicamente fraca, PENALIZE.
Prefira rigor a elegância.`);

  return { prefix: estavel.join('\n\n'), user: variavel.join('\n\n') };
}

/**
 * Contexto + prompt do check de UMA resposta, numa peça só — para o síncrono e o
 * lote pedirem exatamente a mesma auditoria. Prompt duplicado entre os dois
 * caminhos é como eles divergem sem ninguém ver (o corolário "conserte o que
 * RODA" do CLAUDE.md), então aqui só existe esta função.
 */
export async function montarCheckIA4Prompt(
  sb: SupabaseClient, resp: any, empresaId: string,
): Promise<{ system: string; prefix: string; user: string; compNome: string; colab: any }> {
  const { data: colab } = await sb.from('colaboradores')
    .select('id, nome_completo, cargo, d_natural, i_natural, s_natural, c_natural, perfil_dominante, perfil_externo_fonte, perfil_externo_dados')
    .eq('empresa_id', empresaId)
    .eq('id', resp.colaborador_id).maybeSingle();

  let cenarioTexto = '', perguntasTexto = '';
  if (resp.cenario_id) {
    const { data: cen } = await sb.from('banco_cenarios')
      .select('titulo, descricao, alternativas').eq('id', resp.cenario_id).maybeSingle();
    if (cen) {
      cenarioTexto = `${cen.titulo}\n${cen.descricao}`;
      const altObj = typeof cen.alternativas === 'object' && !Array.isArray(cen.alternativas) ? cen.alternativas : {};
      const pergs = (altObj as any).perguntas || (Array.isArray(cen.alternativas) ? cen.alternativas : []);
      perguntasTexto = pergs.map((p: any, i: number) => `P${p.numero || i + 1}: ${p.texto || ''}`).join('\n');
    }
  }

  let compNome = '', reguaTexto = '';
  if (resp.competencia_id) {
    const { data: comp } = await sb.from('competencias')
      .select('nome, cod_comp').eq('id', resp.competencia_id).maybeSingle();
    compNome = comp?.nome || '';
    const { data: descs } = await sb.from('competencias')
      .select('cod_desc, nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
      .eq('empresa_id', empresaId).eq('cod_comp', comp?.cod_comp).not('cod_desc', 'is', null);
    if (descs?.length) {
      reguaTexto = descs.map((d: any, i: number) =>
        `D${i + 1} ${d.cod_desc}: ${d.nome_curto}\n  N1: ${d.n1_gap || '—'}\n  N2: ${d.n2_desenvolvimento || '—'}\n  N3: ${d.n3_meta || '—'}\n  N4: ${d.n4_referencia || '—'}`
      ).join('\n\n');
    }
  }

  const perfilCIS = formatPerfilContext(colab as any);
  const { prefix, user } = buildCheckUser(colab, compNome, perfilCIS, resp, reguaTexto, cenarioTexto, perguntasTexto);
  return { system: CHECK_SYSTEM, prefix, user, compNome, colab };
}

/** Persistência do veredito — um lugar só, usado pelo síncrono e pelo lote. */
export async function persistirCheckIA4(
  sb: SupabaseClient, respostaId: string, empresaId: string, status: string, check: any,
): Promise<{ error?: string }> {
  const { error } = await sb.from('respostas').update({
    status_ia4: status,
    payload_ia4: check,
  }).eq('id', respostaId).eq('empresa_id', empresaId).select('id');
  return error ? { error: error.message } : {};
}

/**
 * Responde os itens `fonte: 'codigo'` olhando o payload — sem IA, sem ruído.
 *
 * São fatos que já calculamos: o nível vem de `nivelDaNota`, a média e as
 * travas de `consolidarNotasIA4`, e a coerência entre seções é IMPOSTA por
 * `normalizarNiveisDaAvaliacao`. Perguntar isso a um LLM foi o que produziu 19
 * reprovações de B2 em 45 rodadas — o modelo discordando de uma normalização
 * determinística. Quando o código não consegue verificar (payload sem o campo),
 * o item fica AUSENTE e não pontua para nenhum lado.
 */
export function verificarEmCodigo(avaliacao: any): Record<string, { ok: boolean; obs?: string }> {
  const out: Record<string, { ok: boolean; obs?: string }> = {};
  const cons = avaliacao?.consolidacao;
  const notas: Record<string, any> | undefined = cons?.notas_por_descritor;
  if (!cons || !notas || typeof notas !== 'object') return out;

  const entradas = Object.entries(notas);
  if (!entradas.length) return out;

  // B1 — nível de cada descritor bate com a nota pela régua oficial.
  const b1 = entradas.filter(([, v]: any) => nivelDaNota(v?.nota_decimal) !== v?.nivel);
  out.B1 = b1.length
    ? { ok: false, obs: `${b1.length} descritor(es) com nível fora da régua: ${b1.map(([k]) => k).join(', ')}` }
    : { ok: true };

  // B2 — o MESMO descritor com o MESMO nível em todas as seções.
  const porChave = new Map(entradas.map(([k, v]: any) => [k, v?.nivel]));
  const divergentes: string[] = [];
  for (const d of avaliacao?.avaliacao_por_descritor || []) {
    const esperado = porChave.get(`D${d?.numero}`);
    if (esperado != null && d?.nivel_sugerido != null && d.nivel_sugerido !== esperado) divergentes.push(`D${d.numero}`);
  }
  for (const rec of avaliacao?.recomendacoes_pdi || []) {
    const m = String(rec?.descritor_foco || '').match(/^D\s*(\d+)/i);
    const esperado = m ? porChave.get(`D${m[1]}`) : undefined;
    if (esperado != null && rec?.nivel_atual_sugerido != null && rec.nivel_atual_sugerido !== esperado) divergentes.push(`PDI:${m?.[0]}`);
  }
  out.B2 = divergentes.length
    ? { ok: false, obs: `níveis divergentes entre seções: ${[...new Set(divergentes)].join(', ')}` }
    : { ok: true };

  // A3 — toda evidência declara de qual resposta veio. Aceita tanto o formato
  // estruturado ({resposta:'R1', trecho}) quanto o textual ("R2: '...'"), que é
  // o que o modelo produz na prática. Item solto, sem R1–R4, reprova.
  const soltas: string[] = [];
  for (const d of avaliacao?.avaliacao_por_descritor || []) {
    for (const e of d?.evidencias || []) {
      const marcada = typeof e === 'object'
        ? /^R[1-4]$/i.test(String(e?.resposta || '').trim())
        : /^\s*R\s*[1-4]\b/i.test(String(e || ''));
      if (!marcada) soltas.push(`${d?.nome || d?.numero}: "${String(typeof e === 'object' ? e?.trecho : e).slice(0, 60)}…"`);
    }
  }
  out.A3 = soltas.length
    ? { ok: false, obs: `${soltas.length} evidência(s) sem origem em R1–R4 (cenário citado como prova?): ${soltas.slice(0, 2).join(' | ')}` }
    : { ok: true };

  // C1 — a média informada confere com as notas.
  const valores = entradas.map(([, v]: any) => Number(v?.nota_decimal)).filter((n) => Number.isFinite(n));
  const mediaEsperada = valores.length ? Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100 : null;
  const mediaGravada = Number(cons.media_descritores);
  out.C1 = mediaEsperada != null && Math.abs(mediaEsperada - mediaGravada) <= 0.011
    ? { ok: true }
    : { ok: false, obs: `média informada ${mediaGravada}, calculada ${mediaEsperada}` };

  // C2 — travas e gap.
  const niveis = entradas.map(([, v]: any) => v?.nivel);
  const nN1 = niveis.filter((n) => n === 1).length;
  const nivelGravado = Number(cons.nivel_geral);
  const problemas: string[] = [];
  if (nN1 > 3 && nivelGravado > 1) problemas.push(`${nN1} descritores N1 exigiam nível geral N1`);
  else if (nN1 > 0 && nivelGravado > 2) problemas.push('descritor N1 presente exigia no máximo N2');
  if (niveis.some((n) => n >= 3) && nivelGravado < 2) problemas.push('evidência N3 exigia no mínimo N2');
  if (Number(cons.gap) !== Math.max(0, 3 - nivelGravado)) problemas.push(`gap ${cons.gap} ≠ ${Math.max(0, 3 - nivelGravado)}`);
  out.C2 = problemas.length ? { ok: false, obs: problemas.join('; ') } : { ok: true };

  return out;
}

/** Veredito a partir da nota — a régua de faixas, num lugar só. */
function faixaDeStatus(nota: number): string {
  return nota >= 90 ? 'aprovado' : nota >= 80 ? 'aprovado_com_ajustes' : 'revisar';
}

/**
 * Deriva NOTA e VEREDITO do checklist — o modelo responde sim/não, o código
 * calcula. Mesmo princípio do `derivarVeredito` da auditoria dual-IA e da
 * consolidação da IA4: número que sai da IA não se aceita, se deriva.
 *
 * Duas decisões que vêm da medição de 12/08 (test-retest, entrada idêntica):
 *
 * 1. NOTA sem teto. O `erro_grave` antigo grampeava em 60, e era esse penhasco
 *    que produzia as séries bimodais (`60 · 84 · 88`): uma discordância isolada
 *    valia 25 pontos. Agora cada item vale o seu peso (7–10) e nada mais.
 * 2. Item AUSENTE não pune. A nota é normalizada pelos itens efetivamente
 *    respondidos — se o modelo esquecer um item, a avaliação não é penalizada
 *    por uma falha do auditor. Só falha DECLARADA (`ok:false`) tira ponto.
 *
 * O rigor migrou para o VEREDITO: qualquer item crítico reprovado segura em
 * `revisar` por mais alta que seja a nota. Inventar evidência não passa — mas
 * também não derruba a nota num degrau artificial.
 */
export function processCheckResult(check: any, avaliacao?: any): { status: string; check: any } {
  if (!check) return { status: 'erro', check: null };

  // Itens objetivos: o CÓDIGO responde e sobrescreve o que a IA porventura
  // tenha dito. Fato verificável não se pergunta a um modelo.
  if (avaliacao && check.verificacoes && typeof check.verificacoes === 'object') {
    const doCodigo = verificarEmCodigo(avaliacao);
    for (const [id, v] of Object.entries(doCodigo)) check.verificacoes[id] = { ...v, fonte: 'codigo' };
  }

  const verificacoes = check.verificacoes;
  if (verificacoes && typeof verificacoes === 'object') {
    let pesoRespondido = 0, pesoOk = 0;
    const criticosFalhos: string[] = [];
    const falhas: string[] = [];
    const porEixo: Record<string, { peso: number; ok: number }> = {};

    for (const item of CHECK_ITENS) {
      const v = verificacoes[item.id];
      if (!v || typeof v.ok !== 'boolean') continue; // ausente: não conta (nem a favor, nem contra)
      pesoRespondido += item.peso;
      porEixo[item.eixo] ||= { peso: 0, ok: 0 };
      porEixo[item.eixo].peso += item.peso;
      if (v.ok) {
        pesoOk += item.peso;
        porEixo[item.eixo].ok += item.peso;
      } else {
        falhas.push(`${item.id}: ${v.obs || item.texto}`);
        if (item.critico) criticosFalhos.push(item.id);
      }
    }

    if (pesoRespondido === 0) return { status: 'erro', check: null };

    const nota = Math.round((pesoOk / pesoRespondido) * 100);

    // Quantos críticos seguram o veredito. UM basta quando o item é FATAL
    // (evidência inventada — alucinação não passa, em nenhuma hipótese); os
    // demais exigem DOIS, porque medimos que um crítico isolado é justamente
    // onde o julgamento oscila (F1 reprovado em 2 de 3 rodadas idênticas,
    // chaveando o veredito sozinho). Dois críticos independentes discordando é
    // sinal; um só é moeda.
    const temFatal = criticosFalhos.some((id) => CHECK_ITENS.find((i) => i.id === id)?.fatal);
    const seguraVeredito = temFatal || criticosFalhos.length >= 2;
    const status = seguraVeredito ? 'revisar' : faixaDeStatus(nota);

    check.nota = nota;
    check.status = status;
    check.erro_grave = seguraVeredito;
    check.criticos_falhos = criticosFalhos;
    check.itens_falhos = falhas;
    check.itens_respondidos = Math.round((pesoRespondido / CHECK_ITENS.reduce((s, i) => s + i.peso, 0)) * 100);
    // `criterios` por eixo (0–100) — o formato que as telas já sabiam ler.
    check.criterios = Object.fromEntries(
      Object.entries(porEixo).map(([eixo, v]) => [eixo, Math.round((v.ok / v.peso) * 100)])
    );
    return { status, check };
  }

  // Formato ANTIGO (nota escrita pelo modelo): payloads já gravados e qualquer
  // resposta que ignore o checklist continuam legíveis, com a régua de então.
  if (check.nota === undefined) return { status: 'erro', check: null };
  if (check.erro_grave && check.nota > 60) check.nota = 60;
  const status = faixaDeStatus(check.nota);
  check.status = status;
  return { status, check };
}

/**
 * Fila do check: avaliações da empresa que ainda não passaram pela 2ª IA.
 *
 * Existe para a UI percorrer a fila UMA RESPOSTA POR REQUEST (como a IA4 já
 * fazia), em vez de pedir o lote inteiro numa server action. Motivo medido
 * (11/08/2026, Macaé): o lote de 72 avaliações rodou dentro de um único POST e
 * a Vercel matou a função aos 300s (`maxDuration` do segmento /admin/empresas)
 * com 14 checadas — o erro chegou como "Check falhou", sem nada de errado no
 * modelo nem nos dados. A ~21s por check, o teto sempre foi ~14 por execução.
 */
export async function listarPendentesCheckCore(sb: SupabaseClient, empresaId: string) {
  const { data, error } = await sb.from('respostas')
    .select('id, colaborador_id, competencia_nome')
    .eq('empresa_id', empresaId)
    .not('avaliacao_ia', 'is', null)
    .is('status_ia4', null);
  if (error) return { success: false, error: error.message, data: [] };

  const colabIds = [...new Set((data || []).map((r: any) => r.colaborador_id).filter(Boolean))] as string[];
  const nomes: Record<string, string> = {};
  if (colabIds.length) {
    const { data: colabs, error: errColab } = await sb.from('colaboradores')
      .select('id, nome_completo')
      .eq('empresa_id', empresaId)
      .in('id', colabIds);
    if (errColab) return { success: false, error: errColab.message, data: [] };
    (colabs || []).forEach((c: any) => { nomes[c.id] = c.nome_completo; });
  }

  return {
    success: true,
    data: (data || []).map((r: any) => ({
      id: r.id,
      nome: nomes[r.colaborador_id] || '—',
      competencia: r.competencia_nome || '—',
    })),
  };
}

/**
 * Check em LOTE: todas as avaliações da empresa com `status_ia4 IS NULL`.
 *
 * ⚠️ SÓ HEADLESS (scripts/crons — `scripts/_run-check-ia4.ts`). Não expor como
 * action: o loop inteiro num request estoura o `maxDuration` (ver o comentário
 * de `listarPendentesCheckCore`). Na UI, use a fila + `checarUmaRespostaCore`.
 */
export async function checkAvaliacoesCore(sb: SupabaseClient, empresaId: string, aiConfig: AIConfig = {}) {
  try {
    const { data: respostas, error: qErr } = await sb.from('respostas')
      .select('id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, avaliacao_ia, nivel_ia4')
      .eq('empresa_id', empresaId)
      .not('avaliacao_ia', 'is', null)
      .is('status_ia4', null);

    if (qErr) return { success: false, error: qErr.message };
    if (!respostas?.length) return { success: true, message: 'Nenhuma avaliação pendente de check' };

    const model = aiConfig?.model || await getModelForTask(empresaId, 'ia4_check');
    let checados = 0, erros = 0, ultimoErro = '';

    for (const resp of respostas) {
      try {
        const { system, prefix, user } = await montarCheckIA4Prompt(sb, resp, empresaId);
        const resultado = await callAI(system, user, { model }, 8192, { ...IA4_CHECK_CALL_OPTIONS, cachedUserPrefix: prefix, taskKey: 'ia4_check' });
        const raw = await extractJSON(resultado);
        const { status, check } = processCheckResult(raw, resp.avaliacao_ia);

        if (check) {
          const { error: updErr } = await persistirCheckIA4(sb, resp.id, empresaId, status, check);
          if (!updErr) checados++;
          else { erros++; ultimoErro = updErr; }
        } else {
          erros++;
          ultimoErro = 'Check não retornou nota';
        }
      } catch (e: any) {
        erros++;
        ultimoErro = e.message;
        console.error(`[check-ia4] resposta ${resp.id}: ${e.message}`);
      }
    }

    return {
      success: true,
      message: `Check IA4: ${checados} verificadas${erros ? `, ${erros} erros` : ''}${ultimoErro ? ` — ${ultimoErro}` : ''}`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Check de UMA resposta (recheck): zera o carimbo e reaudita. */
export async function checarUmaRespostaCore(sb: SupabaseClient, respostaId: string, aiConfig: AIConfig = {}) {
  try {
    const { data: resp } = await sb.from('respostas')
      .select('id, empresa_id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, avaliacao_ia, nivel_ia4')
      .eq('id', respostaId).single();
    if (!resp) return { success: false, error: 'Resposta não encontrada' };
    if (!resp.avaliacao_ia) return { success: false, error: 'Resposta não foi avaliada ainda' };

    await sb.from('respostas').update({ status_ia4: null, payload_ia4: null })
      .eq('id', respostaId).eq('empresa_id', resp.empresa_id).select('id');

    const model = aiConfig?.model || await getModelForTask(resp.empresa_id, 'ia4_check');

    const { system, prefix, user, compNome } = await montarCheckIA4Prompt(sb, resp, resp.empresa_id);
    const resultado = await callAI(system, user, { model }, 8192, { ...IA4_CHECK_CALL_OPTIONS, cachedUserPrefix: prefix, taskKey: 'ia4_check' });
    const raw = await extractJSON(resultado);
    const { status, check } = processCheckResult(raw, resp.avaliacao_ia);

    if (check) {
      const { error: updErr } = await persistirCheckIA4(sb, respostaId, resp.empresa_id, status, check);
      if (updErr) return { success: false, error: updErr };
      return { success: true, message: `Check: ${compNome} — ${check.nota}pts (${status})`, nota: check.nota, status };
    }
    return { success: false, error: 'Check não retornou nota' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
