/**
 * IA-auditora de Módulos-Base (Dual-IA, cross-provider: a autora é Claude, a
 * auditora é GPT-5.4 — perspectivas independentes, de propósito).
 *
 * Vive em `lib/` pelo mesmo motivo de `lib/modulo-base-autor.ts`: a task
 * `gerar-modulos-manuscrito` precisa auditar os módulos que acabou de criar, e
 * uma task não pode importar um `'use server'` sem transformar cada export num
 * endpoint HTTP. `auditarModuloCore` NÃO tem guard — quem expõe à web é o wrapper
 * `auditarModuloBase` em `actions/modulos-base.ts`.
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import { validarCorpo } from '@/lib/modulo-base-autor';

export const COLS_MODULO = `
  id, grupo_id, locale, competencia_base_id, competencia_id, nivel_entrada, nivel_destino,
  titulo, descritor, finalidade, contexto_pedagogico, tags, preferido, status, versao,
  substitui_modulo_id, conteudo_central, conteudo_aplicavel, guarda_corpos,
  adaptacao_por_formato, created_by, created_at, updated_at,
  reviewed_by, reviewed_at, published_by, published_at,
  auditoria_ia, auditado_em, auditado_por_modelo, auditado_em_versao
`;

// ── Resolver competência canônica (para IA-as-autor / import) ─────────────────
export async function carregarCompetenciaBase(id: string) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('competencias_base')
    .select('id, segmento, cod_comp, nome, nome_curto, pilar, descricao, cod_desc, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia, cargo, evidencias_esperadas, perguntas_alvo')
    .eq('id', id)
    .maybeSingle();
  return data;
}

// Competência da EMPRESA (taxonomia própria, sem ligação com o catálogo canônico).
// Usada quando a extração é escopada a uma empresa (ex.: pilar Empreendedorismo da
// Macaé). Mesmos campos do catálogo base, exceto `segmento` (deriva da empresa).
export async function carregarCompetenciaEmpresa(id: string) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('competencias')
    .select('id, empresa_id, cargo, pilar, cod_comp, nome, nome_curto, descricao, cod_desc, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia, evidencias_esperadas, perguntas_alvo')
    .eq('id', id)
    .maybeSingle();
  if (data && !(data as any).segmento) (data as any).segmento = '(modelo da empresa)';
  return data;
}

// Resolve a competência do módulo no catálogo certo: canônico (competencia_base_id)
// OU modelo da empresa (competencia_id). Sem isto, módulos de empresa eram
// auditados/refinados SEM o descritor — degradando o julgamento da IA.
export async function carregarCompetenciaDoModulo(m: any): Promise<any> {
  if (m?.competencia_base_id) return carregarCompetenciaBase(m.competencia_base_id);
  if (m?.competencia_id) return carregarCompetenciaEmpresa(m.competencia_id);
  return null;
}

export const SYSTEM_AUDITOR = `Você é IA-auditora de Módulos-Base de Conteúdo da Vertho. Avalie um módulo gerado pela IA-autora contra a spec oficial e os próprios guarda-corpos do módulo.

POSTURA — rigorosa com DEFEITO REAL, justa com o resto:
- Marque só o que você de fato corrigiria. NÃO invente problema pra parecer exigente; NÃO transforme preferência de estilo em defeito.
- O módulo é INSUMO pra IA gerar conteúdo depois — NÃO é o texto final que o colaborador lê. Pequenas asperezas de forma são polidas na geração; não as trate como falhas do módulo.
- Um módulo com estrutura completa e sem defeito grave MERECE nota alta. Se está bom, diga que está bom.

CRITÉRIOS DE AUDITORIA (verifique TODOS):
1. ESTRUTURA — 4 blocos presentes? conteudo_central com ideia/explicação/≥5 princípios/síntese? conteudo_aplicavel com ≥4 situações/exemplos universais (5 chaves)/≥4 erros/repertório (≥6 categorias)/≥4 boas práticas? guarda_corpos com preservar/evitar/cuidados_eticos/cuidados_linguagem (nomes EXATOS do template — NÃO exija um campo "cuidados" genérico)? adaptacao_por_formato com texto/podcast_roteiro/video_roteiro? — Subcampos EXTRAS além do mínimo NÃO são problema. Só conta o que está ABAIXO do mínimo.
2. NÃO É RÉGUA DE MATURIDADE — o conteúdo descreve conhecimento aplicável, não comportamentos observáveis por nível. Repetir a régua de maturidade é problema GRAVE.
3. NÃO É AULA FINAL — o módulo é matéria-prima pedagógica pra IA gerar conteúdo depois, não é texto pronto pra colaborador ler.
4. EXEMPLOS — sem nomes próprios reais. Sobre CARGO: se o "Contexto pedagógico" (no bloco CONTEXTO acima) nomeia um cargo/função específica, então o módulo é DECLARADAMENTE de contexto de cargo e exemplos ancorados nesse cargo são ESPERADOS e desejáveis — NÃO marque isso como falta de universalidade. Só exija universalidade quando o contexto for "transversal". Um exemplo CONCRETO é sempre desejável.
5. NADA INVENTADO — leis, normas, estatísticas, citações fabricadas. Gravidade alta.
6. SEM DIAGNÓSTICO PSICOLÓGICO. SEM DISC determinista. Linguagem evita rotular pessoa.
7. AUTO-CONSISTÊNCIA — exemplos e linguagem respeitam os guarda_corpos do PRÓPRIO módulo (não contradizem).
8. PROFUNDIDADE — explicação expandida tem substância (não é stub); princípios têm implicação prática (não genéricos); situações têm risco_comum E boa_abordagem distintos.
9. LINGUAGEM — tom profissional aplicado. Vocabulário NATIVO do domínio da competência (ex.: "margem", "liquidez", "fluxo de caixa" num módulo de empreendedorismo/gestão) é APROPRIADO — não é "jargão excessivo". Só marque jargão GRATUITO pro público declarado, ou densidade que realmente atrapalhe o entendimento.

COMO CLASSIFICAR GRAVIDADE (seja honesta — a maioria dos achados de um módulo decente é BAIXA):
- ALTA: inviabiliza o uso — invenção factual, violação ética, cópia da régua de maturidade, bloco essencial ausente/stub, contradição clara com o próprio guarda-corpo, conceito central errado.
- MEDIA: defeito real que vale corrigir mas não inviabiliza — falta de um mínimo estrutural, 1 princípio sem implicação prática, 1 exemplo que claramente não transfere.
- BAIXA: polimento / preferência. Se o achado é "poderia ser um pouco mais X", é BAIXA — ou não é problema.
- NUNCA classifique preferência subjetiva como MEDIA. Na dúvida entre média e baixa, escolha BAIXA.

RETORNE APENAS JSON válido. NÃO calcule nota nem veredito — o sistema os deriva
dos problemas que você listar. Sua tarefa é ACHAR e CLASSIFICAR, com evidência:
{
  "problemas": [
    {
      "categoria": "estrutura" | "regua-vs-base" | "aula-vs-base" | "exemplos" | "invencao" | "etica" | "auto-consistencia" | "profundidade" | "linguagem",
      "descricao": "explica concretamente o problema (cite trecho se útil)",
      "gravidade": "alta" | "media" | "baixa",
      "campo_afetado": "ex.: conteudo_central.principios[2]"
    }
  ],
  "recomendacoes": ["sugestões de correção, 1-3 itens"],
  "confianca": 0.0 a 1.0
}

GRAVIDADE É O QUE IMPORTA. O sistema converte assim, e você não pode contorná-lo:
qualquer problema ALTA reprova o módulo. Portanto NÃO marque ALTA por polimento —
e NÃO rebaixe para MEDIA um defeito que de fato inviabiliza o uso (invenção
factual, violação ética, cópia da régua, bloco essencial ausente, contradição com
o próprio guarda-corpo, conceito central errado). Chame o que é.

- "confianca" = sua certeza nos achados (0-1).`;


/**
 * Deriva nota e veredito dos PROBLEMAS, em código.
 *
 * Antes isto era pedido ao próprio modelo. Ele desobedecia: 7 módulos com
 * problema de gravidade ALTA saíram como "aprovado_com_ressalvas" (a régua manda
 * reprovar), e 3 chegaram a ser publicados — um deles com invenção factual. A
 * nota, por sua vez, é pura aritmética sobre os problemas: pedi-la ao LLM só
 * adicionava ruído (batia com a fórmula em 89% dos casos).
 *
 * `estruturaCompleta` vem do `validarCorpo` — checagem determinística e de graça.
 * Sem ela não há piso: estrutura furada pode cair abaixo de 7,0 mesmo sem ALTA.
 */
export function derivarVeredito(
  problemas: Array<{ gravidade?: string }>,
  estruturaCompleta: boolean,
): { nota: number; veredito: 'aprovado' | 'aprovado_com_ressalvas' | 'reprovado' } {
  const conta = (g: string) => problemas.filter((p) => p?.gravidade === g).length;
  const alta = conta('alta'), media = conta('media'), baixa = conta('baixa');

  let nota = 10 - 2.5 * alta - 0.6 * media - 0.1 * baixa;
  if (alta > 0) nota = Math.min(nota, 4.9);          // teto: defeito que inviabiliza
  else if (estruturaCompleta) nota = Math.max(nota, 7.0); // piso: insumo sólido
  nota = Math.round(Math.max(0, Math.min(10, nota)) * 10) / 10;

  const veredito = (alta > 0 || nota < 5.0)
    ? 'reprovado' as const
    : (nota >= 9.0 && media === 0)
      ? 'aprovado' as const
      : 'aprovado_com_ressalvas' as const;
  return { nota, veredito };
}

export async function auditarModuloCore(sb: ReturnType<typeof createSupabaseAdmin>, id: string) {
  const { data: m } = await sb.from('modulos_base_conteudo').select(COLS_MODULO).eq('id', id).maybeSingle();
  if (!m) return { error: 'Módulo não encontrado' };

  const comp = await carregarCompetenciaDoModulo(m);

  const userPrompt = `## CONTEXTO
- Competência: ${comp?.nome || '—'} (${comp?.segmento || '—'})
- Descritor: ${comp?.descritor_completo || '—'}
- Transição: ${m.nivel_entrada} → ${m.nivel_destino}
- Locale: ${m.locale}
- Contexto pedagógico: ${m.contexto_pedagogico || 'transversal'}
- Título: ${m.titulo}
- Finalidade: ${m.finalidade}

## MÓDULO A AUDITAR (JSON completo dos 4 blocos):
${JSON.stringify({
  conteudo_central: m.conteudo_central,
  conteudo_aplicavel: m.conteudo_aplicavel,
  guarda_corpos: m.guarda_corpos,
  adaptacao_por_formato: m.adaptacao_por_formato,
}, null, 2)}

Responda APENAS com o JSON do veredito.`;

  const model = await getModelForTask(null as any, 'modulo_base_auditor');
  let auditoria: any = null;
  for (let tentativa = 1; tentativa <= 2 && !auditoria; tentativa++) {
    try {
      const raw = await callAI(SYSTEM_AUDITOR, userPrompt, { model }, 16000, { taskKey: 'modulo_base_auditor' });
      const cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
      const candidatos = [cleaned];
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objMatch) candidatos.push(objMatch[0]);
      for (const c of candidatos) {
        try {
          const p = JSON.parse(c);
          // O contrato agora é `problemas` (array, possivelmente vazio). Aceita
          // resposta legada com `veredito` — ele é ignorado na derivação.
          if (p && Array.isArray(p.problemas)) { auditoria = p; break; }
        } catch { /* tenta próximo */ }
      }
    } catch (e: any) {
      console.warn(`[auditarModuloBase] tentativa ${tentativa} falhou:`, e?.message);
    }
  }
  if (!auditoria) return { error: 'IA-auditora não conseguiu emitir veredito válido' };

  // Normaliza campos
  auditoria.problemas = Array.isArray(auditoria.problemas) ? auditoria.problemas : [];
  auditoria.recomendacoes = Array.isArray(auditoria.recomendacoes) ? auditoria.recomendacoes : [];
  auditoria.confianca = typeof auditoria.confianca === 'number' ? auditoria.confianca : 0.5;

  // Nota e veredito são DERIVADOS dos problemas, não pedidos ao modelo. Guarda o
  // palpite dele quando vier, pra medir o quanto ele desviaria da régua.
  if (auditoria.veredito) auditoria.veredito_sugerido_pelo_modelo = auditoria.veredito;
  const estruturaCompleta = validarCorpo({
    conteudo_central: m.conteudo_central,
    conteudo_aplicavel: m.conteudo_aplicavel,
    guarda_corpos: m.guarda_corpos,
    adaptacao_por_formato: m.adaptacao_por_formato,
  }).length === 0;
  const derivado = derivarVeredito(auditoria.problemas, estruturaCompleta);
  auditoria.nota = derivado.nota;
  auditoria.veredito = derivado.veredito;

  const { error } = await sb.from('modulos_base_conteudo').update({
    auditoria_ia: auditoria,
    auditado_em: new Date().toISOString(),
    auditado_por_modelo: model,
    auditado_em_versao: m.versao,
  }).eq('id', id);
  if (error) return { error: error.message };

  return { ok: true, auditoria };
}

/**
 * Audita vários módulos com concorrência limitada. Best-effort: falha em um não
 * derruba os outros — o módulo só fica sem nota, auditável depois pela UI.
 *
 * CONC=4: cada auditoria é uma chamada GPT-5.4 densa; 4 em paralelo mantêm
 * throughput sem afogar o rate-limit do provedor.
 */
export async function auditarModulosCore(
  sb: ReturnType<typeof createSupabaseAdmin>,
  ids: string[],
  opts: {
    conc?: number;
    onItem?: (id: string, ok: boolean) => Promise<void> | void;
    /** Auditados saltam de rascunho → revisão: já têm veredito. */
    promoverParaRevisao?: boolean;
  } = {},
) {
  const CONC = opts.conc ?? 4;
  let ok = 0;
  const falhas: string[] = [];
  for (let i = 0; i < ids.length; i += CONC) {
    const fatia = ids.slice(i, i + CONC);
    const res = await Promise.all(fatia.map((id) =>
      auditarModuloCore(sb, id).catch((e: any) => ({ error: e?.message || 'erro' }))));
    for (let k = 0; k < fatia.length; k++) {
      const bom = !!(res[k] as any)?.ok;
      if (bom) ok++;
      else falhas.push(`${fatia[k].slice(0, 8)}: ${(res[k] as any)?.error || 'falhou'}`);
      if (opts.onItem) await opts.onItem(fatia[k], bom);
    }
  }

  if (opts.promoverParaRevisao && ids.length) {
    // Só os que de fato receberam veredito. Quem falhou fica em rascunho.
    await sb.from('modulos_base_conteudo')
      .update({ status: 'revisao' })
      .in('id', ids).eq('status', 'rascunho').not('auditoria_ia', 'is', null);
  }
  return { ok, falhas };
}
