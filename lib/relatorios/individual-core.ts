import { tenantDb } from '@/lib/tenant-db';
import { focoDoCargo } from '@/lib/foco-cargo';
import type { DevelopmentBlueprint } from '@/lib/blueprint/types';
import { callAI, type AIConfig } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { buildRelatorioIndividualPrompt, normKey } from '@/lib/relatorio-individual-prompt';
import { renderToBuffer } from '@react-pdf/renderer';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import { storageSlug } from '@/lib/storage-slug';
import { PROGRESSO } from '@/lib/status';
import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

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

export async function gerarRelatorioIndividualCore(
  sbRaw: SupabaseClient,
  empresaId: string,
  colaboradorId: string,
  aiConfig: AIConfig = {},
): Promise<{ success: boolean; message?: string; error?: string; pdfPath?: string | null }> {
  const tdb = tenantDb(empresaId);
  try {
    // Montagem do prompt EXTRAÍDA p/ lib/relatorio-individual-prompt (núcleo
    // headless, fonte única com scripts/lotes). Comportamento idêntico.
    const built = await buildRelatorioIndividualPrompt(sbRaw, { empresaId, colaboradorId });
    if ('error' in built) return { success: false, error: built.error };
    const { system, user, dadosComps, blueprint, colab, empresa } = built;

    const resultado = await callAI(system, user, aiConfig, 64000, {
      taskKey: 'pdi_individual', empresaId, colaboradorId,
    });
    const relatorio: any = await extractJSON(resultado);

    if (!relatorio) return { success: false, error: 'IA não retornou relatório válido' };

    // Pós-processo: força nivel/nota_decimal dos dados reais (LLM as vezes ignora).
    const dadosByName = Object.fromEntries(dadosComps.map(d => [normKey(d.competencia), d]));
    const overlay = (c: any, key: string = 'nome'): any => {
      const src = dadosByName[normKey(c[key] || c.competencia || c.nome)];
      if (!src) return c;
      return {
        ...c,
        nivel: src.nivel === PROGRESSO.PENDENTE ? null : src.nivel,
        nota_decimal: src.nota_decimal === PROGRESSO.PENDENTE ? null : src.nota_decimal,
        flag: src.nivel === PROGRESSO.PENDENTE || (typeof src.nivel === 'number' && src.nivel < 3),
      };
    };
    if (Array.isArray(relatorio.competencias)) relatorio.competencias = relatorio.competencias.map((c: any) => overlay(c, 'nome'));
    if (Array.isArray(relatorio.resumo_desempenho)) relatorio.resumo_desempenho = relatorio.resumo_desempenho.map((c: any) => overlay(c, 'competencia'));

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
    return { success: true, message: `Relatório gerado: ${colab.nome_completo}${pdfPath ? ' (PDF salvo)' : ''}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
