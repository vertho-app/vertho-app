'use server';

import { callAI, type AIConfig } from '@/actions/ai-client';
import { escopoTenantDaLinha, updateConteudoInTenantDaLinha, deleteConteudoInTenantDaLinha } from '@/lib/repositories/conteudos-repo';
import { promptVideoScript } from '@/lib/season-engine/prompts/video-script';
import { promptPodcastScript } from '@/lib/season-engine/prompts/podcast-script';
import { promptTextContent } from '@/lib/season-engine/prompts/text-content';
import { promptCaseStudy } from '@/lib/season-engine/prompts/case-study';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { resolverModuloBaseParaConteudo, enriquecerPromptComModuloBase } from '@/lib/season-engine/modulo-base-integration';
import { getModelForTask } from '@/lib/ai-tasks';
import { derivarArquetipo } from '@/lib/disc-arquetipos';
import { resumirPPP, extracaoParaTexto, briefPreenchido, assinaturaCurta, type EscolaBrief } from '@/lib/escola-brief';
import { buildPersonalizacaoPrompt } from '@/lib/season-engine/prompts/personalizacao';
import { resolverPerfilPublicoDaEmpresa } from '@/lib/season-engine/perfil-publico';

/** Mínimo de caracteres para conteúdo que vira PDF (texto/case): leitura de
 *  ~5-8 min. Aplicado tanto na geração do conteúdo quanto na hora do PDF.
 *  NÃO exportar: este é um módulo "use server", onde todo export precisa ser
 *  uma função async. */
const MIN_PDF_CHARS = 8000;

/**
 * Garante o mínimo de caracteres num markdown de texto/case: se vier curto,
 * faz UMA expansão mantendo estilo/estrutura. Nunca lança — devolve o original
 * em qualquer falha. `system` orienta a expansão (o caller passa o seu prompt).
 */
async function garantirMinimoPdf(
  conteudoMd: string,
  system: string,
  aiConfig: AIConfig | undefined,
  model: string | undefined,
  minChars: number = MIN_PDF_CHARS,
  empresaId: string | null = null,
): Promise<string> {
  // Público de baixa escolaridade tem meta menor (RegistroPublico.minCharsPdf):
  // NÃO reinflar — expansão por volume reintroduz o abstrato que queríamos cortar.
  if (conteudoMd.length >= minChars) return conteudoMd;
  try {
    const user = `O texto em markdown abaixo tem ${conteudoMd.length} caracteres — curto demais para sustentar uma publicação editorial rica. Expanda-o por VALOR, não por volume.

Objetivo: dar matéria-prima suficiente para um PDF visual de 6 a 10 páginas, mantendo EXATAMENTE o mesmo tema, público-alvo, tom, estilo, estrutura de seções e formatação markdown do original. NÃO crie novas seções nem mude a estrutura — aprofunde as que já existem.

Cada parágrafo novo deve ACRESCENTAR algo concreto: uma nuance, um exemplo, uma aplicação ao cargo/contexto, um risco, um cuidado, uma comparação útil ou uma pergunta relevante. Se um parágrafo não acrescentar valor, não o escreva.

NÃO faça: enchimento repetitivo, alongar só para bater tamanho, tom acadêmico/professoral/motivacional, inventar dados/leis/normas/estatísticas, conteúdo genérico.

Meta de tamanho: chegue a NO MÍNIMO ${minChars} caracteres QUANDO o tema justificar sem repetição. Se não justificar, priorize qualidade e densidade aplicada — entregue o melhor texto possível, mais rico que o original.

Retorne APENAS o markdown final, sem comentários e sem cercas de código.\n\n---\n\n${conteudoMd}`;
    const expandido = (await callAI(system, user, { ...(aiConfig || {}), model }, minChars, {
      taskKey: 'conteudo_expansao_pdf', empresaId,
    })).trim();
    return expandido.length > conteudoMd.length ? expandido : conteudoMd;
  } catch (e: any) {
    console.warn('[garantirMinimoPdf] expansão p/ mínimo de caracteres falhou:', e?.message);
    return conteudoMd;
  }
}

/**
 * Gera conteúdo (roteiro ou texto) via IA e salva em micro_conteudos.
 *
 * @param {Object} params
 * @param {string} params.formato - video | audio | texto | case
 * @param {string} params.competencia
 * @param {string} params.descritor
 * @param {number} params.nivelMin
 * @param {number} params.nivelMax
 * @param {string} params.cargo
 * @param {string} params.contexto - educacional | corporativo | generico
 * @param {string} [params.empresaId] - se NULL, conteúdo global
 * @param {Object} [params.aiConfig]
 */
interface GerarConteudoParams {
  formato: string;
  competencia: string;
  descritor: string;
  nivelMin?: number;
  nivelMax?: number;
  cargo?: string;
  contexto?: string;
  duracaoSegundos?: number | null;
  podcastFormato?: 'solo' | 'mentor_campo';
  empresaId?: string | null;
  aiConfig?: AIConfig;
  // Idempotência: por padrão, se já existir conteúdo para (empresa, competência,
  // descritor, cargo, formato), NÃO regenera (pula) — evita duplicar em re-run
  // (ex.: após timeout de lote). `forcar: true` regenera mesmo assim.
  forcar?: boolean;
  // Kit Semanal: quando presente, semeia o prompt com a espinha (núcleo + lente
  // DISC + desafio) e amarra o conteúdo ao kit. Ver docs/KIT-SEMANAL.md.
  kit?: import('@/lib/season-engine/kit/enrich').KitSeed & { kitId: string };
  // Cliente Supabase já autenticado (service-role). Quando presente, pula a auth
  // de request — usado pelo job em background (trigger.dev), fora de uma request.
  sb?: any;
  // Caller de IA injetado (Batch API). Default = callAI síncrono. Mesma assinatura
  // dos 4 primeiros args do callAI. Ver lib/ai-batch.ts. Só a geração PRINCIPAL
  // (linha do callAI) usa; expansões/plano de PDF seguem síncronos.
  aiRun?: import('@/lib/ai-batch').AIRun;
}



export async function gerarConteudoIA({
  formato, competencia, descritor, nivelMin = 1.0, nivelMax = 2.0,
  cargo = 'todos', contexto = 'generico', duracaoSegundos = null,
  podcastFormato = 'solo',
  empresaId = null, aiConfig = {}, kit, sb: sbIn, aiRun, forcar = false,
}: GerarConteudoParams) {
  try {
    const sb = sbIn || await requireAdminSupabase('content.manage');
    if (!formato || !competencia || !descritor) {
      return { success: false, error: 'formato, competencia e descritor obrigatórios' };
    }

    // Idempotência: se já existe conteúdo para (empresa, competência, descritor,
    // cargo, formato), NÃO regenera — evita duplicar em re-run (ex.: após timeout de
    // lote, onde parte já foi salva). `forcar` ignora. Kit tem variantes por DISC.
    //
    // ⚠️ `.is('kit_id', null)`: conteúdo de KIT é DISC-específico e sai SÓ pelo overlay
    // (o build o exclui com esse mesmo filtro). Sem ele, um kit já existente fazia esta
    // query dizer "já existe" e o CORE nunca era gerado — falha SILENCIOSA, porque o
    // retorno é `success: true`. Medido 27/07 no Ibipeba: o áudio de kit de
    // "Busca de apoio e rede" (DISC D) bloqueava o áudio core do MESMO par, deixando
    // 13 de 15 pessoas de Gestão Escolar sem áudio naquele descritor.
    if (!forcar && !kit) {
      let exq = sb.from('micro_conteudos').select('id')
        .eq('competencia', competencia).eq('descritor', descritor)
        .eq('formato', formato).eq('cargo', cargo)
        .is('kit_id', null);
      exq = empresaId ? exq.eq('empresa_id', empresaId) : exq.is('empresa_id', null);
      const { data: jaTem } = await exq.limit(1);
      if (jaTem && jaTem.length) {
        return { success: true, skipped: true, conteudoId: jaTem[0].id, message: `já existe (${formato} · ${descritor})` };
      }
    }

    // Registro/domínio por PÚBLICO (cargo-primeiro; segmento da empresa = fallback).
    // Adapta texto/case ao leitor (MEI/Empregabilidade/Educação/Corporativo).
    const perfilPublico = await resolverPerfilPublicoDaEmpresa(sb, empresaId, cargo);
    const args = { competencia, descritor, nivelMin, nivelMax, cargo, contexto, duracaoSegundos, podcastFormato, perfilPublico };
    const builders = {
      video: promptVideoScript,
      audio: promptPodcastScript,
      texto: promptTextContent,
      case: promptCaseStudy,
    };
    const build = builders[formato];
    if (!build) return { success: false, error: `formato ${formato} não suportado` };

    let { system, user } = build(args);

    // ── Integração Módulos-Base (frente 3) ──────────────────────────────────
    // Resolve módulo-base publicado pra (competência, transição de nível, locale).
    // Se existir, enriquece system+user com seções canônicas (ideia/princípios/
    // guarda-corpos/exemplos/repertório). Sem módulo → fallback transparente
    // pro comportamento atual.
    let moduloUsado: any = null;
    try {
      const escolhido = await resolverModuloBaseParaConteudo(sb, {
        competenciaNome: competencia,
        descritor,
        nivelMin,
        locale: (aiConfig as any)?.locale,
        contexto_pedagogico: contexto,
        cargo,
        empresaId,
      });
      if (escolhido) {
        ({ system, user } = enriquecerPromptComModuloBase({ system, user }, escolhido.modulo, formato));
        moduloUsado = { id: escolhido.modulo.id, grupo_id: escolhido.modulo.grupo_id, locale: escolhido.modulo.locale, criterio: escolhido.criterio };
        console.log(`[gerarConteudoIA] módulo-base aplicado: ${moduloUsado.id} (${moduloUsado.locale}) · critério: ${moduloUsado.criterio}`);
      }
    } catch (e: any) {
      // Falha do enrichment NUNCA quebra a geração — só loga e segue sem módulo.
      console.warn('[gerarConteudoIA] enrichment falhou (seguindo sem módulo-base):', e?.message);
    }

    // ── Kit Semanal: semeia a espinha (núcleo + lente DISC + desafio) ────────
    // Aplicado APÓS o módulo-base: o kit é a camada de coesão entre os 4 formatos.
    if (kit) {
      const { enriquecerPromptComKit } = await import('@/lib/season-engine/kit/enrich');
      ({ system, user } = enriquecerPromptComKit({ system, user }, kit, formato));
    }

    // Usa modelo configurado por tarefa (fallback: modelo padrão da empresa → default)
    const { getModelForTask } = await import('@/lib/ai-tasks');
    const taskKey = formato === 'video' ? 'conteudo_video'
      : formato === 'audio' ? 'conteudo_podcast'
      : formato === 'texto' ? 'conteudo_texto'
      : formato === 'case' ? 'conteudo_case' : null;
    const model = taskKey && empresaId ? await getModelForTask(empresaId, taskKey) : aiConfig?.model;
    // texto/case viram PDF e exigem mín. 8.000 caracteres — precisam de mais
    // tokens de saída p/ não truncar antes de atingir o comprimento mínimo.
    const maxTokens = formato === 'texto' || formato === 'case' ? 8000 : 4096;
    const ai = aiRun || callAI;
    // O `taskKey` acima já existia — mas só para ESCOLHER O MODELO
    // (`getModelForTask`). Não era repassado ao ledger, então a geração de
    // conteúdo caía em `untagged`: medido em 31/07, 2.812 chamadas / $87,28 (89%
    // do untagged) sem nenhuma atribuição. Mesma etiqueta, os dois usos.
    let conteudoGerado = (await ai(system, user, { ...aiConfig, model: model || aiConfig?.model }, maxTokens, {
      taskKey: taskKey || 'conteudo_gerar', empresaId,
    })).trim();

    // Garante o mínimo de 8.000 caracteres nos PDFs (texto/case): se vier curto,
    // faz UMA expansão mantendo estilo/estrutura. Falha não quebra a geração.
    if (formato === 'texto' || formato === 'case') {
      conteudoGerado = await garantirMinimoPdf(conteudoGerado, system, aiConfig, model || aiConfig?.model, perfilPublico.minCharsPdf, empresaId);
    }

    const titulo = extrairTitulo(conteudoGerado, descritor, formato);
    const duracaoEstimada = duracaoSegundos
      ? Math.round(duracaoSegundos / 60 * 10) / 10
      : (formato === 'video' || formato === 'audio'
         ? Math.min(5, Math.max(3, Math.round(conteudoGerado.split(/\s+/).length / 150)))
         : null);

    // Para texto/case: renderiza o PDF PREMIUM (planner editorial + diagramação)
    // já na criação e linka no url. Antes usava renderMarkdownPDF (Helvetica,
    // texto corrido, sem capa) — um rascunho pobre que era o que o usuário
    // baixava até clicar "Gerar PDF final". Agora o url nasce premium. Sem
    // imagem GPT aqui (capa vetorial); "Gerar PDF final" reforça com capa/seção.
    let pdfUrl = null, pdfPath = null;
    if (formato === 'texto' || formato === 'case') {
      try {
        const { parseBlocks, planLayout } = await import('@/lib/conteudo-layout-plan');
        const { renderConteudoFinalPDF } = await import('@/lib/conteudo-final-pdf');
        const blocks = parseBlocks(conteudoGerado, { skipFirstH1: Boolean(titulo) });
        let plan = null;
        try {
          plan = await planLayout(blocks, { titulo, competencia, descritor, formato }, model || aiConfig?.model);
        } catch (e: any) {
          console.warn('[gerarConteudoIA] plano editorial falhou (flat):', e?.message);
        }
        const buffer = await renderConteudoFinalPDF({
          titulo, conteudoMd: conteudoGerado, competencia, descritor, formato,
          empresaNome: null, coverBase64: null, plan, sectionImageBase64: null,
        });
        const path = `texto/${competencia.replace(/[^a-zA-Z0-9]/g, '_')}/${Date.now()}.pdf`;
        const { error: upErr } = await sb.storage.from('conteudos').upload(path, Buffer.from(buffer), {
          contentType: 'application/pdf', upsert: false,
        });
        if (!upErr) {
          const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(path);
          pdfUrl = publicUrl;
          pdfPath = path;
        }
      } catch (e: any) {
        console.warn('[gerarConteudoIA] PDF render falhou:', e?.message);
      }
    }

    const { data: novo, error } = await sb.from('micro_conteudos').insert({
      empresa_id: empresaId,
      titulo,
      descricao: `Gerado por IA · ${competencia} › ${descritor}`,
      formato,
      duracao_min: duracaoEstimada,
      url: pdfUrl, // texto/case ganham URL pro PDF
      storage_path: pdfPath,
      conteudo_inline: conteudoGerado,
      competencia,
      descritor,
      nivel_min: nivelMin,
      nivel_max: nivelMax,
      tipo_conteudo: 'core',
      contexto,
      cargo,
      origem: 'ia_gerado',
      versao: 1,
      ativo: formato === 'texto' || formato === 'case',
      kit_id: kit?.kitId ?? null,
      // F-I4: `disc` (1ª letra) NÃO é FK — sobrevive ao ON DELETE SET NULL de kit_id
      // e o build o usa como 2º filtro do pool (conteudosDoBuild).
      disc: kit?.disc ?? null,
      modulo_base_id: moduloUsado?.id ?? null, // rastreio p/ anti-repetição
    }).select('id, titulo').maybeSingle();

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      message: `${formato} gerado: "${novo.titulo}"${pdfUrl ? ' (PDF criado)' : ''}${moduloUsado ? ' · módulo-base aplicado' : ''}`,
      conteudoId: novo.id,
      titulo: novo.titulo,
      roteiro: conteudoGerado,
      pdfUrl,
      precisaGravar: formato === 'video' || formato === 'audio',
      moduloBase: moduloUsado,
    };
  } catch (err) {
    console.error('[gerarConteudoIA]', err);
    return { success: false, error: err?.message || 'Erro' };
  }
}

/**
 * Upload manual de conteúdo (áudio/pdf via Storage; texto/case inline no banco).
 * FormData fields: file (audio/pdf), formato, titulo, pilar, competencia, descritor,
 *   nivel_min, nivel_max, contexto, cargo, setor, empresa_id, conteudo_inline (texto/case).
 */
export async function uploadConteudo(formData: any) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    const formato = formData.get('formato');
    const titulo = formData.get('titulo');
    const pilar = String(formData.get('pilar') || '').trim() || null;
    const competencia = String(formData.get('competencia') || '').trim() || 'Não classificado';
    const descritor = formData.get('descritor') || null;
    if (!formato || !titulo) return { success: false, error: 'formato e titulo obrigatórios' };

    let url = null, storage_path = null, conteudo_inline = null, duracao_min = null;

    if (formato === 'texto' || formato === 'case') {
      conteudo_inline = formData.get('conteudo_inline') || '';
      if (!conteudo_inline.trim()) return { success: false, error: 'Conteúdo obrigatório' };
    } else {
      // Preferência: cliente já fez upload direto via /api/upload/signed-url
      // e manda só o storage_path. Caso não tenha, tenta upload pelo server
      // (usado só pra arquivos pequenos, <15MB).
      const pathPreUploaded = formData.get('storage_path');
      if (pathPreUploaded) {
        storage_path = pathPreUploaded;
        const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(pathPreUploaded);
        url = publicUrl;
      } else {
        const file = formData.get('file');
        if (!file || typeof file === 'string') return { success: false, error: 'Arquivo ou storage_path obrigatório' };
        const path = `${formato}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: upErr } = await sb.storage.from('conteudos').upload(path, buffer, {
          contentType: file.type || undefined, upsert: false,
        });
        if (upErr) return { success: false, error: `Upload falhou: ${upErr.message}` };
        const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(path);
        url = publicUrl;
        storage_path = path;
      }
    }

    const { data, error } = await sb.from('micro_conteudos').insert({
      empresa_id: formData.get('empresa_id') || null,
      titulo, descricao: formData.get('descricao') || null,
      formato, duracao_min, url, storage_path, conteudo_inline,
      pilar,
      competencia, descritor,
      nivel_min: parseFloat(formData.get('nivel_min') || '1.0'),
      nivel_max: parseFloat(formData.get('nivel_max') || '2.0'),
      tipo_conteudo: formData.get('tipo_conteudo') || 'core',
      contexto: formData.get('contexto') || 'generico',
      cargo: formData.get('cargo') || 'todos',
      setor: formData.get('setor') || 'todos',
      origem: 'pre_produzido', ativo: true,
    }).select('id, titulo').maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, conteudoId: data.id, message: `"${data.titulo}" adicionado` };
  } catch (err) {
    console.error('[VERTHO] uploadConteudo:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Geração em lote: cria conteúdos para múltiplos descritores de uma competência.
 *
 * @param {Object} params
 * @param {string} formato - video|audio|texto|case
 * @param {string} competencia
 * @param {string|null} descritor - se null, gera pra todos os descritores da competência
 * @param {number} nivelMin
 * @param {number} nivelMax
 * @param {string} cargo
 * @param {string} contexto
 * @param {number|null} duracaoSegundos - só pra video/audio
 * @param {string|null} empresaId - se null, conteúdo global
 * @param {Object} aiConfig
 */
interface GerarConteudoLoteParams {
  formato: string;
  competencia: string;
  descritor?: string | null;
  nivelMin?: number;
  nivelMax?: number;
  cargo?: string;
  contexto?: string;
  duracaoSegundos?: number | null;
  empresaId?: string | null;
  aiConfig?: AIConfig;
}

export async function gerarConteudoLote({
  formato, competencia, descritor = null, nivelMin = 1.0, nivelMax = 2.0,
  cargo = 'todos', contexto = 'generico', duracaoSegundos = null,
  empresaId = null, aiConfig = {},
}: GerarConteudoLoteParams) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!formato || !competencia) {
      return { success: false, error: 'formato e competencia obrigatórios' };
    }

    // Resolve lista de descritores
    let descritores: string[] = [];
    if (descritor) {
      descritores = [descritor];
    } else {
      // Tenta competencias da empresa, fallback competencias_base.
      // REGRA: competência é ÚNICA POR CARGO — ao gerar p/ um cargo específico,
      // enumera SÓ os descritores daquele cargo (não a união entre cargos, que
      // carregaria descritores de outro cargo de mesmo nome de competência).
      let empQ = sb.from('competencias')
        .select('nome_curto').eq('nome', competencia).not('nome_curto', 'is', null);
      if (empresaId) empQ = empQ.eq('empresa_id', empresaId);
      const cargoEsp = String(cargo || '').trim();
      if (cargoEsp && cargoEsp.toLowerCase() !== 'todos') empQ = empQ.eq('cargo', cargoEsp);
      const { data: emp } = await empQ;
      let lista = [...new Set((emp || []).map(c => c.nome_curto))] as string[];
      if (lista.length === 0) {
        const { data: base } = await sb.from('competencias_base')
          .select('nome_curto').eq('nome', competencia).not('nome_curto', 'is', null);
        lista = [...new Set((base || []).map(c => c.nome_curto))] as string[];
      }
      descritores = lista;
    }

    if (descritores.length === 0) {
      return { success: false, error: `Sem descritores cadastrados para "${competencia}"` };
    }

    let ok = 0, erros = 0;
    const resultados = [];
    for (const desc of descritores) {
      const r = await gerarConteudoIA({
        formato, competencia, descritor: desc, nivelMin, nivelMax,
        cargo, contexto, duracaoSegundos, empresaId, aiConfig,
      });
      if (r.success) {
        ok++;
        resultados.push({ descritor: desc, conteudoId: r.conteudoId, titulo: r.titulo });
      } else {
        erros++;
        resultados.push({ descritor: desc, error: r.error });
      }
    }

    return {
      success: true,
      message: `${ok} gerado${ok !== 1 ? 's' : ''}${erros ? ` · ${erros} erros` : ''} (${formato} para "${competencia}")`,
      ok, erros, resultados,
    };
  } catch (err) {
    console.error('[VERTHO] gerarConteudoLote:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Lista competências disponíveis (com descritores cadastrados) e cargos distintos
 * — usado para popular dropdowns no modal de geração.
 *
 * @param empresaId Filtra `competencias` por empresa (cargos também). Quando
 * null/undefined/'all' mostra tudo (visão global). `competencias_base` é o
 * catálogo canônico Vertho — sempre incluído, não filtrado.
 */
export async function loadOpcoesGerar(empresaId?: string | null) {
  try {
    const sb = await requireAdminSupabase();
    const empresaUuid = empresaId && empresaId !== 'all' ? empresaId : null;

    let compsQuery = sb.from('competencias')
      .select('nome, nome_curto, pilar, cargo')
      .not('nome_curto', 'is', null);
    if (empresaUuid) compsQuery = compsQuery.eq('empresa_id', empresaUuid);
    const { data: comps } = await compsQuery;

    const { data: baseComps } = await sb.from('competencias_base')
      .select('nome, nome_curto')
      .not('nome_curto', 'is', null);

    // Agrupa: competencia -> descritores + pilares + descritores POR CARGO.
    // REGRA: competência é única por cargo. `porCargo` deixa o modal oferecer só os
    // descritores do cargo escolhido — nunca a UNIÃO entre cargos (que geraria
    // conteúdo de descritor de outro cargo). Só `competencias` (empresa) têm cargo;
    // `competencias_base` (catálogo) é cargo-agnóstico e entra só na lista genérica.
    const mapa: Record<string, { descritores: Set<string>; pilares: Set<string>; porCargo: Record<string, Set<string>> }> = {};
    const add = (c: any, comCargo: boolean) => {
      if (!c.nome) return;
      if (!mapa[c.nome]) mapa[c.nome] = { descritores: new Set(), pilares: new Set(), porCargo: {} };
      if (c.nome_curto) mapa[c.nome].descritores.add(c.nome_curto);
      if (c.pilar) mapa[c.nome].pilares.add(c.pilar);
      if (comCargo && c.cargo && c.nome_curto) {
        (mapa[c.nome].porCargo[c.cargo] ||= new Set<string>()).add(c.nome_curto);
      }
    };
    (comps || []).forEach(c => add(c, true));
    (baseComps || []).forEach(c => add(c, false));

    const competencias = Object.keys(mapa).sort().map(nome => ({
      nome,
      descritores: ([...mapa[nome].descritores] as string[]).sort(),
      pilares: ([...mapa[nome].pilares] as string[]).sort(),
      porCargo: Object.fromEntries(
        Object.entries(mapa[nome].porCargo).map(([cg, set]) => [cg, [...set].sort()]),
      ) as Record<string, string[]>,
    }));

    // Cargos distintos — só da empresa filtrada (competencias_base não tem cargo
    // associado a empresa real, então não entram aqui pra evitar confusão).
    const cargos = [...new Set((comps || []).map(c => c.cargo).filter(Boolean))].sort();
    const pilares = [...new Set((comps || []).map(c => c.pilar).filter(Boolean))].sort();

    return { competencias, cargos, pilares };
  } catch (err) {
    return { competencias: [], cargos: [], pilares: [], error: err?.message };
  }
}

function extrairTitulo(texto: string, fallback: string, formato: string) {
  // Podcast TTS: linha "TÍTULO: ..." no topo
  const tituloMatch = texto.match(/^\s*T[ÍI]TULO:\s*(.+)$/im);
  if (tituloMatch) {
    const tt = tituloMatch[1].trim().replace(/^["“]|["”]$/g, '').substring(0, 200);
    if (tt.length > 3) return formato === 'video' ? `🎥 ${tt}` : formato === 'audio' ? `🎧 ${tt}` : tt;
  }
  // Texto/case: primeira linha # Título
  const match = texto.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim().substring(0, 200);
  // Vídeo/podcast: primeira frase significativa (até 80 chars)
  const primeiraLinha = texto.split('\n').find(l => l.trim().length > 10);
  if (primeiraLinha) {
    const frase = primeiraLinha.trim().split(/[.!?]/)[0].substring(0, 80);
    return frase.length > 10 ? `${formato === 'video' ? '🎥' : '🎧'} ${frase}` : fallback;
  }
  return fallback;
}

/**
 * Importa todos os vídeos da library do Bunny pra micro_conteudos.
 * Idempotente: pula vídeos já importados (matched por bunny_video_id).
 * Cria entries com tags vazias — admin completa depois (manual ou via IA).
 */
export async function importarVideosBunny() {
  try {
    const sb = await requireAdminSupabase('content.manage');
    const lib = process.env.BUNNY_LIBRARY_ID;
    const key = process.env.BUNNY_STREAM_API_KEY;
    if (!lib || !key) return { error: 'BUNNY_LIBRARY_ID/BUNNY_STREAM_API_KEY ausentes' };

    const res = await fetch(
      `https://video.bunnycdn.com/library/${lib}/videos?page=1&itemsPerPage=200&orderBy=date`,
      { headers: { AccessKey: key, Accept: 'application/json' }, cache: 'no-store' }
    );
    if (!res.ok) return { error: `Bunny API ${res.status}` };
    const data = await res.json();
    const items = (data?.items || []).filter(v => v?.guid);

    const { data: existentes } = await sb.from('micro_conteudos')
      .select('bunny_video_id').not('bunny_video_id', 'is', null);
    const jaImportados = new Set((existentes || []).map(e => e.bunny_video_id));

    const novos = items.filter(v => !jaImportados.has(v.guid));
    if (novos.length === 0) {
      return { ok: true, importados: 0, total: items.length, message: 'Nenhum vídeo novo' };
    }

    const linhas = novos.map(v => ({
      titulo: cleanTitle(v.title) || 'Sem título',
      descricao: v.description || null,
      formato: 'video',
      duracao_min: v.length ? Math.round(v.length / 60 * 10) / 10 : null,
      url: `https://iframe.mediadelivery.net/embed/${lib}/${v.guid}`,
      bunny_video_id: v.guid,
      competencia: 'Não classificado',
      descritor: null,
      nivel_min: 1.0,
      nivel_max: 4.0,
      tipo_conteudo: 'core',
      contexto: 'generico',
      cargo: 'todos',
      setor: 'todos',
      origem: 'pre_produzido',
      ativo: true,
    }));

    const { error } = await sb.from('micro_conteudos').insert(linhas);
    if (error) return { error: error.message };

    return { ok: true, importados: novos.length, total: items.length };
  } catch (err) {
    console.error('[importarVideosBunny]', err);
    return { error: err?.message || 'Erro' };
  }
}

function cleanTitle(raw: string | null | undefined) {
  if (!raw) return null;
  let t = String(raw).replace(/\.(mp4|mov|webm|m4v|mkv)$/i, '').replace(/_/g, ' ').trim();
  if (/^[\d\sx]+(?:hd|fps)?[\d\s]*$/i.test(t)) return null;
  return t;
}

/**
 * Lista micro_conteudos com filtros e paginação.
 */
interface ListarConteudosParams {
  formato?: string;
  competencia?: string;
  semClassificacao?: boolean;
  limit?: number;
  /**
   * Filtra micro_conteudos por empresa: aceita uuid (mostra conteúdos da
   * empresa + globais sem `empresa_id`) ou 'all'/null (mostra tudo).
   * Quando uuid, também filtra pra que `competencia` esteja entre as
   * cadastradas pela empresa OU no catálogo Vertho (`competencias_base`),
   * mantendo "Não classificado" sempre visível pra triagem.
   */
  empresaId?: string | null;
}

export async function listarConteudos({ formato, competencia, semClassificacao, limit = 100, empresaId }: ListarConteudosParams = {}) {
  try {
    const sb = await requireAdminSupabase();
    const empresaUuid = empresaId && empresaId !== 'all' ? empresaId : null;

    // Quando há empresa: prepara whitelist de nomes de competência válidos
    // (competencias da empresa + competencias_base catálogo + 'Não classificado').
    let nomesValidos: Set<string> | null = null;
    if (empresaUuid) {
      const { data: compEmp } = await sb.from('competencias').select('nome').eq('empresa_id', empresaUuid);
      const { data: compBase } = await sb.from('competencias_base').select('nome');
      nomesValidos = new Set<string>([
        ...((compEmp || []).map((c: any) => c.nome).filter(Boolean) as string[]),
        ...((compBase || []).map((c: any) => c.nome).filter(Boolean) as string[]),
        'Não classificado',
      ]);
    }

    let q = sb.from('micro_conteudos').select('*, empresa:empresas(id, nome, slug)').order('created_at', { ascending: false }).limit(limit);
    if (empresaUuid) q = q.or(`empresa_id.eq.${empresaUuid},empresa_id.is.null`);
    if (formato) q = q.eq('formato', formato);
    if (competencia) q = q.eq('competencia', competencia);
    if (semClassificacao) q = q.eq('competencia', 'Não classificado');
    const { data, error } = await q;
    if (error) return { error: error.message };

    let items = data || [];
    if (nomesValidos) items = items.filter((c: any) => nomesValidos!.has(c.competencia || 'Não classificado'));

    return { items };
  } catch (err) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Edição manual de tags de um conteúdo.
 */
export async function atualizarConteudo(id: string, patch: any) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!id) return { error: 'id obrigatório' };
    const allowed = ['titulo','descricao','pilar','competencia','descritor','nivel_min','nivel_max',
                     'tipo_conteudo','contexto','cargo','setor','apresentador','ativo','duracao_min'];
    const clean: Record<string, any> = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    const upd = await updateConteudoInTenantDaLinha(sb, id, clean);
    if (upd === null) return { error: 'Conteúdo não encontrado' };
    return { ok: true };
  } catch (err) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Chave de cache das imagens (capa/seção): COMPETÊNCIA + DESCRITOR — não o id do
 * conteúdo. Assim, todos os conteúdos da mesma competência/descritor REUSAM a
 * mesma imagem (sem regenerar no GPT a cada conteúdo). Sem comp/descritor, cai
 * no id (isolado). O tema da imagem usa só comp/descritor (não o título), já que
 * a imagem é compartilhada entre títulos diferentes da mesma comp/descritor.
 */
function imagemCacheSlug(c: any): string {
  const base = [c?.competencia, c?.descritor].map((x: any) => String(x || '').trim()).filter(Boolean).join('__');
  const slug = base.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120).toLowerCase();
  return slug || `id_${c?.id}`;
}

function imagemTema(c: any): string | null {
  return [c?.competencia, c?.descritor].filter(Boolean).join(' — ') || null;
}

/**
 * Resolve a capa (fundo GPT Image), cache em `final/covers/cd/<comp__descritor>.png`.
 * NÃO é personalizada — cacheada por COMPETÊNCIA/DESCRITOR e reusada por todos os
 * conteúdos dessa comp/descritor (genérica e personalizadas). Falha nunca quebra
 * o PDF (base64 null → fundo vetorial).
 */
async function resolveCoverBase64(sb: any, c: any): Promise<{ base64: string | null; erro: string | null }> {
  const coverPath = `final/covers/cd/${imagemCacheSlug(c)}.png`;
  try {
    const { data: existente } = await sb.storage.from('conteudos').download(coverPath);
    const buf = existente ? Buffer.from(await existente.arrayBuffer()) : null;
    if (buf && buf.length > 1024) return { base64: `data:image/png;base64,${buf.toString('base64')}`, erro: null };
    throw new Error('cover ausente ou vazio');
  } catch {
    try {
      const { generateCoverImage } = await import('@/lib/openai-image');
      const imgBuf = await generateCoverImage(imagemTema(c));
      await sb.storage.from('conteudos').upload(coverPath, imgBuf, { contentType: 'image/png', upsert: true });
      return { base64: `data:image/png;base64,${imgBuf.toString('base64')}`, erro: null };
    } catch (e: any) {
      const erro = e?.message || 'erro desconhecido';
      console.warn('[resolveCoverBase64] capa GPT Image falhou (usando fallback vetorial):', erro);
      return { base64: null, erro };
    }
  }
}

/**
 * Resolve a imagem de seção (hero), cache em `final/sections/cd/<comp__descritor>.png`.
 * Mesma chave de comp/descritor da capa. Chame só quando o plano tiver uma página
 * heroImage. Falha nunca quebra o PDF.
 */
async function resolveSectionBase64(sb: any, c: any): Promise<string | null> {
  const sectionPath = `final/sections/cd/${imagemCacheSlug(c)}.png`;
  try {
    const { data: existente } = await sb.storage.from('conteudos').download(sectionPath);
    const buf = existente ? Buffer.from(await existente.arrayBuffer()) : null;
    if (buf && buf.length > 1024) return `data:image/png;base64,${buf.toString('base64')}`;
    throw new Error('section ausente ou vazio');
  } catch {
    try {
      const { generateSectionImage } = await import('@/lib/openai-image');
      const imgBuf = await generateSectionImage(imagemTema(c));
      await sb.storage.from('conteudos').upload(sectionPath, imgBuf, { contentType: 'image/png', upsert: true });
      return `data:image/png;base64,${imgBuf.toString('base64')}`;
    } catch (e: any) {
      console.warn('[resolveSectionBase64] imagem de seção falhou:', e?.message);
      return null;
    }
  }
}

/**
 * Gera o "conteúdo final" entregável: renderiza o PDF premium branded a partir
 * do conteudo_inline (texto/case), sobe pro Storage e linka em url/storage_path.
 * Reusa a paleta/logo oficiais via lib/conteudo-final-pdf. Texto preservado
 * integralmente — o markdown é a fonte única.
 */
export async function gerarConteudoFinal(id: string) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!id) return { success: false, error: 'id obrigatório' };

    const { data: c } = await sb
      .from('micro_conteudos')
      .select('*, empresa:empresas(nome)')
      .eq('id', id)
      .maybeSingle();
    if (!c) return { success: false, error: 'Conteúdo não encontrado' };
    if (c.formato !== 'texto' && c.formato !== 'case') {
      return { success: false, error: 'PDF final disponível apenas para texto e case' };
    }
    if (!c.conteudo_inline?.trim()) {
      return { success: false, error: 'Conteúdo sem texto inline para gerar o PDF' };
    }

    // Mínimo de caracteres: conteúdos criados antes da regra (ou importados)
    // podem vir curtos; expande UMA vez aqui e PERSISTE em conteudo_inline, p/ o
    // PDF respeitar o mínimo sem exigir regenerar a fonte do zero.
    let conteudoMd = c.conteudo_inline as string;
    if (conteudoMd.length < MIN_PDF_CHARS) {
      const { getModelForTask } = await import('@/lib/ai-tasks');
      const taskKey = c.formato === 'case' ? 'conteudo_case' : 'conteudo_texto';
      const model = c.empresa_id ? await getModelForTask(c.empresa_id, taskKey) : undefined;
      const system = 'Você é um editor sênior de materiais de desenvolvimento profissional. Expande textos em markdown preservando estilo, tom, estrutura e formatação, aprofundando com exemplos e nuance aplicada ao contexto — nunca com enchimento repetitivo. Markdown válido, sem cercas de código.';
      const expandido = await garantirMinimoPdf(conteudoMd, system, undefined, model);
      if (expandido.length > conteudoMd.length) {
        conteudoMd = expandido;
        await escopoTenantDaLinha(sb.from('micro_conteudos').update({ conteudo_inline: conteudoMd }).eq('id', id), c);
      }
    }

    // Capa (fundo GPT Image), cacheada por-conteúdo. Falha cai no fundo vetorial.
    const { base64: coverBase64, erro: coverErro } = await resolveCoverBase64(sb, c);

    // Plano editorial (IA): diagrama o conteúdo em páginas com função distinta e
    // tratamentos visuais ricos. A IA só classifica/organiza — o texto vem dos
    // blocos verbatim. Falha NUNCA quebra o PDF — cai no corpo flat.
    let plan = null;
    let sectionBase64: string | null = null;
    try {
      const { parseBlocks, planLayout } = await import('@/lib/conteudo-layout-plan');
      const { getModelForTask } = await import('@/lib/ai-tasks');
      const taskKey = c.formato === 'case' ? 'conteudo_case' : 'conteudo_texto';
      const planModel = c.empresa_id ? await getModelForTask(c.empresa_id, taskKey) : undefined;
      const blocks = parseBlocks(conteudoMd, { skipFirstH1: Boolean(c.titulo) });
      plan = await planLayout(blocks, {
        titulo: c.titulo, competencia: c.competencia, descritor: c.descritor, formato: c.formato,
      }, planModel);
    } catch (e: any) {
      console.warn('[gerarConteudoFinal] plano editorial falhou (usando flat):', e?.message);
    }

    // Imagem de seção: só se o plano marcou uma página heroImage. Cacheada por-conteúdo.
    if (plan && plan.pages.some((p: any) => p.heroImage)) {
      sectionBase64 = await resolveSectionBase64(sb, c);
    }

    const { renderConteudoFinalPDF } = await import('@/lib/conteudo-final-pdf');
    const buffer = await renderConteudoFinalPDF({
      titulo: c.titulo,
      conteudoMd,
      competencia: c.competencia,
      descritor: c.descritor,
      formato: c.formato,
      empresaNome: c.empresa?.nome || null,
      coverBase64,
      plan,
      sectionImageBase64: sectionBase64,
    });

    const slug = String(c.competencia || 'geral').replace(/[^a-zA-Z0-9]/g, '_');
    const path = `final/${slug}/${c.id}-${Date.now()}.pdf`;
    const { error: upErr } = await sb.storage.from('conteudos').upload(path, Buffer.from(buffer), {
      contentType: 'application/pdf', upsert: true,
    });
    if (upErr) return { success: false, error: `Upload falhou: ${upErr.message}` };

    const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(path);
    const { error: updErr } = await escopoTenantDaLinha(
      sb.from('micro_conteudos').update({ url: publicUrl, storage_path: path }).eq('id', id), c);
    if (updErr) return { success: false, error: updErr.message };

    const layoutMsg = plan
      ? ` — layout editorial: ${plan.pages.length} páginas${plan.summary ? ` (${plan.summary})` : ''}`
      : ' — layout simples (corpo único)';
    return {
      success: true,
      url: publicUrl,
      message: `PDF final gerado para "${c.titulo}"${layoutMsg}`,
      coverGerada: Boolean(coverBase64),
      coverErro,
      layoutPlanejado: Boolean(plan),
      paginas: plan ? plan.pages.length : null,
    };
  } catch (err) {
    console.error('[gerarConteudoFinal]', err);
    return { success: false, error: err?.message || 'Erro' };
  }
}

/**
 * Gera (ou serve do cache) a versão PERSONALIZADA do PDF de conteúdo final para
 * um colaborador: núcleo curricular intacto + camada com 2 seções novas —
 * "Para o seu perfil <arquétipo DISC>" e "No contexto da sua escola" (PPP).
 *
 * Granularidade: por (conteúdo, empresa, arquétipo) — cacheado em
 * `final/perso/<id>/<empresa>/<arquetipo>.pdf`. Gerado sob demanda (1º acesso).
 * Capa/seção reusam o cache por-conteúdo (sem custo de imagem extra).
 * Qualquer falha → retorna a URL genérica (nunca quebra a entrega).
 */
export async function gerarConteudoFinalPersonalizado({ contentId, colab: colabIn }: { contentId: string; colab?: any }) {
  let generico: string | null = null;
  try {
    // Service-role direto: quem abre o conteúdo é o COLABORADOR (não admin).
    // A identidade vem da SESSÃO (sem IDOR) — EXCETO quando `colab` é passado
    // explicitamente (pré-geração em lote por um job admin, por colaboradorId).
    const sb = createSupabaseAdmin();
    if (!contentId) return { success: false, error: 'contentId obrigatório' };

    const { data: c } = await sb
      .from('micro_conteudos')
      .select('*, empresa:empresas(nome)')
      .eq('id', contentId)
      .maybeSingle();
    if (!c) return { success: false, error: 'Conteúdo não encontrado' };
    generico = c.url || null;
    if ((c.formato !== 'texto' && c.formato !== 'case') || !c.conteudo_inline?.trim()) {
      return { success: true, url: generico, personalized: false };
    }

    // Colaborador (DISC + tenant): passado pelo job (pré-geração) OU resolvido da sessão.
    let colab: any = colabIn;
    if (!colab) {
      const email = await getAuthenticatedEmailFromAction();
      if (!email) return { success: true, url: generico, personalized: false };
      const { findColabByEmail } = await import('@/lib/authz');
      colab = await findColabByEmail(
        email,
        'perfil_dominante, d_natural, i_natural, s_natural, c_natural, tp_introvertido_extrovertido, tp_sensor_intuitivo, empresa_id',
      );
    }
    const empresaId: string | null = colab?.empresa_id || null;
    const arq = derivarArquetipo(colab?.perfil_dominante);
    const arquetipoSlug = String(colab?.perfil_dominante || '').trim().toUpperCase().replace(/[^A-Z]/g, '') || 'NA';

    // Contexto institucional (PPP) — CONSOLIDADO por empresa.
    //
    // Antes: `.eq('empresa_id').order('extracted_at' desc).limit(1)` — o PPP de UMA
    // escola sorteada pela data de extração, aplicado a toda a rede. Em Ibipeba são
    // 11 PPPs para 13 escolas: 54 pessoas recebiam a lente de uma escola arbitrária,
    // em silêncio (nada erra; o conteúdo só fica calibrado na escola errada).
    // É o F-I10 do docs/FMEA-PIPELINE.md, mesma classe já corrigida em `buscarValores`.
    //
    // Agora usa `resolverContextoEmpresa` — o MESMO resolvedor do Kit. Isso importa
    // além de corrigir o sorteio: o kit é o conteúdo principal da semana, e ter o PDF
    // numa lente e o kit noutra daria à mesma pessoa dois contextos divergentes para o
    // mesmo tema. 1 PPP → usa direto; N → síntese municipal cacheada.
    let escolaBrief: EscolaBrief | null = null;
    let contextoAssinatura = 'sem-ppp';
    if (empresaId) {
      try {
        const { data: emp } = await sb.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
        const salvo = (emp?.sys_config as any)?.video_escola || null;
        if (briefPreenchido(salvo)) {
          escolaBrief = salvo;                 // brief manual da empresa tem precedência
          contextoAssinatura = 'brief-manual';
        } else {
          const { resolverContextoEmpresa } = await import('@/lib/season-engine/kit/contexto-empresa');
          const contexto = await resolverContextoEmpresa(sb, empresaId);
          if (contexto) {
            const resumo = await resumirPPP(contexto);
            if (briefPreenchido(resumo)) {
              escolaBrief = resumo;
              contextoAssinatura = assinaturaCurta(contexto);
            }
          }
        }
      } catch (e: any) {
        console.warn('[gerarConteudoFinalPersonalizado] contexto institucional falhou:', e?.message);
      }
    }

    // Sem DISC e sem PPP → nada a personalizar: serve a versão genérica.
    const temDisc = Boolean(colab?.perfil_dominante);
    if (!temDisc && !briefPreenchido(escolaBrief)) {
      return { success: true, url: generico, personalized: false };
    }

    // Cache por (conteúdo, empresa, arquétipo, CONTEXTO).
    //
    // A assinatura do contexto na chave resolve duas coisas:
    //  1. INVALIDAÇÃO — sem ela, um PPP novo (escola extraída depois) atualizava o
    //     contexto mas os PDFs em cache seguiam servindo o texto antigo para sempre;
    //  2. o F-E7 do FMEA — se um dia a resolução do PPP voltar a ser POR ESCOLA, duas
    //     pessoas de escolas diferentes com o mesmo arquétipo passariam a colidir nesta
    //     chave e a segunda receberia o PDF da escola da primeira. Com a assinatura,
    //     contextos diferentes ocupam chaves diferentes por construção.
    //     ⚠️ Ao mudar a fonte do contexto, garanta que `contextoAssinatura` varie com ela.
    const cachePath = `final/perso/${contentId}/${empresaId || 'global'}/${arquetipoSlug}-${contextoAssinatura}.pdf`;
    try {
      const { data: cached } = await sb.storage.from('conteudos').download(cachePath);
      const buf = cached ? Buffer.from(await cached.arrayBuffer()) : null;
      if (buf && buf.length > 1024) {
        const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(cachePath);
        return { success: true, url: publicUrl, personalized: true, cached: true };
      }
    } catch { /* sem cache → gera */ }

    // Camada de personalização (IA)
    const model = await getModelForTask(empresaId, 'conteudo_personalizacao');
    const { system, user } = buildPersonalizacaoPrompt({
      competencia: c.competencia, descritor: c.descritor, conteudoCore: c.conteudo_inline,
      arquetipoNome: arq.nome, arquetipoDesc: arq.desc, escolaBrief,
    });
    const layer = (await callAI(system, user, { model }, 2000, {
      temperature: 0.5, taskKey: 'conteudo_personalizacao', empresaId,
    })).trim();
    if (!layer) return { success: true, url: generico, personalized: false };
    const full = `${c.conteudo_inline}\n\n${layer}`;

    // Pipeline de render (reusa capa/seção por-conteúdo + planner + renderer)
    const { parseBlocks, planLayout } = await import('@/lib/conteudo-layout-plan');
    const { renderConteudoFinalPDF } = await import('@/lib/conteudo-final-pdf');
    const planModel = await getModelForTask(empresaId, c.formato === 'case' ? 'conteudo_case' : 'conteudo_texto');
    const blocks = parseBlocks(full, { skipFirstH1: Boolean(c.titulo) });
    let plan = null;
    try {
      plan = await planLayout(blocks, { titulo: c.titulo, competencia: c.competencia, descritor: c.descritor, formato: c.formato }, planModel);
    } catch (e: any) {
      console.warn('[gerarConteudoFinalPersonalizado] plano falhou (flat):', e?.message);
    }
    const { base64: coverBase64 } = await resolveCoverBase64(sb, c);
    const sectionBase64 = plan && plan.pages.some((p: any) => p.heroImage) ? await resolveSectionBase64(sb, c) : null;

    const buffer = await renderConteudoFinalPDF({
      titulo: c.titulo, conteudoMd: full, competencia: c.competencia, descritor: c.descritor,
      formato: c.formato, empresaNome: c.empresa?.nome || null, coverBase64, plan, sectionImageBase64: sectionBase64,
    });

    const { error: upErr } = await sb.storage.from('conteudos').upload(cachePath, Buffer.from(buffer), {
      contentType: 'application/pdf', upsert: true,
    });
    if (upErr) return { success: true, url: generico, personalized: false, error: upErr.message };
    const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(cachePath);
    return { success: true, url: publicUrl, personalized: true, arquetipo: arq.nome, paginas: plan?.pages.length ?? null };
  } catch (err: any) {
    console.error('[gerarConteudoFinalPersonalizado]', err);
    return { success: true, url: generico, personalized: false, error: err?.message || 'Erro' };
  }
}

/**
 * Pré-gera (e cacheia) o ÁUDIO personalizado de um conteúdo de podcast para um
 * colaborador específico — mesma lógica da rota /api/conteudo/[id]/podcast, mas
 * por colaboradorId (pré-geração em lote). Idempotente: pula se o cache já existe.
 */
export async function prepararAudioPersonalizado({ contentId, colab }: { contentId: string; colab: any }) {
  try {
    const sb = createSupabaseAdmin();
    const nome = colab?.nome_completo?.trim();
    if (!nome || !colab?.id) return { success: false, error: 'colab inválido' };
    const { data: content } = await sb.from('micro_conteudos')
      .select('id, formato, conteudo_inline').eq('id', contentId).maybeSingle();
    if (!content || content.formato !== 'audio') return { success: false, error: 'não é áudio' };

    const sani = (v: string) => String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cachePath = `final/audio-personalizado/${sani(contentId)}/${sani(colab.id)}.mp3`;
    const { data: cached } = await sb.storage.from('conteudos').download(cachePath);
    if (cached) return { success: true, cached: true };

    const { extractNarration, generatePersonalizedPodcastAudio } = await import('@/lib/gemini-tts');
    const narracao = extractNarration(content.conteudo_inline || '');
    if (narracao.length < 20) return { success: false, error: 'narração curta' };
    const audio = await generatePersonalizedPodcastAudio(narracao, nome);
    const { error } = await sb.storage.from('conteudos').upload(cachePath, audio.buffer, {
      contentType: audio.contentType, upsert: true,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro' };
  }
}

/**
 * Gera o "conteúdo final" entregável de ÁUDIO: narra o roteiro de podcast via
 * Gemini TTS (voz masculina pt-BR), sobe o MP3 final pro Storage e linka url/storage_path.
 * Mesmo fluxo do PDF; a narração usa o bloco de TEXTO LIMPO do roteiro.
 */
export async function gerarPodcastAudio(id: string) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!id) return { success: false, error: 'id obrigatório' };

    const { data: c } = await sb
      .from('micro_conteudos')
      .select('*, empresa:empresas(nome)')
      .eq('id', id)
      .maybeSingle();
    if (!c) return { success: false, error: 'Conteúdo não encontrado' };
    if (c.formato !== 'audio') {
      return { success: false, error: 'Áudio TTS disponível apenas para o formato áudio' };
    }
    if (!c.conteudo_inline?.trim()) {
      return { success: false, error: 'Conteúdo sem roteiro inline para narrar' };
    }

    const { extractNarration, generatePodcastAudio } = await import('@/lib/gemini-tts');
    const narracao = extractNarration(c.conteudo_inline);
    if (!narracao || narracao.length < 20) {
      return { success: false, error: 'Não foi possível extrair a narração do roteiro' };
    }

    const audio = await generatePodcastAudio(narracao);

    const slug = String(c.competencia || 'geral').replace(/[^a-zA-Z0-9]/g, '_');
    const path = `final/audio/${slug}/${c.id}-${Date.now()}.${audio.extension}`;
    const { error: upErr } = await sb.storage.from('conteudos').upload(path, audio.buffer, {
      contentType: audio.contentType, upsert: true,
    });
    if (upErr) return { success: false, error: `Upload falhou: ${upErr.message}` };

    const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(path);
    const updAud = await updateConteudoInTenantDaLinha(sb, id, { url: publicUrl, storage_path: path, ativo: true });
    if (updAud === null) return { success: false, error: 'Conteúdo não encontrado' };

    return { success: true, url: publicUrl, message: `Áudio com vinheta gerado para "${c.titulo}"` };
  } catch (err) {
    console.error('[gerarPodcastAudio]', err);
    return { success: false, error: err?.message || 'Erro' };
  }
}

/**
 * Etapa editorial do podcast: salva o roteiro revisado pelo admin e, em seguida,
 * gera o áudio final. Usado pelo modal pós-geração de roteiro.
 */
export async function aprovarRoteiroPodcastEGerarAudio(id: string, roteiro: string) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!id) return { success: false, error: 'id obrigatório' };
    if (!roteiro?.trim() || roteiro.trim().length < 20) {
      return { success: false, error: 'Roteiro muito curto para gerar áudio' };
    }

    const { data: c } = await sb
      .from('micro_conteudos')
      .select('id, formato')
      .eq('id', id)
      .maybeSingle();
    if (!c) return { success: false, error: 'Conteúdo não encontrado' };
    if (c.formato !== 'audio') {
      return { success: false, error: 'Aprovação de roteiro disponível apenas para podcast' };
    }

    const updRot = await updateConteudoInTenantDaLinha(sb, id, { conteudo_inline: roteiro.trim() });
    if (updRot === null) return { success: false, error: 'Conteúdo não encontrado' };

    return await gerarPodcastAudio(id);
  } catch (err) {
    console.error('[aprovarRoteiroPodcastEGerarAudio]', err);
    return { success: false, error: err?.message || 'Erro' };
  }
}

/**
 * Inicia o render de VÍDEO IA (microlearning premium): gera o PLANO via Gemini
 * (voice-over + cenas/prompts Veo), sobe o plano no Storage e dispara o Cloud
 * Run Job que monta o MP4 (Veo + TTS Charon + FFmpeg). É ASSÍNCRONO: a action
 * retorna assim que o Job é disparado; o Job atualiza url/status ao concluir.
 * Saída: 16:9 1280x720, voice-over Charon, sem legendas/lip-sync.
 */
/**
 * Exclui SÓ o PDF final gerado (e a capa GPT Image) do Storage e limpa
 * url/storage_path na linha — sem apagar o conteúdo/roteiro. Permite regerar
 * do zero (próxima geração cria capa nova). Guard: só mexe em paths sob
 * `final/` pra nunca apagar uploads manuais (formato pdf/áudio).
 */
export async function excluirConteudoFinal(id: string) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!id) return { success: false, error: 'id obrigatório' };

    const { data: c } = await sb.from('micro_conteudos')
      .select('id, storage_path, url, competencia').eq('id', id).maybeSingle();
    if (!c) return { success: false, error: 'Conteúdo não encontrado' };

    // Prefixos de artefatos gerados pela plataforma (PDF final premium + PDFs
    // auto-gerados de texto/case). NUNCA toca em uploads manuais (pdf/, audio/).
    const prefixosGerados = ['final/', 'texto/', 'case/'];
    const ehGerado = (p?: string | null) => !!p && prefixosGerados.some(pre => p.startsWith(pre));

    const slug = String(c.competencia || 'geral').replace(/[^a-zA-Z0-9]/g, '_');
    const aRemover: string[] = [];
    if (ehGerado(c.storage_path)) aRemover.push(c.storage_path!);
    aRemover.push(`final/covers/${id}.png`); // capa (idempotente se não existir)
    aRemover.push(`final/video/${slug}/${id}-plano.json`); // plano de vídeo (idempotente)

    const { error: rmErr } = await sb.storage.from('conteudos').remove(aRemover);
    if (rmErr) console.warn('[excluirConteudoFinal] remove storage:', rmErr.message);

    if (ehGerado(c.storage_path)) {
      const updExc = await updateConteudoInTenantDaLinha(sb, id, { url: null, storage_path: null, video_render_status: null, video_render_error: null });
      if (updExc === null) return { success: false, error: 'Conteúdo não encontrado' };
    } else {
      // Pode ter ficado um render travado em "processing/error" sem MP4 ainda.
      await updateConteudoInTenantDaLinha(sb, id, { video_render_status: null, video_render_error: null }).catch(() => null);
    }

    return { success: true, message: 'Entregável final excluído' };
  } catch (err) {
    console.error('[excluirConteudoFinal]', err);
    return { success: false, error: err?.message || 'Erro' };
  }
}

export async function deletarConteudo(id: string) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    await deleteConteudoInTenantDaLinha(sb, id); // false = já não existia (delete idempotente)
    return { ok: true };
  } catch (err) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * IA sugere tags para um conteúdo baseado em metadados + corpo do conteúdo.
 * Usa lista de competências do banco como vocabulário controlado.
 */
export async function sugerirTagsIA(conteudoId: string, aiConfig?: AIConfig) {
  try {
    const sb = await requireAdminSupabase('ai.audit.regenerate');
    const { data: c } = await sb.from('micro_conteudos').select('*').eq('id', conteudoId).maybeSingle();
    if (!c) return { error: 'Conteúdo não encontrado' };

    const { data: baseComps } = await sb.from('competencias_base')
      .select('nome, nome_curto')
      .not('nome', 'is', null)
      .limit(1000);
    const { data: empresaComps } = c.empresa_id
      ? await sb.from('competencias')
        .select('nome, nome_curto, pilar, cargo')
        .eq('empresa_id', c.empresa_id)
        .not('nome', 'is', null)
        .limit(1000)
      : { data: [] };

    const compMap: Record<string, {
      descritores: Set<string>;
      pilares: Set<string>;
      cargos: Set<string>;
      escopo: 'base' | 'empresa' | 'ambos';
    }> = {};
    const addComp = (co: any, escopo: 'base' | 'empresa') => {
      const nome = String(co?.nome || '').trim();
      if (!nome) return;
      if (!compMap[nome]) {
        compMap[nome] = {
          descritores: new Set(),
          pilares: new Set(),
          cargos: new Set(),
          escopo,
        };
      } else if (compMap[nome].escopo !== escopo) {
        compMap[nome].escopo = 'ambos';
      }
      if (co.nome_curto) compMap[nome].descritores.add(String(co.nome_curto).trim());
      if (co.pilar) compMap[nome].pilares.add(String(co.pilar).trim());
      if (co.cargo) compMap[nome].cargos.add(String(co.cargo).trim());
    };
    (baseComps || []).forEach((co: any) => addComp(co, 'base'));
    (empresaComps || []).forEach((co: any) => addComp(co, 'empresa'));

    const system = `Você é um especialista em classificação de conteúdos de desenvolvimento profissional da Vertho.

Sua tarefa é analisar um conteúdo e sugerir tags para classificá-lo no banco de micro-conteúdos.

ATENÇÃO:
Você NÃO está inventando tags livremente.
Você está classificando dentro de um vocabulário controlado, com prudência e foco em utilidade prática.

PRINCÍPIOS INEGOCIÁVEIS:
1. Use apenas a lista de competências fornecida.
2. Nunca invente competência fora do vocabulário.
3. Não force encaixe quando a base estiver fraca.
4. Prefira prudência a falsa precisão.
5. Classifique pelo que o conteúdo REALMENTE entrega, não pelo que o título promete.
6. Se a descrição for vaga, reduza a confiança.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

    const competenciasInfo = Object.entries(compMap)
      .sort(([, a], [, b]) => {
        const ap = a.escopo === 'empresa' || a.escopo === 'ambos' ? 0 : 1;
        const bp = b.escopo === 'empresa' || b.escopo === 'ambos' ? 0 : 1;
        return ap - bp;
      })
      .slice(0, 80)
      .map(([comp, info]) => {
        const meta = [
          info.pilares.size ? `pilar: ${[...info.pilares].slice(0, 3).join(', ')}` : null,
          info.cargos.size ? `cargo: ${[...info.cargos].slice(0, 3).join(', ')}` : null,
          `escopo: ${info.escopo}`,
        ].filter(Boolean).join('; ');
        const descs = info.descritores.size ? ` (${[...info.descritores].slice(0, 8).join(', ')})` : '';
        return `- ${comp}${descs}${meta ? ` [${meta}]` : ''}`;
      }).join('\n');
    const corpoConteudo = String(c.conteudo_inline || '').trim();
    const trechoConteudo = corpoConteudo
      ? corpoConteudo.slice(0, 7000)
      : '(sem corpo textual disponível; use título e descrição com confiança mais baixa)';

    const user = `CONTEÚDO A CLASSIFICAR:
- Título: ${c.titulo}
- Descrição: ${c.descricao || '(sem descrição)'}
- Formato: ${c.formato}
- Duração: ${c.duracao_min || '?'} min
- Pilar informado pelo admin: ${c.pilar || '(não informado)'}
- Competência atual: ${c.competencia || '(não classificado)'}
- Corpo/trecho textual:
${trechoConteudo}

COMPETÊNCIAS DISPONÍVEIS (escolha EXATAMENTE 1):
${competenciasInfo}

Retorne JSON:
{
  "pilar": "pilar sugerido ou null",
  "competencia": "nome exato da lista acima",
  "descritor": "descritor sugerido ou null",
  "nivel_min": 1,
  "nivel_max": 2,
  "contexto": "educacional|corporativo|generico",
  "cargo": "todos ou cargo específico",
  "setor": "educacao_publica|saude|agro|todos",
  "tipo_conteudo": "video|texto|audio|case|ferramenta|outro",
  "confianca": "alta|media|baixa",
  "raciocinio": "explicação curta e honesta da classificação"
}

REGRAS:
- competencia deve vir EXATAMENTE da lista fornecida
- use pilar, cargo e descritores como pistas, mas retorne a competência exata
- se "Pilar informado pelo admin" estiver preenchido, trate como pista prioritária, mas ainda valide contra o conteúdo
- quando o conteúdo for de Empreendedorismo/MEI, priorize competências desse pilar se elas estiverem na lista e houver evidência no texto
- nivel_min e nivel_max entre 1 e 4, nivel_min <= nivel_max
- se o conteúdo parecer introdutório, não inflar nivel_max
- se a base estiver fraca (descrição vaga, título genérico), confianca = "baixa"
- raciocinio deve ser específico ao conteúdo, não genérico`;

    // Modelo configurado da tarefa conteudo_tags (usa empresa_id do conteúdo)
    const { getModelForTask } = await import('@/lib/ai-tasks');
    const model = c.empresa_id ? await getModelForTask(c.empresa_id, 'conteudo_tags') : undefined;
    const resposta = await callAI(system, user, { ...(aiConfig || {}), model: model || aiConfig?.model }, 1000, {
      taskKey: 'conteudo_tags', empresaId: c.empresa_id ?? null,
    });
    const jsonMatch = resposta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { error: 'IA não retornou JSON válido' };

    const tags = JSON.parse(jsonMatch[0]);
    return { ok: true, sugestao: tags };
  } catch (err) {
    console.error('[sugerirTagsIA]', err);
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Aplica tags sugeridas a um conteúdo (após admin revisar/aprovar).
 */
export async function aplicarTagsIA(conteudoId: string, tags: any) {
  return atualizarConteudo(conteudoId, {
    pilar: tags.pilar,
    competencia: tags.competencia,
    descritor: tags.descritor,
    nivel_min: tags.nivel_min,
    nivel_max: tags.nivel_max,
    contexto: tags.contexto,
    cargo: tags.cargo,
    setor: tags.setor,
    tipo_conteudo: tags.tipo_conteudo,
  });
}
