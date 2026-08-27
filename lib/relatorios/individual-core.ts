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
    return { success: true, message: `Relatório gerado: ${colab.nome_completo}${pdfPath ? ' (PDF salvo)' : ''}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
