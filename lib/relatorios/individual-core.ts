import { tenantDb } from '@/lib/tenant-db';
import { focoDoCargo } from '@/lib/foco-cargo';
import type { DevelopmentBlueprint } from '@/lib/blueprint/types';
import { callAI, type AIConfig } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { buildRelatorioIndividualPrompt, normKey } from '@/lib/relatorio-individual-prompt';
import { renderToBuffer } from '@react-pdf/renderer';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import { storageSlug } from '@/lib/storage-slug';
import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  auditarPdiEstrutural, consolidarAuditoriaPdi, promptAuditoriaPdi, parseAuditoriaPdi,
} from './pdi-audit';
import { getModelForTask } from '@/lib/ai-tasks';

/**
 * Relatório Individual (PDI) — núcleo SEM gate.
 *
 * Vive em `lib/` porque num `'use server'` todo export vira endpoint HTTP: o
 * gate de `gerarRelatorioIndividual` é "sempre", por decisão de segurança
 * (`empresaId` vem do caller, então um bypass ali leria qualquer tenant). Quem
 * precisa rodar em lote — script, task — chama daqui, e o gate continua
 * intacto na action.
 *
 * O laço PRECISA sair do browser: a tela itera chamando a action uma vez por
 * pessoa, e Server Action é despachada uma por vez por cliente — 38 relatórios
 * seriam ~25 min de aba travada.
 *
 * ⚠️ O PDF é best-effort AQUI também: `renderToBuffer` do @react-pdf falha se a
 * fonte não estiver registrada na MESMA instância do módulo, o que acontece sob
 * `tsx`. Quando falha, o relatório é salvo com `pdf_path: null` — o conteúdo
 * não se perde, mas o documento não existe. Quem chama em lote tem de CONFERIR
 * `pdf_path`, não o `success`.
 */

type RelatorioTipo = 'individual' | 'gestor' | 'rh';

async function gerarPDFBuffer(
  tipo: RelatorioTipo,
  data: unknown,
  empresaNome: string,
): Promise<Buffer | null> {
  let Component: React.ComponentType<any> | undefined;
  if (tipo === 'individual') {
    const mod = await import('@/components/pdf/RelatorioIndividual');
    Component = mod.default;
  } else if (tipo === 'gestor') {
    const mod = await import('@/components/pdf/RelatorioGestor');
    Component = mod.default;
  } else if (tipo === 'rh') {
    const mod = await import('@/components/pdf/RelatorioRH');
    Component = mod.default;
  }
  if (!Component) return null;
  const logoBase64 = getLogoCoverBase64();
  return renderToBuffer(React.createElement(Component, { data, empresaNome, logoBase64 }));
}

async function salvarPDFStorage(
  sb: SupabaseClient,
  empresaId: string,
  tipo: RelatorioTipo,
  colaboradorNome: string,
  buffer: Buffer,
): Promise<string | null> {
  const slug = storageSlug(colaboradorNome, tipo);
  const path = `${empresaId}/${tipo}-${slug}-${Date.now()}.pdf`;
  const { error } = await sb.storage.from('relatorios-pdf').upload(path, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) { console.error('[PDF Storage]', error.message); return null; }
  return path;
}

/** Teto de saída do PDI. Um número só, para o síncrono e o lote não divergirem. */
export const PDI_MAX_TOKENS = 64000;

export interface RelatorioIndividualReq {
  /** = colaboradorId: é a chave que o batch devolve em cada resultado. */
  customId: string;
  system: string;
  user: string;
  maxTokens: number;
}

/**
 * Request do PDI pronto para a IA — síncrono OU batch.
 *
 * Existe pelo mesmo motivo de `buildBlueprintReq`: a Batch API precisa de
 * (system, user) ANTES de haver resposta, e sem esta função o caminho em lote
 * teria de remontar o prompt por conta própria. Prompt remontado é o gêmeo que
 * diverge na primeira correção — e aqui a divergência seria invisível, porque o
 * PDI sai bonito de qualquer jeito.
 */
export async function buildRelatorioIndividualReq(
  sbRaw: SupabaseClient,
  { empresaId, colaboradorId }: { empresaId: string; colaboradorId: string },
): Promise<RelatorioIndividualReq | { error: string }> {
  const built = await buildRelatorioIndividualPrompt(sbRaw, { empresaId, colaboradorId });
  if ('error' in built) return { error: built.error };
  return { customId: colaboradorId, system: built.system, user: built.user, maxTokens: PDI_MAX_TOKENS };
}

/**
 * TUDO o que acontece depois da IA: parse, overlay dos níveis reais, binding do
 * blueprint, auditoria, PDF e persistência.
 *
 * 🔑 POR QUE ISTO É UMA FUNÇÃO, e não código dentro do core síncrono: quando o
 * lote chegou (31/08/2026), o pós-processamento tinha 130 linhas de regra que
 * decidem o que a pessoa recebe — o overlay que corrige o nível quando a IA
 * arredonda, o `trilha_mapa` que liga o PDI à trilha, a auditoria em duas
 * camadas. Reescrever isso no lado do lote seria duplicar a parte mais cara de
 * errar, e o sintoma de uma divergência aqui é um PDI que abre normal
 * descrevendo uma régua que não existe.
 *
 * `built` é opcional: o síncrono já o tem em mãos e passa; o lote (que só
 * guarda o texto do batch) deixa reconstruir. Reconstruir é a MESMA chamada de
 * `buildRelatorioIndividualPrompt`, não uma reconstrução paralela — é o que
 * mantém a evidência da auditoria igual ao prompt que o gerador recebeu.
 */
export async function persistRelatorioIndividualFromText(
  sbRaw: SupabaseClient,
  args: {
    empresaId: string;
    colaboradorId: string;
    texto: string;
    built?: Awaited<ReturnType<typeof buildRelatorioIndividualPrompt>>;
  },
): Promise<{ success: boolean; message?: string; error?: string; pdfPath?: string | null }> {
  const { empresaId, colaboradorId, texto } = args;
  const tdb = tenantDb(empresaId);
  try {
    const built = args.built ?? await buildRelatorioIndividualPrompt(sbRaw, { empresaId, colaboradorId });
    if ('error' in built) return { success: false, error: built.error };
    const { user, dadosComps, blueprint, colab, empresa } = built;

    const relatorio: any = await extractJSON(texto);

    if (!relatorio) return { success: false, error: 'IA não retornou relatório válido' };

    // Pós-processo: força nivel/nota_decimal dos dados reais (LLM as vezes ignora).
    const overlay = (c: any, src: (typeof dadosComps)[number], key: 'nome' | 'competencia'): any => {
      if (typeof src.nivel !== 'number' || typeof src.nota_decimal !== 'number') {
        throw new Error(`PDI sem nível válido para ${src.competencia}`);
      }
      return {
        ...c,
        [key]: src.competencia,
        nivel: src.nivel,
        nota_decimal: src.nota_decimal,
        flag: src.nivel < 3,
      };
    };
    const alinhar = (items: any[], key: 'nome' | 'competencia') => dadosComps.map((src) => {
      const item = items.find((c: any) => normKey(c?.[key] || c?.competencia || c?.nome) === normKey(src.competencia));
      return overlay(item || {}, src, key);
    });
    // Mesmo que a IA omita, duplique ou invente uma competência, o documento
    // persistido acompanha exatamente o input validado — nomes, ordem e N1–N4.
    relatorio.competencias = alinhar(Array.isArray(relatorio.competencias) ? relatorio.competencias : [], 'nome');
    relatorio.resumo_desempenho = alinhar(Array.isArray(relatorio.resumo_desempenho) ? relatorio.resumo_desempenho : [], 'competencia');

    // Binding real "vira trilha" (Estágio 2): LIDO DO BLUEPRINT, não da IA. Persiste
    // no `conteudo` pra a página "Como este PDI vira trilha" mostrar o vínculo real
    // (cada semana → ação do PDI). Sem blueprint, ambos ficam ausentes (fallback).
    if (blueprint) {
      // trilha_mapa: as semanas com competencia_foco + conexao_com_pdi (ids dos objetivos).
      relatorio.trilha_mapa = blueprint.trilha;
      // blueprint_objetivos: mapa { [objetivoId]: { competencia, objetivo, acao_principal } }
      // pra a página resolver conexao_com_pdi → ação do PDI que a semana sustenta.
      const blueprintObjetivos: Record<string, { competencia: string; objetivo: string; acao_principal: string }> = {};
      for (const comp of (blueprint.competencias || [])) {
        for (const obj of (comp.objetivos_30_dias || [])) {
          if (!obj?.id) continue;
          blueprintObjetivos[obj.id] = {
            competencia: comp.nome,
            objetivo: obj.objetivo,
            acao_principal: obj.acao_principal,
          };
        }
      }
      relatorio.blueprint_objetivos = blueprintObjetivos;
      // blueprint_conteudos: mapa { [competenciaNome]: [{ tema, formato }] } — a TEORIA
      // (o que a pessoa vai APRENDER por competência). A página "vira trilha" mostra
      // aprende+aplica, não só a prática. Temas do blueprint (sempre presentes); o
      // micro-conteúdo REAL só existe quando a trilha é gerada (refinamento futuro).
      const blueprintConteudos: Record<string, { tema: string; formato?: string }[]> = {};
      for (const comp of (blueprint.competencias || [])) {
        const temas = (comp.conteudos_recomendados || [])
          .map((cr: any) => ({ tema: cr?.tema, formato: cr?.formato_preferencial }))
          .filter((t: any) => t.tema);
        if (temas.length) blueprintConteudos[comp.nome] = temas;
      }
      relatorio.blueprint_conteudos = blueprintConteudos;
    }

    // ── AUDITORIA (o check que faltava no bloco C) ─────────────────────────
    //
    // Roda ANTES do PDF de propósito: o veredito acompanha o artefato desde a
    // primeira versão persistida. Depois seria auditoria de coisa já entregue.
    //
    // Duas camadas (`lib/relatorios/pdi-audit.ts`): a estrutural é código e não
    // custa nada — confere as promessas LITERAIS do prompt (sprint copiado do
    // blueprint, checklist de 3, 2ª pessoa, sem jargão em inglês). A semântica
    // é a 2ª IA, cross-família por `pdi_check`.
    //
    // ⚠️ Falha da auditoria NÃO derruba a geração: o PDI já foi pago e o
    // veredito é informação sobre ele, não pré-condição. Mas o resultado é
    // PERSISTIDO junto — auditoria que não deixa rastro é a que ninguém lê.
    const objetivosBlueprint = blueprint
      ? (blueprint.competencias || []).flatMap((comp: any) => (comp.objetivos_30_dias || []).map((o: any) => ({
        competencia: comp.nome,
        acao_principal: o?.acao_principal,
        acao_apoio: o?.acao_apoio,
        ritual: o?.ritual,
      })))
      : null;
    const checks = auditarPdiEstrutural(relatorio, objetivosBlueprint);
    try {
      // 🔑 A evidência do auditor é O PROMPT QUE O GERADOR RECEBEU — não uma
      // reconstrução. Duas tentativas de reconstruir falharam por motivos
      // diferentes, e a segunda ensinou a regra:
      //
      //  1ª: `String(d.feedback)` virou "[object Object]" — `DadoComp.feedback`
      //      é TIPADO como `string` e recebe o objeto da IA4, e com
      //      `strict: false` no tsconfig ninguém acusa. O auditor recebia lixo,
      //      concluía "sem lastro" para tudo, e o veredito era `fail` por
      //      defeito do INSTRUMENTO.
      //  2ª: com competências corretas, sobraram achados sobre o PERFIL DISC —
      //      porque eu mandava só `dadosComps` e o gerador também recebe o
      //      perfil. O auditor estava certo de novo: aquilo, para ele, não
      //      tinha lastro.
      //
      // Qualquer reconstrução tem esse defeito por construção: ela diverge da
      // entrada real, e toda divergência vira falso positivo. Falso positivo
      // ensina a ignorar o veredito, que é pior que não auditar.
      //
      // Usando o `user` do gerador, auditor e gerador olham a MESMA coisa por
      // definição, e o único jeito de divergirem é alguém mudar o prompt.
      const evidencia = user.slice(0, 40000);
      const modeloCheck = await getModelForTask(empresaId, 'pdi_check');
      const { system: sysA, user: userA } = promptAuditoriaPdi(relatorio, evidencia);
      const bruto = await callAI(sysA, userA, { model: modeloCheck }, 6000, {
        taskKey: 'pdi_check', empresaId, colaboradorId,
      });
      checks.push(...parseAuditoriaPdi(await extractJSON(bruto)));
    } catch (e: any) {
      // Sem `pass` silencioso: a ausência da 2ª IA entra como achado.
      console.warn('[pdi_check] auditoria semântica falhou:', e?.message);
      checks.push({
        id: 'semantica-indisponivel',
        categoria: 'semantica',
        titulo: 'A auditoria semântica não rodou',
        status: 'fail',
        detalhe: `Erro ao chamar o auditor: ${String(e?.message ?? e).slice(0, 200)}. Isto NÃO é aprovação.`,
        ocorrencias: [],
      });
    }
    relatorio.auditoria = consolidarAuditoriaPdi(checks, dadosComps.length);
    if (relatorio.auditoria.status === 'fail') {
      console.warn(`[pdi_check] ${colaboradorId?.slice(0, 8)}: ${relatorio.auditoria.resumo}`);
    }

    // Gerar PDF
    let pdfPath: string | null = null;
    try {
      const pdfData = { conteudo: relatorio, colaborador_nome: colab.nome_completo, colaborador_cargo: colab.cargo, gerado_em: new Date().toISOString() };
      const buffer = await gerarPDFBuffer('individual', pdfData, empresa.nome);
      if (buffer) pdfPath = await salvarPDFStorage(sbRaw, empresaId, 'individual', colab.nome_completo, buffer);
    } catch (e: any) { console.error('[PDF Gen]', e.message); }

    // Salvar — empresa_id é injetado pelo tdb.upsert
    const { error: saveErr } = await tdb.from('relatorios').upsert({
      colaborador_id: colaboradorId,
      tipo: 'individual',
      conteudo: relatorio,
      pdf_path: pdfPath,
      gerado_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id,colaborador_id,tipo' }).select('id');

    if (saveErr) return { success: false, error: saveErr.message };
    // `pdfPath` VOLTA para quem chamou: em lote, `success` sozinho esconde o
    // relatório salvo com `pdf_path: null` — o defeito que fez 40
    // micro-conteúdos nascerem sem PDF, pagos e em silêncio.
    return { success: true, pdfPath, message: `Relatório gerado: ${colab.nome_completo}${pdfPath ? ' (PDF salvo)' : ''}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * PDI de UM colaborador, SÍNCRONO (build → IA → persist).
 *
 * Continua sendo o caminho da tela e dos scripts. As três etapas viraram
 * funções para o lote reusar as pontas: o que muda entre síncrono e batch é
 * exclusivamente COMO a IA é chamada no meio.
 */
export async function gerarRelatorioIndividualCore(
  sbRaw: SupabaseClient,
  empresaId: string,
  colaboradorId: string,
  aiConfig: AIConfig = {},
): Promise<{ success: boolean; message?: string; error?: string; pdfPath?: string | null }> {
  try {
    const built = await buildRelatorioIndividualPrompt(sbRaw, { empresaId, colaboradorId });
    if ('error' in built) return { success: false, error: built.error };

    // O teto padrão do cliente de IA é 120s, e o PDI passou a cobrir TODAS as
    // competências mapeadas (02/09/2026) — com cinco delas, a geração levava
    // mais que isso e morria em "Request was aborted" depois de ~2 min de
    // trabalho já pago. O documento é longo por desenho; o teto acompanha.
    const resultado = await callAI(built.system, built.user, aiConfig, PDI_MAX_TOKENS, {
      taskKey: 'pdi_individual', empresaId, colaboradorId, timeoutMs: 300000,
    });

    // `built` passado adiante: o síncrono já pagou a leitura, não há por que
    // refazê-la — e garante que a auditoria veja exatamente o prompt enviado.
    return await persistRelatorioIndividualFromText(sbRaw, {
      empresaId, colaboradorId, texto: resultado, built,
    });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
